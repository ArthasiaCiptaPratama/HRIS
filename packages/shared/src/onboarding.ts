import { z } from "zod";
import { genderSchema } from "./employee.ts";

// D-045: onboarding karyawan baru — status, nomor induk otomatis, input penerimaan (API & web).

export const ONBOARDING_STATUSES = [
  "NOT_INVITED",
  "INVITED",
  "FILLING",
  "SUBMITTED",
  "REVISION_REQUESTED",
  "APPROVED",
  "CANCELLED",
] as const;
export const onboardingStatusSchema = z.enum(ONBOARDING_STATUSES);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  NOT_INVITED: "Belum diundang",
  INVITED: "Diundang",
  FILLING: "Mengisi data",
  SUBMITTED: "Menunggu review",
  REVISION_REQUESTED: "Perlu revisi",
  APPROVED: "Disetujui",
  CANCELLED: "Dibatalkan",
};

export const ONBOARDING_INVITATION_STATUSES = ["QUEUED", "SENT", "FAILED"] as const;
export const onboardingInvitationStatusSchema = z.enum(ONBOARDING_INVITATION_STATUSES);
export type OnboardingInvitationStatus = z.infer<typeof onboardingInvitationStatusSchema>;

/** Batas baris per penerimaan (design §4.1). */
export const ONBOARDING_MAX_ROWS = 500;

// ── Nomor induk otomatis: DD.MM.KODE-PT.NNN (tanggal & bulan join, urut berjalan per PT) ──────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatEmployeeNumber(joinDate: string, companyCode: string, sequence: number) {
  const match = ISO_DATE.exec(joinDate);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  if (!match || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("Tanggal masuk tidak valid (YYYY-MM-DD).");
  }
  return `${match[3]}.${match[2]}.${companyCode.toUpperCase()}.${String(sequence).padStart(3, "0")}`;
}

/**
 * Urut berikutnya untuk satu PT = angka terbesar di ujung nomor induk karyawan PT itu + 1.
 * Semua pola dihitung (25.11.ACP.023, 2511.ACP.041, ACP-2022-0006) supaya tidak bentrok dengan data lama.
 */
export function nextEmployeeNumberSequence(existing: readonly string[]): number {
  let max = 0;
  for (const number of existing) {
    const tail = /(\d+)\s*$/.exec(number)?.[1];
    if (tail) max = Math.max(max, Number(tail));
  }
  return max + 1;
}

/** Usulan nomor untuk satu batch (urut sesuai baris), melewati nomor yang sudah ada. */
export function suggestEmployeeNumbers(input: {
  existing: readonly string[];
  companyCode: string;
  joinDates: readonly string[];
}): string[] {
  const taken = new Set(input.existing.map((n) => n.toUpperCase()));
  let sequence = nextEmployeeNumberSequence(input.existing);
  return input.joinDates.map((joinDate) => {
    let number = formatEmployeeNumber(joinDate, input.companyCode, sequence);
    while (taken.has(number.toUpperCase())) {
      sequence += 1;
      number = formatEmployeeNumber(joinDate, input.companyCode, sequence);
    }
    taken.add(number.toUpperCase());
    sequence += 1;
    return number;
  });
}

// ── Input penerimaan (API memvalidasi ulang; web memakai bentuk yang sama) ──────────────────────

const isoDate = z.string().regex(ISO_DATE, "Format tanggal YYYY-MM-DD.");
const optionalUuid = z.uuid().nullable().optional();

/** Satu calon yang lolos, lengkap dengan data kerja (D-045 poin 1–3). */
export const onboardingCandidateSchema = z.object({
  sourceRow: z.number().int().min(1),
  fullName: z.string().trim().min(2, "Nama wajib diisi.").max(150),
  personalEmail: z
    .email("Email pribadi tidak valid.")
    .max(254)
    .transform((v) => v.toLowerCase()),
  phoneNumber: z.string().trim().max(30).nullable().optional(),
  gender: genderSchema.nullable().optional(),
  /** Kosong saat pratinjau = minta usulan otomatis. Wajib saat simpan. */
  employeeNumber: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9./-]+$/, "Hanya huruf, angka, titik, garis miring, dan tanda hubung.")
    .optional(),
  companyId: z.uuid("Pilih perusahaan."),
  employmentStatusId: z.uuid("Pilih status kepegawaian."),
  positionId: z.uuid("Pilih jabatan."),
  joinDate: isoDate,
  workLocationId: optionalUuid,
  gradeId: optionalUuid,
  managerId: optionalUuid,
  /** Langkah Konfirmasi Undangan: false = disimpan "Belum diundang". */
  invite: z.boolean().default(true),
});
export type OnboardingCandidateInput = z.input<typeof onboardingCandidateSchema>;
export type OnboardingCandidate = z.output<typeof onboardingCandidateSchema>;

export const onboardingBatchInputSchema = z.object({
  name: z.string().trim().min(1, "Nama penerimaan wajib diisi.").max(150),
  sourceFileName: z.string().trim().max(255).nullable().optional(),
  sourceFileSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional(),
  candidates: z
    .array(onboardingCandidateSchema)
    .min(1, "Pilih minimal satu calon.")
    .max(ONBOARDING_MAX_ROWS),
});
export type OnboardingBatchInput = z.input<typeof onboardingBatchInputSchema>;
