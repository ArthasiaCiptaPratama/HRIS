import {
  isOrgChartTempId,
  ORG_SECONDARY_POSTS_MAX,
  type OrgChartChange,
  type OrgChartChangeBatch,
  type OrgChartChangePreview,
  type OrgChartChangeResult,
} from "@hris/shared";
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import { countPendingRequestsForEmployees } from "../approval/index.ts";
import {
  archivePostInTransaction,
  auditOrgChartBatch,
  canManageOrgPost,
  canManageOrgStructure,
  createChartPosition,
  createPostInTransaction,
  listOrgPosts,
  type OrgChartEditTx,
  type OrgPostNode,
  updatePostInTransaction,
  withOrgChartEdit,
} from "../organization/index.ts";
import * as employees from "./employee.repository.ts";
import type { RequestContext } from "./employee.service.ts";
import * as repository from "./org-chart.repository.ts";
import { resolvePostPlacement, syncPostManagers } from "./org-post-assignment.ts";
import { recordPositionChange } from "./position-history.ts";

/** undefined = SA (seluruh bagan); selain itu pos yang boleh dikelola aktor (ORG-D2). */
export async function manageablePostIds(
  ctx: RequestContext,
  tx: OrgChartEditTx,
): Promise<ReadonlySet<string> | undefined> {
  if (ctx.actor.role === "SUPER_ADMIN") return undefined;
  const posts = await listOrgPosts(tx);
  return new Set(posts.filter((post) => canManageOrgPost(ctx.actor, post)).map((post) => post.id));
}

class PreviewRollback extends Error {
  constructor(readonly preview: OrgChartChangePreview) {
    super("org-chart preview rollback");
  }
}

const postLabel = (post: OrgPostNode | undefined) =>
  post ? `${post.positionName} · ${post.departmentName}` : null;

async function placeEmployee(
  ctx: RequestContext,
  tx: OrgChartEditTx,
  employeeId: string,
  postId: string | null,
): Promise<OrgChartChangePreview["placements"][number]> {
  const before = await employees.findEmployee(employeeId, tx);
  if (!before) throw new NotFoundError("Karyawan tidak ditemukan.");
  if (!canManageOrgStructure(ctx.actor, before.companyId)) throw new ForbiddenError();
  if (!before.isActive || before.onboardingStatus !== "APPROVED") {
    throw new BusinessRuleError("Karyawan harus aktif dan sudah disetujui.");
  }
  const posts = await listOrgPosts(tx);
  const previous = posts.find((post) => post.id === before.orgPostId);
  const next = posts.find((post) => post.id === postId);
  if (previous && !canManageOrgPost(ctx.actor, previous)) throw new ForbiddenError();
  if (next && !canManageOrgPost(ctx.actor, next)) throw new ForbiddenError();
  // ORG-D3: menjadi pemegang utama pos yang sebelumnya ia rangkap → baris rangkap dilepas dulu
  // (supaya tidak terhitung dua kali di slot).
  if (postId) await repository.removeSecondaryPost(tx, employeeId, postId);
  const placement = postId
    ? await resolvePostPlacement(tx, {
        employeeId,
        orgPostId: postId,
        companyId: before.companyId,
        positionId: undefined,
      })
    : null;
  await employees.updateEmployee(tx, employeeId, {
    orgPostId: postId,
    ...(placement ? { positionId: placement.positionId } : {}),
  });
  await recordPositionChange(
    tx,
    employeeId,
    before.positionId,
    placement?.positionId,
    ctx.actor.accountId,
  );
  return {
    employee: { id: before.id, fullName: before.fullName },
    fromPost: postLabel(previous),
    toPost: postLabel(next),
  };
}

