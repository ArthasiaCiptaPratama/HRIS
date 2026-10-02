import {
  CATEGORIES_BY_GROUP,
  EMPLOYMENT_CATEGORIES,
  EMPLOYMENT_CATEGORY_LABELS,
  type EmploymentCategory,
  POSITION_LEVELS,
} from "@hris/shared";
import type { Actor, EmployeeTarget } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import {
  EMPLOYEE_PHOTO_BUCKET,
  EMPLOYEE_PHOTO_MAX_BYTES,
  EMPLOYEE_PHOTO_MIME_TYPES,
  type StorageAdmin,
  UNCONFIGURED_STORAGE,
} from "../../core/storage.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import {
  applyNikLogin,
  deactivateAccountOfEmployee,
  getAccountLinksForEmployees,
  getAccountSummaries,
  listManagerEmployeeIds,
  type NikLoginDeps,
} from "../iam/index.ts";
import {
  getMasterLookup,
  type MasterLookup,
  positionIdsInDepartment,
  statusIdsForCategories,
} from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import * as repository from "./employee.repository.ts";
import type {
  ChangeStatusInput,
  CreateEmployeeInput,
  DASHBOARD_EDUCATION_LEVELS,
  DeactivateInput,
  DetailView,
  EmployeeDashboard,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeSummary,
  ListEmployeesQuery,
  ManagerOption,
  OrgStructure,
  PhotoConfirmInput,
  PhotoResult,
  PhotoUploadUrl,
  PhotoUploadUrlInput,
  ReactivateInput,
  SummaryQuery,
  UpdateEmployeeInput,
} from "./employee.schema.ts";
import { markActivatedOnLogin } from "./onboarding.service.ts";

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
  /** D-037: Supabase Storage untuk foto profil (test memakai versi palsu). */
  storage?: StorageAdmin | undefined;
  /** PLAN §3.3: prefix path objek (lokal `dev/<nama>/`; staging/produksi kosong). */
  storagePathPrefix?: string | undefined;
  /** D-048: ubah nomor induk → alamat login NIK ikut diperbarui. */
  nikLogin?: NikLoginDeps | undefined;
}

// URL baca foto berlaku singkat: cukup untuk satu sesi melihat halaman; setelahnya diminta ulang.
const PHOTO_URL_TTL_SECONDS = 10 * 60;
const storageOf = (ctx: RequestContext | undefined) => ctx?.storage ?? UNCONFIGURED_STORAGE;
const photoDir = (ctx: RequestContext, id: string) =>
  `${ctx.storagePathPrefix ?? ""}employees/${id}/`;

