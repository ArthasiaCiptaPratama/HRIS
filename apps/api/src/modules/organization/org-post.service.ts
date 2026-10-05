import {
  canReportTo,
  type OrgPostInput,
  type OrgPostUpdate,
  type OrgUnitType,
  orgPostInputSchema,
  orgPostUpdateSchema,
  type PositionLevel,
  wouldCreatePostCycle,
} from "@hris/shared";
import type { z } from "zod";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import type { OrgPostAdmin, OrgPostListQuery } from "./org-post.schema.ts";
import * as policy from "./organization.policy.ts";
import * as repository from "./organization.repository.ts";
import { masterKey } from "./organization.service.ts";
import { employeeSupport, type RequestContext } from "./organization-support.ts";

// D-051: pos jabatan (kursi di bagan). SA kelola, HR lihat (D-049). Setiap perubahan struktur memicu
// sinkron atasan otomatis (D-053) lewat modul employee (disuntikkan di app.ts; organization tidak
// membaca tabel employee, PLAN §3.2.4).

/** Pos dalam bentuk yang dipakai modul lain (bagan, penempatan karyawan, sinkron atasan). */
export interface OrgPostNode {
  id: string;
  code: string | null;
  positionId: string;
  positionName: string;
  level: PositionLevel | null;
  departmentId: string;
  departmentName: string;
  unitType: OrgUnitType;
  companyId: string | null;
  reportsToId: string | null;
  functionalReportsToId: string | null;
  headcount: number;
  sortOrder: number;
  archived: boolean;
}

function toNode(row: repository.PostRow): OrgPostNode {
  return {
    id: row.id,
    code: row.code,
    positionId: row.positionId,
    positionName: row.position.name,
    level: row.position.level,
    departmentId: row.position.departmentId,
    departmentName: row.position.department.name,
    unitType: row.position.department.unitType,
    companyId: row.position.department.companyId,
    reportsToId: row.reportsToId,
    functionalReportsToId: row.functionalReportsToId,
    headcount: row.headcount,
    sortOrder: row.sortOrder,
    archived: row.deletedAt !== null,
  };
}

/** Semua pos (termasuk arsip, ditandai) untuk modul lain lewat index.ts. */
export async function listOrgPosts(tx?: repository.OrganizationTx): Promise<OrgPostNode[]> {
  return (await repository.listPostRows(tx)).map(toNode);
}

function assertCanView(ctx: RequestContext) {
  if (!policy.canViewMasterDataAdmin(ctx.actor)) throw new ForbiddenError();
}
function assertCanManage(ctx: RequestContext) {
  if (!policy.canManageMasterData(ctx.actor)) throw new ForbiddenError();
}

const label = (node: OrgPostNode | undefined) =>
  node ? `${node.positionName} · ${node.departmentName}` : null;

export async function listPostsAdmin(
  ctx: RequestContext,
  query: OrgPostListQuery,
): Promise<OrgPostAdmin[]> {
  assertCanView(ctx);
  const [nodes, holders, companies] = await Promise.all([
    listOrgPosts(),
    employeeSupport().countPostHolders(),
    repository.listAdminRows().then((rows) => rows.companies),
  ]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const codes = new Map(companies.map((c) => [c.id, c.code]));
  const needle = query.q ? masterKey(query.q) : null;
  return nodes
    .filter((node) =>
      query.view === "all" ? true : query.view === "archived" ? node.archived : !node.archived,
    )
    .filter((node) =>
      query.companyId === undefined
        ? true
        : query.companyId === "corporate"
          ? node.companyId === null
          : node.companyId === query.companyId,
    )
    .filter(
      (node) =>
        !needle ||
        [node.positionName, node.departmentName, node.code ?? ""].some((text) =>
          masterKey(text).includes(needle),
        ),
    )
    .map((node) => ({
      id: node.id,
      code: node.code,
      positionId: node.positionId,
      positionName: node.positionName,
      level: node.level,
      departmentId: node.departmentId,
      departmentName: node.departmentName,
      unitType: node.unitType,
      companyId: node.companyId,
      companyCode: node.companyId ? (codes.get(node.companyId) ?? null) : null,
      reportsToId: node.reportsToId,
      reportsToLabel: label(node.reportsToId ? byId.get(node.reportsToId) : undefined),
      functionalReportsToId: node.functionalReportsToId,
      functionalReportsToLabel: label(
        node.functionalReportsToId ? byId.get(node.functionalReportsToId) : undefined,
      ),
      headcount: node.headcount,
      holderCount: holders.get(node.id) ?? 0,
      sortOrder: node.sortOrder,
      archived: node.archived,
    }));
}

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  return result.data;
}

interface Placement {
  positionId: string;
  reportsToId: string | null;
  functionalReportsToId: string | null;
}

