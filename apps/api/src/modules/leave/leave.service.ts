import {
  DEFAULT_ANNUAL_QUOTA,
  isLeaveYearExpired,
  LEAVE_ATTACHMENT_MAX_BYTES,
  LEAVE_ATTACHMENT_TYPES,
  LEAVE_YEAR_END_EXPIRY_FROM,
  type LeaveAdjustInput,
  type LeaveBalanceImportInput,
  type LeaveLedgerKind,
  type LeavePreviewInput,
  type LeaveRequestInput,
  type LeaveTypeInput,
  type LeaveYearInput,
  leaveBalanceLastDay,
  leaveResubmitDeadline,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import type { StorageAdmin } from "../../core/storage.ts";
import {
  type AfterCommit,
  type ApprovalView,
  cancelApprovalRequest,
  createApprovalRequest,
  getApprovalViews,
  listActionable,
  registerApprovalHandler,
} from "../approval/index.ts";
import {
  dateLabel,
  datesWithPunches,
  employeeDirectory,
  holidaysBetween,
  isDateClosed,
  markLeaveDays,
  notifyEmployees,
  type RequestContext,
  rosteredWithoutAttendance,
  rosterMarks,
  settingsToday,
} from "../attendance/index.ts";
import * as policy from "./leave.policy.ts";
import * as repository from "./leave.repository.ts";
import {
  allocateCharges,
  type BalanceSummary,
  chargeYearOf,
  countLeaveDates,
  datesBetween,
  prorataDays,
  settlementDays,
  summarize,
} from "./leave-engine.ts";
import { syncExitSettlements } from "./leave-exit.service.ts";

// Tahap E — cuti tahunan, izin, sakit (docs/features/time-management/design.md §7, D-072).

export const LEAVE_ATTACHMENT_BUCKET = "leave-attachments";
const ATTACHMENT_URL_TTL_SECONDS = 10 * 60;
const MAX_RANGE_DAYS = 120;

export interface LeaveDeps {
  storage: StorageAdmin;
  storagePathPrefix: string;
}
let deps: LeaveDeps | undefined;
let bucketReady: Promise<unknown> | undefined;
export function configureLeave(next: LeaveDeps) {
  deps = next;
}
function storage(): LeaveDeps {
  if (!deps) throw new Error("leave: storage belum dikonfigurasi");
  return deps;
}
function ensureBucket() {
  bucketReady ??= storage()
    .storage.ensurePrivateBucket({
      id: LEAVE_ATTACHMENT_BUCKET,
      fileSizeLimit: LEAVE_ATTACHMENT_MAX_BYTES,
      allowedMimeTypes: LEAVE_ATTACHMENT_TYPES,
    })
    .catch((error) => {
      bucketReady = undefined;
      throw error;
    });
  return bucketReady;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

async function audit(
  ctx: RequestContext,
  action: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
) {
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action,
    entityType: "leave",
    entityId,
    before: before as never,
    after: after as never,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
}

// ── Jenis & Master Cuti ────────────────────────────────────────────────────────

/** Jenis bawaan dibuat sekali bila tabel masih kosong (SA bisa mengubah/menonaktifkan). */
// Keterangan & berkas bawaan sama dengan migrasi `leave_type_description` (SA bisa mengubahnya).
const DEFAULT_TYPES = [
  {
    code: "CUTI_TAHUNAN",
    name: "Cuti tahunan",
    category: "ANNUAL",
    description:
      "Cuti tahunan dari saldo cuti Anda. Hari OFF roster dan tanggal merah tidak dihitung.",
    sortOrder: 0,
  },
  {
    code: "SAKIT",
    name: "Sakit",
    category: "SICK",
    documentRequiredAfterDays: 1,
    description:
      "Tidak masuk karena sakit. Lebih dari 1 hari wajib melampirkan surat keterangan dokter.",
    documentLabel: "Surat keterangan dokter",
    sortOrder: 10,
  },
  {
    code: "IZIN_MENIKAH",
    name: "Izin menikah",
    category: "PERMIT",
    maxDaysPerRequest: 3,
    documentRequiredAfterDays: 0,
    description: "Pernikahan karyawan sendiri.",
    documentLabel: "Undangan pernikahan / buku nikah",
    sortOrder: 20,
  },
  {
    code: "IZIN_ANAK_MENIKAH",
    name: "Izin menikahkan anak",
    category: "PERMIT",
    maxDaysPerRequest: 2,
    description: "Menikahkan anak kandung.",
    documentLabel: "Undangan pernikahan anak",
    sortOrder: 21,
  },
  {
    code: "IZIN_KHITAN_BAPTIS",
    name: "Izin khitanan/baptis anak",
    category: "PERMIT",
    maxDaysPerRequest: 2,
    description: "Khitanan atau pembaptisan anak.",
    documentLabel: "Undangan / surat keterangan acara",
    sortOrder: 22,
  },
  {
    code: "IZIN_ISTRI_LAHIR",
    name: "Izin istri melahirkan/keguguran",
    category: "PERMIT",
    maxDaysPerRequest: 2,
    description: "Istri melahirkan atau keguguran kandungan.",
    documentLabel: "Surat keterangan kelahiran / dokter / bidan",
    sortOrder: 23,
  },
  {
    code: "IZIN_DUKA",
    name: "Izin duka (keluarga inti)",
    category: "PERMIT",
    maxDaysPerRequest: 2,
    description: "Suami/istri, orang tua/mertua, atau anak/menantu meninggal dunia.",
    documentLabel: "Surat keterangan kematian",
    sortOrder: 24,
  },
  {
    code: "IZIN_DUKA_SERUMAH",
    name: "Izin duka (anggota serumah)",
    category: "PERMIT",
    maxDaysPerRequest: 1,
    description: "Anggota keluarga dalam satu rumah meninggal dunia.",
    documentLabel: "Surat keterangan kematian",
    sortOrder: 25,
  },
  {
    code: "IZIN_LAIN",
    name: "Izin lainnya",
    category: "PERMIT",
    description: "Keperluan lain di luar jenis di atas — jelaskan di kolom alasan.",
    documentLabel: "Dokumen pendukung (bila ada)",
    sortOrder: 90,
  },
] as const;

let typesSeeded: Promise<unknown> | undefined;
async function ensureDefaultTypes() {
  typesSeeded ??= repository.createTypes(DEFAULT_TYPES.map((t) => ({ ...t }))).catch((error) => {
    typesSeeded = undefined;
    throw error;
  });
  await typesSeeded;
}

export interface LeaveTypeDto {
  id: string;
  code: string;
  name: string;
  category: "ANNUAL" | "PERMIT" | "SICK";
  maxDaysPerRequest: number | null;
  documentRequiredAfterDays: number | null;
  /** Keterangan untuk karyawan & berkas yang diperlukan (diatur SA). */
  description: string | null;
  documentLabel: string | null;
  isActive: boolean;
  sortOrder: number;
}
const typeDto = (row: LeaveTypeDto): LeaveTypeDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  category: row.category,
  maxDaysPerRequest: row.maxDaysPerRequest,
  documentRequiredAfterDays: row.documentRequiredAfterDays,
  description: row.description,
  documentLabel: row.documentLabel,
  isActive: row.isActive,
  sortOrder: row.sortOrder,
});