/** ORG-D3: tambah/lepas pos rangkap (PT sama, maks 5, bukan pos utama, slot tersedia). */
async function changeSecondaryPost(
  ctx: RequestContext,
  tx: OrgChartEditTx,
  employeeId: string,
  postId: string,
  add: boolean,
): Promise<OrgChartChangePreview["secondaryChanges"][number]> {
  const person = await employees.findEmployee(employeeId, tx);
  if (!person) throw new NotFoundError("Karyawan tidak ditemukan.");
  if (!canManageOrgStructure(ctx.actor, person.companyId)) throw new ForbiddenError();
  const post = (await listOrgPosts(tx)).find((p) => p.id === postId);
  if (!post || post.archived) {
    throw new BusinessRuleError("Pos jabatan tidak ditemukan atau sudah diarsipkan.");
  }
  if (!canManageOrgPost(ctx.actor, post)) throw new ForbiddenError();
  const label = postLabel(post) ?? post.positionName;
  const employee = { id: person.id, fullName: person.fullName };
  if (!add) {
    if ((await repository.removeSecondaryPost(tx, employeeId, postId)) === 0) {
      throw new BusinessRuleError(`${person.fullName} tidak merangkap pos "${post.positionName}".`);
    }
    return { employee, post: label, action: "REMOVED" };
  }
  if (!person.isActive || person.onboardingStatus !== "APPROVED") {
    throw new BusinessRuleError("Karyawan harus aktif dan sudah disetujui.");
  }
  if (post.companyId !== null && post.companyId !== person.companyId) {
    throw new BusinessRuleError("Pos rangkap harus di perusahaan yang sama dengan karyawan.");
  }
  if (person.orgPostId === postId) {
    throw new BusinessRuleError("Pos ini sudah menjadi pos utama karyawan tersebut.");
  }
  const current = await repository.listEmployeeSecondaryPosts(tx, employeeId);
  if (current.some((row) => row.orgPostId === postId)) {
    throw new BusinessRuleError(`${person.fullName} sudah merangkap pos ini.`);
  }
  if (current.length >= ORG_SECONDARY_POSTS_MAX) {
    throw new BusinessRuleError(
      `Maksimal ${ORG_SECONDARY_POSTS_MAX} pos rangkap per karyawan (pos utama tidak dihitung).`,
    );
  }
  if ((await repository.countOtherHolders(tx, postId, employeeId)) >= post.headcount) {
    throw new BusinessRuleError(
      `Pos "${post.positionName}" sudah penuh (${post.headcount} slot). Tambah slot dulu.`,
    );
  }
  await repository.addSecondaryPost(tx, employeeId, postId, ctx.actor.accountId);
  return { employee, post: label, action: "ADDED" };
}

/** Preview and apply execute this exact path; the preview result escapes only via rollback. */
async function execute(
  ctx: RequestContext,
  input: OrgChartChangeBatch,
  previewOnly: boolean,
): Promise<OrgChartChangeResult> {
  return withOrgChartEdit(ctx, input, previewOnly, async (tx, revision) => {
    const before = await repository.listChartPeople(tx);
    const createdIds: Record<string, string> = {};
    const preview: OrgChartChangePreview = {
      revision,
      posts: [],
      createdPositions: [],
      secondaryChanges: [],
      placements: [],
      managerChanges: [],
      pendingRequests: [],
    };
    const resolve = (ref: string): string => {
      if (!isOrgChartTempId(ref)) return ref;
      const id = createdIds[ref];
      if (!id) throw new BusinessRuleError(`Rujukan sementara "${ref}" belum dibuat.`);
      return id;
    };
    const resolveNullable = (ref: string | null) => (ref === null ? null : resolve(ref));
    for (const [index, change] of input.changes.entries()) {
      try {
        if ("tempId" in change && createdIds[change.tempId]) {
          throw new BusinessRuleError("Id sementara sudah dipakai operasi sebelumnya.");
        }
        if (change.op === "createPosition") {
          const created = await createChartPosition(ctx, tx, change);
          createdIds[change.tempId] = created.id;
          preview.createdPositions.push({ name: change.name, unitName: created.unitName });
          continue;
        }
        if (change.op === "addSecondaryPost" || change.op === "removeSecondaryPost") {
          preview.secondaryChanges.push(
            await changeSecondaryPost(
              ctx,
              tx,
              change.employeeId,
              resolve(change.postId),
              change.op === "addSecondaryPost",
            ),
          );
          continue;
        }
        if (change.op === "placeEmployee") {
          preview.placements.push(
            await placeEmployee(ctx, tx, change.employeeId, resolveNullable(change.postId)),
          );
          continue;
        }
        const nodes = await listOrgPosts(tx);
        const current =
          "postId" in change ? nodes.find((node) => node.id === resolve(change.postId)) : undefined;
        let id: string;
        if (change.op === "createPost") {
          const created = await createPostInTransaction(ctx, tx, {
            positionId: resolve(change.positionId),
            reportsToId: resolveNullable(change.reportsToId),
            functionalReportsToId: resolveNullable(change.functionalReportsToId),
            headcount: change.headcount,
            sortOrder: change.sortOrder,
          });
          id = created.id;
          createdIds[change.tempId] = id;
        } else if (change.op === "updatePost") {
          id = resolve(change.postId);
          await updatePostInTransaction(ctx, tx, id, {
            ...(change.positionId !== undefined ? { positionId: resolve(change.positionId) } : {}),
            ...(change.reportsToId !== undefined
              ? { reportsToId: resolveNullable(change.reportsToId) }
              : {}),
            ...(change.functionalReportsToId !== undefined
              ? { functionalReportsToId: resolveNullable(change.functionalReportsToId) }
              : {}),
            ...(change.headcount !== undefined ? { headcount: change.headcount } : {}),
            ...(change.sortOrder !== undefined ? { sortOrder: change.sortOrder } : {}),
          });
        } else {
          id = resolve(change.postId);
          await archivePostInTransaction(ctx, tx, id, true);
        }
        const nextNodes = await listOrgPosts(tx);
        const next = nextNodes.find((node) => node.id === id);
        if (!next) throw new NotFoundError("Pos jabatan tidak ditemukan.");
        preview.posts.push({
          postId: change.op === "createPost" ? change.tempId : change.postId,
          label: postLabel(next) ?? next.positionName,
          kind:
            change.op === "createPost"
              ? "CREATED"
              : change.op === "archivePost"
                ? "ARCHIVED"
                : "UPDATED",
          details: describePost(change, current, next, nextNodes),
        });
      } catch (error) {
        // Preserve the HTTP status and give the client the exact failing operation (zero-based path).
        if (error instanceof AppError) {
          throw new AppError(error.status, error.code, `Operasi ${index + 1}: ${error.message}`, [
            { path: `changes.${index}`, code: error.code, message: error.message },
            ...(error.details ?? []),
          ]);
        }
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          const conflict = new ConflictError("Nama atau kode sudah dipakai.");
          throw new AppError(
            conflict.status,
            conflict.code,
            `Operasi ${index + 1}: ${conflict.message}`,
            [{ path: `changes.${index}`, code: conflict.code, message: conflict.message }],
          );
        }
        throw error;
      }
    }
    // HR hanya menyinkron pemegang pos yang boleh ia kelola (garis tegas tidak lintas PT, jadi
    // perubahan di PT-nya tidak mengubah atasan PT lain); SA menyinkron seluruh bagan.
    const scope = await manageablePostIds(ctx, tx);
    const managersUpdated = await syncPostManagers(tx, scope);
    const result = { revision, createdIds, managersUpdated };
    if (previewOnly) {
      // Ringkasan hanya memuat karyawan di PT cakupan aktor (SA: semua).
      const visible = (person: { companyId: string }) =>
        canManageOrgStructure(ctx.actor, person.companyId);
      const after = (await repository.listChartPeople(tx)).filter(visible);
      const managerIds = [
        ...new Set(
          [...before, ...after].flatMap((person) => (person.managerId ? [person.managerId] : [])),
        ),
      ];
      const managers = await repository.findChartPersonNames(tx, managerIds);
      const byId = new Map([...managers, ...before, ...after].map((person) => [person.id, person]));
      const oldById = new Map(before.map((person) => [person.id, person]));
      const personRef = (id: string | null) => {
        const person = id ? byId.get(id) : undefined;
        return person ? { id: person.id, fullName: person.fullName } : null;
      };
      for (const person of after) {
        const previous = oldById.get(person.id);
        if (previous && previous.managerId !== person.managerId) {
          preview.managerChanges.push({
            employee: { id: person.id, fullName: person.fullName },
            fromManager: personRef(previous.managerId),
            toManager: personRef(person.managerId),
          });
        }
      }
      const pending = await countPendingRequestsForEmployees(
        tx,
        preview.managerChanges.map((change) => change.employee.id),
      );
      preview.pendingRequests = pending.flatMap((row) => {
        const employee = personRef(row.employeeId);
        return employee ? [{ employee, subjectType: row.subjectType, count: row.count }] : [];
      });
      throw new PreviewRollback(preview);
    }
    await auditOrgChartBatch(ctx, tx, input, result);
    return result;
  });
}

