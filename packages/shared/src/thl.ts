import { z } from "zod";

export const THL_PRESENT_DAYS_THRESHOLD = 21;
export const THL_STATUSES = ["NONE", "APPROACHING", "REQUIRED"] as const;
export type ThlStatus = (typeof THL_STATUSES)[number];
export const THL_STATUS_LABELS: Record<ThlStatus, string> = {
  NONE: "Belum mencapai batas",
  APPROACHING: "Mendekati batas",
  REQUIRED: "Wajib diangkat PKWTT",
};
export interface ThlAttendanceMonth {
  month: string;
  presentDays: number;
  pendingDays: number;
}

export function shiftThlMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function thlCurrentMonth(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now).slice(0, 7);
}

/** KTR-D8/D13: hanya tiga bulan kalender penuh sebelum bulan berjalan WIB. */
export function evaluateThlAttendance(counts: readonly ThlAttendanceMonth[], now = new Date()) {
  const current = thlCurrentMonth(now);
  const byMonth = new Map(counts.map((m) => [m.month, m]));
  const count = (month: string): ThlAttendanceMonth =>
    byMonth.get(month) ?? { month, presentDays: 0, pendingDays: 0 };
  const months = [-3, -2, -1].map((offset) => {
    const row = count(shiftThlMonth(current, offset));
    return { ...row, qualifies: row.presentDays >= THL_PRESENT_DAYS_THRESHOLD };
  });
  const status: ThlStatus = months.every((m) => m.qualifies)
    ? "REQUIRED"
    : months.slice(1).every((m) => m.qualifies)
      ? "APPROACHING"
      : "NONE";
  return { status, label: THL_STATUS_LABELS[status], months, currentMonth: count(current) };
}

export const dailyWageInputSchema = z.object({
  amount: z.number().positive().max(100_000_000).multipleOf(0.01),
  effectiveFrom: z.iso.date(),
  note: z.string().trim().min(1).max(300),
});
export type DailyWageInput = z.infer<typeof dailyWageInputSchema>;
