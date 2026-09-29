import { EMPLOYMENT_CATEGORIES, type EmploymentCategory } from "@hris/shared";
import type { Actor, EmployeeTarget } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import {
  deactivateAccountOfEmployee,
  getAccountLinksForEmployees,
  listManagerEmployeeIds,
} from "../iam/index.ts";
import {
  getMasterLookup,
  type MasterLookup,
  positionIdsInDepartment,
  statusIdsForCategory,
} from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import * as repository from "./employee.repository.ts";
import type {
  ChangeStatusInput,
  CreateEmployeeInput,
  DeactivateInput,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeSummary,
  ListEmployeesQuery,
  ManagerOption,
  OrgStructure,
  ReactivateInput,
  UpdateEmployeeInput,
} from "./employee.schema.ts";

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

// ── Utilitas ────────────────────────────────────────────────────────────────

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
/** PROMPT §4: logika harian memakai zona Asia/Jakarta. */
export const todayInJakarta = (now = new Date()) => JAKARTA_DATE.format(now);

function auditBase(ctx: RequestContext) {
  return {
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
    entityType: "employee.employee",
  };
}

const targetOf = (row: { id: string; managerId: string | null }): EmployeeTarget => ({
  employeeId: row.id,
  managerId: row.managerId,
});

function nameRef<T extends { id: string; name: string }>(map: Map<string, T>, id: string | null) {
  if (!id) return null;
  const row = map.get(id);
  return row ? { id: row.id, name: row.name } : null;
}

function toListItem(row: repository.EmployeeRow, lookup: MasterLookup): EmployeeListItem {
  const status = lookup.statuses.get(row.employmentStatusId);
  const position = lookup.positions.get(row.positionId);
  return {
    id: row.id,
    employeeNumber: row.employeeNumber,
    fullName: row.fullName,
    workEmail: row.workEmail,
    phoneNumber: row.phoneNumber,
    gender: row.gender,
    joinDate: toIso(row.joinDate),
    endDate: row.endDate ? toIso(row.endDate) : null,
    isActive: row.isActive,
    exitReason: row.exitReason,
    employmentStatus: {
      id: row.employmentStatusId,
      name: status?.name ?? "—",
      category: status?.category ?? null,
    },
    position: { id: row.positionId, name: position?.name ?? "—" },
    department: nameRef(lookup.departments, position?.departmentId ?? null),
    workLocation: nameRef(lookup.locations, row.workLocationId),
    grade: nameRef(lookup.grades, row.gradeId),
    manager: row.manager ? { id: row.manager.id, name: row.manager.fullName } : null,
  };
}

/** Respons mutasi: data kerja saja (tanpa bagian sensitif, jadi tanpa audit baca). */
async function loadListItem(id: string): Promise<EmployeeListItem> {
  const [row, lookup] = await Promise.all([loadEmployee(id), getMasterLookup()]);
  return toListItem(row, lookup);
}

async function loadEmployee(id: string, tx?: repository.EmployeeTx) {
  const row = await repository.findEmployee(id, tx);
  if (!row) throw new NotFoundError("Karyawan tidak ditemukan.");
  return row;
}

function assertCanManage(actor: Actor) {
  if (!policy.canManageEmployees(actor)) throw new ForbiddenError();
}

/** Prisma P2002 (unik) → 409 dengan pesan yang bisa dipahami pengguna. */
function rethrowUnique(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    const target = JSON.stringify((error as { meta?: unknown }).meta ?? "");
    throw new ConflictError(
      target.includes("work_email") || target.includes("workEmail")
        ? "Email kantor sudah dipakai karyawan lain."
        : "Nomor induk karyawan sudah dipakai.",
    );
  }
  throw error;
}

// ── Daftar & ringkasan ──────────────────────────────────────────────────────

const NO_MATCH = "00000000-0000-0000-0000-000000000000";

function scopeWhere(actor: Actor): repository.EmployeeWhere {
  const scope = policy.employeeListScope(actor);
  if (scope === null) throw new ForbiddenError();
  // D-035: MANAGER hanya tim (bawahan langsung, D-009).
  return scope === "team" ? { managerId: actor.employeeId } : {};
}

