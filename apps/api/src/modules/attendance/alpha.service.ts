import {
  ALPHA_RULE_START,
  ATTENDANCE_RECORD_OUTCOMES,
  type AttendanceRecordOutcome,
  canStillCorrect,
  correctionDeadline,
} from "@hris/shared";
import { getPrisma } from "../../core/db.ts";
import { ForbiddenError, NotFoundError } from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import { localDate, shiftWindow } from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
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
  const due = roster.filter((r) => {
    if (!r.shift || has.has(`${r.employeeId}|${toIso(r.workDate)}`)) return false;
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
        };
      }),
      now,
    );
  }
  return { marked: result.count };
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
        OR: [{ status: "ALPHA" }, { labels: { has: "NO_ATTENDANCE" } }],
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
