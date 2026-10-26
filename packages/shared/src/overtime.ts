import { z } from "zod";

// TM-D6 (lembur) & TM-D7 (absen istirahat) — perhitungan murni, dipakai API (usulan, rekap) & web (pratinjau).
// Semua waktu dalam milidetik epoch; hasil dalam menit & jam setara.

export const OVERTIME_DAY_TYPES = ["WORKDAY", "OFF_DAY", "HOLIDAY"] as const;
export type OvertimeDayType = (typeof OVERTIME_DAY_TYPES)[number];
export const OVERTIME_DAY_TYPE_LABELS: Record<OvertimeDayType, string> = {
  WORKDAY: "Hari kerja",
  OFF_DAY: "Hari OFF",
  HOLIDAY: "Tanggal merah",
};

/** Rumus lembur hari libur mengikuti pola roster: 6 hari kerja/minggu atau 5 hari kerja/minggu. */
export const OVERTIME_FORMULAS = ["SIX_DAY", "FIVE_DAY"] as const;
export type OvertimeFormula = (typeof OVERTIME_FORMULAS)[number];
export const OVERTIME_FORMULA_LABELS: Record<OvertimeFormula, string> = {
  SIX_DAY: "Pola 6 hari kerja",
  FIVE_DAY: "Pola 5 hari kerja",
};