/** path foto → URL bertanda tangan (satu panggilan untuk semua baris). */
async function signPhotoUrls(
  ctx: RequestContext | undefined,
  paths: (string | null)[],
): Promise<Map<string, string>> {
  const wanted = paths.filter((path): path is string => path !== null);
  if (wanted.length === 0) return new Map();
  return storageOf(ctx).createSignedUrls(EMPLOYEE_PHOTO_BUCKET, wanted, PHOTO_URL_TTL_SECONDS);
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

const targetOf = (row: {
  id: string;
  managerId: string | null;
  companyId: string;
}): EmployeeTarget => ({
  employeeId: row.id,
  managerId: row.managerId,
  companyId: row.companyId,
});

/**
 * D-040: lengkapi cakupan PT aktor MANAGER/EMPLOYEE dengan PT tempat ia terdaftar (dipakai direktori).
 * SUPER_ADMIN (semua) & HR_ADMIN (penugasan) sudah diisi iam. Dirakit di app.ts (iam tidak membaca
 * tabel employee, PLAN §3.2).
 */
/** D-040: penyaring cakupan akun untuk iam (disuntik lewat configureIam di app.ts). */
export const employeeScopeForIam = {
  async companyOfEmployees(employeeIds: string[]): Promise<Map<string, string>> {
    const rows = await repository.findCompanyIds(employeeIds);
    return new Map(rows.map((row) => [row.id, row.companyId]));
  },
  employeeIdsInCompanies: (companyIds: string[]) => repository.findIdsInCompanies(companyIds),
  async employeeLabels(employeeIds: string[]): Promise<Map<string, string>> {
    const rows = await repository.findManyByIds(employeeIds);
    return new Map(rows.map((row) => [row.id, `${row.fullName} (${row.employeeNumber})`]));
  },
};

/** D-048: pencarian karyawan untuk lupa password (disuntik ke route iam lewat app.ts). */
export const employeeLoginDirectory = {
  employeeIdByNumber: (employeeNumber: string) => repository.findApprovedIdByNumber(employeeNumber),
  employeeIdByPersonalEmail: (email: string) => repository.findIdByPersonalEmail(email),
  personalEmailOf: (employeeId: string) => repository.findPersonalEmail(employeeId),
};

export async function withEmployeeCompanyScope(actor: Actor): Promise<Actor> {
  if (!actor.employeeId) return actor;
  const employee = await repository.findActorEmployee(actor.employeeId);
  // D-045: request pertama setelah calon mengatur password → status "Mengisi data".
  let status = employee?.onboardingStatus ?? "APPROVED";
  if (status === "INVITED" && (await markActivatedOnLogin(actor.employeeId))) status = "FILLING";
  const withOnboarding: Actor = {
    ...actor,
    onboarding: employee
      ? {
          status,
          completionRequired: employee.completionRequired,
          submitted: status === "SUBMITTED" || employee.completionSubmittedAt !== null,
          // Calon belum disetujui dikunci ke wizard; karyawan existing (lengkapi data) tidak.
          locked: status !== "APPROVED",
        }
      : null,
  };
  if (actor.role === "SUPER_ADMIN" || actor.role === "HR_ADMIN") return withOnboarding;
  return { ...withOnboarding, companyIds: new Set(employee ? [employee.companyId] : []) };
}

function nameRef<T extends { id: string; name: string }>(map: Map<string, T>, id: string | null) {
  if (!id) return null;
  const row = map.get(id);
  return row ? { id: row.id, name: row.name } : null;
}

function companyRef(lookup: MasterLookup, id: string) {
  const company = lookup.companies.get(id);
  return { id, code: company?.code ?? "—", name: company?.name ?? "—" };
}

function toListItem(
  row: repository.EmployeeRow,
  lookup: MasterLookup,
  photoUrls: Map<string, string> = new Map(),
): EmployeeListItem {
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
    company: companyRef(lookup, row.companyId),
    position: { id: row.positionId, name: position?.name ?? "—" },
    department: nameRef(lookup.departments, position?.departmentId ?? null),
    workLocation: nameRef(lookup.locations, row.workLocationId),
    grade: nameRef(lookup.grades, row.gradeId),
    manager: row.manager ? { id: row.manager.id, name: row.manager.fullName } : null,
    photoUrl: row.photoPath ? (photoUrls.get(row.photoPath) ?? null) : null,
  };
}

/** Respons mutasi: data kerja saja (tanpa bagian sensitif, jadi tanpa audit baca). */
async function loadListItem(id: string, ctx: RequestContext): Promise<EmployeeListItem> {
  const [row, lookup] = await Promise.all([loadEmployee(id), getMasterLookup()]);
  return toListItem(row, lookup, await signPhotoUrls(ctx, [row.photoPath]));
}

async function loadEmployee(id: string, tx?: repository.EmployeeTx) {
  const row = await repository.findEmployee(id, tx);
  if (!row) throw new NotFoundError("Karyawan tidak ditemukan.");
  return row;
}

function assertCanManage(actor: Actor) {
  if (!policy.canManageEmployees(actor)) throw new ForbiddenError();
}

/** Karyawan yang boleh dilihat aktor; di luar cakupan (mis. PT lain, D-040) = 404 (PROMPT §5). */
async function loadInScope(ctx: RequestContext, id: string, tx?: repository.EmployeeTx) {
  const row = await loadEmployee(id, tx);
  // D-045: calon onboarding dikelola lewat menu Penerimaan, bukan endpoint karyawan biasa.
  if (row.onboardingStatus !== "APPROVED" || !policy.canViewEmployee(ctx.actor, targetOf(row))) {
    throw new NotFoundError("Karyawan tidak ditemukan.");
  }
  return row;
}

