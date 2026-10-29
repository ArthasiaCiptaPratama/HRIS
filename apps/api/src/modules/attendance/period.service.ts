import {
  type CorrectionInput,
  canStillCorrect,
  correctionDeadline,
  type PeriodCloseInput,
  STATEMENT_ATTACHMENT_MAX_BYTES,
  STATEMENT_ATTACHMENT_TYPES,
  type StatementInput,
} from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { hasPermission } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import { getPrisma } from "../../core/db.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import type { StorageAdmin } from "../../core/storage.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import {
  type ApprovalView,
  cancelApprovalRequest,
  createApprovalRequest,
  getApprovalViews,
  listActionable,
  registerApprovalHandler,
} from "../approval/index.ts";
import { markNoAttendanceAlpha, pendingAlphaVerifications } from "./alpha.service.ts";
import * as policy from "./attendance.policy.ts";
import { localDate, offsetMinutes } from "./attendance-engine.ts";
import {
  type RequestContext,
  readTimeSettings,
  settingsToday,
  toDate,
  toIso,
} from "./calendar.service.ts";
import * as directory from "./directory.ts";
import { isoAddDays } from "./roster-engine.ts";
import { dateLabel, notifyEmployees } from "./time-notify.service.ts";

// Tahap F — tutup periode → ALPHA, surat pernyataan absensi, rekap bulanan, koreksi absensi (D-071).

const db = () => getPrisma();
export const STATEMENT_BUCKET = "attendance-statements";
const URL_TTL_SECONDS = 10 * 60;
const monthRange = (month: string) => {
  const from = `${month}-01`;
  const to = isoAddDays(`${isoAddDays(from, 31).slice(0, 7)}-01`, -1);
  return { from, to };
};

let storageDeps: { storage: StorageAdmin; storagePathPrefix: string } | undefined;
let bucketReady: Promise<unknown> | undefined;
export function configurePeriod(next: { storage: StorageAdmin; storagePathPrefix: string }) {
  storageDeps = next;
}
function storage() {
  if (!storageDeps) throw new Error("attendance period: storage belum dikonfigurasi");
  return storageDeps;
}
function ensureBucket() {
  bucketReady ??= storage()
    .storage.ensurePrivateBucket({
      id: STATEMENT_BUCKET,
      fileSizeLimit: STATEMENT_ATTACHMENT_MAX_BYTES,
      allowedMimeTypes: STATEMENT_ATTACHMENT_TYPES,
    })
    .catch((error) => {
      bucketReady = undefined;
      throw error;
    });
  return bucketReady;
}

async function audit(ctx: RequestContext, action: string, entityId: string | null, after: unknown) {
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action,
    entityType: "attendance.period",
    entityId,
    before: null,
    after: after as never,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
}

/** D-073: batalkan approval absen (masuk/pulang) yang masih menunggu pada satu hari. */
async function cancelPunchApprovals(tx: Prisma.TransactionClient, dayId: string, now: Date) {
  const punches = await tx.attendancePunch.findMany({
    where: { dayId, status: "PENDING" },
    select: { id: true },
  });
  for (const punch of punches) {
    await cancelApprovalRequest(tx, "ATTENDANCE_PUNCH", punch.id, now);
  }
}

/** Tutup periode: SA; HR PT ditugaskan dengan grant `payroll.period.prepare` (D-071). */
export function canClosePeriod(actor: Actor, companyId: string): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  return (
    actor.role === "HR_ADMIN" &&
    (actor.companyIds?.has(companyId) ?? false) &&
    hasPermission(actor, "payroll.period.prepare")
  );
}

/** Bulan tertutup per PT pada rentang (kunci roster, cuti, koreksi). */
export async function closedMonths(
  companyIds: string[],
  from: string,
  to: string,
  tx?: Prisma.TransactionClient,
) {
  if (companyIds.length === 0) return new Set<string>();
  const rows = await (tx ?? db()).attendancePeriod.findMany({
    where: {
      companyId: { in: [...new Set(companyIds)] },
      status: "CLOSED",
      month: { gte: from.slice(0, 7), lte: to.slice(0, 7) },
    },
    select: { companyId: true, month: true },
  });
  return new Set(rows.map((r) => `${r.companyId}|${r.month}`));
}