export const OVERTIME_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type OvertimeStatus = (typeof OVERTIME_STATUSES)[number];
export const OVERTIME_STATUS_LABELS: Record<OvertimeStatus, string> = {
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

/** Peringatan batas PP 35/2021: tetap bisa disetujui, pemutus wajib menulis alasan. */
export const OVERTIME_FLAGS = ["OVER_DAY_LIMIT", "OVER_WEEK_LIMIT"] as const;
export type OvertimeFlag = (typeof OVERTIME_FLAGS)[number];
export const OVERTIME_FLAG_TEXT: Record<OvertimeFlag, string> = {
  OVER_DAY_LIMIT: "Lebih dari 4 jam sehari",
  OVER_WEEK_LIMIT: "Lebih dari 18 jam seminggu",
};

/** Label hari absen dari lembur rutin & istirahat (TM-D6, TM-D7). */
export const BREAK_LABELS = ["BREAK_OVER", "NO_BREAK_PUNCH"] as const;
export type BreakLabel = (typeof BREAK_LABELS)[number];

/** Lembur baru diakui bila minimal 60 menit efektif (jam pertama penuh). */
export const OVERTIME_FIRST_HOUR_MIN = 60;
/** Lewat jam pertama, dibulatkan ke atas per 30 menit. */
export const OVERTIME_ROUND_MIN = 30;
export const OVERTIME_DAY_LIMIT_MIN = 4 * 60;
export const OVERTIME_WEEK_LIMIT_MIN = 18 * 60;
/** Upah sejam = 1/173 upah sebulan (PP 35/2021). */
export const HOURLY_WAGE_DIVISOR = 173;
/** Upah sehari untuk uang pengganti cuti (TM-D9): ÷25 pola 6 hari, ÷21 pola 5 hari. */
export const DAILY_WAGE_DIVISOR: Record<OvertimeFormula, number> = { SIX_DAY: 25, FIVE_DAY: 21 };

const MINUTE = 60_000;

/** < 60 menit → 0; selebihnya dibulatkan ke atas per 30 menit (1j05 → 90, 1j50 → 120). */
export function recognizeOvertimeMinutes(minutes: number): number {
  const m = Math.floor(minutes);
  if (m < OVERTIME_FIRST_HOUR_MIN) return 0;
  return Math.ceil(m / OVERTIME_ROUND_MIN) * OVERTIME_ROUND_MIN;
}

interface Tier {
  upToMin: number;
  rate: number;
}
const TIERS: Record<"REGULAR" | `HOLIDAY_${OvertimeFormula}`, Tier[]> = {
  // Hari kerja & hari OFF rotasi: jam ke-1 ×1,5; berikutnya ×2.
  REGULAR: [
    { upToMin: 60, rate: 1.5 },
    { upToMin: Number.POSITIVE_INFINITY, rate: 2 },
  ],
  // Tanggal merah, pola 6 hari: jam 1–7 ×2, ke-8 ×3, ke-9+ ×4.
  HOLIDAY_SIX_DAY: [
    { upToMin: 7 * 60, rate: 2 },
    { upToMin: 8 * 60, rate: 3 },
    { upToMin: Number.POSITIVE_INFINITY, rate: 4 },
  ],
  // Tanggal merah, pola 5 hari: jam 1–8 ×2, ke-9 ×3, ke-10+ ×4.
  HOLIDAY_FIVE_DAY: [
    { upToMin: 8 * 60, rate: 2 },
    { upToMin: 9 * 60, rate: 3 },
    { upToMin: Number.POSITIVE_INFINITY, rate: 4 },
  ],
};

/**
 * Jam setara untuk `minutes` menit lembur yang dimulai pada menit ke-`offsetMin` dari urutan lembur hari itu
 * (mis. lembur tambahan setelah 60 menit lembur rutin langsung memakai pengali jam ke-2).
 */
export function overtimeEquivalentHours(
  minutes: number,
  dayType: OvertimeDayType,
  formula: OvertimeFormula,
  offsetMin = 0,
): number {
  const tiers = dayType === "HOLIDAY" ? TIERS[`HOLIDAY_${formula}`] : TIERS.REGULAR;
  let from = 0;
  let total = 0;
  const start = offsetMin;
  const end = offsetMin + Math.max(0, minutes);
  for (const tier of tiers) {
    const overlap = Math.max(0, Math.min(end, tier.upToMin) - Math.max(start, from));
    total += (overlap / 60) * tier.rate;
    from = tier.upToMin;
  }
  return Math.round(total * 100) / 100;
}

export interface OvertimeDayInput {
  dayType: OvertimeDayType;
  formula: OvertimeFormula;
  /** Jadwal shift hari itu (null = tanpa shift: hari OFF / tanpa roster). */
  scheduledStart: number | null;
  scheduledEnd: number | null;
  regularOvertimeMin: number;
  lateToleranceMin: number;
  /** Jatah istirahat shift (menit) & apakah istirahat termasuk jam kerja dibayar. */
  breakMin: number;
  breakPaid: boolean;
  /** Lokasi wajib absen istirahat (TM-D7). */
  breakRequired: boolean;
  checkIn: number;
  checkOut: number;
  breakStart?: number | null;
  breakEnd?: number | null;
}

export interface OvertimeDayResult {
  /** Menit di luar jadwal sebelum pengurangan (hari OFF/libur: seluruh jam kerja). */
  rawMin: number;
  earlyMin: number;
  lateMin: number;
  breakOverMin: number;
  debtMin: number;
  /** Lembur rutin riil yang dibayar (setelah sisa utang menit). */
  regularMin: number;
  regularShort: boolean;
  /** Lembur tambahan yang diusulkan (aturan ≥ 60 menit + bulat ke atas per 30 menit). */
  proposedMin: number;
  regularEquivalentHours: number;
  proposedEquivalentHours: number;
  flags: OvertimeFlag[];
  breakLabels: BreakLabel[];
}

const minutesBetween = (a: number, b: number) => Math.max(0, Math.floor((b - a) / MINUTE));

/**
 * Hitung lembur satu hari absen (TM-D6) + label istirahat (TM-D7).
 * - Hari kerja: kelebihan = datang awal + pulang lewat jadwal; utang = telat (lewat toleransi, dihitung dari
 *   jam masuk) + istirahat lebih. Utang mengurangi kelebihan dulu, sisanya mengurangi lembur rutin.
 * - Hari OFF / tanpa jadwal / tanggal merah: seluruh jam kerja (dikurangi istirahat tak dibayar) = lembur.
 * - Lembur tambahan diakui bila total lembur hari itu ≥ 60 menit, lalu dibulatkan ke atas per 30 menit.
 *   Lembur rutin dihitung riil (TM-D6: kurang dari jadwal tetap dibayar riil + label).
 */
export function computeOvertimeDay(input: OvertimeDayInput): OvertimeDayResult {
  const breakActual =
    input.breakStart != null && input.breakEnd != null
      ? minutesBetween(input.breakStart, input.breakEnd)
      : null;
  const breakLabels: BreakLabel[] = [];
  const hasSchedule = input.scheduledStart !== null && input.scheduledEnd !== null;
  // Hari OFF / tanpa jadwal tidak punya jatah istirahat shift → tidak wajib absen istirahat (UAT 2026-10-22).
  if (input.breakRequired && hasSchedule && breakActual === null)
    breakLabels.push("NO_BREAK_PUNCH");
  const breakOverMin =
    breakActual !== null && hasSchedule ? Math.max(0, breakActual - input.breakMin) : 0;
  if (breakOverMin > 0) breakLabels.push("BREAK_OVER");

  const base = {
    earlyMin: 0,
    lateMin: 0,
    breakOverMin,
    regularMin: 0,
    regularShort: false,
    regularEquivalentHours: 0,
    breakLabels,
  };

  if (input.dayType !== "WORKDAY" || !hasSchedule) {
    // Seluruh jam kerja dihitung lembur; istirahat tak dibayar dipotong (jatah, atau riil bila tanpa jadwal).
    const unpaidBreak = hasSchedule ? (input.breakPaid ? 0 : input.breakMin) : (breakActual ?? 0);
    const worked = Math.max(0, minutesBetween(input.checkIn, input.checkOut) - unpaidBreak);
    const debtMin = breakOverMin;
    const proposedMin = recognizeOvertimeMinutes(worked - debtMin);
    return {
      ...base,
      rawMin: worked,
      debtMin,
      proposedMin,
      proposedEquivalentHours: overtimeEquivalentHours(proposedMin, input.dayType, input.formula),
      flags:
        input.dayType !== "HOLIDAY" && proposedMin > OVERTIME_DAY_LIMIT_MIN
          ? ["OVER_DAY_LIMIT"]
          : [],
    };
  }

  const start = input.scheduledStart as number;
  const end = input.scheduledEnd as number;
  // Hanya waktu yang benar-benar dijalani di luar jadwal: datang awal dibatasi jam pulang (Clock In jauh
  // sebelum shift lalu pulang sebelum shift mulai ≠ lembur), pulang lewat dibatasi jam masuk.
  const earlyMin = minutesBetween(input.checkIn, Math.min(start, input.checkOut));
  const afterMin = minutesBetween(Math.max(end, input.checkIn), input.checkOut);
  const lateMin =
    input.checkIn > start + input.lateToleranceMin * MINUTE
      ? minutesBetween(start, input.checkIn)
      : 0;
  const debtMin = lateMin + breakOverMin;
  const regularPlanned = Math.max(0, input.regularOvertimeMin);
  const regularActual =
    regularPlanned > 0
      ? Math.min(regularPlanned, minutesBetween(end - regularPlanned * MINUTE, input.checkOut))
      : 0;
  const rawMin = earlyMin + afterMin;
  const extra = rawMin - debtMin;
  const regularMin = Math.max(0, regularActual + Math.min(0, extra));
  const total = regularMin + Math.max(0, extra);
  const recognizedTotal = recognizeOvertimeMinutes(total);
  const proposedMin = recognizedTotal > 0 ? Math.max(0, recognizedTotal - regularMin) : 0;
  return {
    rawMin,
    earlyMin,
    lateMin,
    breakOverMin,
    debtMin,
    regularMin,
    regularShort: regularPlanned > 0 && regularActual < regularPlanned,
    proposedMin,
    regularEquivalentHours: overtimeEquivalentHours(regularMin, "WORKDAY", input.formula),
    proposedEquivalentHours: overtimeEquivalentHours(
      proposedMin,
      "WORKDAY",
      input.formula,
      regularMin,
    ),
    flags: regularMin + proposedMin > OVERTIME_DAY_LIMIT_MIN ? ["OVER_DAY_LIMIT"] : [],
    breakLabels,
  };
}

/** Pola roster → rumus hari libur: rata-rata ≥ 5,5 hari kerja per 7 hari = pola 6 hari. */
export function formulaForPattern(
  steps: string[] | null | undefined,
  offCode = "OFF",
): OvertimeFormula {
  if (!steps || steps.length === 0) return "SIX_DAY";
  const work = steps.filter((s) => s !== offCode).length;
  return (work * 7) / steps.length >= 5.5 ? "SIX_DAY" : "FIVE_DAY";
}

/** Upah sejam dari upah grade (pokok + tunjangan tetap) ÷ 173, dibulatkan ke rupiah. */
export const hourlyWage = (basePay: number, fixedAllowance: number) =>
  Math.round((basePay + fixedAllowance) / HOURLY_WAGE_DIVISOR);

/** Rupiah lembur = jam setara × upah sejam (tanpa pembulatan ganda). */
export const overtimePay = (equivalentHours: number, basePay: number, fixedAllowance: number) =>
  Math.round((equivalentHours * (basePay + fixedAllowance)) / HOURLY_WAGE_DIVISOR);

/**
 * TM-D9 uang penggantian hak cuti saat keluar: sisa hari × upah grade (pokok + tunjangan tetap) ÷ 25
 * (pola 6 hari) / ÷ 21 (pola 5 hari; juga staf tanpa roster), dibulatkan ke rupiah.
 */
export const leaveCompensation = (
  days: number,
  basePay: number,
  fixedAllowance: number,
  formula: OvertimeFormula,
) => Math.round((Math.max(0, days) * (basePay + fixedAllowance)) / DAILY_WAGE_DIVISOR[formula]);

export const LEAVE_EXIT_STATUSES = ["OPEN", "PAID", "CANCELLED"] as const;
export type LeaveExitStatus = (typeof LEAVE_EXIT_STATUSES)[number];
export const LEAVE_EXIT_STATUS_LABELS: Record<LeaveExitStatus, string> = {
  OPEN: "Belum diproses payroll",
  PAID: "Sudah diproses",
  CANCELLED: "Dibatalkan (aktif lagi)",
};

/** Format menit → "1 jam 30 menit". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} menit`;
  return rest === 0 ? `${h} jam` : `${h} jam ${rest} menit`;
}

const money = z.number().min(0).max(1_000_000_000);
export const gradeWageInputSchema = z.object({
  basePay: money,
  fixedAllowance: money,
});
export type GradeWageInput = z.infer<typeof gradeWageInputSchema>;

/** Lokasi kerja yang wajib absen istirahat (TM-D7), diatur SA + HR. */
export const breakLocationsInputSchema = z.object({
  workLocationIds: z.array(z.uuid()).max(500),
});
export type BreakLocationsInput = z.infer<typeof breakLocationsInputSchema>;

/** Template roster siap pakai (TM-D8). Hanya JT untuk saat ini. */
/**
 * Template roster siap pakai (TM-D8): JT (Jetty & Loading, 3 shift rotasi 6+1), 13+1 (13 kerja + 1 OFF,
 * 7 j normal + 1 j lembur rutin seperti JT), 5+2 (Senin–Jumat 08–17, istirahat 1 j tidak dibayar).
 */
export const ROSTER_TEMPLATES = ["JT", "ROT_13_1", "WEEK_5_2", "SHIFT_3X8"] as const;
export type RosterTemplate = (typeof ROSTER_TEMPLATES)[number];
export const ROSTER_TEMPLATE_LABELS: Record<RosterTemplate, string> = {
  JT: "JT — Jetty & Loading (3 shift, 6+1 rotasi)",
  ROT_13_1: "13+1 — 13 hari kerja, 1 OFF",
  WEEK_5_2: "5+2 — Senin–Jumat 08.00–17.00",
  SHIFT_3X8: "3 shift × 8 jam — 08–16 / 16–24 / 24–08 (2-2-2 + 2 OFF, 4 crew)",
};
export const rosterTemplateInputSchema = z.object({
  template: z.enum(ROSTER_TEMPLATES),
  companyId: z.uuid(),
  /** Bila diisi, dibuat crew di lokasi ini (JT: 3 crew bergeser 7 hari; lainnya: 1 crew). */
  workLocationId: z.uuid().nullish(),
  cycleStartDate: z.iso.date(),
});
export type RosterTemplateInput = z.infer<typeof rosterTemplateInputSchema>;

/**
 * TM-D13 Fase D: jeda antarshift di dalam pola (berurutan & melingkar). Menit dari 00:00 tanggal roster;
 * shift `startsNextDay` mulai +24 jam. Kembalikan pasangan langkah yang jedanya < `minRestHours`.
 */
export function patternRestWarnings(
  steps: readonly string[],
  shifts: readonly {
    code: string;
    startMinute: number;
    endMinute: number;
    startsNextDay?: boolean;
  }[],
  minRestHours: number,
  offCode = "OFF",
): { index: number; from: string; to: string; restHours: number }[] {
  if (minRestHours <= 0 || steps.length < 2) return [];
  const byCode = new Map(shifts.map((s) => [s.code, s]));
  const span = (code: string) => {
    const s = code === offCode ? undefined : byCode.get(code);
    if (!s) return null;
    const start = (s.startsNextDay ? 1440 : 0) + s.startMinute;
    const length = (s.endMinute - s.startMinute + 1440) % 1440 || 1440;
    return { start, end: start + length };
  };
  const warnings: { index: number; from: string; to: string; restHours: number }[] = [];
  steps.forEach((code, index) => {
    const nextCode = steps[(index + 1) % steps.length] as string;
    const a = span(code);
    const b = span(nextCode);
    if (!a || !b) return;
    const rest = 1440 + b.start - a.end;
    if (rest < minRestHours * 60) {
      warnings.push({
        index,
        from: code,
        to: nextCode,
        restHours: Math.round((rest / 60) * 10) / 10,
      });
    }
  });
  return warnings;
}
