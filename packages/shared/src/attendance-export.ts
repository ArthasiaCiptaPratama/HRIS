import { z } from "zod";

// TM-D31: ekspor Excel data absen (Detail per crew & Flash 7 kolom). Skema dipakai bersama API & form web.
// TM-D34: Detail — mode karyawan (crew / karyawan tertentu / filter halaman), kelompok kolom, filter baris.

/** Batas teknis rentang (inklusif) — ukuran respons serverless (Vercel ± 4,5 MB). */
export const ATTENDANCE_EXPORT_MAX_DAYS = 92;
/** Batas teknis jumlah baris data (bukan header/ringkasan) per file. */
export const ATTENDANCE_EXPORT_MAX_ROWS = 20_000;
/**
 * TM-D34: batas teknis ukuran isi file (panjang base64) di respons — di bawah batas respons serverless
 * (Vercel ± 4,5 MB). Melewati batas → 422 (kolom Alasan teks bebas bisa membuat file besar).
 */
export const ATTENDANCE_EXPORT_MAX_BASE64_BYTES = 4 * 1024 * 1024;
export const ATTENDANCE_EXPORT_TOO_LARGE =
  "File terlalu besar untuk diunduh. Persempit rentang tanggal, kurangi karyawan, atau matikan kolom Alasan.";

export const ATTENDANCE_EXPORT_KINDS = ["DETAIL", "FLASH"] as const;
export type AttendanceExportKind = (typeof ATTENDANCE_EXPORT_KINDS)[number];

const DAY_MS = 86_400_000;
const isoDate = z.iso.date();

/** Jumlah hari inklusif dari `from` sampai `to` (YYYY-MM-DD). */
export const attendanceExportDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

// ── TM-D34: Detail — pilih karyawan, kelompok kolom & filter baris ─────────────

/** Batas jumlah karyawan pada mode "Pilih karyawan tertentu" (sama dengan batas pemilih di web). */
export const ATTENDANCE_EXPORT_MAX_EMPLOYEES = 500;

/**
 * Mode pemilihan karyawan Detail — diturunkan dari body (tidak dikirim):
 * `CREW` = sesuai crew (`crewIds`/`includeNoCrew`, bawaan); `EMPLOYEES` = `employeeIds`; `PAGE_FILTER` = `q`.
 */
export const ATTENDANCE_EXPORT_EMPLOYEE_MODES = ["CREW", "EMPLOYEES", "PAGE_FILTER"] as const;
export type AttendanceExportEmployeeMode = (typeof ATTENDANCE_EXPORT_EMPLOYEE_MODES)[number];

/** Kolom Identitas (selalu ada, tidak bisa dimatikan). Jabatan & Divisi = penempatan SAAT INI. */
export const ATTENDANCE_EXPORT_IDENTITY_COLUMNS = [
  "NIP",
  "Nama",
  "Jabatan",
  "Divisi",
  "Crew",
  "Tanggal",
  "Hari",
] as const;

export const ATTENDANCE_EXPORT_COLUMN_GROUPS = [
  "SCHEDULE",
  "CLOCK",
  "LOCATION",
  "LABEL",
  "SUMMARY",
  "REASON",
  "BREAK",
  "APPROVAL",
  "LATE_EARLY",
] as const;
export type AttendanceExportColumnGroup = (typeof ATTENDANCE_EXPORT_COLUMN_GROUPS)[number];

/** Bawaan = kolom Detail sebelum TM-D34 (+ Identitas). */
export const ATTENDANCE_EXPORT_DEFAULT_COLUMN_GROUPS: readonly AttendanceExportColumnGroup[] = [
  "SCHEDULE",
  "CLOCK",
  "LOCATION",
  "LABEL",
  "SUMMARY",
];

/** Label & kolom per kelompok (teks dialog web). `SUMMARY` = lembar Ringkasan, bukan kolom. */
export const ATTENDANCE_EXPORT_COLUMN_GROUP_INFO: Record<
  AttendanceExportColumnGroup,
  { label: string; columns: readonly string[] }
> = {
  SCHEDULE: { label: "Jadwal", columns: ["Shift", "Jadwal Masuk", "Jadwal Pulang"] },
  CLOCK: { label: "Clock In & Clock Out", columns: ["Clock In", "Clock Out", "Status"] },
  LOCATION: {
    label: "Lokasi & peta",
    columns: ["Lokasi Clock In", "Peta In", "Lokasi Clock Out", "Peta Out"],
  },
  LABEL: { label: "Label", columns: ["Label"] },
  SUMMARY: { label: "Lembar Ringkasan", columns: [] },
  REASON: { label: "Alasan", columns: ["Alasan"] },
  BREAK: { label: "Istirahat", columns: ["Mulai istirahat", "Selesai istirahat"] },
  APPROVAL: { label: "Persetujuan", columns: ["Persetujuan Clock In", "Persetujuan Clock Out"] },
  LATE_EARLY: { label: "Telat & pulang cepat", columns: ["Telat (menit)", "Pulang cepat (menit)"] },
};

/**
 * Kelompok status baris Detail (filter baris). `PENDING` = belum absen pulang + menunggu persetujuan;
 * `OFF` = OFF + Time off; `NO_RECORD` = hari kerja roster tanpa catatan absen (termasuk belum absen hari ini
 * dan jadwal mendatang).
 */
export const ATTENDANCE_EXPORT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "ALPHA",
  "LEAVE",
  "OFF",
  "NO_RECORD",
] as const;
export type AttendanceExportStatus = (typeof ATTENDANCE_EXPORT_STATUSES)[number];

