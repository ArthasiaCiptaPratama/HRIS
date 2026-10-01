import {
  companyInputSchema,
  departmentInputSchema,
  employmentStatusInputSchema,
  GEOFENCE_INCOMPLETE_MESSAGE,
  geofenceIncomplete,
  gradeInputSchema,
  type MasterDataKind,
  type MasterDataView,
  MERGEABLE_MASTER_DATA,
  positionInputSchema,
  workLocationBaseSchema,
  workLocationInputSchema,
} from "@hris/shared";
import type { z } from "zod";
import type { Actor } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import * as policy from "./organization.policy.ts";
import * as repository from "./organization.repository.ts";
import { masterKey } from "./organization.service.ts";
import type {
  AdminListQuery,
  CompanyAdmin,
  DepartmentAdmin,
  EmploymentStatusAdmin,
  GradeAdmin,
  MergeResult,
  PositionAdmin,
  WorkLocationAdmin,
} from "./organization-admin.schema.ts";

// D-049: kelola master data. Organization tidak membaca tabel employee (PLAN §3.2.4): jumlah karyawan &
// pemindahan rujukan saat gabungkan disuntikkan dari modul employee lewat configureOrganization (app.ts).

export type MasterRefKind = "company" | "position" | "status" | "grade" | "location";
export interface EmployeeMasterDataSupport {
  countByMasterRef(kind: MasterRefKind): Promise<Map<string, { active: number; total: number }>>;
  reassignMasterRef(
    tx: repository.OrganizationTx,
    kind: Exclude<MasterRefKind, "company">,
    fromId: string,
    toId: string,
  ): Promise<{ employees: number; histories: number }>;
}

let support: EmployeeMasterDataSupport | undefined;

export function configureOrganization(next: { employeeSupport: EmployeeMasterDataSupport }): void {
  support = next.employeeSupport;
}

function employees(): EmployeeMasterDataSupport {
  // Gagal tertutup: tanpa konfigurasi, jumlah pemakai & gabungkan tidak bisa dipastikan benar.
  if (!support) throw new Error("organization: employeeSupport belum dikonfigurasi");
  return support;
}

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

const ENTITY: Record<MasterDataKind, repository.ArchivableEntity> = {
  companies: "company",
  departments: "department",
  positions: "position",
  "employment-statuses": "employmentStatus",
  grades: "grade",
  "work-locations": "workLocation",
};
const AUDIT_ENTITY: Record<MasterDataKind, string> = {
  companies: "company",
  departments: "department",
  positions: "position",
  "employment-statuses": "employment_status",
  grades: "grade",
  "work-locations": "work_location",
};
const LABEL: Record<MasterDataKind, string> = {
  companies: "Perusahaan",
  departments: "Departemen",
  positions: "Jabatan",
  "employment-statuses": "Status kepegawaian",
  grades: "Grade",
  "work-locations": "Lokasi kerja",
};

function assertCanView(actor: Actor) {
  if (!policy.canViewMasterDataAdmin(actor)) throw new ForbiddenError();
}
function assertCanManage(actor: Actor) {
  if (!policy.canManageMasterData(actor)) throw new ForbiddenError();
}

async function audit(
  ctx: RequestContext,
  tx: repository.OrganizationTx,
  kind: MasterDataKind,
  action: string,
  id: string,
  extra: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null },
) {
  const entity = AUDIT_ENTITY[kind];
  await writeAudit(
    {
      actorAccountId: ctx.actor.accountId,
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
      action: `organization.${entity}.${action}`,
      entityType: `organization.${entity}`,
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

/** P2002 unik → 409; P2003/P2014 rujukan → 409 (hapus permanen ditolak); lainnya diteruskan. */
async function mapDbErrors<T>(kind: MasterDataKind, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2002") {
      throw new ConflictError(
        kind === "employment-statuses"
          ? "Nama atau kategori sudah dipakai status lain (termasuk yang diarsipkan)."
          : kind === "companies"
            ? "Kode atau nama perusahaan sudah dipakai (termasuk yang diarsipkan)."
            : `${LABEL[kind]} dengan nama itu sudah ada (termasuk yang diarsipkan — pulihkan saja).`,
      );
    }
    if (code === "P2003" || code === "P2014") {
      throw new ConflictError(
        `${LABEL[kind]} ini sudah pernah dipakai data lain, jadi tidak bisa dihapus permanen. Arsipkan saja.`,
      );
    }
    throw error;
  }
}

const num = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());
const decimal = (value: number | null | undefined) =>
  value === null || value === undefined ? null : new Prisma.Decimal(value.toFixed(6));

