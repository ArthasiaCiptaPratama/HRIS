import { z } from "zod";
import { OFF_CODE } from "./time-management.ts";

// TM-D28 (Mat 2026-11-13): "roster" — di tampilan **Pola Kerja** — = siklus kerja–libur yang wajib dijalani,
// bukan jadwal jam kerja. Jadwal (shift, pola, crew, grid harian) tetap mesin yang sama; pola kerja dirakit
// menjadi pola jadwal: hari kerja = shift terpilih, hari libur = OFF, blok time off = TO.
//   • Office: karyawan di lokasi kerja kantor (ditandai HR), mis. 5 kerja / 2 libur (Senin–Jumat).
//   • Lapangan non-lokal: mis. 13 kerja / 1 libur, setelah N siklus time off 14 hari pulang ke homebase.
//   • Lapangan lokal: kerja normal 6 kerja / 1 libur, tanpa time off.
// Kelompok otomatis: lokasi kerja kantor → office; selain itu Homebase karyawan vs Homebase lokal lokasi
// (lokal / non-lokal); HR bisa mengubah per karyawan.

/** Kode langkah pola untuk hari time off (libur roster, bukan cuti; tidak Alpha). */
export const TIME_OFF_CODE = "TO";

/** Kelompok karyawan untuk pola kerja (nama kode tetap `Residency`). */
export const RESIDENCIES = ["OFFICE", "LOCAL", "NON_LOCAL"] as const;
export type Residency = (typeof RESIDENCIES)[number];
export const RESIDENCY_LABELS: Record<Residency, string> = {
  OFFICE: "Office",
  LOCAL: "Lapangan lokal",
  NON_LOCAL: "Lapangan non-lokal",
};

/** Batas panjang pola jadwal (langkah); roster dirakit menjadi pola sepanjang satu putaran penuh. */
export const MAX_PATTERN_STEPS = 400;

/** Bentuk siklus roster (dipakai rakitan pola & ringkasan). */
export interface RosterShape {
  workDays: number;
  offDays: number;
  cyclesBeforeTimeOff: number;
  timeOffDays: number;
}

export const workRosterInputSchema = z
  .object({
    companyId: z.uuid(),
    name: z.string().trim().min(1).max(60),
    /** Untuk kelompok office / lapangan lokal / lapangan non-lokal (pilihan bawaan saat mengisi jadwal). */
    residency: z.enum(RESIDENCIES),
    workDays: z.number().int().min(1).max(60),
    offDays: z.number().int().min(0).max(30),
    /** Jumlah siklus kerja–libur sebelum time off; 0 = tanpa time off. */
    cyclesBeforeTimeOff: z.number().int().min(0).max(20),
    timeOffDays: z.number().int().min(0).max(60),
    /** Crew bergiliran (crew berikutnya mulai lebih awal ⌊putaran ÷ crew⌋ hari) supaya site tidak kosong. */
    crewCount: z.number().int().min(1).max(8).default(1),
  })
  .refine((r) => r.cyclesBeforeTimeOff === 0 || r.timeOffDays > 0, {
    message: "Isi lama time off, atau jadikan 0 siklus bila tanpa time off.",
    path: ["timeOffDays"],
  })
  .refine((r: RosterShape) => workRosterLength(r) <= MAX_PATTERN_STEPS, {
    message: `Satu putaran pola kerja maksimal ${MAX_PATTERN_STEPS} hari.`,
    path: ["cyclesBeforeTimeOff"],
  });
export type WorkRosterInput = z.infer<typeof workRosterInputSchema>;

/** Panjang satu putaran (hari): siklus × (kerja + libur) + time off. */
export function workRosterLength(r: RosterShape): number {
  const cycle = r.workDays + r.offDays;
  return r.cyclesBeforeTimeOff === 0 ? cycle : r.cyclesBeforeTimeOff * cycle + r.timeOffDays;
}

/** Langkah pola hasil roster + kode shift hari kerja. */
export function workRosterSteps(r: RosterShape, shiftCode: string): string[] {
  const cycle = [
    ...Array<string>(r.workDays).fill(shiftCode),
    ...Array<string>(r.offDays).fill(OFF_CODE),
  ];
  if (r.cyclesBeforeTimeOff === 0) return cycle;
  return [
    ...Array.from({ length: r.cyclesBeforeTimeOff }, () => cycle).flat(),
    ...Array<string>(r.timeOffDays).fill(TIME_OFF_CODE),
  ];
}

/** Ringkasan, mis. "13/1 × 4 + time off 14 hari (70 hari)" atau "6/1". */
export function workRosterSummary(r: RosterShape): string {
  const base = `${r.workDays}/${r.offDays}`;
  if (r.cyclesBeforeTimeOff === 0) return base;
  return `${base} × ${r.cyclesBeforeTimeOff} + time off ${r.timeOffDays} hari (${workRosterLength(r)} hari)`;
}

/** Pola kerja bawaan (tombol cepat). */
export const DEFAULT_WORK_ROSTERS: Omit<WorkRosterInput, "companyId">[] = [
  {
    name: "Office 5/2",
    residency: "OFFICE",
    workDays: 5,
    offDays: 2,
    cyclesBeforeTimeOff: 0,
    timeOffDays: 0,
    crewCount: 1,
  },
  {
    name: "Non-lokal 13/1 + time off",
    residency: "NON_LOCAL",
    workDays: 13,
    offDays: 1,
    cyclesBeforeTimeOff: 4,
    timeOffDays: 14,
    crewCount: 1,
  },
  {
    name: "Lokal 6/1",
    residency: "LOCAL",
    workDays: 6,
    offDays: 1,
    cyclesBeforeTimeOff: 0,
    timeOffDays: 0,
    crewCount: 1,
  },
];

/** HR menandai lokasi kerja kantor (karyawannya = office) dan Homebase yang dianggap lokal di lokasi itu. */
export const localHomebasesInputSchema = z.object({
  workLocationId: z.uuid(),
  office: z.boolean().default(false),
  homebaseIds: z.array(z.uuid()).max(200),
});
export type LocalHomebasesInput = z.infer<typeof localHomebasesInputSchema>;

/** Ubah kelompok banyak karyawan; null = kembali otomatis (lokasi kantor / Homebase). */
export const employeeResidencyInputSchema = z.object({
  companyId: z.uuid(),
  employeeIds: z.array(z.uuid()).min(1).max(500),
  residency: z.enum(RESIDENCIES).nullable(),
});
export type EmployeeResidencyInput = z.infer<typeof employeeResidencyInputSchema>;

/**
 * Isi jadwal dengan pola kerja: karyawan dipisah office / lapangan lokal / lapangan non-lokal (otomatis),
 * masing-masing memakai pola kerja pilihan + shift hari kerja, lalu dipasang lewat mesin template jadwal
 * (TM-D23/TM-D24).
 */
export const workRosterAssignInputSchema = z.object({
  companyId: z.uuid(),
  workLocationId: z.uuid(),
  employeeIds: z.array(z.uuid()).min(1).max(500),
  effectiveDate: z.iso.date(),
  shiftCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/),
  officeRosterId: z.uuid().nullable().default(null),
  localRosterId: z.uuid().nullable(),
  nonLocalRosterId: z.uuid().nullable(),
});
export type WorkRosterAssignInput = z.infer<typeof workRosterAssignInputSchema>;