function buildWhere(
  actor: Actor,
  query: ListEmployeesQuery,
  lookup: MasterLookup,
): repository.EmployeeWhere {
  const and: repository.EmployeeWhere[] = [scopeWhere(actor), { isActive: query.active }];
  if (query.category) {
    const ids = statusIdsForCategory(lookup, query.category);
    and.push({ employmentStatusId: { in: ids.length > 0 ? ids : [NO_MATCH] } });
  }
  if (query.statusId) and.push({ employmentStatusId: query.statusId });
  if (query.departmentId) {
    const ids = positionIdsInDepartment(lookup, query.departmentId);
    and.push({ positionId: { in: ids.length > 0 ? ids : [NO_MATCH] } });
  }
  if (query.positionId) and.push({ positionId: query.positionId });
  if (query.workLocationId) and.push({ workLocationId: query.workLocationId });
  if (query.q) {
    and.push({
      OR: [
        { fullName: { contains: query.q, mode: "insensitive" } },
        { employeeNumber: { contains: query.q, mode: "insensitive" } },
        { workEmail: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
}

function buildOrderBy(sort: string): repository.EmployeeOrderBy[] {
  const [field, direction] = sort.split(":") as [string, "asc" | "desc"];
  const primary: repository.EmployeeOrderBy =
    field === "endDate"
      ? { endDate: { sort: direction, nulls: "last" } }
      : ({ [field]: direction } as repository.EmployeeOrderBy);
  // Urutan stabil antar-halaman.
  return [primary, { id: "asc" }];
}

export async function listEmployees(ctx: RequestContext, query: ListEmployeesQuery) {
  const lookup = await getMasterLookup();
  const where = buildWhere(ctx.actor, query, lookup);
  const { rows, total } = await repository.listEmployees(
    where,
    buildOrderBy(query.sort),
    (query.page - 1) * query.pageSize,
    query.pageSize,
  );
  return {
    data: rows.map((row) => toListItem(row, lookup)),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getSummary(ctx: RequestContext): Promise<EmployeeSummary> {
  const [lookup, groups] = await Promise.all([
    getMasterLookup(),
    repository.countByStatus(scopeWhere(ctx.actor)),
  ]);
  const byCategory = Object.fromEntries(EMPLOYMENT_CATEGORIES.map((c) => [c, 0])) as Record<
    EmploymentCategory,
    number
  >;
  let total = 0;
  let uncategorized = 0;
  let inactive = 0;
  for (const group of groups) {
    const count = group._count._all;
    if (!group.isActive) {
      inactive += count;
      continue;
    }
    total += count;
    const category = lookup.statuses.get(group.employmentStatusId)?.category;
    if (category) byCategory[category] += count;
    else uncategorized += count;
  }
  return { active: { total, byCategory, uncategorized }, inactive };
}

// ── Detail ──────────────────────────────────────────────────────────────────

export async function getEmployee(
  ctx: RequestContext,
  id: string,
  view: "full" | "work" = "full",
): Promise<EmployeeDetail> {
  const row = await repository.findEmployee(id);
  const target = row ? targetOf(row) : null;
  // PROMPT §5: 404 juga untuk data yang tidak boleh diketahui keberadaannya.
  if (!row || !target || !policy.canViewEmployee(ctx.actor, target)) {
    throw new NotFoundError("Karyawan tidak ditemukan.");
  }
  const access = {
    manage: policy.canManageEmployees(ctx.actor),
    deactivate: policy.canDeactivateEmployee(ctx.actor, target),
    personal: policy.canReadPersonal(ctx.actor, target),
    bank: policy.canReadBank(ctx.actor, target),
  };
  // Need-to-know: bagian sensitif hanya dibaca (dan diaudit) bila memang diminta.
  const withSensitive = view === "full";
  const [lookup, parts, links] = await Promise.all([
    getMasterLookup(),
    repository.findEmployeeParts(id, {
      personal: withSensitive && access.personal,
      bank: withSensitive && access.bank,
    }),
    getAccountLinksForEmployees([id]),
  ]);

  // PLAN §4.2: setiap akses data sensitif milik orang lain tercatat di audit (tanpa nilainya).
  const sections = withSensitive
    ? [access.personal && "personal", access.bank && "bank"].filter(Boolean)
    : [];
  if (sections.length > 0 && ctx.actor.employeeId !== id) {
    await writeAudit({
      ...auditBase(ctx),
      action: "employee.sensitive.read",
      entityId: id,
      after: { sections },
    });
  }

  const link = links.get(id);
  const detail: EmployeeDetail = {
    ...toListItem(row, lookup),
    emergencyPhone: row.emergencyPhone,
    account: link ? { role: link.role, isActive: link.isActive } : null,
    access,
    educations: parts.educations,
    trainings: parts.trainings,
    histories: parts.histories.map((h) => ({
      id: h.id,
      changeType: h.changeType,
      effectiveDate: toIso(h.effectiveDate),
      fromStatus: nameRef(lookup.statuses, h.fromStatusId),
      toStatus: nameRef(lookup.statuses, h.toStatusId),
      fromPosition: nameRef(lookup.positions, h.fromPositionId),
      toPosition: nameRef(lookup.positions, h.toPositionId),
      exitReason: h.exitReason,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
  };
  // Key sensitif hanya ada bila boleh (bukan null).
  if (withSensitive && access.personal) {
    const p = parts.personal;
    detail.personal = p
      ? {
          ktpNumber: p.ktpNumber,
          npwpNumber: p.npwpNumber,
          kkNumber: p.kkNumber,
          birthPlace: p.birthPlace,
          birthDate: p.birthDate ? toIso(p.birthDate) : null,
          ktpAddress: p.ktpAddress,
          domicileAddress: p.domicileAddress,
          maritalStatus: p.maritalStatus,
          religion: p.religion,
        }
      : null;
    detail.familyMembers = (parts.familyMembers ?? []).map((f) => ({
      ...f,
      birthDate: f.birthDate ? toIso(f.birthDate) : null,
    }));
  }
  if (withSensitive && access.bank) detail.bankAccount = parts.bankAccount;
  return detail;
}

// ── Validasi referensi ──────────────────────────────────────────────────────

interface RefInput {
  employmentStatusId?: string | undefined;
  positionId?: string | undefined;
  workLocationId?: string | null | undefined;
  gradeId?: string | null | undefined;
}

function assertRefs(lookup: MasterLookup, input: RefInput) {
  const check = (
    map: Map<string, { deleted: boolean }>,
    id: string | null | undefined,
    label: string,
  ) => {
    if (!id) return;
    const row = map.get(id);
    if (!row || row.deleted) {
      throw new BusinessRuleError(`${label} tidak ditemukan atau sudah tidak dipakai.`);
    }
  };
  check(lookup.statuses, input.employmentStatusId, "Status kepegawaian");
  check(lookup.positions, input.positionId, "Jabatan");
  check(lookup.locations, input.workLocationId, "Lokasi kerja");
  check(lookup.grades, input.gradeId, "Grade");
}

// PLAN §4.1: manager_id wajib menunjuk karyawan aktif ber-akun MANAGER/SUPER_ADMIN; tanpa siklus.
async function assertManager(
  managerId: string,
  employeeId: string | null,
  tx: repository.EmployeeTx,
) {
  if (managerId === employeeId) throw new BusinessRuleError("Atasan tidak boleh dirinya sendiri.");
  const [manager, allowed] = await Promise.all([
    repository.findEmployee(managerId, tx),
    listManagerEmployeeIds(),
  ]);
  if (!manager?.isActive || !allowed.includes(managerId)) {
    throw new BusinessRuleError(
      "Atasan harus karyawan aktif yang memiliki akun Manager atau Super Admin.",
    );
  }
  if (!employeeId) return;
  let cursor: string | null = manager.managerId;
  for (let depth = 0; cursor && depth < 100; depth += 1) {
    if (cursor === employeeId) {
      throw new BusinessRuleError(
        "Atasan ini membuat struktur melingkar (bawahan menjadi atasan).",
      );
    }
    cursor = await repository.findManagerId(cursor, tx);
  }
}

function assertNotBeforeJoin(effectiveDate: string, joinDate: Date) {
  if (toDate(effectiveDate) < joinDate) {
    throw new BusinessRuleError("Tanggal efektif tidak boleh sebelum tanggal masuk.");
  }
}

// ── Tulis ───────────────────────────────────────────────────────────────────

const nullable = <T>(value: T | null | undefined) => (value === undefined ? undefined : value);

export async function createEmployee(
  ctx: RequestContext,
  input: CreateEmployeeInput,
): Promise<EmployeeListItem> {
  assertCanManage(ctx.actor);
  assertRefs(await getMasterLookup(), input);
  const id = await repository
    .withTransaction(async (tx) => {
      if (input.managerId) await assertManager(input.managerId, null, tx);
      const created = await repository.createEmployee(tx, {
        employeeNumber: input.employeeNumber,
        fullName: input.fullName,
        workEmail: input.workEmail?.toLowerCase() ?? null,
        phoneNumber: input.phoneNumber ?? null,
        emergencyPhone: input.emergencyPhone ?? null,
        gender: input.gender ?? null,
        joinDate: toDate(input.joinDate),
        employmentStatusId: input.employmentStatusId,
        positionId: input.positionId,
        workLocationId: input.workLocationId ?? null,
        gradeId: input.gradeId ?? null,
        managerId: input.managerId ?? null,
      });
      await repository.createHistory(tx, {
        employeeId: created.id,
        changeType: "HIRED",
        effectiveDate: toDate(input.joinDate),
        toStatusId: input.employmentStatusId,
        toPositionId: input.positionId,
        changedBy: ctx.actor.accountId,
      });
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "employee.employee.create",
          entityId: created.id,
          after: {
            employeeNumber: input.employeeNumber,
            employmentStatusId: input.employmentStatusId,
            positionId: input.positionId,
            managerId: input.managerId ?? null,
          },
        },
        tx,
      );
      return created.id;
    })
    .catch(rethrowUnique);
  return loadListItem(id);
}

export async function updateEmployee(
  ctx: RequestContext,
  id: string,
  input: UpdateEmployeeInput,
  now = new Date(),
): Promise<EmployeeListItem> {
  assertCanManage(ctx.actor);
  assertRefs(await getMasterLookup(), input);
  await repository
    .withTransaction(async (tx) => {
      const before = await loadEmployee(id, tx);
      if (!before.isActive) {
        throw new BusinessRuleError(
          "Data karyawan nonaktif hanya arsip. Aktifkan kembali untuk mengubah.",
        );
      }
      if (input.managerId && input.managerId !== before.managerId) {
        await assertManager(input.managerId, id, tx);
      }
      await repository.updateEmployee(tx, id, {
        employeeNumber: input.employeeNumber,
        fullName: input.fullName,
        workEmail:
          input.workEmail === undefined ? undefined : (input.workEmail?.toLowerCase() ?? null),
        phoneNumber: nullable(input.phoneNumber),
        emergencyPhone: nullable(input.emergencyPhone),
        gender: nullable(input.gender),
        joinDate: input.joinDate ? toDate(input.joinDate) : undefined,
        positionId: input.positionId,
        workLocationId: nullable(input.workLocationId),
        gradeId: nullable(input.gradeId),
        managerId: nullable(input.managerId),
      });
      if (input.positionId && input.positionId !== before.positionId) {
        await repository.createHistory(tx, {
          employeeId: id,
          changeType: "POSITION_CHANGED",
          effectiveDate: toDate(todayInJakarta(now)),
          fromPositionId: before.positionId,
          toPositionId: input.positionId,
          changedBy: ctx.actor.accountId,
        });
      }
      // Audit hanya nama field yang berubah + id referensi (tanpa kontak pribadi).
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "employee.employee.update",
          entityId: id,
          before: {
            positionId: before.positionId,
            managerId: before.managerId,
            workLocationId: before.workLocationId,
            gradeId: before.gradeId,
          },
          after: { changedFields: Object.keys(input) },
        },
        tx,
      );
    })
    .catch(rethrowUnique);
  return loadListItem(id);
}

export async function changeStatus(
  ctx: RequestContext,
  id: string,
  input: ChangeStatusInput,
): Promise<EmployeeListItem> {
  assertCanManage(ctx.actor);
  assertRefs(await getMasterLookup(), input);
  await repository.withTransaction(async (tx) => {
    const before = await loadEmployee(id, tx);
    if (!before.isActive) {
      throw new BusinessRuleError("Karyawan nonaktif. Gunakan menu Pengaktifan Pegawai.");
    }
    if (before.employmentStatusId === input.employmentStatusId) {
      throw new ConflictError("Status kepegawaian baru sama dengan status saat ini.");
    }
    assertNotBeforeJoin(input.effectiveDate, before.joinDate);
    await repository.updateEmployee(tx, id, { employmentStatusId: input.employmentStatusId });
    await repository.createHistory(tx, {
      employeeId: id,
      changeType: "STATUS_CHANGED",
      effectiveDate: toDate(input.effectiveDate),
      fromStatusId: before.employmentStatusId,
      toStatusId: input.employmentStatusId,
      note: input.note ?? null,
      changedBy: ctx.actor.accountId,
    });
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "employee.employee.change_status",
        entityId: id,
        before: { employmentStatusId: before.employmentStatusId },
        after: { employmentStatusId: input.employmentStatusId, effectiveDate: input.effectiveDate },
        reason: input.note ?? null,
      },
      tx,
    );
  });
  return loadListItem(id);
}

export async function deactivateEmployee(
  ctx: RequestContext,
  id: string,
  input: DeactivateInput,
  deps: { authAdmin: AuthAdmin },
): Promise<EmployeeListItem> {
  await repository.withTransaction(async (tx) => {
    const before = await loadEmployee(id, tx);
    if (!policy.canDeactivateEmployee(ctx.actor, targetOf(before))) throw new ForbiddenError();
    if (!before.isActive) throw new ConflictError("Karyawan sudah nonaktif.");
    assertNotBeforeJoin(input.effectiveDate, before.joinDate);
    await repository.updateEmployee(tx, id, {
      isActive: false,
      endDate: toDate(input.effectiveDate),
      exitReason: input.exitReason,
    });
    await repository.createHistory(tx, {
      employeeId: id,
      changeType: "DEACTIVATED",
      effectiveDate: toDate(input.effectiveDate),
      fromStatusId: before.employmentStatusId,
      exitReason: input.exitReason,
      note: input.note ?? null,
      changedBy: ctx.actor.accountId,
    });
    // PLAN §4.5: karyawan nonaktif tidak bisa login (akun + ban Supabase, satu transaksi).
    const account = await deactivateAccountOfEmployee(ctx, id, deps, tx);
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "employee.employee.deactivate",
        entityId: id,
        before: { isActive: true },
        after: {
          isActive: false,
          effectiveDate: input.effectiveDate,
          exitReason: input.exitReason,
          account,
        },
        reason: input.note ?? null,
      },
      tx,
    );
  });
  return loadListItem(id);
}

export async function reactivateEmployee(
  ctx: RequestContext,
  id: string,
  input: ReactivateInput,
): Promise<EmployeeListItem> {
  assertCanManage(ctx.actor);
  assertRefs(await getMasterLookup(), input);
  await repository.withTransaction(async (tx) => {
    const before = await loadEmployee(id, tx);
    if (before.isActive) throw new ConflictError("Karyawan sudah aktif.");
    assertNotBeforeJoin(input.effectiveDate, before.joinDate);
    const statusId = input.employmentStatusId ?? before.employmentStatusId;
    await repository.updateEmployee(tx, id, {
      isActive: true,
      endDate: null,
      exitReason: null,
      employmentStatusId: statusId,
    });
    await repository.createHistory(tx, {
      employeeId: id,
      changeType: "REACTIVATED",
      effectiveDate: toDate(input.effectiveDate),
      fromStatusId: before.employmentStatusId,
      toStatusId: statusId,
      note: input.note ?? null,
      changedBy: ctx.actor.accountId,
    });
    // Akun login TIDAK diaktifkan otomatis (keputusan 2026-09-29): lewat menu Akun.
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "employee.employee.reactivate",
        entityId: id,
        before: { isActive: false, exitReason: before.exitReason },
        after: { isActive: true, effectiveDate: input.effectiveDate, employmentStatusId: statusId },
        reason: input.note ?? null,
      },
      tx,
    );
  });
  return loadListItem(id);
}