function describePost(
  change: OrgChartChange,
  before: OrgPostNode | undefined,
  after: OrgPostNode,
  nodes: OrgPostNode[],
): string[] {
  if (change.op === "archivePost") return ["Pos diarsipkan."];
  const details: string[] = [];
  const describe = (
    label: string,
    old: string | number | null | undefined,
    next: string | number | null,
    changed = old !== next,
  ) => {
    if (!before || changed)
      details.push(`${label}: ${before ? `${old ?? "Tidak ada"} → ` : ""}${next ?? "Tidak ada"}`);
  };
  const parentLabel = (id: string | null | undefined) =>
    postLabel(nodes.find((post) => post.id === id));
  describe(
    "Atasan",
    parentLabel(before?.reportsToId),
    parentLabel(after.reportsToId),
    before?.reportsToId !== after.reportsToId,
  );
  describe(
    "Atasan fungsional",
    parentLabel(before?.functionalReportsToId),
    parentLabel(after.functionalReportsToId),
    before?.functionalReportsToId !== after.functionalReportsToId,
  );
  describe(
    "Jabatan",
    before?.positionName,
    after.positionName,
    before?.positionId !== after.positionId,
  );
  describe("Slot", before?.headcount, after.headcount);
  describe("Urutan", before?.sortOrder, after.sortOrder);
  return details;
}

export function applyOrgChartChanges(
  ctx: RequestContext,
  input: OrgChartChangeBatch,
): Promise<OrgChartChangeResult> {
  return execute(ctx, input, false);
}

export async function previewOrgChartChanges(
  ctx: RequestContext,
  input: OrgChartChangeBatch,
): Promise<OrgChartChangePreview> {
  try {
    await execute(ctx, input, true);
  } catch (error) {
    if (error instanceof PreviewRollback) return error.preview;
    throw error;
  }
  throw new BusinessRuleError("Ringkasan perubahan tidak tersedia.");
}
