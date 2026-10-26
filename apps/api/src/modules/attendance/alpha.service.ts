import {
  ALPHA_RULE_START,
  ALPHA_VERIFICATION_LABELS,
  type AlphaVerificationInput,
  type AlphaVerificationState,
  ATTENDANCE_RECORD_OUTCOMES,
  type AttendanceRecordOutcome,
  canStillCorrect,
  correctionDeadline,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { getPrisma } from "../../core/db.ts";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import { localDate, shiftWindow } from "./attendance-engine.ts";
import {
  holidaysBetween,
  type RequestContext,
  readTimeSettings,
  toDate,
  toIso,
} from "./calendar.service.ts";
import * as directory from "./directory.ts";
import { isoAddDays } from "./roster-engine.ts";
import { dateLabel, notifyEmployees } from "./time-notify.service.ts";

// TM-D3 — hari kerja roster tanpa absen sama sekali langsung Alpha setelah batas absen pulang shift-nya
// lewat (mulai ALPHA_RULE_START); koreksi hanya s.d. tanggal kerja + 3 hari; rekam jejak tidak pernah dihapus.
// Dipanggil cron `attendance-daily` DAN saat layar terkait dibuka (tak bergantung jadwal cron). Idempoten.

const db = () => getPrisma();

/** Tandai Alpha hari kerja roster tanpa absen yang sudah lewat batas absen pulang. */
export async function markNoAttendanceAlpha(
  now = new Date(),
  employeeIds?: string[],
): Promise<{ marked: number }> {
  const { timezone } = await readTimeSettings();
  const today = localDate(now, timezone);
  if (today <= ALPHA_RULE_START) return { marked: 0 };
  const scope = employeeIds ? { employeeId: { in: employeeIds } } : {};
  const range = { gte: toDate(ALPHA_RULE_START), lte: toDate(today) };
  const [roster, existing] = await Promise.all([
    db().rosterDay.findMany({
      where: { ...scope, workDate: range, shiftId: { not: null } },
      include: { shift: true },
    }),
    db().attendanceDay.findMany({
      where: { ...scope, workDate: range },
      select: { employeeId: true, workDate: true },
    }),
  ]);
  const has = new Set(existing.map((d) => `${d.employeeId}|${toIso(d.workDate)}`));
  // Cuti bersama: hari kerja roster tanpa absen dipotong 1 hari cuti oleh cron leave-daily (D-072),
  // bukan Alpha.
  const collective = new Set(
    [...(await holidaysBetween(ALPHA_RULE_START, today)).values()]
      .filter((h) => h.kind === "COLLECTIVE_LEAVE")
      .map((h) => h.date),
  );
  const due = roster.filter((r) => {
    if (!r.shift || has.has(`${r.employeeId}|${toIso(r.workDate)}`)) return false;
    if (collective.has(toIso(r.workDate))) return false;
    const window = shiftWindow(toIso(r.workDate), r.shift, timezone);
    return window.checkOutDeadline.getTime() < now.getTime();
  });
  if (due.length === 0) return { marked: 0 };
  const people = await directory.employeesByIds(due.map((r) => r.employeeId));
  const rows = due.flatMap((r) => {
    const employee = people.get(r.employeeId);
    if (!employee?.isActive || !r.shift) return [];
    const window = shiftWindow(toIso(r.workDate), r.shift, timezone);
    return [
      {
        employeeId: r.employeeId,
        companyId: employee.companyId,
        managerEmployeeId: employee.managerId,
        workDate: r.workDate,
        shiftId: r.shift.id,
        shiftCode: r.shift.code,
        scheduledStart: window.start,
        scheduledEnd: window.end,
        checkOutDeadline: window.checkOutDeadline,
        status: "ALPHA" as const,
        labels: ["NO_ATTENDANCE"],
        // TM-D13 Fase B: atasan memverifikasi (Alpha / izin / sakit / tugas luar).
        alphaVerification: "PENDING" as const,
      },
    ];
  });
  // skipDuplicates: aman bila absen/penandaan lain menulis hari yang sama bersamaan (unik employee+tanggal).
  const result = await db().attendanceDay.createMany({ data: rows, skipDuplicates: true });
  if (result.count > 0) {
    // Satu notifikasi per hari Alpha (dedupe); hari yang sudah lewat batas koreksi tidak diberi tombol.
    await notifyEmployees(
      rows.map((r) => {
        const date = toIso(r.workDate);
        const open = canStillCorrect(date, today);
        return {
          employeeId: r.employeeId,
          type: "attendance.alpha",
          title: `Tidak ada absen ${dateLabel(date)} — dihitung Alpha`,
          body: open
            ? `Gaji hari itu tidak dihitung. Ajukan koreksi paling lambat ${dateLabel(correctionDeadline(date))} bila ada kesalahan.`
            : "Batas koreksi sudah lewat; hari itu tetap Alpha dan wajib dibuatkan surat pernyataan.",
          link: "/time/pernyataan",
          dedupeKey: `tm-alpha:${r.employeeId}:${date}`,
          target: { type: "ATTENDANCE_DATE", id: date },
        };
      }),
      now,
    );
    // TM-D13 Fase B: atasan diberi tahu & diminta verifikasi (karyawan tanpa atasan → HR di antrean).
    await notifyEmployees(
      rows
        .filter((r) => r.managerEmployeeId)
        .map((r) => {
          const date = toIso(r.workDate);
          const name = people.get(r.employeeId)?.fullName ?? "Karyawan";
          return {
            employeeId: r.managerEmployeeId as string,
            type: "attendance.alpha_verify",
            title: `${name} tidak absen ${dateLabel(date)} (shift ${r.shiftCode}) — perlu verifikasi`,
            body: "Pilih: Alpha, izin, sakit, atau tugas luar. Periode absensi tidak bisa ditutup sebelum diverifikasi.",
            link: "/absen/approval",
            dedupeKey: `tm-alpha-verify:${r.employeeId}:${date}`,
            target: { type: "APPROVAL_QUEUE", id: date },
          };
        }),
      now,
    );
  }
  return { marked: result.count };
}

// ── TM-D13 Fase B: verifikasi atasan atas Alpha ────────────────────────────────────

export interface AlphaVerificationItem {
  dayId: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  workDate: string;
  shiftCode: string | null;
  scheduledStart: string | null;
  verification: AlphaVerificationState;
  note: string | null;
  verifiedAt: string | null;
  /** Batas koreksi / pengajuan izin karyawan (YYYY-MM-DD). */
  deadline: string;
  canVerify: boolean;
}

type AlphaRow = {
  id: string;
  employeeId: string;
  companyId: string;
  managerEmployeeId: string | null;
  workDate: Date;
  shiftCode: string | null;
  scheduledStart: Date | null;
  alphaVerification: AlphaVerificationState | null;
  alphaVerificationNote: string | null;
  alphaVerifiedAt: Date | null;
};

async function toVerificationItems(ctx: RequestContext, rows: AlphaRow[]) {
  const people = await directory.employeesByIds(rows.map((r) => r.employeeId));
  return rows.map((r): AlphaVerificationItem => {
    const p = people.get(r.employeeId);
    const date = toIso(r.workDate);
    return {
      dayId: r.id,
      employee: {
        id: r.employeeId,
        fullName: p?.fullName ?? "—",
        employeeNumber: p?.employeeNumber ?? null,
      },
      workDate: date,
      shiftCode: r.shiftCode,
      scheduledStart: r.scheduledStart?.toISOString() ?? null,
      verification: r.alphaVerification ?? "PENDING",
      note: r.alphaVerificationNote,
      verifiedAt: r.alphaVerifiedAt?.toISOString() ?? null,
      deadline: correctionDeadline(date),
      canVerify: policy.canVerifyAlpha(ctx.actor, r),
    };
  });
}

/** Antrean verifikasi Alpha: `inbox` = menunggu & boleh diputus aktor; `all` = semua dalam cakupan (≤ 60 hari). */
export async function listAlphaVerifications(
  ctx: RequestContext,
  scope: "inbox" | "all",
  now = new Date(),
): Promise<AlphaVerificationItem[]> {
  if (!policy.canViewAlphaVerifications(ctx.actor)) throw new ForbiddenError();
  const { timezone } = await readTimeSettings();
  const from = toDate(isoAddDays(localDate(now, timezone), -60));
  const actor = ctx.actor;
  const where =
    actor.role === "SUPER_ADMIN"
      ? {}
      : actor.role === "HR_ADMIN"
        ? { companyId: { in: [...(actor.companyIds ?? [])] } }
        : { managerEmployeeId: actor.employeeId as string };
  const rows = await db().attendanceDay.findMany({
    where: {
      ...where,
      status: "ALPHA",
      alphaVerification: scope === "inbox" ? "PENDING" : { not: null },
      workDate: { gte: from },
    },
    orderBy: [{ workDate: "desc" }],
    take: 500,
  });
  const items = await toVerificationItems(ctx, rows);
  return scope === "inbox" ? items.filter((i) => i.canVerify) : items;
}

const OUTCOME_NOTICE: Record<AlphaVerificationInput["outcome"], (deadline: string) => string> = {
  CONFIRMED: () =>
    "Atasan mengonfirmasi hari itu Alpha. Buat surat pernyataan di menu Koreksi & Pernyataan.",
  PERMIT: (d) =>
    `Atasan mencatat izin. Ajukan Izin untuk tanggal itu di menu Cuti & Izin paling lambat ${dateLabel(d)}.`,
  SICK: (d) =>
    `Atasan mencatat sakit. Ajukan Sakit (lampirkan surat dokter bila ada) paling lambat ${dateLabel(d)}.`,
  DUTY: (d) =>
    `Atasan mencatat tugas luar. Ajukan koreksi absen untuk tanggal itu paling lambat ${dateLabel(d)}.`,
};

/** Atasan memverifikasi satu hari Alpha (boleh diubah selama periode belum ditutup). */
export async function verifyAlpha(
  ctx: RequestContext,
  dayId: string,
  input: AlphaVerificationInput,
  now = new Date(),
): Promise<AlphaVerificationItem> {
  const row = await db().attendanceDay.findUnique({ where: { id: dayId } });
  if (row?.status !== "ALPHA" || row.alphaVerification === null) throw new NotFoundError();
  if (!policy.canVerifyAlpha(ctx.actor, row)) throw new ForbiddenError();
  if (await isClosedMonth(row.companyId, toIso(row.workDate))) {
    throw new BusinessRuleError("Periode absensi bulan ini sudah ditutup.");
  }
  const updated = await db().attendanceDay.update({
    where: { id: row.id },
    data: {
      alphaVerification: input.outcome,
      alphaVerificationNote: input.note,
      alphaVerifiedBy: ctx.actor.accountId,
      alphaVerifiedAt: now,
    },
  });
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "attendance.alpha.verify",
    entityType: "attendance.day",
    entityId: row.id,
    before: { verification: row.alphaVerification },
    after: { verification: input.outcome, note: input.note },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  const date = toIso(row.workDate);
  await notifyEmployees(
    [
      {
        employeeId: row.employeeId,
        type: "attendance.alpha_verified",
        title: `Verifikasi ${dateLabel(date)}: ${ALPHA_VERIFICATION_LABELS[input.outcome]}`,
        body: OUTCOME_NOTICE[input.outcome](correctionDeadline(date)),
        link:
          input.outcome === "PERMIT" || input.outcome === "SICK" ? "/absen/cuti" : "/absen/koreksi",
        dedupeKey: `tm-alpha-verified:${row.id}:${now.getTime()}`,
        target: { type: "ATTENDANCE_DATE", id: date },
      },
    ],
    now,
  );
  return (await toVerificationItems(ctx, [updated]))[0] as AlphaVerificationItem;
}

const isClosedMonth = async (companyId: string, date: string) =>
  (await db().attendancePeriod.count({
    where: { companyId, month: date.slice(0, 7), status: "CLOSED" },
  })) > 0;

/** Alpha yang masih menunggu verifikasi atasan pada bulan & PT (tutup periode ditolak bila > 0). */
export async function pendingAlphaVerifications(companyId: string, month: string) {
  const from = toDate(`${month}-01`);
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  return db().attendanceDay.count({
    where: {
      companyId,
      status: "ALPHA",
      alphaVerification: "PENDING",
      workDate: { gte: from, lte: last },
    },
  });
}

export interface AttendanceRecordItem {
  workDate: string;
  shiftCode: string | null;
  outcome: AttendanceRecordOutcome;
  /** Batas pengajuan koreksi (YYYY-MM-DD). */
  deadline: string;
  correction: { status: string; reason: string; createdAt: string } | null;
}

export interface AttendanceRecord {
  employee: { id: string; fullName: string; employeeNumber: string | null };
  today: string;
  summary: Record<AttendanceRecordOutcome, number>;
  items: AttendanceRecordItem[];
}

/** Rekam jejak hari bermasalah seorang karyawan (Alpha & koreksi), terbaru di atas. */
async function buildRecord(employee: directory.DirectoryEmployee): Promise<AttendanceRecord> {
  const { timezone } = await readTimeSettings();
  const today = localDate(new Date(), timezone);
  await markNoAttendanceAlpha(new Date(), [employee.id]);
  const [days, corrections] = await Promise.all([
    db().attendanceDay.findMany({
      where: {
        employeeId: employee.id,
        // Hari Alpha yang akhirnya disetujui cuti (TM-D9) bukan lagi rekam jejak Alpha.
        OR: [{ status: "ALPHA" }, { labels: { has: "NO_ATTENDANCE" }, status: { not: "LEAVE" } }],
      },
      select: { workDate: true, status: true, labels: true, shiftCode: true },
    }),
    db().attendanceCorrection.findMany({
      where: { employeeId: employee.id, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      select: { workDate: true, status: true, reason: true, createdAt: true },
    }),
  ]);
  const latest = new Map<string, (typeof corrections)[number]>();
  for (const c of corrections) {
    const key = toIso(c.workDate);
    if (!latest.has(key)) latest.set(key, c);
  }
  const dayMap = new Map(days.map((d) => [toIso(d.workDate), d]));
  const dates = new Set([...dayMap.keys(), ...latest.keys()]);
  const items: AttendanceRecordItem[] = [...dates].map((date) => {
    const day = dayMap.get(date);
    const correction = latest.get(date) ?? null;
    const noAttendance = day?.labels.includes("NO_ATTENDANCE") ?? false;
    let outcome: AttendanceRecordOutcome;
    if (correction?.status === "PENDING") outcome = "CORRECTION_PENDING";
    else if (day?.status === "ALPHA") {
      outcome = !noAttendance
        ? "ALPHA_PERIOD"
        : canStillCorrect(date, today)
          ? "ALPHA_CORRECTABLE"
          : "ALPHA_EXPIRED";
    } else if (correction?.status === "APPROVED" || (noAttendance && day?.status === "APPROVED")) {
      outcome = "CORRECTED";
    } else outcome = "CORRECTION_REJECTED";
    return {
      workDate: date,
      shiftCode: day?.shiftCode ?? null,
      outcome,
      deadline: correctionDeadline(date),
      correction: correction
        ? {
            status: correction.status,
            reason: correction.reason,
            createdAt: correction.createdAt.toISOString(),
          }
        : null,
    };
  });
  items.sort((a, b) => b.workDate.localeCompare(a.workDate));
  const summary = Object.fromEntries(
    ATTENDANCE_RECORD_OUTCOMES.map((o) => [o, items.filter((i) => i.outcome === o).length]),
  ) as Record<AttendanceRecordOutcome, number>;
  return {
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      employeeNumber: employee.employeeNumber,
    },
    today,
    summary,
    items,
  };
}

/** Rekam jejak milik sendiri (karyawan). */
export async function myAttendanceRecord(ctx: RequestContext): Promise<AttendanceRecord> {
  if (!ctx.actor.employeeId) throw new ForbiddenError("Akun tidak terhubung ke data karyawan.");
  const employee = await directory.employeeById(ctx.actor.employeeId);
  if (!employee) throw new NotFoundError();
  return buildRecord(employee);
}

/** Rekam jejak seorang karyawan: SA; HR PT-nya; MANAGER untuk timnya; karyawan sendiri. */
export async function employeeAttendanceRecord(
  ctx: RequestContext,
  employeeId: string,
): Promise<AttendanceRecord> {
  const employee = await directory.employeeById(employeeId);
  if (!employee) throw new NotFoundError();
  const target = {
    employeeId: employee.id,
    companyId: employee.companyId,
    managerId: employee.managerId,
  };
  if (!policy.canViewEmployeeRoster(ctx.actor, target)) throw new NotFoundError();
  return buildRecord(employee);
}
