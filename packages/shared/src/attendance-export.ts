import { z } from "zod";

// TM-D31: ekspor Excel data absen (Detail per crew & Flash 5 kolom). Skema dipakai bersama API & form web.

/** Batas teknis rentang (inklusif) — ukuran respons serverless (Vercel ± 4,5 MB). */
export const ATTENDANCE_EXPORT_MAX_DAYS = 92;
/** Batas teknis jumlah baris data (bukan header/ringkasan) per file. */
export const ATTENDANCE_EXPORT_MAX_ROWS = 20_000;

export const ATTENDANCE_EXPORT_KINDS = ["DETAIL", "FLASH"] as const;
export type AttendanceExportKind = (typeof ATTENDANCE_EXPORT_KINDS)[number];

const DAY_MS = 86_400_000;
const isoDate = z.iso.date();

/** Jumlah hari inklusif dari `from` sampai `to` (YYYY-MM-DD). */
export const attendanceExportDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

const detailSchema = z
  .object({
    kind: z.literal("DETAIL"),
    from: isoDate,
    to: isoDate,
    companyId: z.uuid().optional(),
    /** Tidak diisi = semua crew; bila diisi minimal satu. */
    crewIds: z.array(z.uuid()).min(1).max(200).optional(),
    /** Sheet "Tanpa crew" untuk tanggal tanpa keanggotaan crew (bebas dari pilihan crew). */
    includeNoCrew: z.boolean().optional(),
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
  });
export type AttendanceExportInput = z.infer<typeof attendanceExportInputSchema>;

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