function assertCanCreateIn(actor: Actor, companyId: string) {
  if (!policy.canCreateInCompany(actor, companyId)) {
    throw new ForbiddenError("Anda tidak berhak mengelola karyawan di perusahaan ini.");
  }
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

// D-045: calon yang belum disetujui bukan "karyawan" bagi fitur lain (daftar, ringkasan, dashboard,
// struktur, pilihan atasan, detail) — mereka hanya terlihat di menu Penerimaan.
const APPROVED_ONLY = { onboardingStatus: "APPROVED" } as const;

/** Calon belum disetujui hanya terlihat oleh dirinya sendiri (wizard onboarding, D-045 bagian b). */
function visibleToActor(actor: Actor, row: { id: string; onboardingStatus: string }) {
  return row.onboardingStatus === "APPROVED" || actor.employeeId === row.id;
}

function scopeWhere(actor: Actor): repository.EmployeeWhere {
  const scope = policy.employeeListScope(actor);
  if (scope === null) throw new ForbiddenError();
  // D-035: MANAGER hanya tim (bawahan langsung, D-009).
  if (scope === "team") return { ...APPROVED_ONLY, managerId: actor.employeeId };
  // D-040: HR hanya PT yang ditugaskan (tanpa penugasan → tidak ada).
  if (scope === "companies") {
    const ids = [...(actor.companyIds ?? [])];
    return { ...APPROVED_ONLY, companyId: { in: ids.length > 0 ? ids : [NO_MATCH] } };
  }
  return { ...APPROVED_ONLY };
}

function buildWhere(
  actor: Actor,
  query: ListEmployeesQuery,
  lookup: MasterLookup,
): repository.EmployeeWhere {
  const and: repository.EmployeeWhere[] = [scopeWhere(actor), { isActive: query.active }];
  const categoryFilters = [
    ...(query.category ? [[query.category]] : []),
    ...(query.group ? [CATEGORIES_BY_GROUP[query.group]] : []),
  ];
  for (const categories of categoryFilters) {
    const ids = statusIdsForCategories(lookup, categories);
    and.push({ employmentStatusId: { in: ids.length > 0 ? ids : [NO_MATCH] } });
  }
  if (query.companyId) and.push({ companyId: query.companyId });
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
  const photoUrls = await signPhotoUrls(
    ctx,
    rows.map((row) => row.photoPath),
  );
  return {
    data: rows.map((row) => toListItem(row, lookup, photoUrls)),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getSummary(
  ctx: RequestContext,
  query: SummaryQuery = {},
): Promise<EmployeeSummary> {
  const where: repository.EmployeeWhere = query.companyId
    ? { AND: [scopeWhere(ctx.actor), { companyId: query.companyId }] }
    : scopeWhere(ctx.actor);
  const [lookup, groups] = await Promise.all([getMasterLookup(), repository.countByStatus(where)]);
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

// ── Dashboard ───────────────────────────────────────────────────────────────

type DashboardLevel = (typeof DASHBOARD_EDUCATION_LEVELS)[number];
const LEVEL_RANK = {
  SD: 1,
  SMP: 2,
  SMA: 3,
  D1: 4,
  D2: 4,
  D3: 4,
  D4: 4,
  S1: 4,
  S2: 4,
  S3: 4,
} as const;
const DASHBOARD_LEVELS: DashboardLevel[] = ["SD", "SMP", "SMA", "Kuliah", "Tanpa Data"];

/** Jenjang tertinggi karyawan → kelompok dashboard (D1–S3 = Kuliah; tanpa data/OTHER = Tanpa Data). */
function educationBucket(levels: (string | null)[]): DashboardLevel {
  let best = 0;
  for (const level of levels) {
    const rank = level ? (LEVEL_RANK[level as keyof typeof LEVEL_RANK] ?? 0) : 0;
    best = Math.max(best, rank);
  }
  return best === 0 ? "Tanpa Data" : (DASHBOARD_LEVELS[best - 1] as DashboardLevel);
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Agregat kepegawaian untuk halaman Dashboard (SA/HR). Hanya jumlah — tanpa data per orang. */
export async function getDashboard(
  ctx: RequestContext,
  now = new Date(),
): Promise<EmployeeDashboard> {
  if (!policy.canViewDashboard(ctx.actor)) throw new ForbiddenError();
  // D-040: HR hanya PT yang ditugaskan; SA semua PT.
  const [lookup, rows] = await Promise.all([
    getMasterLookup(),
    repository.listForDashboard(scopeWhere(ctx.actor)),
  ]);
  const active = rows.filter((row) => row.isActive);
  const today = toDate(todayInJakarta(now)).getTime();

  const tally = <K>(keys: K[]) => {
    const counts = new Map<K, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  };
  const byCount = <T extends { count: number; name: string }>(a: T, b: T) =>
    b.count - a.count || a.name.localeCompare(b.name, "id");

  const categoryOf = (statusId: string) => lookup.statuses.get(statusId)?.category ?? null;
  const categories = tally(active.map((row) => categoryOf(row.employmentStatusId)));
  const byCategory = [...categories]
    .map(([category, count]) => ({
      id: category,
      category,
      name: category ? EMPLOYMENT_CATEGORY_LABELS[category] : "Tanpa kategori",
      count,
    }))
    .sort(byCount);

  const byLocation = [...tally(active.map((row) => row.workLocationId))]
    .map(([id, count]) => {
      const location = id ? lookup.locations.get(id) : undefined;
      return {
        id,
        name: location?.name ?? "Belum ditentukan",
        city: location?.city ?? null,
        count,
      };
    })
    .sort(byCount);

  const departmentOf = (positionId: string) =>
    lookup.positions.get(positionId)?.departmentId ?? null;
  const byDepartment = [...tally(active.map((row) => departmentOf(row.positionId)))]
    .map(([id, count]) => ({
      id,
      name: (id ? lookup.departments.get(id)?.name : undefined) ?? "—",
      count,
    }))
    .sort(byCount);

  const byPosition = [...tally(active.map((row) => row.positionId))]
    .map(([id, count]) => ({ id, name: lookup.positions.get(id)?.name ?? "—", count }))
    .sort(byCount);

  const byJoinYear = [...tally(active.map((row) => row.joinDate.getUTCFullYear()))]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  const pivot = new Map<string, Map<DashboardLevel, number>>();
  for (const row of active) {
    const key = categoryOf(row.employmentStatusId) ?? "NONE";
    const levels = pivot.get(key) ?? new Map<DashboardLevel, number>();
    const bucket = educationBucket(row.educations.map((e) => e.level));
    levels.set(bucket, (levels.get(bucket) ?? 0) + 1);
    pivot.set(key, levels);
  }
  const byEducationPivot = [...pivot]
    .map(([category, levels]) => ({
      category,
      label:
        category === "NONE"
          ? "Tanpa kategori"
          : EMPLOYMENT_CATEGORY_LABELS[category as EmploymentCategory],
      levels: DASHBOARD_LEVELS.map((level) => ({ level, count: levels.get(level) ?? 0 })),
      total: [...levels.values()].reduce((sum, n) => sum + n, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const tenure = active.map((row) => Math.max(0, today - row.joinDate.getTime()) / MS_PER_YEAR);
  const avgTenureYears =
    tenure.length > 0
      ? Math.round((tenure.reduce((sum, n) => sum + n, 0) / tenure.length) * 10) / 10
      : null;

  return {
    overview: {
      total: rows.length,
      active: active.length,
      inactive: rows.length - active.length,
      avgTenureYears,
    },
    byCategory,
    byLocation,
    byDepartment,
    byPosition,
    byJoinYear,
    byEducationPivot,
  };
}

// ── Detail ──────────────────────────────────────────────────────────────────

type Changer = NonNullable<EmployeeDetail["histories"][number]["changedBy"]>;

/** Akun pengubah → nama pegawai (fallback email akun), role, dan lokasi kerja. */
async function resolveChangers(
  accountIds: (string | null)[],
  lookup: MasterLookup,
): Promise<Map<string, Changer>> {
  const ids = accountIds.filter((value): value is string => value !== null);
  if (ids.length === 0) return new Map();
  const accounts = await getAccountSummaries(ids);
  const employeeIds = [...accounts.values()]
    .map((account) => account.employeeId)
    .filter((value): value is string => value !== null);
  const employees = new Map(
    (await repository.findChangerEmployees(employeeIds)).map((row) => [row.id, row]),
  );
  const result = new Map<string, Changer>();
  for (const account of accounts.values()) {
    const employee = account.employeeId ? employees.get(account.employeeId) : undefined;
    result.set(account.accountId, {
      name: employee?.fullName ?? account.email,
      role: account.role,
      workLocation: employee?.workLocationId
        ? (lookup.locations.get(employee.workLocationId)?.name ?? null)
        : null,
    });
  }
  return result;
}

export async function getEmployee(
  ctx: RequestContext,
  id: string,
  view: DetailView = "full",
): Promise<EmployeeDetail> {
  const row = await repository.findEmployee(id);
  const target = row ? targetOf(row) : null;
  // PROMPT §5: 404 juga untuk data yang tidak boleh diketahui keberadaannya.
  if (
    !row ||
    !target ||
    !visibleToActor(ctx.actor, row) ||
    !policy.canViewEmployee(ctx.actor, target)
  ) {
    throw new NotFoundError("Karyawan tidak ditemukan.");
  }
  const access = {
    manage: policy.canManageEmployees(ctx.actor),
    deactivate: policy.canDeactivateEmployee(ctx.actor, target),
    personal: policy.canReadPersonal(ctx.actor, target),
    bank: policy.canReadBank(ctx.actor, target),
    print: policy.canPrintEmployee(ctx.actor, target),
    photo: policy.canChangePhoto(ctx.actor, target),
  };
  if (view === "print" && !access.print) {
    throw new ForbiddenError("Anda tidak berhak mengunduh data karyawan ini.");
  }
  // Need-to-know: bagian sensitif hanya dibaca (dan diaudit) bila memang diminta.
  // Formulir cetak tidak memuat rekening, jadi view=print tidak membacanya.
  const include = {
    personal: view !== "work" && access.personal,
    bank: view === "full" && access.bank,
  };
  const [lookup, parts, links, photoUrls] = await Promise.all([
    getMasterLookup(),
    repository.findEmployeeParts(id, include),
    getAccountLinksForEmployees([id]),
    signPhotoUrls(ctx, [row.photoPath]),
  ]);
  const changers = await resolveChangers(
    parts.histories.map((h) => h.changedBy),
    lookup,
  );

  // PLAN §4.2: setiap akses data sensitif milik orang lain tercatat di audit (tanpa nilainya).
  const sections = [include.personal && "personal", include.bank && "bank"].filter(Boolean);
  if (view === "print") {
    // PLAN §4.5: data pegawai yang dibawa keluar sistem (file) selalu tercatat, termasuk data sendiri.
    await writeAudit({
      ...auditBase(ctx),
      action: "employee.printed",
      entityId: id,
      after: { format: "xlsx", sections },
    });
  } else if (sections.length > 0 && ctx.actor.employeeId !== id) {
    await writeAudit({
      ...auditBase(ctx),
      action: "employee.sensitive.read",
      entityId: id,
      after: { sections },
    });
  }

  const link = links.get(id);
  const detail: EmployeeDetail = {
    ...toListItem(row, lookup, photoUrls),
    emergencyPhone: row.emergencyPhone,
    emergencyContactName: row.emergencyContactName,
    emergencyContactRelationship: row.emergencyContactRelationship,
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
      fromCompany: nameRef(lookup.companies, h.fromCompanyId),
      toCompany: nameRef(lookup.companies, h.toCompanyId),
      exitReason: h.exitReason,
      note: h.note,
      changedBy: h.changedBy ? (changers.get(h.changedBy) ?? null) : null,
      createdAt: h.createdAt.toISOString(),
    })),
  };
  // Key sensitif hanya ada bila boleh (bukan null).
  if (include.personal) {
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
          bpjsEmploymentNumber: p.bpjsEmploymentNumber,
          bpjsHealthNumber: p.bpjsHealthNumber,
          ptkpStatus: p.ptkpStatus,
          originCity: p.originCity,
        }
      : null;
    detail.familyMembers = (parts.familyMembers ?? []).map((f) => ({
      ...f,
      birthDate: f.birthDate ? toIso(f.birthDate) : null,
    }));
  }
  if (include.bank) detail.bankAccount = parts.bankAccount;
  return detail;
}

// ── Validasi referensi ──────────────────────────────────────────────────────

interface RefInput {
  companyId?: string | undefined;
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
  check(lookup.companies, input.companyId, "Perusahaan");
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
  if (
    !manager?.isActive ||
    manager.onboardingStatus !== "APPROVED" ||
    !allowed.includes(managerId)
  ) {
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
  assertCanCreateIn(ctx.actor, input.companyId);
  assertRefs(await getMasterLookup(), input);
  const id = await repository
    .withTransaction(async (tx) => {
      if (input.managerId) await assertManager(input.managerId, null, tx);
      const created = await repository.createEmployee(tx, {
        companyId: input.companyId,
        employeeNumber: input.employeeNumber,
        fullName: input.fullName,
        workEmail: input.workEmail?.toLowerCase() ?? null,
        phoneNumber: input.phoneNumber ?? null,
        emergencyPhone: input.emergencyPhone ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactRelationship: input.emergencyContactRelationship ?? null,
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
        toCompanyId: input.companyId,
        changedBy: ctx.actor.accountId,
      });
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "employee.employee.create",
          entityId: created.id,
          after: {
            employeeNumber: input.employeeNumber,
            companyId: input.companyId,
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
  return loadListItem(id, ctx);
}

export async function updateEmployee(
  ctx: RequestContext,
  id: string,
  input: UpdateEmployeeInput,
  now = new Date(),
): Promise<EmployeeListItem> {
  assertCanManage(ctx.actor);
  const lookup = await getMasterLookup();
  await repository
    .withTransaction(async (tx) => {
      const before = await loadInScope(ctx, id, tx);
      // D-049: hanya rujukan yang BERUBAH yang harus aktif; nilai lama yang sudah diarsipkan tetap boleh
      // dikirim ulang oleh form supaya field lain masih bisa diubah.
      const changed = <T>(next: T | undefined, current: T): T | undefined =>
        next !== undefined && next !== current ? next : undefined;
      assertRefs(lookup, {
        companyId: changed(input.companyId, before.companyId),
        positionId: changed(input.positionId, before.positionId),
        workLocationId: changed(input.workLocationId, before.workLocationId),
        gradeId: changed(input.gradeId, before.gradeId),
      });
      if (!before.isActive) {
        throw new BusinessRuleError(
          "Data karyawan nonaktif hanya arsip. Aktifkan kembali untuk mengubah.",
        );
      }
      // D-040: memindahkan karyawan hanya ke PT dalam cakupan aktor.
      const companyChanged = input.companyId !== undefined && input.companyId !== before.companyId;
      if (companyChanged) assertCanCreateIn(ctx.actor, input.companyId as string);
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
        emergencyContactName: nullable(input.emergencyContactName),
        emergencyContactRelationship: nullable(input.emergencyContactRelationship),
        gender: nullable(input.gender),
        joinDate: input.joinDate ? toDate(input.joinDate) : undefined,
        companyId: input.companyId,
        positionId: input.positionId,
        workLocationId: nullable(input.workLocationId),
        gradeId: nullable(input.gradeId),
        managerId: nullable(input.managerId),
      });
      // D-048: nomor induk berubah → alamat login NIK ikut (gagal di Supabase → seluruh perubahan batal).
      if (
        input.employeeNumber !== undefined &&
        input.employeeNumber !== before.employeeNumber &&
        ctx.nikLogin
      ) {
        await applyNikLogin(id, input.employeeNumber, ctx.nikLogin, tx, "refresh");
      }
      if (companyChanged) {
        // D-039: pindah perusahaan dalam grup tercatat di riwayat.
        await repository.createHistory(tx, {
          employeeId: id,
          changeType: "COMPANY_CHANGED",
          effectiveDate: toDate(todayInJakarta(now)),
          fromCompanyId: before.companyId,
          toCompanyId: input.companyId as string,
          changedBy: ctx.actor.accountId,
        });
      }
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
            companyId: before.companyId,
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
  return loadListItem(id, ctx);
}

export async function changeStatus(
  ctx: RequestContext,
  id: string,
  input: ChangeStatusInput,
): Promise<EmployeeListItem> {
  assertCanManage(ctx.actor);
  assertRefs(await getMasterLookup(), input);
  await repository.withTransaction(async (tx) => {
    const before = await loadInScope(ctx, id, tx);
    if (!before.isActive) {
      throw new BusinessRuleError("Karyawan nonaktif. Gunakan menu Pengaktifan Karyawan.");
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
  return loadListItem(id, ctx);
}

export async function deactivateEmployee(
  ctx: RequestContext,
  id: string,
  input: DeactivateInput,
  deps: { authAdmin: AuthAdmin },
): Promise<EmployeeListItem> {
  await repository.withTransaction(async (tx) => {
    const before = await loadInScope(ctx, id, tx);
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
  return loadListItem(id, ctx);
}

export async function reactivateEmployee(
  ctx: RequestContext,
  id: string,
  input: ReactivateInput,
): Promise<EmployeeListItem> {
  assertCanManage(ctx.actor);
  assertRefs(await getMasterLookup(), input);
  await repository.withTransaction(async (tx) => {
    const before = await loadInScope(ctx, id, tx);
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
  return loadListItem(id, ctx);
}

// ── Struktur organisasi & pilihan atasan ────────────────────────────────────

export async function getOrgStructure(ctx: RequestContext): Promise<OrgStructure> {
  if (!policy.canReadOrgStructure(ctx.actor)) throw new ForbiddenError();
  // D-040: direktori per PT (SA semua; HR penugasan; MANAGER/EMPLOYEE PT sendiri).
  const companies = policy.directoryCompanyIds(ctx.actor);
  const [lookup, employees] = await Promise.all([
    getMasterLookup(),
    repository.listActiveForStructure(companies === null ? null : [...companies]),
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
      unitType: department.unitType,
      positions: positions
        .filter((p) => p.departmentId === department.id)
        // Jabatan yang dihapus tetap tampil bila masih ada pemegangnya.
        .filter((p) => !p.deleted || byPosition.has(p.id))
        // D-050: urut level (Direksi → Helper), lalu nama; tanpa level di akhir.
        .sort(
          (a, b) =>
            (a.level ? POSITION_LEVELS.indexOf(a.level) : POSITION_LEVELS.length) -
              (b.level ? POSITION_LEVELS.indexOf(b.level) : POSITION_LEVELS.length) ||
            a.name.localeCompare(b.name, "id"),
        )
        .map((p) => ({
          id: p.id,
          name: p.name,
          level: p.level,
          employees: (byPosition.get(p.id) ?? []).map(({ positionId: _p, ...rest }) => rest),
        })),
    }));
  return { departments, totalEmployees: employees.length };
}

export async function listManagerOptions(ctx: RequestContext): Promise<ManagerOption[]> {
  assertCanManage(ctx.actor);
  const [lookup, ids] = await Promise.all([getMasterLookup(), listManagerEmployeeIds()]);
  const rows = (await repository.findManyByIds(ids)).filter(
    (row) => row.onboardingStatus === "APPROVED",
  );
  return rows
    .filter((row) => row.isActive)
    .map((row) => ({
      id: row.id,
      fullName: row.fullName,
      employeeNumber: row.employeeNumber,
      position: lookup.positions.get(row.positionId)?.name ?? "—",
    }));
}

// ── Foto profil (D-037) ─────────────────────────────────────────────────────
// Alur: (1) upload-url → path unik + token sekali pakai; (2) browser mengunggah langsung ke Storage;
// (3) konfirmasi → server memeriksa objek (ada, tipe gambar, ≤ 2 MB) lalu menyimpan path.
// Bucket private: foto hanya bisa dibaca lewat URL bertanda tangan dari API.

const PHOTO_EXTENSION: Record<PhotoUploadUrlInput["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function loadPhotoTarget(ctx: RequestContext, id: string) {
  const row = await repository.findEmployee(id);
  const target = row ? targetOf(row) : null;
  if (
    !row ||
    !target ||
    !visibleToActor(ctx.actor, row) ||
    !policy.canViewEmployee(ctx.actor, target)
  ) {
    throw new NotFoundError("Karyawan tidak ditemukan.");
  }
  if (!policy.canChangePhoto(ctx.actor, target)) {
    throw new ForbiddenError("Anda tidak berhak mengubah foto karyawan ini.");
  }
  return row;
}

export async function createPhotoUploadUrl(
  ctx: RequestContext,
  id: string,
  input: PhotoUploadUrlInput,
): Promise<PhotoUploadUrl> {
  await loadPhotoTarget(ctx, id);
  const path = `${photoDir(ctx, id)}${crypto.randomUUID()}.${PHOTO_EXTENSION[input.contentType]}`;
  const upload = await storageOf(ctx).createSignedUploadUrl(EMPLOYEE_PHOTO_BUCKET, path);
  return {
    bucket: EMPLOYEE_PHOTO_BUCKET,
    path,
    token: upload.token,
    signedUrl: upload.signedUrl,
    maxBytes: EMPLOYEE_PHOTO_MAX_BYTES,
  };
}

export async function confirmPhoto(
  ctx: RequestContext,
  id: string,
  input: PhotoConfirmInput,
): Promise<PhotoResult> {
  const row = await loadPhotoTarget(ctx, id);
  // Path wajib milik pegawai ini di lingkungan ini (mencegah memakai foto orang lain/lingkungan lain).
  if (!input.path.startsWith(photoDir(ctx, id))) {
    throw new BusinessRuleError("Foto tidak valid untuk karyawan ini.");
  }
  const storage = storageOf(ctx);
  const info = await storage.getObjectInfo(EMPLOYEE_PHOTO_BUCKET, input.path);
  if (!info) throw new BusinessRuleError("Foto belum terunggah. Coba unggah ulang.");
  const allowed = (EMPLOYEE_PHOTO_MIME_TYPES as readonly string[]).includes(info.contentType ?? "");
  if (!allowed || info.size <= 0 || info.size > EMPLOYEE_PHOTO_MAX_BYTES) {
    await storage.removeObjects(EMPLOYEE_PHOTO_BUCKET, [input.path]);
    throw new BusinessRuleError("Foto harus berupa gambar JPG, PNG, atau WebP maksimal 2 MB.");
  }
  if (row.photoPath === input.path) {
    const urls = await signPhotoUrls(ctx, [input.path]);
    return { photoUrl: urls.get(input.path) ?? null };
  }

  await repository.setPhotoPath(id, input.path);
  await writeAudit({
    ...auditBase(ctx),
    action: "employee.photo.update",
    entityId: id,
    before: { hasPhoto: row.photoPath !== null },
    after: { hasPhoto: true },
  });
  // Foto lama dihapus setelah path baru tersimpan; gagal hapus tidak membatalkan perubahan.
  if (row.photoPath) await removeQuietly(storage, row.photoPath);
  const urls = await signPhotoUrls(ctx, [input.path]);
  return { photoUrl: urls.get(input.path) ?? null };
}

export async function deletePhoto(ctx: RequestContext, id: string): Promise<PhotoResult> {
  const row = await loadPhotoTarget(ctx, id);
  if (!row.photoPath) return { photoUrl: null };
  await repository.setPhotoPath(id, null);
  await writeAudit({
    ...auditBase(ctx),
    action: "employee.photo.delete",
    entityId: id,
    before: { hasPhoto: true },
    after: { hasPhoto: false },
  });
  await removeQuietly(storageOf(ctx), row.photoPath);
  return { photoUrl: null };
}

async function removeQuietly(storage: StorageAdmin, path: string) {
  try {
    await storage.removeObjects(EMPLOYEE_PHOTO_BUCKET, [path]);
  } catch {
    // Objek yatim tidak berbahaya (bucket private); tidak ada data pribadi yang dicatat di sini.
  }
}

// ── D-049: dukungan master data untuk modul organization (disuntik di app.ts) ──────────────────
// Organization tidak boleh membaca tabel employee (PLAN §3.2.4); data yang dibutuhkannya disediakan
// di sini tanpa data per orang (hanya jumlah) dan pemindahan rujukan saat gabungkan.

export const employeeMasterDataSupport = {
  countByMasterRef: (kind: repository.MasterRefKind) => repository.countByMasterRef(kind),
  reassignMasterRef: (
    tx: repository.EmployeeTx,
    kind: Exclude<repository.MasterRefKind, "company">,
    fromId: string,
    toId: string,
  ) => repository.reassignMasterRef(tx, kind, fromId, toId),
};
