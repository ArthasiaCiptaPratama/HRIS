import { z } from "zod";
import { employmentCategorySchema } from "./employee.ts";

// D-049: input kelola master data organisasi — dipakai API (validasi body) & web (form) dengan aturan sama.

export const MASTER_DATA_KINDS = [
  "companies",
  "departments",
  "positions",
  "employment-statuses",
  "grades",
  "work-locations",
] as const;
export const masterDataKindSchema = z.enum(MASTER_DATA_KINDS);
export type MasterDataKind = z.infer<typeof masterDataKindSchema>;

export const MASTER_DATA_LABELS: Record<MasterDataKind, string> = {
  companies: "Perusahaan",
  // D-050: tabel/API "departments" menyimpan semua unit organisasi (Direktorat … Seksi).
  departments: "Unit organisasi",
  positions: "Jabatan",
  "employment-statuses": "Status kepegawaian",
  grades: "Grade",
  "work-locations": "Site / lokasi kerja",
};

/** Perusahaan tidak bisa digabung (badan hukum berbeda, D-039). */
export const MERGEABLE_MASTER_DATA: readonly MasterDataKind[] = [
  "departments",
  "positions",
  "employment-statuses",
  "grades",
  "work-locations",
];

// ── D-050: unit organisasi berjenjang & level jabatan ───────────────────────────

export const ORG_UNIT_TYPES = ["DIRECTORATE", "DIVISION", "DEPARTMENT", "SECTION"] as const;
export const orgUnitTypeSchema = z.enum(ORG_UNIT_TYPES);
export type OrgUnitType = z.infer<typeof orgUnitTypeSchema>;

export const ORG_UNIT_TYPE_LABELS: Record<OrgUnitType, string> = {
  DIRECTORATE: "Direktorat",
  DIVISION: "Divisi",
  DEPARTMENT: "Departemen",
  SECTION: "Seksi",
};

/**
 * Induk yang sah per jenis. Semua jenis boleh tanpa induk (puncak). Departemen boleh langsung di
 * bawah Direktorat (tanpa Divisi); Direktorat boleh di bawah Direktorat (mis. Direktorat Operasional
 * di bawah Direktorat Utama).
 */
export const ORG_UNIT_PARENTS: Record<OrgUnitType, readonly OrgUnitType[]> = {
  DIRECTORATE: ["DIRECTORATE"],
  DIVISION: ["DIRECTORATE"],
  DEPARTMENT: ["DIRECTORATE", "DIVISION"],
  SECTION: ["DIVISION", "DEPARTMENT"],
};

export function canBeChildOf(child: OrgUnitType, parent: OrgUnitType | null): boolean {
  return parent === null || ORG_UNIT_PARENTS[child].includes(parent);
}

/** Urutan dari puncak ke bawah (Direksi → Helper) untuk bagan & laporan. */
export const POSITION_LEVELS = [
  "DIRECTOR",
  "GENERAL_MANAGER",
  "MANAGER",
  "SUPERINTENDENT",
  "SUPERVISOR",
  "FOREMAN",
  "STAFF",
  "NON_STAFF",
] as const;
export const positionLevelSchema = z.enum(POSITION_LEVELS);
export type PositionLevel = z.infer<typeof positionLevelSchema>;

export const POSITION_LEVEL_LABELS: Record<PositionLevel, string> = {
  DIRECTOR: "Direksi",
  GENERAL_MANAGER: "GM / VP",
  MANAGER: "Manager",
  SUPERINTENDENT: "Superintendent",
  SUPERVISOR: "Supervisor",
  FOREMAN: "Foreman",
  STAFF: "Staf / Operator",
  NON_STAFF: "Helper / Non-staf",
};

export const MASTER_DATA_VIEWS = ["active", "archived", "all"] as const;
export const masterDataViewSchema = z.enum(MASTER_DATA_VIEWS);
export type MasterDataView = z.infer<typeof masterDataViewSchema>;

const name = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Wajib diisi.")
    .max(max, `Maksimal ${max} karakter.`)
    .transform((value) => value.replace(/\s+/g, " "));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

// D-045: kode PT ikut di nomor induk karyawan (DD.MM.KODE.NNN) → huruf besar/angka, tanpa titik.
export const companyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,10}$/, "2–10 huruf besar atau angka, tanpa spasi/titik.");