export async function listTypes(ctx: RequestContext): Promise<LeaveTypeDto[]> {
  if (!policy.canViewLeaveMaster(ctx.actor)) throw new ForbiddenError();
  await ensureDefaultTypes();
  return (await repository.listTypes()).map(typeDto);
}

export async function saveType(
  ctx: RequestContext,
  id: string | null,
  input: LeaveTypeInput,
): Promise<LeaveTypeDto> {
  if (!policy.canManageLeaveMaster(ctx.actor)) throw new ForbiddenError();
  await ensureDefaultTypes();
  const before = id ? await repository.findType(id) : null;
  if (id && !before) throw new NotFoundError();
  if (before && before.category !== input.category) {
    throw new BusinessRuleError("Kategori jenis yang sudah ada tidak bisa diubah.");
  }
  const data = {
    code: input.code,
    name: input.name,
    category: input.category,
    maxDaysPerRequest: input.maxDaysPerRequest,
    documentRequiredAfterDays: input.documentRequiredAfterDays,
    description: input.description?.trim() || null,
    documentLabel: input.documentLabel?.trim() || null,
    isActive: input.isActive,
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  };
  try {
    const row = id ? await repository.updateType(id, data) : await repository.createType(data);
    await audit(ctx, id ? "leave.type.update" : "leave.type.create", row.id, before, row);
    return typeDto(row);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new ConflictError("Kode jenis sudah dipakai.");
    throw error;
  }
}

export interface LeaveYearDto {
  year: number;
  quota: number;
  isActive: boolean;
  grantedAt: string | null;
  settledAt: string | null;
  expiredAt: string | null;
}
const yearDto = (row: {
  year: number;
  quota: number;
  isActive: boolean;
  grantedAt: Date | null;
  settledAt: Date | null;
  expiredAt: Date | null;
}): LeaveYearDto => ({
  year: row.year,
  quota: row.quota,
  isActive: row.isActive,
  grantedAt: row.grantedAt?.toISOString() ?? null,
  settledAt: row.settledAt?.toISOString() ?? null,
  expiredAt: row.expiredAt?.toISOString() ?? null,
});

export async function listYears(ctx: RequestContext): Promise<LeaveYearDto[]> {
  if (!policy.canViewLeaveYears(ctx.actor)) throw new ForbiddenError();
  return (await repository.listYears()).map(yearDto);
}

export async function saveYear(ctx: RequestContext, input: LeaveYearInput): Promise<LeaveYearDto> {
  if (!policy.canManageLeaveMaster(ctx.actor)) throw new ForbiddenError();
  const before = await repository.findYear(input.year);
  if (before?.grantedAt && before.quota !== input.quota) {
    throw new BusinessRuleError(
      "Jatah tahun ini sudah dibagikan; ubah saldo karyawan lewat penyesuaian.",
    );
  }
  const row = await repository.upsertYear(input.year, {
    quota: input.quota,
    isActive: input.isActive,
  });
  await audit(ctx, "leave.year.save", null, before, row);
  return yearDto(row);
}

// ── Hitung hari & saldo ────────────────────────────────────────────────────────

async function employeeFor(ctx: RequestContext, employeeId: string) {
  const employee = await employeeDirectory.employeeById(employeeId);
  if (!employee) throw new NotFoundError();
  const target = { employeeId, companyId: employee.companyId, managerId: employee.managerId };
  if (!policy.canViewEmployeeLeave(ctx.actor, target)) throw new NotFoundError();
  return employee;
}

function selfEmployee(ctx: RequestContext) {
  if (!ctx.actor.employeeId) {
    throw new ForbiddenError("Pengajuan hanya untuk akun yang terhubung ke data karyawan.");
  }
  return ctx.actor.employeeId;
}

/** Hari kerja roster terhitung di rentang (§7.3). */
async function countedDates(employeeId: string, startDate: string, endDate: string) {
  const all = datesBetween(startDate, endDate);
  if (all.length > MAX_RANGE_DAYS) {
    throw new BusinessRuleError(`Rentang pengajuan maksimal ${MAX_RANGE_DAYS} hari.`);
  }
  const [roster, holidays] = await Promise.all([
    rosterMarks(employeeId, startDate, endDate),
    holidaysBetween(startDate, endDate),
  ]);
  const holidayKinds = new Map([...holidays.entries()].map(([date, h]) => [date, h.kind]));
  return countLeaveDates(all, roster, holidayKinds);
}

async function balanceMap(employeeId: string, years: number[], tx?: repository.LeaveTx) {
  const sums = await repository.balances([employeeId], years, tx);
  return new Map(years.map((year) => [year, sums.get(`${employeeId}|${year}`) ?? 0]));
}

/**
 * Hari yang memotong saldo cuti tahunan: cuti tahunan = semua hari; izin = hari yang melebihi batas
 * "maks. hari per pengajuan" jenisnya (hari-hari terakhir rentang; permintaan pemilik projek 2026-10-19 —
 * izin boleh melebihi batas, kelebihannya memakai cuti tahunan, saldo boleh minus/hutang seperti D-072).
 * Sakit tidak pernah memotong cuti tahunan.
 */
export function annualChargedDates(
  type: { category: string; maxDaysPerRequest: number | null },
  dates: string[],
): string[] {
  if (type.category === "ANNUAL") return dates;
  if (type.category === "PERMIT" && type.maxDaysPerRequest !== null) {
    return [...dates].sort().slice(type.maxDaysPerRequest);
  }
  return [];
}