/** Aturan struktur pos (D-051/D-052): jabatan aktif, atasan aktif, aturan PT, tanpa siklus. */
async function assertPlacement(
  tx: repository.OrganizationTx,
  nodes: OrgPostNode[],
  id: string | null,
  next: Placement,
) {
  const rows = await repository.listAdminRows();
  const position = rows.positions.find((p) => p.id === next.positionId);
  if (!position || position.deletedAt !== null) {
    throw new BusinessRuleError("Jabatan tidak ditemukan atau sudah diarsipkan.");
  }
  const unit = rows.departments.find((d) => d.id === position.departmentId);
  if (!unit || unit.deletedAt !== null) {
    throw new BusinessRuleError("Unit organisasi jabatan ini sudah diarsipkan.");
  }
  const self = { companyId: unit.companyId };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (next.reportsToId && next.reportsToId === next.functionalReportsToId) {
    throw new BusinessRuleError("Atasan fungsional tidak boleh sama dengan atasan langsung.");
  }
  for (const [key, line] of [
    ["reportsToId", "solid"],
    ["functionalReportsToId", "functional"],
  ] as const) {
    const parentId = next[key];
    if (!parentId) continue;
    const parent = byId.get(parentId);
    const what = line === "solid" ? "Atasan" : "Atasan fungsional";
    if (!parent || parent.archived) {
      throw new BusinessRuleError(`${what} tidak ditemukan atau sudah diarsipkan.`);
    }
    if (parentId === id) throw new BusinessRuleError(`${what} tidak boleh pos ini sendiri.`);
    if (!canReportTo(self, parent, line)) {
      throw new BusinessRuleError(
        line === "solid"
          ? "Atasan langsung harus pos di perusahaan yang sama (fungsi korporat hanya lewat garis fungsional)."
          : "Atasan fungsional harus pos di perusahaan yang sama atau fungsi korporat grup.",
      );
    }
  }
  if (id && wouldCreatePostCycle(nodes, id, next.reportsToId)) {
    throw new BusinessRuleError("Atasan ini membuat struktur melingkar (bawahan menjadi atasan).");
  }
  // Pos bawahan harus tetap sah bila PT pos ini berubah (mis. ganti jabatan ke unit PT lain).
  if (id) {
    const children = nodes.filter(
      (node) => !node.archived && (node.reportsToId === id || node.functionalReportsToId === id),
    );
    for (const child of children) {
      const line = child.reportsToId === id ? "solid" : "functional";
      if (!canReportTo(child, self, line)) {
        throw new BusinessRuleError(
          `Pos bawahan "${child.positionName}" milik perusahaan lain. Pindahkan bawahannya dulu.`,
        );
      }
    }
  }
  void tx;
}

async function audit(
  ctx: RequestContext,
  tx: repository.OrganizationTx,
  action: string,
  id: string,
  extra: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null },
) {
  await writeAudit(
    {
      actorAccountId: ctx.actor.accountId,
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
      action: `organization.org_post.${action}`,
      entityType: "organization.org_post",
      entityId: id,
      before: extra.before ?? null,
      after: extra.after ?? null,
    },
    tx,
  );
}

function prismaCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

async function mapDbErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2002") throw new ConflictError("Kode pos sudah dipakai pos lain.");
    if (code === "P2003" || code === "P2014") {
      throw new ConflictError("Pos masih dirujuk karyawan atau pos lain. Arsipkan saja.");
    }
    throw error;
  }
}

async function findNode(nodes: OrgPostNode[], id: string) {
  const node = nodes.find((n) => n.id === id);
  if (!node) throw new NotFoundError("Pos jabatan tidak ditemukan.");
  return node;
}

export async function createPost(ctx: RequestContext, body: unknown): Promise<{ id: string }> {
  assertCanManage(ctx);
  const input: OrgPostInput = parse(orgPostInputSchema, body);
  return mapDbErrors(() =>
    repository.withTransaction(async (tx) => {
      const nodes = await listOrgPosts(tx);
      const placement = {
        positionId: input.positionId,
        reportsToId: input.reportsToId ?? null,
        functionalReportsToId: input.functionalReportsToId ?? null,
      };
      await assertPlacement(tx, nodes, null, placement);
      const created = await repository.postRepo.create(tx, {
        ...placement,
        code: input.code ?? null,
        headcount: input.headcount,
        sortOrder: input.sortOrder,
      });
      await audit(ctx, tx, "create", created.id, {
        after: { ...placement, code: input.code ?? null, headcount: input.headcount },
      });
      return created;
    }),
  );
}