function matchesView(archived: boolean, view: MasterDataView) {
  return view === "all" || (view === "archived" ? archived : !archived);
}
function matchesQ(q: string | undefined, ...texts: (string | null)[]) {
  if (!q) return true;
  const needle = masterKey(q);
  return texts.some((text) => text !== null && masterKey(text).includes(needle));
}

// ── Daftar admin ──────────────────────────────────────────────────────────────

export type AdminItem =
  | CompanyAdmin
  | DepartmentAdmin
  | PositionAdmin
  | EmploymentStatusAdmin
  | GradeAdmin
  | WorkLocationAdmin;

export async function listAdmin(
  ctx: RequestContext,
  kind: MasterDataKind,
  query: AdminListQuery,
): Promise<AdminItem[]> {
  assertCanView(ctx.actor);
  const rows = await repository.listAdminRows();
  const keep = (archived: boolean, ...texts: (string | null)[]) =>
    matchesView(archived, query.view) && matchesQ(query.q, ...texts);
  const active = (map: Map<string, { active: number; total: number }>, id: string) =>
    map.get(id)?.active ?? 0;

  switch (kind) {
    case "companies": {
      const usage = await employees().countByMasterRef("company");
      return (
        rows.companies
          // D-040: HR hanya melihat PT yang ditugaskan; SA semua.
          .filter((c) => ctx.actor.companyIds === null || ctx.actor.companyIds.has(c.id))
          .filter((c) => keep(c.deletedAt !== null, c.code, c.name))
          .map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            npwpNumber: c.npwpNumber,
            address: c.address,
            archived: c.deletedAt !== null,
            employeeCount: active(usage, c.id),
            totalEmployeeCount: usage.get(c.id)?.total ?? 0,
          }))
      );
    }
    case "departments": {
      const usage = await employees().countByMasterRef("position");
      const names = new Map(rows.departments.map((d) => [d.id, d.name]));
      return rows.departments
        .filter((d) => keep(d.deletedAt !== null, d.name))
        .map((d) => {
          const positions = rows.positions.filter((p) => p.departmentId === d.id);
          return {
            id: d.id,
            name: d.name,
            parentId: d.parentId,
            parentName: d.parentId ? (names.get(d.parentId) ?? null) : null,
            positionCount: positions.filter((p) => p.deletedAt === null).length,
            archived: d.deletedAt !== null,
            employeeCount: positions.reduce((sum, p) => sum + active(usage, p.id), 0),
          };
        });
    }
    case "positions": {
      const usage = await employees().countByMasterRef("position");
      const names = new Map(rows.departments.map((d) => [d.id, d.name]));
      return rows.positions
        .map((p) => ({ ...p, departmentName: names.get(p.departmentId) ?? "" }))
        .filter((p) => keep(p.deletedAt !== null, p.name, p.departmentName))
        .map((p) => ({
          id: p.id,
          name: p.name,
          departmentId: p.departmentId,
          departmentName: p.departmentName,
          archived: p.deletedAt !== null,
          employeeCount: active(usage, p.id),
        }));
    }
    case "employment-statuses": {
      const usage = await employees().countByMasterRef("status");
      return rows.statuses
        .filter((s) => keep(s.deletedAt !== null, s.name))
        .map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          archived: s.deletedAt !== null,
          employeeCount: active(usage, s.id),
        }));
    }
    case "grades": {
      const usage = await employees().countByMasterRef("grade");
      return rows.grades
        .filter((g) => keep(g.deletedAt !== null, g.name))
        .map((g) => ({
          id: g.id,
          name: g.name,
          archived: g.deletedAt !== null,
          employeeCount: active(usage, g.id),
        }));
    }
    case "work-locations": {
      const usage = await employees().countByMasterRef("location");
      return rows.locations
        .filter((l) => keep(l.deletedAt !== null, l.name, l.city))
        .map((l) => ({
          id: l.id,
          name: l.name,
          city: l.city,
          address: l.address,
          latitude: num(l.latitude),
          longitude: num(l.longitude),
          radiusM: l.radiusM,
          archived: l.deletedAt !== null,
          employeeCount: active(usage, l.id),
        }));
    }
  }
}