export interface LeavePreview {
  /** TM-D9: saldo tahun beban sudah hangus → cuti tahunan untuk tanggal ini tidak bisa diajukan. */
  expiredYear: number | null;
  dates: string[];
  days: number;
  /** Hari yang memotong saldo cuti tahunan (izin: hanya kelebihan dari batas jenisnya). */
  annualDays: number;
  charges: { year: number; days: number }[];
  balances: { year: number; balance: number }[];
  documentRequired: boolean;
  conflicts: string[];
}

export async function previewLeave(
  ctx: RequestContext,
  input: LeavePreviewInput,
): Promise<LeavePreview> {
  const employeeId = selfEmployee(ctx);
  await ensureDefaultTypes();
  const type = await repository.findType(input.leaveTypeId);
  if (!type?.isActive) throw new BusinessRuleError("Jenis cuti/izin tidak tersedia.");
  const dates = await countedDates(employeeId, input.startDate, input.endDate);
  const charged = annualChargedDates(type, dates);
  // TM-D9: seluruh pembebanan ke tahun hari terhitung pertama (tahun mulai).
  const chargeYear = chargeYearOf(dates);
  const charging = charged.length > 0 && chargeYear !== null;
  const balances = charging
    ? await balanceMap(employeeId, [chargeYear as number])
    : new Map<number, number>();
  const charges = charging ? allocateCharges(charged, chargeYear as number).byYear : new Map();
  return {
    expiredYear:
      charging && isLeaveYearExpired(chargeYear as number, await settingsToday())
        ? (chargeYear as number)
        : null,
    dates,
    days: dates.length,
    annualDays: charged.length,
    charges: [...charges.entries()].map(([year, days]) => ({ year, days })),
    balances: [...balances.entries()]
      .map(([year, balance]) => ({ year, balance }))
      .sort((a, b) => a.year - b.year),
    documentRequired:
      type.documentRequiredAfterDays !== null && dates.length > type.documentRequiredAfterDays,
    conflicts: await datesWithPunches(employeeId, dates),
  };
}

// ── Pengajuan ──────────────────────────────────────────────────────────────────

export async function createAttachmentUpload(
  ctx: RequestContext,
  contentType: (typeof LEAVE_ATTACHMENT_TYPES)[number],
) {
  const employeeId = selfEmployee(ctx);
  await ensureBucket();
  const ext = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[contentType];
  const path = `${storage().storagePathPrefix}leave/${employeeId}/${crypto.randomUUID()}.${ext}`;
  const upload = await storage().storage.createSignedUploadUrl(LEAVE_ATTACHMENT_BUCKET, path);
  return {
    bucket: LEAVE_ATTACHMENT_BUCKET,
    path,
    token: upload.token,
    signedUrl: upload.signedUrl,
    maxBytes: LEAVE_ATTACHMENT_MAX_BYTES,
  };
}

export interface LeaveRequestDto {
  id: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  type: { id: string; code: string; name: string; category: string };
  startDate: string;
  endDate: string;
  workDates: string[];
  days: number;
  /** Bagian hari yang memotong saldo cuti tahunan (izin melebihi batas / cuti tahunan). */
  annualDays: number;
  reason: string;
  attachmentUrl: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  approval: ApprovalView | null;
  canCancel: boolean;
  /** TM-D9: catatan pemutus yang menolak (bila ditolak). */
  rejectionNote: string | null;
  /** TM-D9: pengajuan ini adalah pengajuan ulang dari pengajuan yang ditolak. */
  resubmittedFrom: {
    id: string;
    startDate: string;
    endDate: string;
    rejectionNote: string | null;
  } | null;
  /** TM-D9: pemilik boleh mengajukan ulang (ditolak, ≤ 6 bulan, belum diajukan ulang) s.d. tanggal ini. */
  resubmitUntil: string | null;
  canResubmit: boolean;
}

const subjectOf = (category: string): "LEAVE" | "PERMIT" =>
  category === "ANNUAL" ? "LEAVE" : "PERMIT";

/** Catatan langkah yang menolak (atasan/HR) dari tampilan approval. */
const rejectionNoteOf = (view: ApprovalView | undefined) =>
  view?.steps.find((step) => step.decision === "REJECTED")?.note ?? null;

/** Tanggal (Jakarta) penolakan PERTAMA dalam rantai pengajuan ulang — patokan batas 6 bulan. */
async function rootRejectedOn(row: repository.RequestRow): Promise<string | null> {
  let current: repository.RequestRow | null = row;
  for (let i = 0; i < 20 && current?.resubmittedFromId; i++) {
    const parent: repository.RequestRow | null = await repository.findRequest(
      current.resubmittedFromId,
    );
    if (!parent) break;
    current = parent;
  }
  return current?.decidedAt ? await settingsToday(current.decidedAt) : null;
}

