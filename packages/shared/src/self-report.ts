import { z } from "zod";
import { CLOCK_KINDS, punchLocationSchema } from "./time-management.ts";

// ════════════════════════════════════════════════════════════════════════════════════════════
// TM-D29 — ABSEN MANDIRI (STAGING). Fitur sementara untuk crew berizin (The Intern's).
// Seluruh jejak & cara menghapus: docs/features/time-management/tm-d29-absen-mandiri.md
// Cari penanda `TM-D29` untuk semua titik sentuh. Mematikan cepat: SELF_REPORT_ENABLED = false.
// ════════════════════════════════════════════════════════════════════════════════════════════

/** Saklar server TM-D29. `false` = endpoint absen mandiri menolak (403) & HP menyembunyikan tombolnya. */
export const SELF_REPORT_ENABLED = true;

const isoDate = z.iso.date();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:mm");

/**
 * Absen mandiri: karyawan crew berizin mengisi sendiri jam masuk/pulang untuk tanggal mana pun
 * (lampau maupun mendatang), foto dari galeri, koordinat GPS HP. Tetap butuh persetujuan atasan & HR.
 */
export const selfReportPunchInputSchema = punchLocationSchema.extend({
  workDate: isoDate,
  kind: z.enum(CLOCK_KINDS),
  time: hhmm,
  /** Path foto hasil `POST /attendance/selfie-upload` (diunggah dari galeri). */
  photoPath: z.string().min(10).max(300),
  altitudeM: z.number().min(-500).max(9000).nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});
export type SelfReportPunchInput = z.infer<typeof selfReportPunchInputSchema>;

/** HR/SA mengizinkan / mencabut absen mandiri untuk satu crew. */
export const selfReportCrewInputSchema = z.object({
  crewId: z.uuid(),
  enabled: z.boolean(),
});
export type SelfReportCrewInput = z.infer<typeof selfReportCrewInputSchema>;
