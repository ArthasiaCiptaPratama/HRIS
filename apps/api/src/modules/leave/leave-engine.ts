import type { LeaveLedgerKind } from "@hris/shared";

// Aturan murni cuti tahunan (docs/features/time-management/design.md §7, D-072). Tanpa I/O supaya mudah diuji.

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

/**
 * TM-D9: tahun jatah yang menanggung pengajuan = tahun hari terhitung PERTAMA pengajuan (cuti lintas
 * tahun 29 Des–3 Jan seluruhnya memakai saldo tahun mulai). Tidak ada lagi pemakaian sisa tahun lalu
 * (D-072 lama: s.d. 31 Maret) — sisa tahun lalu sudah hangus 31 Desember. Saldo boleh minus (hutang).
 */
export const chargeYearOf = (countedDates: string[]): number | null => {
  const first = [...countedDates].sort()[0];
  return first ? Number(first.slice(0, 4)) : null;
};

export function allocateCharges(
  dates: string[],
  chargeYear: number,
): { byYear: Map<number, number>; perDate: { date: string; year: number }[] } {
  const sorted = [...dates].sort();
  return {
    byYear: sorted.length > 0 ? new Map([[chargeYear, sorted.length]]) : new Map(),
    perDate: sorted.map((date) => ({ date, year: chargeYear })),
  };
}

/**
 * Saldo "nyata" untuk pelunasan hutang & hak keluar: tahanan pengajuan yang masih menunggu (HOLD tanpa
 * RELEASE) tidak dihitung sebagai pemakaian — HOLD/RELEASE pengajuan yang sudah final saling meniadakan.
 */
export const realBalance = (rows: { kind: LeaveLedgerKind; days: number }[]) =>
  rows.filter((r) => r.kind !== "HOLD" && r.kind !== "RELEASE").reduce((t, r) => t + r.days, 0);

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