async function toDtos(
  ctx: RequestContext,
  rows: repository.RequestRow[],
  withAttachment = false,
): Promise<LeaveRequestDto[]> {
  const people = await employeeDirectory.employeesByIds(rows.map((r) => r.employeeId));
  const charged = await repository.chargedDaysByRequest(rows.map((r) => r.id));
  const parents = await repository.requestsByIds(
    rows.map((r) => r.resubmittedFromId).filter((id): id is string => id !== null),
  );
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const approvals = new Map<string, ApprovalView>();
  for (const subject of ["LEAVE", "PERMIT"] as const) {
    const ids = [...rows, ...parents]
      .filter((r) => subjectOf(r.category) === subject)
      .map((r) => r.id);
    for (const [id, view] of await getApprovalViews(ctx.actor, subject, ids))
      approvals.set(id, view);
  }
  const today = await settingsToday();
  const rejectedOwn = rows.filter(
    (r) => r.status === "REJECTED" && r.employeeId === ctx.actor.employeeId,
  );
  const resubmitted = await repository.activeResubmissions(rejectedOwn.map((r) => r.id));
  const deadlines = new Map<string, string | null>();
  for (const r of rejectedOwn) {
    const root = await rootRejectedOn(r);
    deadlines.set(r.id, root ? leaveResubmitDeadline(root) : null);
  }
  const paths = withAttachment
    ? rows.map((r) => r.attachmentPath).filter((p): p is string => p !== null)
    : [];
  const urls =
    paths.length > 0 && deps
      ? await deps.storage
          .createSignedUrls(LEAVE_ATTACHMENT_BUCKET, paths, ATTACHMENT_URL_TTL_SECONDS)
          .catch(() => new Map<string, string>())
      : new Map<string, string>();
  return rows.map((row) => {
    const person = people.get(row.employeeId);
    return {
      id: row.id,
      employee: {
        id: row.employeeId,
        fullName: person?.fullName ?? "—",
        employeeNumber: person?.employeeNumber ?? null,
      },
      type: {
        id: row.type.id,
        code: row.type.code,
        name: row.type.name,
        category: row.type.category,
      },
      startDate: toIso(row.startDate),
      endDate: toIso(row.endDate),
      workDates: row.workDates.map(toIso),
      days: row.days,
      annualDays: charged.get(row.id) ?? 0,
      reason: row.reason,
      attachmentUrl: row.attachmentPath ? (urls.get(row.attachmentPath) ?? null) : null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      approval: approvals.get(row.id) ?? null,
      canCancel: row.status === "PENDING" && row.employeeId === ctx.actor.employeeId,
      rejectionNote: row.status === "REJECTED" ? rejectionNoteOf(approvals.get(row.id)) : null,
      resubmittedFrom: (() => {
        const parent = row.resubmittedFromId ? parentById.get(row.resubmittedFromId) : undefined;
        return parent
          ? {
              id: parent.id,
              startDate: toIso(parent.startDate),
              endDate: toIso(parent.endDate),
              rejectionNote: rejectionNoteOf(approvals.get(parent.id)),
            }
          : null;
      })(),
      resubmitUntil: deadlines.get(row.id) ?? null,
      canResubmit: (() => {
        const until = deadlines.get(row.id);
        return Boolean(until && today <= until && !resubmitted.has(row.id));
      })(),
    };
  });
}

export async function createLeaveRequest(
  ctx: RequestContext,
  input: LeaveRequestInput,
): Promise<LeaveRequestDto> {
  const employeeId = selfEmployee(ctx);
  if (!policy.canRequestLeave(ctx.actor, employeeId)) throw new ForbiddenError();
  const employee = await employeeDirectory.employeeById(employeeId);
  if (!employee?.isActive) throw new ForbiddenError("Karyawan tidak aktif.");
  await ensureDefaultTypes();
  const type = await repository.findType(input.leaveTypeId);
  if (!type?.isActive) throw new BusinessRuleError("Jenis cuti/izin tidak tersedia.");

  const dates = await countedDates(employeeId, input.startDate, input.endDate);
  if (dates.length === 0) {
    throw new BusinessRuleError("Tidak ada hari kerja roster pada rentang ini (semua OFF/libur).");
  }
  // Izin boleh melebihi batas (kelebihan memotong cuti tahunan); batas tetap berlaku untuk sakit.
  if (
    type.category === "SICK" &&
    type.maxDaysPerRequest !== null &&
    dates.length > type.maxDaysPerRequest
  ) {
    throw new BusinessRuleError(
      `${type.name} maksimal ${type.maxDaysPerRequest} hari per pengajuan.`,
    );
  }
  const charged = annualChargedDates(type, dates);
  const today = await settingsToday();
  // TM-D9: pembebanan ke tahun mulai; saldo tahun yang sudah hangus tidak bisa dipakai lagi.
  const chargeYear = chargeYearOf(dates) as number;
  if (charged.length > 0 && isLeaveYearExpired(chargeYear, today)) {
    throw new BusinessRuleError(
      `Saldo cuti ${chargeYear} sudah hangus (${dateLabel(leaveBalanceLastDay(chargeYear))}); cuti tahunan untuk tanggal tersebut tidak bisa diajukan lagi.`,
    );
  }
  // TM-D9: pengajuan ulang dari pengajuan yang ditolak (≤ 6 bulan sejak penolakan pertama, tanggal ke depan).
  let resubmitOf: repository.RequestRow | null = null;
  if (input.resubmitOfId) {
    resubmitOf = await repository.findRequest(input.resubmitOfId);
    if (!resubmitOf || resubmitOf.employeeId !== employeeId) {
      throw new NotFoundError("Pengajuan asal tidak ditemukan.");
    }
    if (resubmitOf.status !== "REJECTED") {
      throw new BusinessRuleError("Hanya pengajuan yang ditolak yang bisa diajukan ulang.");
    }
    const root = await rootRejectedOn(resubmitOf);
    const until = root ? leaveResubmitDeadline(root) : null;
    if (!until || today > until) {
      throw new BusinessRuleError(
        `Batas pengajuan ulang sudah lewat${until ? ` (paling lambat ${dateLabel(until)})` : ""}.`,
      );
    }
    if (input.startDate <= today) {
      throw new BusinessRuleError(
        "Pengajuan ulang hanya untuk tanggal ke depan (mulai besok atau setelahnya).",
      );
    }
    if ((await repository.activeResubmissions([resubmitOf.id])).size > 0) {
      throw new ConflictError("Pengajuan ini sudah diajukan ulang.");
    }
  }
  const needsDocument =
    type.documentRequiredAfterDays !== null && dates.length > type.documentRequiredAfterDays;
  if (needsDocument && !input.attachmentPath) {
    throw new BusinessRuleError(`${type.name} ${dates.length} hari wajib melampirkan dokumen.`);
  }
  if (input.attachmentPath) {
    if (!input.attachmentPath.startsWith(`${storage().storagePathPrefix}leave/${employeeId}/`)) {
      throw new BusinessRuleError("Lampiran tidak valid. Unggah ulang.");
    }
    const info = await storage().storage.getObjectInfo(
      LEAVE_ATTACHMENT_BUCKET,
      input.attachmentPath,
    );
    if (!info || info.size <= 0 || info.size > LEAVE_ATTACHMENT_MAX_BYTES) {
      throw new BusinessRuleError("Lampiran belum terunggah atau terlalu besar. Unggah ulang.");
    }
  }
  for (const date of [dates[0], dates[dates.length - 1]] as string[]) {
    if (await isDateClosed(employee.companyId, date)) {
      throw new BusinessRuleError("Periode absensi pada rentang ini sudah ditutup.");
    }
  }
  const overlap = await repository.overlapping(
    employeeId,
    toDate(input.startDate),
    toDate(input.endDate),
  );
  if (overlap.length > 0) {
    throw new ConflictError("Sudah ada pengajuan cuti/izin/sakit pada rentang ini.");
  }
  const punched = await datesWithPunches(employeeId, dates);
  if (punched.length > 0) {
    throw new BusinessRuleError(`Sudah ada absen pada ${punched.join(", ")}; tidak bisa diajukan.`);
  }

  const row = await repository.withTransaction(async (tx) => {
    const created = await repository.createRequest(tx, {
      employeeId,
      companyId: employee.companyId,
      managerEmployeeId: employee.managerId,
      leaveTypeId: type.id,
      category: type.category,
      startDate: toDate(input.startDate),
      endDate: toDate(input.endDate),
      workDates: dates.map(toDate),
      days: dates.length,
      reason: input.reason,
      attachmentPath: input.attachmentPath ?? null,
      createdByEmployeeId: employeeId,
      resubmittedFromId: resubmitOf?.id ?? null,
    });
    if (resubmitOf) await repository.lockRequest(tx, resubmitOf.id);
    if (
      resubmitOf &&
      ((await repository.activeResubmissions([resubmitOf.id], tx)).get(resubmitOf.id) ?? 0) > 1
    ) {
      throw new ConflictError("Pengajuan ini sudah diajukan ulang.");
    }
    if (charged.length > 0) {
      // Hutang diperbolehkan (D-072): tahanan tetap dicatat walau saldo menjadi minus.
      const { byYear } = allocateCharges(charged, chargeYear);
      await repository.addEntries(
        tx,
        [...byYear.entries()].map(([year, days]) => ({
          employeeId,
          companyId: employee.companyId,
          year,
          kind: "HOLD" as const,
          days: -days,
          requestId: created.id,
          createdByAccount: ctx.actor.accountId,
        })),
      );
    }
    await createApprovalRequest(tx, {
      subjectType: subjectOf(type.category),
      subjectId: created.id,
      requesterEmployeeId: employeeId,
      companyId: employee.companyId,
      managerEmployeeId: employee.managerId,
    });
    return created;
  });
  if (employee.managerId) {
    await notifyEmployees([
      {
        employeeId: employee.managerId,
        type: "leave.request_new",
        title: `${resubmitOf ? "Pengajuan ulang" : "Pengajuan"} ${type.name} dari ${employee.fullName}`,
        body: `${dateLabel(input.startDate)} – ${dateLabel(input.endDate)} (${dates.length} hari${
          charged.length > 0 && type.category !== "ANNUAL"
            ? `, ${charged.length} hari memotong cuti tahunan`
            : ""
        }).`,
        link: "/time/persetujuan-cuti",
        dedupeKey: `tm-leave-new:${row.id}`,
        target: { type: "LEAVE_REQUEST", id: row.id },
      },
    ]);
  }
  await audit(ctx, "leave.request.create", row.id, null, {
    type: type.code,
    startDate: input.startDate,
    endDate: input.endDate,
    days: dates.length,
    annualDays: charged.length,
    ...(resubmitOf ? { resubmitOfId: resubmitOf.id } : {}),
  });
  return (await toDtos(ctx, [row]))[0] as LeaveRequestDto;
}

