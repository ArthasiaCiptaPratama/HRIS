import { localDate } from "./attendance-engine.ts";
import { readTimeSettings } from "./calendar.service.ts";
import * as repository from "./roster.repository.ts";
import { dateLabel, type EmployeeNotice, notifyEmployees } from "./time-notify.service.ts";

// TM-D13 Fase C (poin 12): karyawan diberi tahu setiap jadwalnya berubah (tukar shift, edit grid, import,
// pola dibangkitkan ulang) — hanya tanggal hari ini ke depan. Kode shift; null = OFF; undefined = tanpa roster.

export interface RosterChange {
  employeeId: string;
  date: string;
  from: string | null | undefined;
  to: string | null | undefined;
}

export type RosterChangeReason = "swap" | "edit" | "import" | "pattern";

const codeText = (code: string | null | undefined) =>
  code === undefined ? "tanpa roster" : code === null ? "OFF" : code;

const TITLES: Record<RosterChangeReason, string> = {
  swap: "Tukar shift disetujui — jadwal Anda berubah",
  edit: "Jadwal Anda diubah HR",
  import: "Jadwal Anda diperbarui (import roster)",
  pattern: "Jadwal Anda diperbarui (pola roster)",
};

/** Kode shift per (karyawan, tanggal) sebelum perubahan. */
export async function rosterCodes(
  keys: { employeeId: string; date: string }[],
  tx?: repository.AttendanceTx,
): Promise<Map<string, string | null>> {
  if (keys.length === 0) return new Map();
  const dates = keys.map((k) => k.date).sort();
  const rows = await repository.rosterDaysBetween(
    [...new Set(keys.map((k) => k.employeeId))],
    new Date(`${dates[0]}T00:00:00Z`),
    new Date(`${dates[dates.length - 1]}T00:00:00Z`),
    tx,
  );
  return new Map(
    rows.map((r) => [
      `${r.employeeId}|${r.workDate.toISOString().slice(0, 10)}`,
      r.shift?.code ?? null,
    ]),
  );
}

export async function notifyRosterChanges(
  changes: RosterChange[],
  reason: RosterChangeReason,
  now = new Date(),
): Promise<number> {
  const today = localDate(now, (await readTimeSettings()).timezone);
  const real = changes.filter((c) => c.from !== c.to && c.date >= today);
  const byEmployee = new Map<string, RosterChange[]>();
  for (const c of real) byEmployee.set(c.employeeId, [...(byEmployee.get(c.employeeId) ?? []), c]);
  const notices: EmployeeNotice[] = [];
  for (const [employeeId, list] of byEmployee) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const lines = list
      .slice(0, 5)
      .map((c) => `${dateLabel(c.date)}: ${codeText(c.from)} → ${codeText(c.to)}`);
    if (list.length > 5) lines.push(`dan ${list.length - 5} tanggal lainnya`);
    notices.push({
      employeeId,
      type: "attendance.roster_changed",
      title: TITLES[reason],
      body: `${lines.join("; ")}. Cek Roster Saya.`,
      link: "/absen/roster",
      dedupeKey: `tm-roster:${employeeId}:${now.getTime()}`,
      target: { type: "ROSTER", id: list[0]?.date as string },
    });
  }
  return notifyEmployees(notices, now);
}

/** Pengajuan tukar/ubah shift ditolak / dibatalkan → pengaju diberi tahu (jadwal tetap). */
export async function notifyRosterChangeRejected(
  employeeId: string,
  date: string,
  status: "REJECTED" | "CANCELLED",
  now = new Date(),
) {
  return notifyEmployees(
    [
      {
        employeeId,
        type: "attendance.roster_change_decided",
        title: `Pengajuan perubahan shift ${dateLabel(date)} ${status === "REJECTED" ? "ditolak" : "dibatalkan"}`,
        body: "Jadwal Anda tidak berubah.",
        link: "/absen/tukar-shift",
        dedupeKey: `tm-roster-decided:${employeeId}:${date}:${now.getTime()}`,
        target: { type: "ROSTER", id: date },
      },
    ],
    now,
  );
}
