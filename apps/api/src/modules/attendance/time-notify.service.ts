import type { TmNotificationTarget } from "@hris/shared";
import { type ApprovalSubject, correctionDeadline } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { getPrisma } from "../../core/db.ts";
import { listActionable } from "../approval/index.ts";
import {
  getAccountLinksForEmployees,
  getAccountSummaries,
  listApproverAccounts,
  loadActor,
} from "../iam/index.ts";
import { notify, type Recipient } from "../notification/index.ts";
import { localDate, shiftWindow } from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate, toIso } from "./calendar.service.ts";
import { isoAddDays } from "./roster-engine.ts";

// Notifikasi Time Management (paket UX 2026-10-20): keputusan ke karyawan, pengajuan baru ke atasan,
// pengingat absen per shift (TM-D2), Alpha & hari terakhir koreksi (TM-D3), ringkasan antrean harian.
// Hanya notifikasi di aplikasi (lonceng); tanpa email & tanpa data sensitif. Anti-duplikat via dedupeKey.

const db = () => getPrisma();
/** TM-D16: pengingat FCM cadangan untuk lupa Clock Out, menit setelah jam pulang. */
const OUT_REMINDER_AFTER_MIN = 15;

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
export const dateLabel = (iso: string) => DATE_FORMAT.format(new Date(`${iso}T00:00:00Z`));

/** Akun aktif milik karyawan (employeeId → penerima). Karyawan tanpa akun dilewati. */
export async function recipientsOfEmployees(
  employeeIds: string[],
): Promise<Map<string, Recipient>> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const links = await getAccountLinksForEmployees(ids);
  const active = [...links.entries()].filter(([, link]) => link.isActive);
  const summaries = await getAccountSummaries(active.map(([, link]) => link.accountId));
  const out = new Map<string, Recipient>();
  for (const [employeeId, link] of active) {
    const summary = summaries.get(link.accountId);
    if (summary) out.set(employeeId, { accountId: link.accountId, email: summary.email });
  }
  return out;
}

export interface EmployeeNotice {
  employeeId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
  /** MOB-D6: layar tujuan di app mobile. */
  target?: { type: TmNotificationTarget; id: string };
}

/** Kirim notifikasi ke akun beberapa karyawan. Gagal kirim tidak pernah menggagalkan proses utama. */
export async function notifyEmployees(notices: EmployeeNotice[], now = new Date()) {
  if (notices.length === 0) return 0;
  const recipients = await recipientsOfEmployees(notices.map((n) => n.employeeId));
  let created = 0;
  for (const n of notices) {
    const recipient = recipients.get(n.employeeId);
    if (!recipient) continue;
    try {
      const r = await notify(
        {
          recipients: [recipient],
          type: n.type,
          title: n.title,
          ...(n.body ? { body: n.body } : {}),
          ...(n.link ? { link: n.link } : {}),
          ...(n.dedupeKey ? { dedupeKey: n.dedupeKey } : {}),
          ...(n.target ? { target: n.target } : {}),
          email: false,
        },
        now,
      );
      created += r.created;
    } catch {
      // Notifikasi bersifat tambahan: kegagalan dicatat modul notification, proses absen/cuti tetap jalan.
    }
  }
  return created;
}

// ── Antrean keputusan (angka di menu) ──────────────────────────────────────────

export interface TimeQueue {
  attendance: number;
  leave: number;
  corrections: number;
  rosterChanges: number;
  overtime: number;
  total: number;
}

const QUEUE_SUBJECTS: Record<Exclude<keyof TimeQueue, "total">, ApprovalSubject[]> = {
  attendance: ["ATTENDANCE_PUNCH"],
  leave: ["LEAVE", "PERMIT"],
  corrections: ["ATTENDANCE_CORRECTION"],
  rosterChanges: ["ROSTER_CHANGE", "ROSTER_EDIT"],
  overtime: ["OVERTIME"],
};