/** Lepas tahanan saldo milik pengajuan (+ opsional ubah jadi terpakai). */
async function settleHolds(
  tx: repository.LeaveTx,
  row: repository.RequestRow,
  convertToUse: boolean,
  accountId: string | null,
) {
  const held = await repository.heldByYear(tx, row.id);
  const entries: Parameters<typeof repository.addEntries>[1] = [];
  for (const [year, days] of held) {
    if (days === 0) continue;
    const base = {
      employeeId: row.employeeId,
      companyId: row.companyId,
      year,
      requestId: row.id,
      createdByAccount: accountId,
    };
    entries.push({ ...base, kind: "RELEASE", days });
    if (convertToUse) {
      entries.push({ ...base, kind: "USE", days: -days });
    } else if (days > 0 && isLeaveYearExpired(year, await settingsToday())) {
      // TM-D9: tahanan yang dilepas setelah saldo tahun itu hangus tidak menghidupkan saldo lagi —
      // hanya bagian yang membuat saldo positif yang ikut hangus (hutang nyata tetap hutang).
      await repository.lockEmployeeYear(tx, row.employeeId, year);
      const after =
        ((await repository.balances([row.employeeId], [year], tx)).get(
          `${row.employeeId}|${year}`,
        ) ?? 0) + days;
      const expire = Math.min(days, Math.max(0, after));
      if (expire > 0) {
        entries.push({
          ...base,
          kind: "EXPIRE",
          days: -expire,
          note: `Tahanan dilepas setelah sisa ${year} hangus`,
        });
      }
    }
  }
  await repository.addEntries(tx, entries);
}

export async function cancelLeaveRequest(
  ctx: RequestContext,
  id: string,
): Promise<LeaveRequestDto> {
  const row = await repository.findRequest(id);
  if (!row || row.employeeId !== ctx.actor.employeeId) throw new NotFoundError();
  if (row.status !== "PENDING") {
    throw new BusinessRuleError("Hanya pengajuan yang masih menunggu yang bisa dibatalkan.");
  }
  const updated = await repository.withTransaction(async (tx) => {
    await cancelApprovalRequest(tx, subjectOf(row.category), row.id);
    await settleHolds(tx, row, false, ctx.actor.accountId);
    return repository.updateRequest(tx, row.id, { status: "CANCELLED", decidedAt: new Date() });
  });
  await audit(ctx, "leave.request.cancel", row.id, { status: row.status }, { status: "CANCELLED" });
  return (await toDtos(ctx, [updated]))[0] as LeaveRequestDto;
}