// ── Bantuan aturan ────────────────────────────────────────────────────────────

type Rows = repository.AdminRows;

function findRow(rows: Rows, kind: MasterDataKind, id: string) {
  const list: { id: string; deletedAt: Date | null }[] = {
    companies: rows.companies,
    departments: rows.departments,
    positions: rows.positions,
    "employment-statuses": rows.statuses,
    grades: rows.grades,
    "work-locations": rows.locations,
  }[kind];
  const row = list.find((r) => r.id === id);
  if (!row) throw new NotFoundError(`${LABEL[kind]} tidak ditemukan.`);
  return row;
}

function activeDepartment(rows: Rows, id: string, label = "Departemen") {
  const department = rows.departments.find((d) => d.id === id);
  if (!department || department.deletedAt !== null) {
    throw new BusinessRuleError(`${label} tidak ditemukan atau sudah diarsipkan.`);
  }
  return department;
}

/** Induk departemen tidak boleh dirinya sendiri atau keturunannya (siklus). */
function assertNoCycle(rows: Rows, id: string, parentId: string | null | undefined) {
  if (!parentId) return;
  if (parentId === id) throw new BusinessRuleError("Departemen tidak boleh menjadi induk dirinya.");
  const parents = new Map(rows.departments.map((d) => [d.id, d.parentId]));
  let cursor: string | null | undefined = parentId;
  for (let depth = 0; cursor && depth < 100; depth += 1) {
    if (cursor === id) {
      throw new BusinessRuleError("Induk tidak boleh sub-departemen dari departemen ini (siklus).");
    }
    cursor = parents.get(cursor);
  }
}

function isDescendant(rows: Rows, candidateId: string, ancestorId: string) {
  const parents = new Map(rows.departments.map((d) => [d.id, d.parentId]));
  let cursor = parents.get(candidateId);
  for (let depth = 0; cursor && depth < 100; depth += 1) {
    if (cursor === ancestorId) return true;
    cursor = parents.get(cursor);
  }
  return false;
}

function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
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

// ── Tambah ────────────────────────────────────────────────────────────────────

export async function createItem(
  ctx: RequestContext,
  kind: MasterDataKind,
  body: unknown,
): Promise<{ id: string }> {
  assertCanManage(ctx.actor);
  const rows = await repository.listAdminRows();
  return mapDbErrors(kind, () =>
    repository.withTransaction(async (tx) => {
      let created: { id: string };
      let after: Record<string, unknown>;
      switch (kind) {
        case "companies": {
          const input = parseInput(companyInputSchema, body);
          const data = {
            code: input.code,
            name: input.name,
            npwpNumber: input.npwpNumber ?? null,
            address: input.address ?? null,
          };
          created = await repository.companyRepo.create(tx, data);
          after = { code: data.code, name: data.name };
          break;
        }
        case "departments": {
          const input = parseInput(departmentInputSchema, body);
          if (input.parentId) activeDepartment(rows, input.parentId, "Departemen induk");
          created = await repository.departmentRepo.create(tx, {
            name: input.name,
            parentId: input.parentId ?? null,
          });
          after = { name: input.name, parentId: input.parentId ?? null };
          break;
        }
        case "positions": {
          const input = parseInput(positionInputSchema, body);
          activeDepartment(rows, input.departmentId);
          created = await repository.positionRepo.create(tx, input);
          after = { name: input.name, departmentId: input.departmentId };
          break;
        }
        case "employment-statuses": {
          const input = parseInput(employmentStatusInputSchema, body);
          created = await repository.statusRepo.create(tx, {
            name: input.name,
            category: input.category ?? null,
          });
          after = { name: input.name, category: input.category ?? null };
          break;
        }
        case "grades": {
          const input = parseInput(gradeInputSchema, body);
          created = await repository.gradeRepo.create(tx, { name: input.name });
          after = { name: input.name };
          break;
        }
        case "work-locations": {
          const input = parseInput(workLocationInputSchema, body);
          created = await repository.workLocationRepo.create(tx, {
            name: input.name,
            city: input.city ?? null,
            address: input.address ?? null,
            latitude: decimal(input.latitude),
            longitude: decimal(input.longitude),
            radiusM: input.radiusM ?? null,
          });
          after = {
            name: input.name,
            city: input.city ?? null,
            geofence: input.radiusM ? { radiusM: input.radiusM } : null,
          };
          break;
        }
      }
      await audit(ctx, tx, kind, "create", created.id, { after });
      return { id: created.id };
    }),
  );
}