/** Jumlah pengajuan yang menunggu keputusan aktor ini (sama dengan inbox masing-masing). */
export async function queueFor(actor: Actor): Promise<TimeQueue> {
  const counts = { attendance: 0, leave: 0, corrections: 0, rosterChanges: 0, overtime: 0 };
  for (const [key, subjects] of Object.entries(QUEUE_SUBJECTS) as [
    keyof typeof counts,
    ApprovalSubject[],
  ][]) {
    for (const subject of subjects) counts[key] += (await listActionable(actor, subject)).length;
  }
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export const myQueue = (ctx: RequestContext) => queueFor(ctx.actor);

// ── Pengingat absen per shift (TM-D2) & hari terakhir koreksi (TM-D3) ────────────

/**
 * Cron `attendance-reminders` (tiap 5 menit). Hari kerja roster:
 * - belum Clock In setelah jam masuk + toleransi telat (dan sebelum batas absen pulang) → pengingat masuk;
 * - sudah Clock In, belum Clock Out ≥ 15 menit setelah jam pulang terkunci (dan sebelum batas absen pulang)
 *   → pengingat pulang. TM-D16: ini cadangan FCM; pengingat utama = alarm lokal app dari jadwal yang sama;
 * - Alpha karena tidak absen yang batas koreksinya hari ini & belum ada koreksi → pengingat terakhir.
 * Setiap pengingat sekali per karyawan per tanggal (dedupeKey).
 */
export async function runAttendanceReminders(now = new Date(), employeeIds?: string[]) {
  const { timezone } = await readTimeSettings();
  const today = localDate(now, timezone);
  const scope = employeeIds ? { employeeId: { in: employeeIds } } : {};
  const dates = [isoAddDays(today, -1), today];
  const [roster, days] = await Promise.all([
    db().rosterDay.findMany({
      where: { ...scope, workDate: { in: dates.map(toDate) }, shiftId: { not: null } },
      include: { shift: true },
    }),
    db().attendanceDay.findMany({
      where: { ...scope, workDate: { in: dates.map(toDate) } },
      include: { punches: { select: { kind: true } } },
    }),
  ]);
  const dayOf = new Map(days.map((d) => [`${d.employeeId}|${toIso(d.workDate)}`, d]));
  // TM-D17: perintah lembur memundurkan jam pulang pengingat.
  const orderOf = new Map(
    (
      await db().overtimeOrder.findMany({
        where: { ...scope, workDate: { in: dates.map(toDate) }, endsAt: { not: null } },
        select: { employeeId: true, workDate: true, endsAt: true },
      })
    ).map((o) => [`${o.employeeId}|${toIso(o.workDate)}`, o.endsAt as Date]),
  );
  const notices: EmployeeNotice[] = [];
  for (const r of roster) {
    if (!r.shift) continue;
    const date = toIso(r.workDate);
    const day = dayOf.get(`${r.employeeId}|${date}`);
    if (day && (day.status === "LEAVE" || day.status === "ALPHA")) continue;
    const window = shiftWindow(date, r.shift, timezone);
    const hasIn = day?.punches.some((p) => p.kind === "IN") ?? false;
    const hasOut = day?.punches.some((p) => p.kind === "OUT") ?? false;
    // TM-D13: setelah tap-in, jam pulang & batas memakai jadwal yang dikunci di hari absen.
    const scheduledEnd = (hasIn && day?.scheduledEnd) || window.end;
    const orderEnd = orderOf.get(`${r.employeeId}|${date}`);
    const end = orderEnd && orderEnd > scheduledEnd ? orderEnd : scheduledEnd;
    const deadline = (hasIn && day?.checkOutDeadline) || window.checkOutDeadline;
    if (now.getTime() >= deadline.getTime()) continue;
    const lateAt = window.start.getTime() + r.shift.lateToleranceMin * 60_000;
    if (!hasIn && now.getTime() >= lateAt) {
      notices.push({
        employeeId: r.employeeId,
        type: "attendance.reminder_in",
        title: `Belum Clock In — shift ${r.shift.code} ${dateLabel(date)}`,
        body: "Segera absen masuk. Bila tidak ada absen sama sekali, hari ini dihitung Alpha dan gaji hari itu tidak dihitung.",
        link: "/absen",
        dedupeKey: `tm-remind-in:${r.employeeId}:${date}`,
        target: { type: "ATTENDANCE_TODAY", id: date },
      });
    } else if (
      hasIn &&
      !hasOut &&
      now.getTime() >= end.getTime() + OUT_REMINDER_AFTER_MIN * 60_000
    ) {
      notices.push({
        employeeId: r.employeeId,
        type: "attendance.reminder_out",
        title: `Belum Clock Out — shift ${r.shift.code} ${dateLabel(date)}`,
        body: "Jam pulang sudah lewat. Lakukan Clock Out sebelum batas absen pulang agar hari ini bisa disetujui.",
        link: "/absen",
        dedupeKey: `tm-remind-out:${r.employeeId}:${date}`,
        target: { type: "ATTENDANCE_TODAY", id: date },
      });
    }
  }
  // TM-D17: hari OFF (tanpa shift roster) dengan perintah lembur — pengingat pulang dari akhir SPL.
  const rostered = new Set(roster.map((r) => `${r.employeeId}|${toIso(r.workDate)}`));
  for (const [key, orderEnd] of orderOf) {
    if (rostered.has(key)) continue;
    const day = dayOf.get(key);
    if (!day || day.status === "LEAVE" || day.status === "ALPHA") continue;
    const hasIn = day.punches.some((p) => p.kind === "IN");
    const hasOut = day.punches.some((p) => p.kind === "OUT");
    if (!hasIn || hasOut) continue;
    if (day.checkOutDeadline && now.getTime() >= day.checkOutDeadline.getTime()) continue;
    if (now.getTime() < orderEnd.getTime() + OUT_REMINDER_AFTER_MIN * 60_000) continue;
    const date = toIso(day.workDate);
    notices.push({
      employeeId: day.employeeId,
      type: "attendance.reminder_out",
      title: `Belum Clock Out — lembur hari libur ${dateLabel(date)}`,
      body: "Jam selesai perintah lembur sudah lewat. Lakukan Clock Out sebelum batas absen pulang.",
      link: "/absen",
      dedupeKey: `tm-remind-out:${day.employeeId}:${date}`,
      target: { type: "ATTENDANCE_TODAY", id: date },
    });
  }

  // Alpha yang hari ini adalah hari terakhir koreksinya (tanggal kerja = hari ini − 3).
  const lastDay = isoAddDays(today, -3);
  if (correctionDeadline(lastDay) === today) {
    const alphas = await db().attendanceDay.findMany({
      where: {
        ...scope,
        workDate: toDate(lastDay),
        status: "ALPHA",
        labels: { has: "NO_ATTENDANCE" },
      },
      select: { employeeId: true },
    });
    const pending = new Set(
      (
        await db().attendanceCorrection.findMany({
          where: {
            employeeId: { in: alphas.map((a) => a.employeeId) },
            workDate: toDate(lastDay),
            status: "PENDING",
          },
          select: { employeeId: true },
        })
      ).map((c) => c.employeeId),
    );
    for (const a of alphas) {
      if (pending.has(a.employeeId)) continue;
      notices.push({
        employeeId: a.employeeId,
        type: "attendance.alpha_last_day",
        title: `Hari terakhir koreksi Alpha ${dateLabel(lastDay)}`,
        body: "Ajukan koreksi hari ini. Setelah hari ini, hari tersebut tetap Alpha dan gaji hari itu tidak dihitung.",
        link: "/time/pernyataan",
        dedupeKey: `tm-alpha-last:${a.employeeId}:${lastDay}`,
        target: { type: "ATTENDANCE_DATE", id: lastDay },
      });
    }
  }
  return { reminded: await notifyEmployees(notices, now) };
}

// ── Ringkasan antrean harian untuk atasan & HR (OD-15 rekomendasi) ─────────────

/** Cron harian: satu notifikasi per pemutus yang masih punya antrean (sekali per tanggal). */
export async function runApprovalDigest(now = new Date()) {
  const { timezone } = await readTimeSettings();
  const today = localDate(now, timezone);
  let sent = 0;
  for (const account of await listApproverAccounts()) {
    const actor = await loadActor(account.authUserId, now);
    if (!actor) continue;
    const queue = await queueFor(actor);
    if (queue.total === 0) continue;
    const parts = [
      queue.attendance ? `${queue.attendance} absen` : null,
      queue.leave ? `${queue.leave} cuti/izin` : null,
      queue.corrections ? `${queue.corrections} koreksi` : null,
      queue.rosterChanges ? `${queue.rosterChanges} perubahan roster` : null,
      queue.overtime ? `${queue.overtime} lembur` : null,
    ].filter(Boolean);
    try {
      const r = await notify(
        {
          recipients: [{ accountId: account.accountId, email: account.email }],
          type: "attendance.approval_digest",
          title: `${queue.total} pengajuan menunggu keputusan Anda`,
          body: `${parts.join(", ")}.`,
          link: queue.attendance
            ? "/time/absen-harian"
            : queue.leave
              ? "/time/persetujuan-cuti"
              : queue.overtime && !queue.corrections
                ? "/time/lembur"
                : "/time/pernyataan",
          dedupeKey: `tm-digest:${account.accountId}:${today}`,
          target: { type: "APPROVAL_QUEUE", id: today },
          email: false,
        },
        now,
      );
      sent += r.created;
    } catch {
      // lanjut ke pemutus berikutnya
    }
  }
  return { sent };
}
