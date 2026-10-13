import { LEAVE_CARRY_UNTIL, type LeaveLedgerKind } from "@hris/shared";

// Aturan murni cuti tahunan (docs/design/time-management.md §7, D-072). Tanpa I/O supaya mudah diuji.

/**
 * Jatah 1 Januari `grantYear` (§7.2): masa kerja penuh tahun sebelumnya → kuota penuh; karyawan baru →
 * 1 hari per bulan kerja penuh s.d. 31 Desember tahun sebelumnya. Masuk tanggal 1–15 → bulan itu
 * dihitung; > 15 → mulai bulan berikutnya. Masuk pada/sesudah 1 Januari `grantYear` → 0.
 */
export function prorataDays(joinDate: string, grantYear: number, quota: number): number {
  const [y, m, d] = joinDate.split("-").map(Number) as [number, number, number];
  if (y >= grantYear) return 0;
  if (y < grantYear - 1) return quota;
  const firstMonth = d <= 15 ? m : m + 1;
  const months = Math.max(0, 13 - firstMonth);
  return months >= 12 ? quota : Math.min(quota, months);
}

export type RosterMark = "WORK" | "OFF";
export type HolidayKind = "NATIONAL" | "COLLECTIVE_LEAVE";

const isWeekday = (iso: string) => {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
};

/**
 * Hari terhitung dalam rentang (§7.3): hanya hari kerja roster; OFF & tanggal merah nasional tidak
 * dihitung; cuti bersama pada hari kerja roster DIHITUNG (karyawan tidak masuk).
 * Tanpa roster pada tanggal itu (mis. staf kantor tanpa crew) → Senin–Jumat yang bukan hari libur.
 */
export function countLeaveDates(
  dates: string[],
  roster: Map<string, RosterMark>,
  holidays: Map<string, HolidayKind>,
): string[] {
  return dates.filter((date) => {
    const mark = roster.get(date);
    const holiday = holidays.get(date);
    if (mark === "OFF") return false;
    if (mark === "WORK") return holiday !== "NATIONAL";
    return isWeekday(date) && holiday === undefined;
  });
}

/** Tahun jatah yang menanggung tiap tanggal: sisa tahun lalu dulu (s.d. 31 Maret), lalu tahun berjalan. */
export function allocateCharges(
  dates: string[],
  balances: Map<number, number>,
): { byYear: Map<number, number>; perDate: { date: string; year: number }[] } {
  const remaining = new Map(balances);
  const byYear = new Map<number, number>();
  const perDate: { date: string; year: number }[] = [];
  for (const date of [...dates].sort()) {
    const year = Number(date.slice(0, 4));
    const carryOpen = date.slice(5) <= LEAVE_CARRY_UNTIL && (remaining.get(year - 1) ?? 0) > 0;
    const charged = carryOpen ? year - 1 : year;
    remaining.set(charged, (remaining.get(charged) ?? 0) - 1);
    byYear.set(charged, (byYear.get(charged) ?? 0) + 1);
    perDate.push({ date, year: charged });
  }
  return { byYear, perDate };
}

/** Pelunasan hutang akhir Januari (§7.2): ambil dari jatah baru sebanyak yang tersedia. */
export function settlementDays(previousBalance: number, newYearBalance: number): number {
  if (previousBalance >= 0) return 0;
  return Math.min(-previousBalance, Math.max(0, newYearBalance));
}

export interface BalanceSummary {
  year: number;
  granted: number;
  adjusted: number;
  used: number;
  held: number;
  collective: number;
  expired: number;
  settled: number;
  balance: number;
}

/** Ringkasan saldo satu tahun jatah dari baris buku besar. */
export function summarize(
  year: number,
  rows: { kind: LeaveLedgerKind; days: number }[],
): BalanceSummary {
  const sum = (...kinds: LeaveLedgerKind[]) =>
    rows.filter((r) => kinds.includes(r.kind)).reduce((total, r) => total + r.days, 0);
  return {
    year,
    granted: sum("GRANT"),
    adjusted: sum("ADJUST"),
    used: -sum("USE"),
    held: -sum("HOLD", "RELEASE"),
    collective: -sum("COLLECTIVE"),
    expired: -sum("EXPIRE"),
    settled: sum("SETTLE"),
    balance: rows.reduce((total, r) => total + r.days, 0),
  };
}

/** Tanggal ISO dalam rentang inklusif. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