// ── Ubah ──────────────────────────────────────────────────────────────────────

export async function updateItem(
  ctx: RequestContext,
  kind: MasterDataKind,
  id: string,
  body: unknown,
): Promise<{ id: string }> {
  assertCanManage(ctx.actor);
  const rows = await repository.listAdminRows();
  const row = findRow(rows, kind, id);
  if (row.deletedAt !== null) {
    throw new BusinessRuleError(`${LABEL[kind]} diarsipkan. Pulihkan dulu sebelum mengubah.`);
  }
  return mapDbErrors(kind, () =>
    repository.withTransaction(async (tx) => {
      let before: Record<string, unknown> = {};
      let after: Record<string, unknown> = {};
      switch (kind) {
        case "companies": {
          const input = parseInput(companyInputSchema.partial(), body);
          const current = rows.companies.find((c) => c.id === id);
          if (input.code !== undefined && input.code !== current?.code) {
            // D-045: kode PT dipakai nomor induk karyawan → terkunci setelah ada karyawan.
            const total = (await employees().countByMasterRef("company")).get(id)?.total ?? 0;
            if (total > 0) {
              throw new BusinessRuleError(
                "Kode perusahaan tidak bisa diubah karena sudah dipakai karyawan (nomor induk).",
              );
            }
          }
          await repository.companyRepo.update(tx, id, input);
          before = { code: current?.code, name: current?.name };
          after = { code: input.code, name: input.name };
          break;
        }
        case "departments": {
          const input = parseInput(departmentInputSchema.partial(), body);
          if (input.parentId) activeDepartment(rows, input.parentId, "Departemen induk");
          assertNoCycle(rows, id, input.parentId);
          const current = rows.departments.find((d) => d.id === id);
          await repository.departmentRepo.update(tx, id, input);
          before = { name: current?.name, parentId: current?.parentId };
          after = input;
          break;
        }
        case "positions": {
          const input = parseInput(positionInputSchema.partial(), body);
          if (input.departmentId) activeDepartment(rows, input.departmentId);
          const current = rows.positions.find((p) => p.id === id);
          await repository.positionRepo.update(tx, id, input);
          before = { name: current?.name, departmentId: current?.departmentId };
          after = input;
          break;
        }
        case "employment-statuses": {
          const input = parseInput(employmentStatusInputSchema.partial(), body);
          const current = rows.statuses.find((s) => s.id === id);
          await repository.statusRepo.update(tx, id, input);
          before = { name: current?.name, category: current?.category };
          after = input;
          break;
        }
        case "grades": {
          const input = parseInput(gradeInputSchema.partial(), body);
          const current = rows.grades.find((g) => g.id === id);
          await repository.gradeRepo.update(tx, id, input);
          before = { name: current?.name };
          after = input;
          break;
        }
        case "work-locations": {
          const input = parseInput(workLocationBaseSchema.partial(), body);
          const current = rows.locations.find((l) => l.id === id);
          const merged = {
            latitude:
              input.latitude !== undefined ? input.latitude : num(current?.latitude ?? null),
            longitude:
              input.longitude !== undefined ? input.longitude : num(current?.longitude ?? null),
            radiusM: input.radiusM !== undefined ? input.radiusM : (current?.radiusM ?? null),
          };
          if (geofenceIncomplete(merged)) {
            throw new ValidationError([
              { path: "latitude", code: "custom", message: GEOFENCE_INCOMPLETE_MESSAGE },
            ]);
          }
          await repository.workLocationRepo.update(tx, id, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.city !== undefined ? { city: input.city } : {}),
            ...(input.address !== undefined ? { address: input.address } : {}),
            ...(input.latitude !== undefined ? { latitude: decimal(input.latitude) } : {}),
            ...(input.longitude !== undefined ? { longitude: decimal(input.longitude) } : {}),
            ...(input.radiusM !== undefined ? { radiusM: input.radiusM } : {}),
          });
          before = { name: current?.name, city: current?.city, radiusM: current?.radiusM };
          after = { name: input.name, city: input.city, radiusM: input.radiusM };
          break;
        }
      }
      await audit(ctx, tx, kind, "update", id, { before, after });
      return { id };
    }),
  );
}