const npwp = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s.-]/g, ""))
  .refine((value) => value === "" || /^\d{15,16}$/.test(value), "NPWP 15 atau 16 digit.")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

export const companyInputSchema = z.object({
  code: companyCodeSchema,
  name: name(150),
  npwpNumber: npwp,
  address: optionalText(500),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const departmentInputSchema = z.object({
  name: name(100),
  /** D-050: jenis unit; tanpa nilai saat tambah = Departemen. */
  unitType: orgUnitTypeSchema.optional(),
  parentId: z.uuid().nullable().optional(),
});
export type DepartmentInput = z.infer<typeof departmentInputSchema>;

export const positionInputSchema = z.object({
  name: name(100),
  departmentId: z.uuid("Pilih unit organisasi."),
  /** D-050: level jabatan (opsional). */
  level: positionLevelSchema.nullable().optional(),
});
export type PositionInput = z.infer<typeof positionInputSchema>;

export const employmentStatusInputSchema = z.object({
  name: name(50),
  category: employmentCategorySchema.nullable().optional(),
});
export type EmploymentStatusInput = z.infer<typeof employmentStatusInputSchema>;

export const gradeInputSchema = z.object({ name: name(50) });
export type GradeInput = z.infer<typeof gradeInputSchema>;

/** Koordinat Decimal(9,6) (PROMPT §6): maks 6 angka di belakang koma. */
const coordinate = (min: number, max: number, label: string) =>
  z
    .number(`${label} harus berupa angka.`)
    .min(min, `${label} antara ${min} dan ${max}.`)
    .max(max, `${label} antara ${min} dan ${max}.`)
    .refine(
      (value) => Math.abs(value * 1e6 - Math.round(value * 1e6)) < 1e-6,
      "Maksimal 6 angka desimal.",
    )
    .nullable()
    .optional();

// Minimal 1 m (permintaan pemilik projek 2026-10-05, D-049 poin 5).
export const GEOFENCE_RADIUS_MIN = 1;
export const GEOFENCE_RADIUS_MAX = 10_000;

// PLAN §5.4 geofence: angka atau pemilih peta (D-049 poin 5). Latitude, longitude, radius diisi semua atau
// dikosongkan semua (dicek juga oleh API setelah digabung dengan nilai lama pada PATCH).
export const workLocationBaseSchema = z.object({
  name: name(100),
  city: optionalText(100),
  address: optionalText(500),
  latitude: coordinate(-90, 90, "Latitude"),
  longitude: coordinate(-180, 180, "Longitude"),
  radiusM: z
    .number("Radius harus berupa angka.")
    .int("Radius dalam meter bulat.")
    .min(GEOFENCE_RADIUS_MIN, `Radius ${GEOFENCE_RADIUS_MIN}–${GEOFENCE_RADIUS_MAX} m.`)
    .max(GEOFENCE_RADIUS_MAX, `Radius ${GEOFENCE_RADIUS_MIN}–${GEOFENCE_RADIUS_MAX} m.`)
    .nullable()
    .optional(),
});

/** Aturan geofence lengkap-atau-kosong; dipakai form web & API (create, dan PATCH setelah digabung). */
export function geofenceIncomplete(value: {
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  radiusM?: number | null | undefined;
}): boolean {
  const parts = [value.latitude, value.longitude, value.radiusM].map(
    (part) => part !== null && part !== undefined,
  );
  return parts.some(Boolean) && !parts.every(Boolean);
}

export const GEOFENCE_INCOMPLETE_MESSAGE =
  "Isi latitude, longitude, dan radius sekaligus, atau kosongkan ketiganya.";

export const workLocationInputSchema = workLocationBaseSchema.superRefine((value, ctx) => {
  if (geofenceIncomplete(value)) {
    ctx.addIssue({ code: "custom", path: ["latitude"], message: GEOFENCE_INCOMPLETE_MESSAGE });
  }
});
export type WorkLocationInput = z.infer<typeof workLocationInputSchema>;

export const mergeMasterDataInputSchema = z.object({ targetId: z.uuid("Pilih tujuan.") });
export type MergeMasterDataInput = z.infer<typeof mergeMasterDataInputSchema>;