/** Status final dari mesin approval → saldo & penandaan hari (dipanggil di transaksi keputusan). */
export function registerLeaveIntegrations() {
  const handler = async (
    tx: repository.LeaveTx,
    event: {
      subjectId: string;
      status: "APPROVED" | "REJECTED" | "CANCELLED";
      decidedAt: Date;
      afterCommit: AfterCommit;
    },
  ) => {
    const row = await repository.findRequest(event.subjectId, tx);
    if (row?.status !== "PENDING") return;
    await settleHolds(tx, row, event.status === "APPROVED", null);
    if (event.status === "APPROVED") {
      await markLeaveDays(tx, {
        employeeId: row.employeeId,
        companyId: row.companyId,
        managerEmployeeId: row.managerEmployeeId,
        dates: row.workDates.map(toIso),
      });
    }
    await repository.updateRequest(tx, row.id, {
      status: event.status,
      decidedAt: event.decidedAt,
    });
    if (event.status === "APPROVED" || event.status === "REJECTED") {
      const approved = event.status === "APPROVED";
      // Setelah commit: keputusan yang batal tidak mengirim notifikasi.
      event.afterCommit(() =>
        notifyEmployees([
          {
            employeeId: row.employeeId,
            type: "leave.request_decided",
            title: `${row.type.name} ${dateLabel(toIso(row.startDate))} ${
              approved ? "disetujui" : "ditolak"
            }`,
            body: approved
              ? `${row.days} hari tercatat sebagai cuti/izin.`
              : "Tahanan saldo dikembalikan. Lihat catatan penolakan di halaman Cuti.",
            link: "/absen/cuti",
            dedupeKey: `tm-leave-decided:${row.id}`,
            target: { type: "LEAVE_REQUEST", id: row.id },
          },
        ]),
      );
    }
  };
  registerApprovalHandler("LEAVE", handler);
  registerApprovalHandler("PERMIT", handler);
}