export async function isDateClosed(companyId: string, date: string) {
  return (await closedMonths([companyId], date, date)).has(`${companyId}|${date.slice(0, 7)}`);
}

// ── Rekap bulanan ──────────────────────────────────────────────────────────────

interface DayCell {
  employeeId: string;
  date: string;
  work: boolean;
  status: string | null;
  labels: string[];
}

/** Hari kerja roster + hari absen untuk karyawan di rentang. */
async function cells(employeeIds: string[], from: string, to: string): Promise<DayCell[]> {
  const [roster, days] = await Promise.all([
    db().rosterDay.findMany({
      where: { employeeId: { in: employeeIds }, workDate: { gte: toDate(from), lte: toDate(to) } },
      select: { employeeId: true, workDate: true, shiftId: true },
    }),
    db().attendanceDay.findMany({
      where: { employeeId: { in: employeeIds }, workDate: { gte: toDate(from), lte: toDate(to) } },
      select: { employeeId: true, workDate: true, status: true, labels: true },
    }),
  ]);
  const map = new Map<string, DayCell>();
  for (const r of roster) {
    const date = toIso(r.workDate);
    map.set(`${r.employeeId}|${date}`, {
      employeeId: r.employeeId,
      date,
      work: r.shiftId !== null,
      status: null,
      labels: [],
    });
  }
  for (const d of days) {
    const date = toIso(d.workDate);
    const key = `${d.employeeId}|${date}`;
    const cell = map.get(key) ?? {
      employeeId: d.employeeId,
      date,
      work: false,
      status: null,
      labels: [],
    };
    cell.status = d.status;
    cell.labels = d.labels;
    map.set(key, cell);
  }
  return [...map.values()];
}

export interface RecapRow {
  employee: { id: string; fullName: string; employeeNumber: string | null };
  workDays: number;
  offDays: number;
  present: number;
  pending: number;
  rejected: number;
  alpha: number;
  leave: number;
  noRecord: number;
  late: number;
  earlyLeave: number;
  outsideRoster: number;
  statements: number;
  /** TM-D3: Alpha karena tidak absen yang lalu dikoreksi & disetujui. */
  corrected: number;
  /** TM-D3: Alpha karena tidak absen yang batas koreksinya sudah lewat. */
  expired: number;
}

async function scopedEmployees(actor: Actor, companyId: string) {
  if (!policy.canViewRosterSetup(actor, companyId)) throw new ForbiddenError();
  if (policy.canManageRoster(actor, companyId)) {
    return directory.activeEmployeesInCompany(companyId, undefined, 2000);
  }
  if (actor.role === "MANAGER" && actor.employeeId) {
    const team = await directory.employeesByIds(await directory.teamIds(actor.employeeId));
    return [...team.values()].filter((e) => e.companyId === companyId);
  }
  throw new ForbiddenError();
}

export async function monthlyRecap(ctx: RequestContext, companyId: string, month: string) {
  const employees = await scopedEmployees(ctx.actor, companyId);
  const { from, to } = monthRange(month);
  const today = await settingsToday();
  const ids = employees.map((e) => e.id);
  await markNoAttendanceAlpha(new Date(), ids);
  const shiftToday = localDate(new Date(), (await readTimeSettings()).timezone);
  const [all, statements, period] = await Promise.all([
    cells(ids, from, to),
    db().attendanceStatement.groupBy({
      by: ["employeeId"],
      where: { employeeId: { in: ids }, workDate: { gte: toDate(from), lte: toDate(to) } },
      _count: { _all: true },
    }),
    db().attendancePeriod.findUnique({ where: { companyId_month: { companyId, month } } }),
  ]);
  const statementCount = new Map(statements.map((s) => [s.employeeId, s._count._all]));
  const rows: RecapRow[] = employees.map((e) => {
    const mine = all.filter((c) => c.employeeId === e.id);
    const count = (fn: (c: DayCell) => boolean) => mine.filter(fn).length;
    const hasLabel = (label: string) => count((c) => c.labels.includes(label));
    return {
      employee: { id: e.id, fullName: e.fullName, employeeNumber: e.employeeNumber },
      workDays: count((c) => c.work),
      offDays: count((c) => !c.work && c.status === null),
      present: count((c) => c.status === "APPROVED"),
      pending: count((c) => c.status === "OPEN" || c.status === "PENDING"),
      rejected: count((c) => c.status === "REJECTED"),
      alpha: count((c) => c.status === "ALPHA"),
      leave: count((c) => c.status === "LEAVE"),
      noRecord: count((c) => c.work && c.status === null && c.date < today),
      late: hasLabel("LATE"),
      earlyLeave: hasLabel("EARLY_LEAVE"),
      outsideRoster: hasLabel("OUTSIDE_ROSTER") + hasLabel("NO_ROSTER"),
      statements: statementCount.get(e.id) ?? 0,
      corrected: count((c) => c.labels.includes("NO_ATTENDANCE") && c.status === "APPROVED"),
      expired: count(
        (c) =>
          c.status === "ALPHA" &&
          c.labels.includes("NO_ATTENDANCE") &&
          !canStillCorrect(c.date, shiftToday),
      ),
    };
  });
  return {
    month,
    companyId,
    period: {
      status: period?.status ?? "OPEN",
      closedAt: period?.closedAt?.toISOString() ?? null,
    },
    canClose: canClosePeriod(ctx.actor, companyId),
    rows: rows.sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName, "id")),
  };
}