export const ATTENDANCE_EXPORT_STATUS_LABELS: Record<AttendanceExportStatus, string> = {
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  ALPHA: "Alpha",
  LEAVE: "Cuti/izin/sakit",
  OFF: "OFF/Time off",
  NO_RECORD: "Tanpa absen",
};

export const ATTENDANCE_EXPORT_STATUS_DESCRIPTIONS: Partial<
  Record<AttendanceExportStatus, string>
> = {
  PENDING: "Termasuk yang belum absen pulang.",
  NO_RECORD: "Hari kerja tanpa catatan absen, termasuk belum absen hari ini dan jadwal mendatang.",
};

const detailSchema = z
  .object({
    kind: z.literal("DETAIL"),
    from: isoDate,
    to: isoDate,
    companyId: z.uuid().optional(),
    /** Mode CREW. Tidak diisi = semua crew; bila diisi minimal satu. */
    crewIds: z.array(z.uuid()).min(1).max(200).optional(),
    /** Mode CREW: sheet "Tanpa crew" untuk tanggal tanpa keanggotaan crew (bebas dari pilihan crew). */
    includeNoCrew: z.boolean().optional(),
    /** Mode EMPLOYEES: karyawan tertentu (di luar cakupan / tak dikenal → 422). */
    employeeIds: z.array(z.uuid()).min(1).max(ATTENDANCE_EXPORT_MAX_EMPLOYEES).optional(),
    /**
     * Mode PAGE_FILTER: cari nama / NIK seperti Data Absen Harian. String kosong = halaman tanpa pencarian
     * (semua karyawan dalam cakupan, termasuk tanpa crew).
     */
    q: z.string().trim().max(100).optional(),
    /** Tidak diisi = `ATTENDANCE_EXPORT_DEFAULT_COLUMN_GROUPS`; Identitas selalu ada. */
    columnGroups: z
      .array(z.enum(ATTENDANCE_EXPORT_COLUMN_GROUPS))
      .max(ATTENDANCE_EXPORT_COLUMN_GROUPS.length)
      .optional(),
    /** Tidak diisi = semua status. */
    statuses: z
      .array(z.enum(ATTENDANCE_EXPORT_STATUSES))
      .min(1)
      .max(ATTENDANCE_EXPORT_STATUSES.length)
      .optional(),
    /** Hanya baris yang sel Label-nya tidak kosong. */
    labeledOnly: z.boolean().optional(),
  })
  .strict();

const flashSchema = z
  .object({
    kind: z.literal("FLASH"),
    from: isoDate,
    to: isoDate,
    companyId: z.uuid().optional(),
  })
  .strict();

export const attendanceExportInputSchema = z
  .discriminatedUnion("kind", [detailSchema, flashSchema])
  .superRefine((input, ctx) => {
    if (input.from > input.to) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Tanggal akhir tidak boleh sebelum tanggal awal.",
      });
      return;
    }
    if (attendanceExportDays(input.from, input.to) > ATTENDANCE_EXPORT_MAX_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Rentang maksimal ${ATTENDANCE_EXPORT_MAX_DAYS} hari.`,
      });
    }
    if (input.kind !== "DETAIL") return;
    // Mode karyawan eksklusif: crew (bawaan) ATAU karyawan tertentu ATAU filter halaman.
    if (input.employeeIds !== undefined && input.q !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["q"],
        message: "Pilih salah satu: karyawan tertentu atau filter halaman.",
      });
    }
    if (input.employeeIds !== undefined || input.q !== undefined) {
      for (const key of ["crewIds", "includeNoCrew"] as const) {
        if (input[key] !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Pilihan crew hanya untuk mode Sesuai crew.",
          });
        }
      }
    }
  });
export type AttendanceExportInput = z.infer<typeof attendanceExportInputSchema>;

/** TM-D34: mode karyawan Detail dari body. */
export function attendanceExportEmployeeMode(
  input: Pick<Extract<AttendanceExportInput, { kind: "DETAIL" }>, "employeeIds" | "q">,
): AttendanceExportEmployeeMode {
  if (input.employeeIds !== undefined) return "EMPLOYEES";
  if (input.q !== undefined) return "PAGE_FILTER";
  return "CREW";
}

export const attendanceExportFileName = (
  input: Pick<AttendanceExportInput, "kind" | "from" | "to">,
) => `absensi-${input.kind === "FLASH" ? "flash-" : ""}${input.from}_${input.to}.xlsx`;

/**
 * Jam "HH:mm" di zona Time Management (`offsetMin` = selisih menit dari UTC). Bila tanggal lokal jam itu
 * berbeda dari tanggal kerja, diberi akhiran " (+1)" (atau "+2", "-1", …), mis. Clock Out shift malam.
 */
export function formatClockTime(at: Date, workDate: string, offsetMin: number): string {
  const local = new Date(at.getTime() + offsetMin * 60_000);
  const hhmm = local.toISOString().slice(11, 16);
  const diff = Math.round(
    (Date.parse(`${local.toISOString().slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${workDate}T00:00:00Z`)) /
      DAY_MS,
  );
  if (diff === 0) return hhmm;
  return `${hhmm} (${diff > 0 ? "+" : ""}${diff})`;
}

/** Tautan peta untuk sel "Peta" (server tidak memanggil Google; hanya menyusun URL). */
export const googleMapsUrl = (latitude: number, longitude: number) =>
  `https://www.google.com/maps?q=${latitude},${longitude}`;