export async function myLeave(ctx: RequestContext, now = new Date()) {
  const employeeId = selfEmployee(ctx);
  const year = Number((await settingsToday(now)).slice(0, 4));
  const ledger = await repository.ledgerOf(employeeId, [year - 1, year]);
  const requests = await repository.listRequests({ employeeId });
  return {
    year,
    balances: [year - 1, year].map((y) =>
      summarize(
        y,
        ledger.filter((r) => r.year === y),
      ),
    ),
    // TM-D9: sisa tahun lalu tidak dibawa lagi mulai saldo 2026 (hangus 31 Desember tahunnya).
    carryUntil: year - 1 < LEAVE_YEAR_END_EXPIRY_FROM ? `${year}-03-31` : null,
    expiresOn: leaveBalanceLastDay(year),
    ledger: ledger.slice(0, 50).map((r) => ({
      id: r.id,
      year: r.year,
      kind: r.kind,
      days: r.days,
      workDate: r.workDate ? toIso(r.workDate) : null,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
    requests: await toDtos(ctx, requests),
  };
}

export interface RequestListQuery {
  scope: "inbox" | "all";
  companyId?: string | undefined;
  status?: string | undefined;
}

export async function listLeaveRequests(
  ctx: RequestContext,
  query: RequestListQuery,
): Promise<LeaveRequestDto[]> {
  const actor = ctx.actor;
  if (query.scope === "inbox") {
    const actionable = [
      ...(await listActionable(actor, "LEAVE", { includeOverride: true })),
      ...(await listActionable(actor, "PERMIT", { includeOverride: true })),
    ];
    let rows = await repository.requestsByIds(actionable.map((a) => a.subjectId));
    if (query.companyId) rows = rows.filter((r) => r.companyId === query.companyId);
    return toDtos(ctx, rows, true);
  }
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (actor.role === "SUPER_ADMIN") {
    if (query.companyId) where.companyId = query.companyId;
  } else if (actor.role === "HR_ADMIN") {
    const scope = [...(actor.companyIds ?? [])];
    if (query.companyId && !scope.includes(query.companyId)) throw new ForbiddenError();
    where.companyId = query.companyId ?? { in: scope };
  } else if (actor.role === "MANAGER" && actor.employeeId) {
    where.employeeId = { in: await employeeDirectory.teamIds(actor.employeeId) };
  } else {
    throw new ForbiddenError();
  }
  return toDtos(ctx, await repository.listRequests(where), true);
}

export async function getLeaveRequest(ctx: RequestContext, id: string): Promise<LeaveRequestDto> {
  const row = await repository.findRequest(id);
  if (!row) throw new NotFoundError();
  const target = {
    employeeId: row.employeeId,
    companyId: row.companyId,
    managerId: row.managerEmployeeId,
  };
  if (!policy.canViewEmployeeLeave(ctx.actor, target)) throw new NotFoundError();
  return (await toDtos(ctx, [row], true))[0] as LeaveRequestDto;
}

// ── Saldo per PT, penyesuaian, import ──────────────────────────────────────────

export interface BalanceRow extends BalanceSummary {
  employee: { id: string; fullName: string; employeeNumber: string | null };
  carryBalance: number;
}

export async function balanceTable(
  ctx: RequestContext,
  companyId: string,
  year: number,
  q?: string,
): Promise<BalanceRow[]> {
  if (!policy.canManageBalances(ctx.actor, companyId)) throw new ForbiddenError();
  const employees = await employeeDirectory.activeEmployeesInCompany(companyId, q, 1000);
  const ids = employees.map((e) => e.id);
  const [sums, carry] = await Promise.all([
    repository.sumsByKind(ids, year),
    repository.balances(ids, [year - 1]),
  ]);
  const byEmployee = new Map<string, { kind: LeaveLedgerKind; days: number }[]>();
  for (const s of sums) {
    const list = byEmployee.get(s.employeeId) ?? [];
    list.push({ kind: s.kind, days: s._sum.days ?? 0 });
    byEmployee.set(s.employeeId, list);
  }
  return employees
    .map((e) => ({
      ...summarize(year, byEmployee.get(e.id) ?? []),
      employee: { id: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber },
      carryBalance: carry.get(`${e.id}|${year - 1}`) ?? 0,
    }))
    .sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName, "id"));
}

export async function employeeLedger(ctx: RequestContext, employeeId: string, year: number) {
  await employeeFor(ctx, employeeId);
  const rows = await repository.ledgerOf(employeeId, [year]);
  return {
    summary: summarize(year, rows),
    entries: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      days: r.days,
      workDate: r.workDate ? toIso(r.workDate) : null,
      requestId: r.requestId,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function adjustBalance(ctx: RequestContext, input: LeaveAdjustInput) {
  const employee = await employeeDirectory.employeeById(input.employeeId);
  if (!employee) throw new NotFoundError();
  if (!policy.canManageBalances(ctx.actor, employee.companyId)) throw new ForbiddenError();
  await repository.withTransaction((tx) =>
    repository.addEntries(tx, [
      {
        employeeId: employee.id,
        companyId: employee.companyId,
        year: input.year,
        kind: "ADJUST",
        days: input.days,
        note: input.note,
        createdByAccount: ctx.actor.accountId,
      },
    ]),
  );
  await audit(ctx, "leave.balance.adjust", employee.id, null, input);
  return employeeLedger(ctx, employee.id, input.year);
}

export async function importBalances(
  ctx: RequestContext,
  input: LeaveBalanceImportInput,
  commit: boolean,
) {
  if (!policy.canManageBalances(ctx.actor, input.companyId)) throw new ForbiddenError();
  const employees = await employeeDirectory.employeesByNumbers(
    input.companyId,
    input.rows.map((r) => r.employeeNumber),
  );
  const issues: { index: number; employeeNumber: string; message: string }[] = [];
  const seen = new Set<string>();
  input.rows.forEach((row, index) => {
    if (!employees.has(row.employeeNumber)) {
      issues.push({
        index,
        employeeNumber: row.employeeNumber,
        message: "NIP tidak ditemukan di perusahaan ini.",
      });
    } else if (seen.has(row.employeeNumber)) {
      issues.push({
        index,
        employeeNumber: row.employeeNumber,
        message: "NIP muncul lebih dari sekali.",
      });
    }
    seen.add(row.employeeNumber);
  });
  const ids = [...employees.values()].map((e) => e.id);
  const current = await repository.balances(ids, [input.year]);
  const changes = input.rows
    .map((row) => {
      const employee = employees.get(row.employeeNumber);
      if (!employee) return null;
      const before = current.get(`${employee.id}|${input.year}`) ?? 0;
      return { employee, before, after: row.balance, diff: row.balance - before };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (!commit || issues.length > 0) {
    if (commit)
      throw new BusinessRuleError(
        "Masih ada baris bermasalah; perbaiki lalu pratinjau ulang.",
        issues,
      );
    return {
      total: input.rows.length,
      changed: changes.filter((c) => c.diff !== 0).length,
      issues,
      saved: 0,
    };
  }
  const entries = changes
    .filter((c) => c.diff !== 0)
    .map((c) => ({
      employeeId: c.employee.id,
      companyId: c.employee.companyId,
      year: input.year,
      kind: "ADJUST" as const,
      days: c.diff,
      note: `Import saldo ${input.year}: ${c.before} → ${c.after}`,
      createdByAccount: ctx.actor.accountId,
    }));
  await repository.withTransaction((tx) => repository.addEntries(tx, entries));
  await audit(ctx, "leave.balance.import", null, null, {
    companyId: input.companyId,
    year: input.year,
    rows: input.rows.length,
    changed: entries.length,
  });
  return { total: input.rows.length, changed: entries.length, issues: [], saved: entries.length };
}

// ── Pekerjaan harian (cron `leave-daily`) ──────────────────────────────────────

async function ensureYear(year: number) {
  return (
    (await repository.findYear(year)) ??
    repository.upsertYear(year, { quota: DEFAULT_ANNUAL_QUOTA, isActive: true })
  );
}

/** 1 Januari: jatah penuh / prorata untuk setiap karyawan aktif (idempoten per karyawan). */
export async function grantAnnual(year: number): Promise<{ granted: number }> {
  const master = await ensureYear(year);
  if (!master.isActive) return { granted: 0 };
  const employees = await employeeDirectory.activeEmployeesForGrant();
  let granted = 0;
  for (const employee of employees) {
    const days = prorataDays(toIso(employee.joinDate), year, master.quota);
    if (days <= 0) continue;
    if (await repository.hasEntry({ employeeId: employee.id, year, kind: "GRANT" })) continue;
    await repository.withTransaction((tx) =>
      repository.addEntries(tx, [
        {
          employeeId: employee.id,
          companyId: employee.companyId,
          year,
          kind: "GRANT",
          days,
          note: days === master.quota ? "Jatah penuh" : `Prorata ${days} bulan kerja penuh`,
        },
      ]),
    );
    granted++;
  }
  await repository.markYear(year, { grantedAt: new Date() });
  return { granted };
}

/** Akhir Januari: hutang tahun lalu dipotong dari jatah baru sebanyak yang tersedia. */
export async function settleDebts(
  year: number,
): Promise<{ settled: number; remainingDebt: number }> {
  await ensureYear(year);
  // TM-D9: hanya hutang NYATA — tahanan pengajuan yang masih menunggu bukan hutang (bisa ditolak).
  const previous = await repository.employeesWithLedger(year - 1, { excludeHolds: true });
  let settled = 0;
  let remainingDebt = 0;
  for (const row of previous) {
    const prevBalance = row._sum.days ?? 0;
    if (prevBalance >= 0) continue;
    if (await repository.hasEntry({ employeeId: row.employeeId, year, kind: "SETTLE" })) continue;
    const current =
      (await repository.balances([row.employeeId], [year])).get(`${row.employeeId}|${year}`) ?? 0;
    const days = settlementDays(prevBalance, current);
    if (days < -prevBalance) remainingDebt++;
    if (days === 0) continue;
    const base = { employeeId: row.employeeId, companyId: row.companyId, kind: "SETTLE" as const };
    await repository.withTransaction((tx) =>
      repository.addEntries(tx, [
        { ...base, year, days: -days, note: `Pelunasan hutang ${year - 1}` },
        { ...base, year: year - 1, days, note: `Dilunasi dari jatah ${year}` },
      ]),
    );
    settled++;
  }
  await repository.markYear(year, { settledAt: new Date() });
  return { settled, remainingDebt };
}

/**
 * Sisa jatah tahun lalu (`year − 1`) yang masih positif hangus. TM-D9: untuk saldo ≥ 2026 dijalankan
 * mulai 1 Januari `year` (hangus 31 Desember); saldo lama (D-072) mulai 1 April. Tahanan pengajuan yang
 * masih menunggu terlindungi (sudah mengurangi saldo); bila kemudian dilepas, dihanguskan di settleHolds.
 */
export async function expireCarry(year: number): Promise<{ expired: number }> {
  await ensureYear(year);
  const previous = await repository.employeesWithLedger(year - 1);
  let expired = 0;
  for (const row of previous) {
    if ((row._sum.days ?? 0) <= 0) continue;
    // Dikunci per (karyawan, tahun) & saldo dibaca ulang di transaksi: pelepasan tahanan yang terjadi
    // bersamaan tidak membuat sisa dihanguskan dua kali (hutang palsu).
    const done = await repository.withTransaction(async (tx) => {
      await repository.lockEmployeeYear(tx, row.employeeId, year - 1);
      const where = { employeeId: row.employeeId, year: year - 1, kind: "EXPIRE" as const };
      if (await repository.hasEntry({ ...where, requestId: null }, tx)) return false;
      const balance =
        (await repository.balances([row.employeeId], [year - 1], tx)).get(
          `${row.employeeId}|${year - 1}`,
        ) ?? 0;
      if (balance <= 0) return false;
      await repository.addEntries(tx, [
        {
          ...where,
          companyId: row.companyId,
          days: -balance,
          note:
            year - 1 >= LEAVE_YEAR_END_EXPIRY_FROM
              ? `Sisa ${year - 1} hangus 31 Desember ${year - 1}`
              : `Sisa ${year - 1} hangus 31 Maret ${year}`,
        },
      ]);
      return true;
    });
    if (done) expired++;
  }
  await repository.markYear(year, { expiredAt: new Date() });
  return { expired };
}

/** Cuti bersama yang sudah lewat: karyawan terjadwal kerja tanpa absen & tanpa pengajuan → −1 cuti. */
export async function chargeCollectiveLeave(date: string): Promise<{ charged: number }> {
  const holiday = (await holidaysBetween(date, date)).get(date);
  if (holiday?.kind !== "COLLECTIVE_LEAVE") return { charged: 0 };
  const candidates = await rosteredWithoutAttendance(date);
  const people = await employeeDirectory.employeesByIds(candidates);
  let charged = 0;
  for (const employeeId of candidates) {
    const employee = people.get(employeeId);
    if (!employee?.isActive) continue;
    if (await repository.hasEntry({ employeeId, kind: "COLLECTIVE", workDate: toDate(date) }))
      continue;
    if ((await repository.overlapping(employeeId, toDate(date), toDate(date))).length > 0) continue;
    await repository.withTransaction(async (tx) => {
      const year = Number(date.slice(0, 4));
      await repository.lockEmployeeYear(tx, employeeId, year);
      // TM-D9: cuti bersama yang baru dibebankan setelah sisa tahun itu dihanguskan diambil dari sisa yang
      // hangus (bukan menjadi hutang yang memotong jatah tahun baru).
      const expiredSum = await repository.expiredDays(tx, employeeId, year);
      if (expiredSum > 0) {
        await repository.addEntries(tx, [
          {
            employeeId,
            companyId: employee.companyId,
            year,
            kind: "EXPIRE",
            days: 1,
            workDate: toDate(date),
            note: `Cuti bersama ${date} dibebankan setelah hangus — diambil dari sisa yang hangus`,
          },
        ]);
      }
      await repository.addEntries(tx, [
        {
          employeeId,
          companyId: employee.companyId,
          year,
          kind: "COLLECTIVE",
          days: -1,
          workDate: toDate(date),
          note: `Cuti bersama: ${holiday.name}`,
        },
      ]);
      await markLeaveDays(tx, {
        employeeId,
        companyId: employee.companyId,
        managerEmployeeId: employee.managerId,
        dates: [date],
      });
    });
    charged++;
  }
  return { charged };
}

/**
 * Cron harian `leave-daily` (Vercel Hobby: satu kali sehari). Setiap langkah idempoten dan mengejar
 * ketertinggalan bila cron sempat tidak jalan: cuti bersama 7 hari terakhir (lebih dulu, supaya cuti
 * bersama akhir Desember dibebankan sebelum sisa hangus), jatah (≥ 1 Jan), hangus sisa tahun lalu
 * (TM-D9: ≥ 1 Jan; saldo lama D-072: ≥ 1 Apr), pelunasan hutang (≥ 31 Jan), hak cuti karyawan keluar.
 */
export interface LeaveDailyResult {
  collective: { charged: number };
  grant?: { granted: number };
  expire?: { expired: number };
  settle?: { settled: number; remainingDebt: number };
  exits: { created: number; cancelled: number };
}

export async function runLeaveDaily(now = new Date()): Promise<LeaveDailyResult> {
  const today = await settingsToday(now);
  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(5);
  const master = await ensureYear(year);
  const result: Partial<LeaveDailyResult> = {};
  let charged = 0;
  // Cuti bersama 62 hari terakhir (idempoten): menangkap juga hari yang tadinya tertutup pengajuan cuti
  // yang lama menunggu lalu ditolak/dibatalkan.
  const from = toDate(today);
  from.setUTCDate(from.getUTCDate() - 62);
  const yesterday = toDate(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  for (const holiday of (await holidaysBetween(toIso(from), toIso(yesterday))).values()) {
    if (holiday.kind === "COLLECTIVE_LEAVE") {
      charged += (await chargeCollectiveLeave(holiday.date)).charged;
    }
  }
  result.collective = { charged };
  if (!master.grantedAt) result.grant = await grantAnnual(year);
  const expireFrom = year - 1 >= LEAVE_YEAR_END_EXPIRY_FROM ? "01-01" : "04-01";
  if (monthDay >= expireFrom && !master.expiredAt) result.expire = await expireCarry(year);
  if (monthDay >= "01-31" && !master.settledAt) result.settle = await settleDebts(year);
  result.exits = await syncExitSettlements();
  return result as LeaveDailyResult;
}

export async function runLeaveJob(
  ctx: RequestContext,
  job: "grant" | "settle" | "expire" | "collective" | "daily",
  value: string,
) {
  if (!policy.canRunLeaveJobs(ctx.actor)) throw new ForbiddenError();
  const result =
    job === "grant"
      ? await grantAnnual(Number(value))
      : job === "settle"
        ? await settleDebts(Number(value))
        : job === "expire"
          ? await expireCarry(Number(value))
          : job === "collective"
            ? await chargeCollectiveLeave(value)
            : await runLeaveDaily();
  await audit(ctx, `leave.job.${job}`, null, null, { value, result });
  return result;
}