// ── Tutup periode ──────────────────────────────────────────────────────────────

/** Hari yang akan menjadi ALPHA: hari kerja roster belum disetujui / tanpa absen / ditolak, bukan cuti. */
async function alphaCandidates(companyId: string, month: string) {
  const employees = await directory.activeEmployeesInCompany(companyId, undefined, 5000);
  const people = new Map(employees.map((e) => [e.id, e]));
  const { from, to } = monthRange(month);
  const all = await cells([...people.keys()], from, to);
  return all
    .filter(
      (c) =>
        (c.work && c.status === null) ||
        c.status === "OPEN" ||
        c.status === "PENDING" ||
        c.status === "REJECTED",
    )
    .map((c) => ({ ...c, employee: people.get(c.employeeId) as directory.DirectoryEmployee }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function assertClosable(ctx: RequestContext, input: PeriodCloseInput) {
  if (!canClosePeriod(ctx.actor, input.companyId)) throw new ForbiddenError();
  const { to } = monthRange(input.month);
  if (to >= (await settingsToday())) {
    throw new BusinessRuleError("Periode hanya bisa ditutup setelah bulannya berakhir.");
  }
}

export async function previewClose(ctx: RequestContext, input: PeriodCloseInput) {
  await assertClosable(ctx, input);
  const period = await db().attendancePeriod.findUnique({
    where: { companyId_month: { companyId: input.companyId, month: input.month } },
  });
  const candidates = await alphaCandidates(input.companyId, input.month);
  const by = (fn: (c: (typeof candidates)[number]) => boolean) => candidates.filter(fn).length;
  return {
    status: period?.status ?? "OPEN",
    alpha: candidates.length,
    // TM-D13 Fase B: Alpha harian yang belum diverifikasi atasan → periode belum bisa ditutup.
    unverifiedAlpha: await pendingAlphaVerifications(input.companyId, input.month),
    noAttendance: by((c) => c.status === null),
    pending: by((c) => c.status === "OPEN" || c.status === "PENDING"),
    rejected: by((c) => c.status === "REJECTED"),
    sample: candidates.slice(0, 200).map((c) => ({
      employee: {
        id: c.employee.id,
        fullName: c.employee.fullName,
        employeeNumber: c.employee.employeeNumber,
      },
      date: c.date,
      status: c.status,
    })),
  };
}

export async function closePeriod(ctx: RequestContext, input: PeriodCloseInput, now = new Date()) {
  await assertClosable(ctx, input);
  const existing = await db().attendancePeriod.findUnique({
    where: { companyId_month: { companyId: input.companyId, month: input.month } },
  });
  if (existing?.status === "CLOSED") throw new ConflictError("Periode ini sudah ditutup.");
  const unverified = await pendingAlphaVerifications(input.companyId, input.month);
  if (unverified > 0) {
    throw new BusinessRuleError(
      `Masih ada ${unverified} hari Alpha yang belum diverifikasi atasan. Selesaikan verifikasi dulu.`,
    );
  }
  const candidates = await alphaCandidates(input.companyId, input.month);
  await db().$transaction(
    async (tx) => {
      for (const c of candidates) {
        const workDate = toDate(c.date);
        const day = await tx.attendanceDay.findUnique({
          where: { employeeId_workDate: { employeeId: c.employeeId, workDate } },
        });
        if (day) {
          await cancelApprovalRequest(tx, "ATTENDANCE_DAY", day.id, now);
          await cancelPunchApprovals(tx, day.id, now);
          await tx.attendanceDay.update({ where: { id: day.id }, data: { status: "ALPHA" } });
        } else {
          await tx.attendanceDay.create({
            data: {
              employeeId: c.employeeId,
              companyId: c.employee.companyId,
              managerEmployeeId: c.employee.managerId,
              workDate,
              status: "ALPHA",
              labels: [],
            },
          });
        }
      }
      const summary = {
        alpha: candidates.length,
        noAttendance: candidates.filter((c) => c.status === null).length,
      };
      await tx.attendancePeriod.upsert({
        where: { companyId_month: { companyId: input.companyId, month: input.month } },
        create: {
          companyId: input.companyId,
          month: input.month,
          status: "CLOSED",
          closedAt: now,
          closedByAccountId: ctx.actor.accountId,
          summary,
        },
        update: {
          status: "CLOSED",
          closedAt: now,
          closedByAccountId: ctx.actor.accountId,
          summary,
        },
      });
    },
    { timeout: 120_000 },
  );
  await audit(ctx, "attendance.period.close", null, { ...input, alpha: candidates.length });
  return { month: input.month, alpha: candidates.length };
}

// ── Surat pernyataan ───────────────────────────────────────────────────────────

export async function createStatementUpload(
  ctx: RequestContext,
  contentType: (typeof STATEMENT_ATTACHMENT_TYPES)[number],
) {
  const employeeId = ctx.actor.employeeId;
  if (!employeeId) throw new ForbiddenError("Akun tidak terhubung ke data karyawan.");
  await ensureBucket();
  const ext = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[contentType];
  const path = `${storage().storagePathPrefix}statements/${employeeId}/${crypto.randomUUID()}.${ext}`;
  const upload = await storage().storage.createSignedUploadUrl(STATEMENT_BUCKET, path);
  return {
    bucket: STATEMENT_BUCKET,
    path,
    token: upload.token,
    signedUrl: upload.signedUrl,
    maxBytes: STATEMENT_ATTACHMENT_MAX_BYTES,
  };
}

export interface StatementRow {
  dayId: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  workDate: string;
  statement: { id: string; reason: string; createdAt: string; attachmentUrl: string | null } | null;
}

async function statementRows(
  days: { id: string; employeeId: string; workDate: Date }[],
  withUrls: boolean,
): Promise<StatementRow[]> {
  const people = await directory.employeesByIds(days.map((d) => d.employeeId));
  const statements = await db().attendanceStatement.findMany({
    where: { dayId: { in: days.map((d) => d.id) } },
  });
  const byDay = new Map(statements.map((s) => [s.dayId, s]));
  const paths = withUrls
    ? statements.map((s) => s.attachmentPath).filter((p): p is string => p !== null)
    : [];
  const urls =
    paths.length && storageDeps
      ? await storageDeps.storage
          .createSignedUrls(STATEMENT_BUCKET, paths, URL_TTL_SECONDS)
          .catch(() => new Map<string, string>())
      : new Map<string, string>();
  return days.map((d) => {
    const p = people.get(d.employeeId);
    const s = byDay.get(d.id);
    return {
      dayId: d.id,
      employee: {
        id: d.employeeId,
        fullName: p?.fullName ?? "—",
        employeeNumber: p?.employeeNumber ?? null,
      },
      workDate: toIso(d.workDate),
      statement: s
        ? {
            id: s.id,
            reason: s.reason,
            createdAt: s.createdAt.toISOString(),
            attachmentUrl: s.attachmentPath ? (urls.get(s.attachmentPath) ?? null) : null,
          }
        : null,
    };
  });
}

/**
 * ARS-D12 (modul discipline): hari ALPHA karyawan + surat pernyataannya sebagai bukti SP mangkir.
 * Baca-saja; pemanggil sudah memeriksa akses (HR ber-grant SP / pihak yang boleh melihat SP).
 * `dayIds` diisi = hanya hari itu (milik karyawan yang sama); kosong = 200 hari ALPHA terbaru.
 * `withUrls` = buat signed URL lampiran pernyataan (hanya untuk tampilan bukti; pemilih & validasi tidak).
 */
export async function alphaDaysForEvidence(
  employeeId: string,
  dayIds: string[] | null = null,
  withUrls = false,
): Promise<StatementRow[]> {
  const days = await db().attendanceDay.findMany({
    where: {
      employeeId,
      status: "ALPHA",
      ...(dayIds ? { id: { in: dayIds } } : {}),
    },
    orderBy: { workDate: "desc" },
    take: 200,
  });
  return statementRows(days, withUrls);
}

/** Hari ALPHA milik saya beserta pernyataannya. */
export async function myStatements(ctx: RequestContext) {
  const employeeId = ctx.actor.employeeId;
  if (!employeeId) throw new ForbiddenError("Akun tidak terhubung ke data karyawan.");
  const days = await db().attendanceDay.findMany({
    where: { employeeId, status: "ALPHA" },
    orderBy: { workDate: "desc" },
    take: 200,
  });
  return statementRows(days, true);
}

/** Daftar ALPHA & pernyataan per PT/bulan: SA; HR PT; MANAGER tim. */
export async function listStatements(ctx: RequestContext, companyId: string, month: string) {
  const employees = await scopedEmployees(ctx.actor, companyId);
  const { from, to } = monthRange(month);
  const days = await db().attendanceDay.findMany({
    where: {
      employeeId: { in: employees.map((e) => e.id) },
      status: "ALPHA",
      workDate: { gte: toDate(from), lte: toDate(to) },
    },
    orderBy: [{ workDate: "asc" }],
  });
  return statementRows(days, true);
}

export async function createStatement(ctx: RequestContext, input: StatementInput) {
  const employeeId = ctx.actor.employeeId;
  if (!employeeId) throw new ForbiddenError("Akun tidak terhubung ke data karyawan.");
  const day = await db().attendanceDay.findUnique({ where: { id: input.dayId } });
  if (!day || day.employeeId !== employeeId) throw new NotFoundError();
  if (day.status !== "ALPHA")
    throw new BusinessRuleError("Surat pernyataan hanya untuk hari berstatus Alpha.");
  if (input.attachmentPath) {
    if (
      !input.attachmentPath.startsWith(`${storage().storagePathPrefix}statements/${employeeId}/`)
    ) {
      throw new BusinessRuleError("Lampiran tidak valid. Unggah ulang.");
    }
    const info = await storage().storage.getObjectInfo(STATEMENT_BUCKET, input.attachmentPath);
    if (!info || info.size <= 0)
      throw new BusinessRuleError("Lampiran belum terunggah. Unggah ulang.");
  }
  try {
    const row = await db().attendanceStatement.create({
      data: {
        dayId: day.id,
        employeeId,
        companyId: day.companyId,
        managerEmployeeId: day.managerEmployeeId,
        workDate: day.workDate,
        reason: input.reason,
        attachmentPath: input.attachmentPath ?? null,
      },
    });
    await audit(ctx, "attendance.statement.create", row.id, { dayId: day.id });
    return (await statementRows([day], true))[0] as StatementRow;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new ConflictError("Surat pernyataan untuk hari ini sudah dibuat.");
    }
    throw error;
  }
}

// ── Koreksi absensi ────────────────────────────────────────────────────────────

export interface CorrectionDto {
  id: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  reason: string;
  status: string;
  createdAt: string;
  approval: ApprovalView | null;
  canCancel: boolean;
}

type CorrectionRow = Prisma.AttendanceCorrectionGetPayload<object>;

async function correctionDtos(
  ctx: RequestContext,
  rows: CorrectionRow[],
): Promise<CorrectionDto[]> {
  const people = await directory.employeesByIds(rows.map((r) => r.employeeId));
  const approvals = await getApprovalViews(
    ctx.actor,
    "ATTENDANCE_CORRECTION",
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const p = people.get(r.employeeId);
    return {
      id: r.id,
      employee: {
        id: r.employeeId,
        fullName: p?.fullName ?? "—",
        employeeNumber: p?.employeeNumber ?? null,
      },
      workDate: toIso(r.workDate),
      checkInAt: r.checkInAt?.toISOString() ?? null,
      checkOutAt: r.checkOutAt?.toISOString() ?? null,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      approval: approvals.get(r.id) ?? null,
      canCancel: r.status === "PENDING" && r.employeeId === ctx.actor.employeeId,
    };
  });
}

/** "HH:mm" pada tanggal kerja (zona jam shift) → instan; `after` = jam pulang lebih kecil → besoknya. */
export function correctionInstant(
  workDate: string,
  hhmm: string,
  timezone: string,
  after?: Date | null,
) {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  let at =
    Date.parse(`${workDate}T00:00:00.000Z`) + (h * 60 + m - offsetMinutes(timezone)) * 60_000;
  if (after && at <= after.getTime()) at += 24 * 3600_000;
  return new Date(at);
}

export async function createCorrection(ctx: RequestContext, input: CorrectionInput) {
  const employeeId = ctx.actor.employeeId;
  if (!employeeId) throw new ForbiddenError("Akun tidak terhubung ke data karyawan.");
  const employee = await directory.employeeById(employeeId);
  if (!employee) throw new NotFoundError();
  if (input.workDate >= (await settingsToday())) {
    throw new BusinessRuleError("Koreksi hanya untuk hari yang sudah lewat.");
  }
  // TM-D3: semua koreksi hanya s.d. tanggal kerja + 3 hari (zona waktu jam shift).
  const settingsTz = (await readTimeSettings()).timezone;
  if (!canStillCorrect(input.workDate, localDate(new Date(), settingsTz))) {
    throw new BusinessRuleError(
      `Batas koreksi untuk tanggal ini sudah lewat (paling lambat ${correctionDeadline(input.workDate)}).`,
    );
  }
  if (await isDateClosed(employee.companyId, input.workDate)) {
    throw new BusinessRuleError("Periode tanggal ini sudah ditutup; koreksi tidak bisa diajukan.");
  }
  const day = await db().attendanceDay.findUnique({
    where: { employeeId_workDate: { employeeId, workDate: toDate(input.workDate) } },
  });
  // TM-D3: Alpha karena tidak absen (NO_ATTENDANCE) boleh dikoreksi dalam batas waktu; Alpha tutup periode tidak.
  const correctableAlpha = day?.status === "ALPHA" && day.labels.includes("NO_ATTENDANCE");
  if (
    day &&
    !correctableAlpha &&
    (day.status === "APPROVED" || day.status === "LEAVE" || day.status === "ALPHA")
  ) {
    throw new BusinessRuleError(
      "Hari ini sudah disetujui, cuti, atau Alpha; tidak perlu/bisa dikoreksi.",
    );
  }
  if (day?.status === "OPEN") {
    throw new BusinessRuleError(
      "Hari ini masih menunggu absen pulang; koreksi setelah statusnya diproses.",
    );
  }
  const pending = await db().attendanceCorrection.count({
    where: { employeeId, workDate: toDate(input.workDate), status: "PENDING" },
  });
  if (pending > 0) throw new ConflictError("Sudah ada koreksi menunggu untuk tanggal ini.");
  const { timezone } = await readTimeSettings();
  const checkInAt = input.checkIn
    ? correctionInstant(input.workDate, input.checkIn, timezone)
    : null;
  const checkOutAt = input.checkOut
    ? correctionInstant(input.workDate, input.checkOut, timezone, checkInAt)
    : null;
  const row = await db().$transaction(async (tx) => {
    const created = await tx.attendanceCorrection.create({
      data: {
        employeeId,
        companyId: employee.companyId,
        managerEmployeeId: employee.managerId,
        workDate: toDate(input.workDate),
        checkInAt,
        checkOutAt,
        reason: input.reason,
      },
    });
    await createApprovalRequest(tx, {
      subjectType: "ATTENDANCE_CORRECTION",
      subjectId: created.id,
      requesterEmployeeId: employeeId,
      companyId: employee.companyId,
      managerEmployeeId: employee.managerId,
    });
    return created;
  });
  await audit(ctx, "attendance.correction.create", row.id, input);
  if (employee.managerId) {
    await notifyEmployees([
      {
        employeeId: employee.managerId,
        type: "attendance.correction_new",
        title: `Koreksi absen baru dari ${employee.fullName}`,
        body: `Tanggal kerja ${dateLabel(input.workDate)}: “${input.reason}”`,
        link: "/time/pernyataan",
        dedupeKey: `tm-correction-new:${row.id}`,
        target: { type: "CORRECTION", id: row.id },
      },
    ]);
  }
  return (await correctionDtos(ctx, [row]))[0] as CorrectionDto;
}

export async function cancelCorrection(ctx: RequestContext, id: string) {
  const row = await db().attendanceCorrection.findUnique({ where: { id } });
  if (!row || row.employeeId !== ctx.actor.employeeId) throw new NotFoundError();
  if (row.status !== "PENDING")
    throw new BusinessRuleError("Hanya koreksi yang menunggu yang bisa dibatalkan.");
  const updated = await db().$transaction(async (tx) => {
    await cancelApprovalRequest(tx, "ATTENDANCE_CORRECTION", row.id);
    return tx.attendanceCorrection.update({
      where: { id },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });
  });
  return (await correctionDtos(ctx, [updated]))[0] as CorrectionDto;
}

export async function listCorrections(ctx: RequestContext, scope: "mine" | "inbox") {
  if (scope === "inbox") {
    const actionable = await listActionable(ctx.actor, "ATTENDANCE_CORRECTION", {
      includeOverride: true,
    });
    const rows = await db().attendanceCorrection.findMany({
      where: { id: { in: actionable.map((a) => a.subjectId) } },
      orderBy: { workDate: "desc" },
    });
    return correctionDtos(ctx, rows);
  }
  if (!ctx.actor.employeeId) return [];
  const rows = await db().attendanceCorrection.findMany({
    where: { employeeId: ctx.actor.employeeId },
    orderBy: { workDate: "desc" },
    take: 200,
  });
  return correctionDtos(ctx, rows);
}

export function registerPeriodIntegrations() {
  registerApprovalHandler("ATTENDANCE_CORRECTION", async (tx, event) => {
    const row = await tx.attendanceCorrection.findUnique({ where: { id: event.subjectId } });
    if (row?.status !== "PENDING") return;
    await tx.attendanceCorrection.update({
      where: { id: row.id },
      data: { status: event.status, decidedAt: event.decidedAt },
    });
    if (event.status === "APPROVED" || event.status === "REJECTED") {
      const date = toIso(row.workDate);
      await notifyEmployees([
        {
          employeeId: row.employeeId,
          type: "attendance.correction_decided",
          title: `Koreksi absen ${dateLabel(date)} ${event.status === "APPROVED" ? "disetujui" : "ditolak"}`,
          ...(event.status === "REJECTED"
            ? {
                body: "Hari itu tetap sesuai data absen; cek catatan penolakan di halaman Koreksi.",
              }
            : {}),
          link: "/time/pernyataan",
          dedupeKey: `tm-correction-decided:${row.id}`,
          target: { type: "CORRECTION", id: row.id },
        },
      ]);
    }
    if (event.status !== "APPROVED") return;
    const day = await tx.attendanceDay.findUnique({
      where: { employeeId_workDate: { employeeId: row.employeeId, workDate: row.workDate } },
    });
    // Hari absen menjadi disetujui; approval hari absen yang masih menunggu dibatalkan (diganti koreksi).
    if (day) {
      const noAttendanceAlpha = day.status === "ALPHA" && day.labels.includes("NO_ATTENDANCE");
      if ((day.status === "ALPHA" && !noAttendanceAlpha) || day.status === "LEAVE") return;
      await cancelApprovalRequest(tx, "ATTENDANCE_DAY", day.id, event.decidedAt);
      await cancelPunchApprovals(tx, day.id, event.decidedAt);
      await tx.attendanceDay.update({
        where: { id: day.id },
        data: { status: "APPROVED", labels: [...new Set([...day.labels, "CORRECTED"])] },
      });
    } else {
      await tx.attendanceDay.create({
        data: {
          employeeId: row.employeeId,
          companyId: row.companyId,
          managerEmployeeId: row.managerEmployeeId,
          workDate: row.workDate,
          status: "APPROVED",
          labels: ["CORRECTED"],
        },
      });
    }
  });
}