export async function updatePost(
  ctx: RequestContext,
  id: string,
  body: unknown,
): Promise<{ id: string }> {
  assertCanManage(ctx);
  const input: OrgPostUpdate = parse(orgPostUpdateSchema, body);
  return mapDbErrors(() =>
    repository.withTransaction(async (tx) => {
      const nodes = await listOrgPosts(tx);
      const current = await findNode(nodes, id);
      if (current.archived) {
        throw new BusinessRuleError("Pos diarsipkan. Pulihkan dulu untuk mengubah.");
      }
      const holders = (await employeeSupport().countPostHolders(tx)).get(id) ?? 0;
      if (input.positionId && input.positionId !== current.positionId && holders > 0) {
        throw new BusinessRuleError(
          "Pos masih ditempati karyawan. Pindahkan pemegangnya dulu sebelum mengganti jabatan.",
        );
      }
      if (input.headcount !== undefined && input.headcount < holders) {
        throw new BusinessRuleError(
          `Jumlah slot tidak boleh kurang dari pemegang saat ini (${holders}).`,
        );
      }
      const next = {
        positionId: input.positionId ?? current.positionId,
        reportsToId: input.reportsToId !== undefined ? input.reportsToId : current.reportsToId,
        functionalReportsToId:
          input.functionalReportsToId !== undefined
            ? input.functionalReportsToId
            : current.functionalReportsToId,
      };
      await assertPlacement(tx, nodes, id, next);
      await repository.postRepo.update(tx, id, input);
      await audit(ctx, tx, "update", id, {
        before: {
          positionId: current.positionId,
          reportsToId: current.reportsToId,
          functionalReportsToId: current.functionalReportsToId,
          headcount: current.headcount,
        },
        after: input,
      });
      // D-053: struktur berubah → atasan otomatis pemegang pos ikut disesuaikan.
      if (input.reportsToId !== undefined) await employeeSupport().syncPostManagers(tx);
      return { id };
    }),
  );
}

export async function archivePost(ctx: RequestContext, id: string, archived: boolean) {
  assertCanManage(ctx);
  return repository.withTransaction(async (tx) => {
    const nodes = await listOrgPosts(tx);
    const current = await findNode(nodes, id);
    if (archived) {
      const holders = (await employeeSupport().countPostHolders(tx)).get(id) ?? 0;
      if (holders > 0) {
        throw new BusinessRuleError(
          `Pos masih ditempati ${holders} karyawan. Pindahkan pemegangnya dulu.`,
        );
      }
      const child = nodes.find(
        (node) => !node.archived && (node.reportsToId === id || node.functionalReportsToId === id),
      );
      if (child) {
        throw new BusinessRuleError(
          `Pos "${child.positionName}" masih melapor ke pos ini. Pindahkan bawahannya dulu.`,
        );
      }
    } else {
      await assertPlacement(tx, nodes, id, current);
    }
    await repository.postRepo.setArchived(tx, id, archived ? new Date() : null);
    await audit(ctx, tx, archived ? "archive" : "restore", id, {});
    return { id };
  });
}

export async function deletePost(ctx: RequestContext, id: string) {
  assertCanManage(ctx);
  return mapDbErrors(() =>
    repository.withTransaction(async (tx) => {
      const nodes = await listOrgPosts(tx);
      const current = await findNode(nodes, id);
      await repository.postRepo.delete(tx, id);
      await audit(ctx, tx, "delete", id, {
        before: { positionId: current.positionId, code: current.code },
      });
      return { id };
    }),
  );
}

export async function syncManagers(ctx: RequestContext): Promise<{ updated: number }> {
  assertCanManage(ctx);
  return repository.withTransaction(async (tx) => {
    const updated = await employeeSupport().syncPostManagers(tx);
    await audit(ctx, tx, "sync_managers", ctx.actor.accountId, { after: { updated } });
    return { updated };
  });
}

/**
 * D-052: dipanggil saat PT sebuah unit diubah — semua pos di unit itu & pos yang terhubung harus
 * tetap memenuhi aturan PT.
 */
export async function assertUnitCompanyChange(
  tx: repository.OrganizationTx,
  unitId: string,
  companyId: string | null,
) {
  const nodes = (await listOrgPosts(tx)).filter((node) => !node.archived);
  const inUnit = new Set(nodes.filter((n) => n.departmentId === unitId).map((n) => n.id));
  if (inUnit.size === 0) return;
  const companyOf = (node: OrgPostNode) => (inUnit.has(node.id) ? companyId : node.companyId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    for (const [parentId, line] of [
      [node.reportsToId, "solid"],
      [node.functionalReportsToId, "functional"],
    ] as const) {
      const parent = parentId ? byId.get(parentId) : undefined;
      if (!parent || (!inUnit.has(node.id) && !inUnit.has(parent.id))) continue;
      if (!canReportTo({ companyId: companyOf(node) }, { companyId: companyOf(parent) }, line)) {
        throw new BusinessRuleError(
          `Pos "${node.positionName}" akan melapor ke perusahaan lain bila PT unit diubah. Atur ulang posnya dulu.`,
        );
      }
    }
  }
  const holders = await employeeSupport().postHolderCompanies(tx, [...inUnit]);
  if (companyId && holders.some((holderCompany) => holderCompany !== companyId)) {
    throw new BusinessRuleError(
      "Pos di unit ini ditempati karyawan perusahaan lain. Pindahkan pemegangnya dulu.",
    );
  }
}
