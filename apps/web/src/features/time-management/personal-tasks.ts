import type { Me } from "@/features/auth/schemas";
import { tmAccess } from "./access";
import { useAttendanceDays, useMyHistory, useRosterChanges, useTimezone, useToday } from "./api";
import { addDays, hhmm, timeIn, todayIn, workDateLabel } from "./components/display";
import { useLeaveRequests, useMyLeave } from "./leave-api";
import { useCorrections, useMyStatements } from "./period-api";

// Daftar "Perlu tindakan" karyawan/atasan — satu sumber untuk dashboard pribadi (web) dan beranda
// absen (#102). Query react-query sama dengan widget dashboard lain, jadi cache dipakai bersama.

export type PersonalTaskTone = "danger" | "warning" | "info";
export interface PersonalTask {
  id: string;
  tone: PersonalTaskTone;
  title: string;
  detail?: string;
  to: string;
  cta: string;
}

/** Tujuan tautan tugas milik karyawan sendiri; beranda absen memetakannya ke rute /absen/*. */
export interface PersonalTaskLinks {
  punch: string;
  statements: string;
  rosterChanges: string;
  leave: string;
}

export const WEB_TASK_LINKS: PersonalTaskLinks = {
  punch: "/absen",
  statements: "/time/pernyataan",
  rosterChanges: "/time/perubahan-roster",
  leave: "/time/cuti",
};

export const ABSEN_TASK_LINKS: PersonalTaskLinks = {
  punch: "/absen",
  statements: "/absen/koreksi",
  rosterChanges: "/absen/tukar-shift",
  leave: "/absen/cuti",
};

export function usePersonalTasks(
  me: Me,
  links: PersonalTaskLinks = WEB_TASK_LINKS,
): { tasks: PersonalTask[]; loading: boolean } {
  const hasEmployee = me.employeeId !== null;
  const isDecider = tmAccess.reviewDays(me);
  const tz = useTimezone();
  const today = todayIn(tz);
  const monthStart = `${today.slice(0, 7)}-01`;

  const todayQ = useToday(hasEmployee);
  const history = useMyHistory(monthStart, today, hasEmployee);
  const leave = useMyLeave(hasEmployee);
  const statements = useMyStatements(hasEmployee);
  const myChanges = useRosterChanges("mine", hasEmployee);
  const dayInbox = useAttendanceDays(
    { scope: "inbox", from: addDays(today, -60), to: today },
    isDecider,
  );
  const leaveInbox = useLeaveRequests({ scope: "inbox" }, tmAccess.decideLeave(me));
  const changeInbox = useRosterChanges("inbox", tmAccess.decideRosterChanges(me));
  const correctionInbox = useCorrections("inbox", isDecider);

  const data = todayQ.data;
  const timezone = data?.timezone ?? tz;
  const current = data?.openDay ?? data?.recent.find((d) => d.workDate === today) ?? null;
  const inAt = current?.punches.find((p) => p.kind === "IN")?.at ?? null;
  const outAt = current?.punches.find((p) => p.kind === "OUT")?.at ?? null;
  const rosterToday = data?.roster.find((r) => r.date === today);
  const days = history.data ?? [];

  const tasks: PersonalTask[] = [];
  if (data) {
    if (data.openDay && !outAt) {
      tasks.push({
        id: "clock-out",
        tone: "warning",
        title: "Belum Clock Out",
        detail: `Clock In ${inAt ? timeIn(inAt, timezone) : "-"} (${workDateLabel(data.openDay.workDate)}).`,
        to: links.punch,
        cta: "Clock Out",
      });
    } else if (rosterToday?.shift && !inAt) {
      tasks.push({
        id: "clock-in",
        tone: "warning",
        title: "Belum Clock In hari ini",
        detail: `Shift ${rosterToday.shift.code} ${hhmm(rosterToday.shift.startMinute)}–${hhmm(rosterToday.shift.endMinute)}.`,
        to: links.punch,
        cta: "Clock In",
      });
    }
  }
  const alphaNoStatement = (statements.data ?? []).filter((s) => !s.statement);
  if (alphaNoStatement.length > 0) {
    tasks.push({
      id: "statements",
      tone: "danger",
      title: `${alphaNoStatement.length} hari Alpha belum ada surat pernyataan`,
      detail: alphaNoStatement
        .slice(0, 3)
        .map((s) => workDateLabel(s.workDate))
        .join(", "),
      to: links.statements,
      cta: "Buat pernyataan",
    });
  }
  const rejected = days.filter(
    (d) => d.status === "REJECTED" || d.punches.some((p) => p.status === "REJECTED"),
  );
  if (rejected.length > 0) {
    tasks.push({
      id: "rejected",
      tone: "danger",
      title: `${rejected.length} absen ditolak bulan ini`,
      detail: "Ajukan koreksi sebelum periode ditutup supaya tidak menjadi Alpha.",
      to: links.statements,
      cta: "Ajukan koreksi",
    });
  }
  const noCheckout = days.filter((d) => d.labels.includes("NO_CHECKOUT") && d.status === "PENDING");
  if (noCheckout.length > 0) {
    tasks.push({
      id: "no-checkout",
      tone: "warning",
      title: `${noCheckout.length} hari tanpa Clock Out`,
      detail: "Ajukan koreksi jam pulang atau minta HR memasukkannya secara manual.",
      to: links.statements,
      cta: "Koreksi",
    });
  }
  const consents = (myChanges.data ?? []).filter((c) => c.awaitingMyConsent);
  if (consents.length > 0) {
    tasks.push({
      id: "swap",
      tone: "warning",
      title: `${consents.length} permintaan tukar shift menunggu jawaban Anda`,
      to: links.rosterChanges,
      cta: "Jawab",
    });
  }
  const inbox: [string, number, string][] = [
    ["absen menunggu persetujuan Anda", dayInbox.data?.length ?? 0, "/time/absen-harian"],
    [
      "pengajuan cuti/izin menunggu persetujuan",
      leaveInbox.data?.length ?? 0,
      "/time/persetujuan-cuti",
    ],
    [
      "perubahan roster menunggu keputusan",
      changeInbox.data?.length ?? 0,
      "/time/perubahan-roster",
    ],
    ["koreksi absensi menunggu keputusan", correctionInbox.data?.length ?? 0, "/time/pernyataan"],
  ];
  for (const [label, n, to] of inbox) {
    if (n > 0) {
      tasks.push({ id: label, tone: "info", title: `${n} ${label}`, to, cta: "Periksa" });
    }
  }
  const balance = leave.data?.balances.find((b) => b.year === leave.data?.year);
  if (balance && balance.balance < 0) {
    tasks.push({
      id: "debt",
      tone: "info",
      title: `Saldo cuti minus ${Math.abs(balance.balance)} hari`,
      detail: "Hutang cuti dilunasi dari jatah tahun berikutnya.",
      to: links.leave,
      cta: "Lihat",
    });
  }
  const loading =
    (hasEmployee && (todayQ.isPending || history.isPending || statements.isPending)) ||
    (isDecider && dayInbox.isPending);
  return { tasks, loading };
}
