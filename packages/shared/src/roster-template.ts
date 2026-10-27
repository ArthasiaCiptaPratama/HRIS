import { z } from "zod";
import { patternRestWarnings } from "./overtime.ts";
import { OFF_CODE, rosterStepSchema } from "./time-management.ts";

// TM-D23 (permintaan Mat 2026-10-27): template roster buatan HR — pola + jumlah crew + jarak geser,
// dipasang ke lokasi kerja (membuat pola & crew A/B/C…), lalu karyawan dibagi rata ke crew.

export const ROSTER_TEMPLATE_MAX_CREWS = 8;

export const rosterTemplateDefInputSchema = z.object({
  companyId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullish(),
  steps: z.array(rosterStepSchema).min(1).max(120),
  crewCount: z.number().int().min(1).max(ROSTER_TEMPLATE_MAX_CREWS),
  /** Crew B mulai sekian hari lebih awal dari A, C dua kali lipat, dst. (JT: 7, 3 shift × 8: 2). */
  crewOffsetDays: z.number().int().min(0).max(120),
  /** Siklus dimulai Senin (pola kantor 5+2 supaya OFF jatuh Sabtu–Minggu). */
  startOnMonday: z.boolean().default(false),
});
export type RosterTemplateDefInput = z.infer<typeof rosterTemplateDefInputSchema>;

export const rosterTemplateInstallInputSchema = z.object({
  workLocationId: z.uuid(),
  cycleStartDate: z.iso.date(),
});
export type RosterTemplateInstallInput = z.infer<typeof rosterTemplateInstallInputSchema>;

/**
 * TM-D23 Fase 2: isi roster karyawan dengan template — karyawan dibagi rata ke crew pemasangan template di
 * lokasi itu (dipasang otomatis bila belum), mulai tanggal efektif. Roster lama karyawan itu (kuas / import /
 * tukar shift) mulai tanggal efektif SELALU ditimpa ("paksa tempel full", Mat 2026-10-27); hari terkunci tetap.
 */
export const rosterTemplateAssignInputSchema = z.object({
  workLocationId: z.uuid(),
  employeeIds: z.array(z.uuid()).min(1).max(500),
  effectiveDate: z.iso.date(),
  /** Hanya dipakai bila template belum terpasang di lokasi itu (bawaan: tanggal efektif). */
  cycleStartDate: z.iso.date().nullish(),
});
export type RosterTemplateAssignInput = z.infer<typeof rosterTemplateAssignInputSchema>;

/** Huruf crew ke-i: A, B, C, … */
/** Template cepat: 5 hari kerja (Sen–Jum) / 6 hari kerja (Sen–Sab), siklus mingguan mulai Senin. */
export const weeklyWorkSteps = (workDays: 5 | 6, code: string) => [
  ...Array<string>(workDays).fill(code),
  ...Array<string>(7 - workDays).fill(OFF_CODE),
];

export const crewLetter = (index: number) => String.fromCharCode(65 + index);

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Senin pada/sebelum tanggal (YYYY-MM-DD). */
export const mondayOnOrBefore = (date: string) => {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
};

/** Tanggal mulai siklus crew ke-i: crew berikutnya mulai `offset` hari lebih awal. */
export const crewCycleStart = (start: string, index: number, offsetDays: number) =>
  addDays(start, -index * offsetDays);

export interface TemplatePreviewShift {
  code: string;
  startMinute: number;
  endMinute: number;
  startsNextDay?: boolean;
}

export interface RosterTemplatePreview {
  dates: string[];
  /** Kode per crew per tanggal (urutan sama dengan `dates`). */
  crews: { name: string; codes: string[] }[];
  /** Shift kerja yang terisi crew di tanggal itu (untuk melihat hari tanpa jaga). */
  coverage: { date: string; codes: string[] }[];
  /** Pergantian di dalam pola: jeda < pengaturan (`restHours` ≥ 0) atau jam bertabrakan (`restHours` < 0). */
  warnings: { index: number; from: string; to: string; restHours: number; overlap: boolean }[];
}

/**
 * Pratinjau template: kode tiap crew per tanggal mulai `start` selama `days` hari, cakupan shift per hari,
 * dan peringatan jeda/bentrok antarlangkah (dipakai form web & validasi API).
 */
export function rosterTemplatePreview(
  template: Pick<
    RosterTemplateDefInput,
    "steps" | "crewCount" | "crewOffsetDays" | "startOnMonday"
  >,
  shifts: readonly TemplatePreviewShift[],
  start: string,
  days: number,
  minRestHours: number,
): RosterTemplatePreview {
  const base = template.startOnMonday ? mondayOnOrBefore(start) : start;
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const n = template.steps.length;
  const crews = Array.from({ length: template.crewCount }, (_, i) => {
    const cycle = crewCycleStart(base, i, template.crewOffsetDays);
    const codes = dates.map((date) => {
      const diff = Math.round(
        (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${cycle}T00:00:00Z`)) / 86_400_000,
      );
      return template.steps[((diff % n) + n) % n] as string;
    });
    return { name: `Crew ${crewLetter(i)}`, codes };
  });
  const coverage = dates.map((date, d) => ({
    date,
    codes: [...new Set(crews.map((c) => c.codes[d] as string).filter((code) => code !== OFF_CODE))],
  }));
  const warnings = patternRestWarnings(template.steps, shifts, minRestHours, OFF_CODE).map((w) => ({
    ...w,
    overlap: w.restHours < 0,
  }));
  return { dates, crews, coverage, warnings };
}