// ── Struktur organisasi & pilihan atasan ────────────────────────────────────

export async function getOrgStructure(ctx: RequestContext): Promise<OrgStructure> {
  if (!policy.canReadOrgStructure(ctx.actor)) throw new ForbiddenError();
  const [lookup, employees] = await Promise.all([
    getMasterLookup(),
    repository.listActiveForStructure(),
  ]);
  const byPosition = new Map<string, typeof employees>();
  for (const employee of employees) {
    const list = byPosition.get(employee.positionId) ?? [];
    list.push(employee);
    byPosition.set(employee.positionId, list);
  }
  const positions = [...lookup.positions.values()];
  const departments = [...lookup.departments.values()]
    .filter((department) => !department.deleted)
    .map((department) => ({
      id: department.id,
      name: department.name,
      parentId: department.parentId,
      positions: positions
        .filter((p) => p.departmentId === department.id)
        // Jabatan yang dihapus tetap tampil bila masih ada pemegangnya.
        .filter((p) => !p.deleted || byPosition.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          employees: (byPosition.get(p.id) ?? []).map(({ positionId: _p, ...rest }) => rest),
        })),
    }));
  return { departments, totalEmployees: employees.length };
}

export async function listManagerOptions(ctx: RequestContext): Promise<ManagerOption[]> {
  assertCanManage(ctx.actor);
  const [lookup, ids] = await Promise.all([getMasterLookup(), listManagerEmployeeIds()]);
  const rows = await repository.findManyByIds(ids);
  return rows
    .filter((row) => row.isActive)
    .map((row) => ({
      id: row.id,
      fullName: row.fullName,
      employeeNumber: row.employeeNumber,
      position: lookup.positions.get(row.positionId)?.name ?? "—",
    }));
}
