import { OFF_CODE } from "@hris/shared";

// Logika roster murni (D-069): tanpa I/O supaya mudah diuji. Tanggal = string ISO "YYYY-MM-DD" (UTC).

const DAY_MS = 24 * 60 * 60 * 1000;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
export const isoAddDays = (iso: string, days: number) =>
  new Date(toMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) =>
  Math.round((toMs(to) - toMs(from)) / DAY_MS);

/** Semua tanggal from..to (inklusif). */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = isoAddDays(d, 1)) out.push(d);
  return out;
}

/** Kode langkah pola pada tanggal tertentu; siklus juga berlaku mundur sebelum tanggal mulai. */
export function patternCodeOn(steps: readonly string[], cycleStart: string, date: string): string {
  const n = steps.length;
  const index = ((daysBetween(cycleStart, date) % n) + n) % n;
  return steps[index] ?? OFF_CODE;
}

export interface MemberInterval {
  employeeId: string;
  startDate: string;
  endDate: string | null;
}

export interface GeneratedDay {
  employeeId: string;
  date: string;
  code: string;
}

/** Hari roster dari pola untuk anggota crew pada rentang tanggal (memperhatikan masa keanggotaan). */
export function generateCrewDays(
  steps: readonly string[],
  cycleStart: string,
  members: readonly MemberInterval[],
  from: string,
  to: string,
): GeneratedDay[] {
  const out: GeneratedDay[] = [];
  for (const member of members) {
    const start = member.startDate > from ? member.startDate : from;
    const end = member.endDate && member.endDate < to ? member.endDate : to;
    for (const date of start <= end ? eachDate(start, end) : []) {
      out.push({
        employeeId: member.employeeId,
        date,
        code: patternCodeOn(steps, cycleStart, date),
      });
    }
  }
  return out;
}

/** "07:00" ↔ menit sejak 00:00. */
export const minuteToHHmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const crossesMidnight = (startMinute: number, endMinute: number) => endMinute <= startMinute;