// ── Arsip, pulihkan, hapus ─────────────────────────────────────────────────────

export async function archiveItem(
  ctx: RequestContext,
  kind: MasterDataKind,
  id: string,
  now = new Date(),
): Promise<{ id: string }> {
  assertCanManage(ctx.actor);
  const rows = await repository.listAdminRows();
  const row = findRow(rows, kind, id);
  if (row.deletedAt !== null) throw new ConflictError(`${LABEL[kind]} sudah diarsipkan.`);
  if (kind === "companies") {
    const active = (await employees().countByMasterRef("company")).get(id)?.active ?? 0;
    if (active > 0) {
      throw new BusinessRuleError(
        `Perusahaan masih punya ${active} karyawan aktif. Pindahkan atau nonaktifkan karyawannya dulu.`,
      );
    }
  }
  if (kind === "departments") {
    const positions = rows.positions.filter((p) => p.departmentId === id && p.deletedAt === null);
    const children = rows.departments.filter((d) => d.parentId === id && d.deletedAt === null);
    if (positions.length > 0 || children.length > 0) {
      throw new BusinessRuleError(
        "Departemen masih punya jabatan atau sub-departemen aktif. Arsipkan/pindahkan dulu, atau gabungkan ke departemen lain.",
      );
    }
  }
  if (kind === "employment-statuses") {
    const status = rows.statuses.find((s) => s.id === id);
    if (status?.category) {
      throw new BusinessRuleError(
        "Status yang mewakili kategori tidak bisa diarsipkan. Kosongkan kategorinya atau pindahkan ke status lain dulu.",
      );
    }
  }
  return repository.withTransaction(async (tx) => {
    await repository.setArchived(tx, ENTITY[kind], id, now);
    await audit(ctx, tx, kind, "archive", id, {});
    return { id };
  });
}

export async function restoreItem(
  ctx: RequestContext,
  kind: MasterDataKind,
  id: string,
): Promise<{ id: string }> {
  assertCanManage(ctx.actor);
  const rows = await repository.listAdminRows();
  const row = findRow(rows, kind, id);
  if (row.deletedAt === null) throw new ConflictError(`${LABEL[kind]} tidak diarsipkan.`);
  if (kind === "positions") {
    const position = rows.positions.find((p) => p.id === id);
    if (position) activeDepartment(rows, position.departmentId);
  }
  if (kind === "departments") {
    const department = rows.departments.find((d) => d.id === id);
    if (department?.parentId) activeDepartment(rows, department.parentId, "Departemen induk");
  }
  return repository.withTransaction(async (tx) => {
    await repository.setArchived(tx, ENTITY[kind], id, null);
    await audit(ctx, tx, kind, "restore", id, {});
    return { id };
  });
}

export async function deleteItem(
  ctx: RequestContext,
  kind: MasterDataKind,
  id: string,
): Promise<{ id: string }> {
  assertCanManage(ctx.actor);
  const rows = await repository.listAdminRows();
  const row = findRow(rows, kind, id) as { id: string; name?: string; code?: string };
  return mapDbErrors(kind, () =>
    repository.withTransaction(async (tx) => {
      // Audit ditulis lebih dulu dalam transaksi yang sama: bila FK menolak, keduanya batal.
      await audit(ctx, tx, kind, "delete", id, {
        before: { name: row.name ?? null, code: row.code ?? null },
      });
      await repository.hardDelete(tx, ENTITY[kind], id);
      return { id };
    }),
  );
}

// ── Gabungkan ─────────────────────────────────────────────────────────────────

const REF_KIND: Partial<Record<MasterDataKind, Exclude<MasterRefKind, "company">>> = {
  positions: "position",
  "employment-statuses": "status",
  grades: "grade",
  "work-locations": "location",
};

export async function mergeItem(
  ctx: RequestContext,
  kind: MasterDataKind,
  id: string,
  targetId: string,
  now = new Date(),
): Promise<MergeResult> {
  assertCanManage(ctx.actor);
  if (!MERGEABLE_MASTER_DATA.includes(kind)) {
    throw new BusinessRuleError(`${LABEL[kind]} tidak bisa digabungkan.`);
  }
  if (id === targetId) throw new BusinessRuleError("Pilih tujuan yang berbeda.");
  const rows = await repository.listAdminRows();
  findRow(rows, kind, id);
  const target = findRow(rows, kind, targetId);
  if (target.deletedAt !== null) {
    throw new BusinessRuleError("Tujuan diarsipkan. Pulihkan dulu atau pilih tujuan lain.");
  }
  if (kind === "employment-statuses") {
    const source = rows.statuses.find((s) => s.id === id);
    if (source?.category) {
      throw new BusinessRuleError(
        "Status yang mewakili kategori tidak bisa digabung ke status lain. Pindahkan kategorinya dulu.",
      );
    }
  }
  if (kind === "departments" && isDescendant(rows, targetId, id)) {
    throw new BusinessRuleError("Tujuan adalah sub-departemen dari departemen ini.");
  }

  return mapDbErrors(kind, () =>
    repository.withTransaction(async (tx) => {
      let movedEmployees = 0;
      let movedHistories = 0;
      let movedPositions = 0;
      const refKind = REF_KIND[kind];
      if (refKind) {
        const moved = await employees().reassignMasterRef(tx, refKind, id, targetId);
        movedEmployees = moved.employees;
        movedHistories = moved.histories;
      } else {
        // Departemen: jabatan dipindah ke tujuan; jabatan bernama sama digabung ke jabatan tujuan.
        const targetPositions = new Map(
          rows.positions
            .filter((p) => p.departmentId === targetId)
            .map((p) => [masterKey(p.name), p]),
        );
        for (const position of rows.positions.filter((p) => p.departmentId === id)) {
          const same = targetPositions.get(masterKey(position.name));
          if (same) {
            const moved = await employees().reassignMasterRef(tx, "position", position.id, same.id);
            movedEmployees += moved.employees;
            movedHistories += moved.histories;
            if (same.deletedAt !== null && position.deletedAt === null) {
              await repository.setArchived(tx, "position", same.id, null);
            }
            if (position.deletedAt === null) {
              await repository.setArchived(tx, "position", position.id, now);
            }
          } else {
            await repository.positionRepo.update(tx, position.id, { departmentId: targetId });
            movedPositions += 1;
          }
        }
        await repository.departmentRepo.reparentChildren(tx, id, targetId);
      }
      const source = findRow(rows, kind, id);
      if (source.deletedAt === null) {
        await repository.setArchived(tx, ENTITY[kind], id, now);
      }
      await audit(ctx, tx, kind, "merge", id, {
        after: { targetId, movedEmployees, movedHistories, movedPositions },
      });
      return { id, targetId, movedEmployees, movedHistories, movedPositions };
    }),
  );
}
