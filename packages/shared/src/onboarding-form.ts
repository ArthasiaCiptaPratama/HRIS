import { z } from "zod";
import { EDUCATION_LEVELS, educationLevelSchema, genderSchema } from "./employee.ts";

// D-045 bagian b: isian wizard onboarding (design §7). Skema per bagian dipakai API (simpan draf —
// semua field boleh kosong) dan web (form). Kelengkapan untuk KIRIM dicek onboardingCompleteness().

export const RELIGIONS = [
  "ISLAM",
  "PROTESTANT",
  "CATHOLIC",
  "HINDU",
  "BUDDHIST",
  "CONFUCIAN",
  "OTHER",
] as const;
export const religionSchema = z.enum(RELIGIONS);
export type ReligionValue = z.infer<typeof religionSchema>;
export const RELIGION_LABELS: Record<ReligionValue, string> = {
  ISLAM: "Islam",
  PROTESTANT: "Kristen Protestan",
  CATHOLIC: "Katolik",
  HINDU: "Hindu",
  BUDDHIST: "Buddha",
  CONFUCIAN: "Konghucu",
  OTHER: "Lainnya",
};

export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"] as const;
export const maritalStatusSchema = z.enum(MARITAL_STATUSES);
export type MaritalStatusValue = z.infer<typeof maritalStatusSchema>;
export const MARITAL_STATUS_LABELS: Record<MaritalStatusValue, string> = {
  SINGLE: "Belum menikah",
  MARRIED: "Menikah",
  DIVORCED: "Cerai hidup",
  WIDOWED: "Cerai mati",
};

export const FAMILY_RELATIONSHIPS = [
  "SPOUSE",
  "CHILD",
  "FATHER",
  "MOTHER",
  "SIBLING",
  "OTHER",
] as const;
export const familyRelationshipSchema = z.enum(FAMILY_RELATIONSHIPS);
export type FamilyRelationshipValue = z.infer<typeof familyRelationshipSchema>;
export const FAMILY_RELATIONSHIP_LABELS: Record<FamilyRelationshipValue, string> = {
  SPOUSE: "Suami/Istri",
  CHILD: "Anak",
  FATHER: "Ayah",
  MOTHER: "Ibu",
  SIBLING: "Saudara kandung",
  OTHER: "Lainnya",
};

export const DOCUMENT_TYPES = [
  "KTP",
  "KK",
  "DIPLOMA",
  "BANK_BOOK",
  "NPWP",
  "BPJS_EMPLOYMENT",
  "BPJS_HEALTH",
  "CERTIFICATE",
  "CV",
  "OTHER",
] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof documentTypeSchema>;
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  KTP: "KTP",
  KK: "Kartu Keluarga",
  DIPLOMA: "Ijazah terakhir",
  BANK_BOOK: "Buku rekening (halaman depan)",
  NPWP: "Kartu NPWP",
  BPJS_EMPLOYMENT: "Kartu BPJS Ketenagakerjaan",
  BPJS_HEALTH: "Kartu BPJS Kesehatan",
  CERTIFICATE: "Sertifikat",
  CV: "CV",
  OTHER: "Lainnya",
};
/** Dokumen yang selalu wajib (design §7 langkah 6). */
export const REQUIRED_DOCUMENTS: readonly DocumentType[] = ["KTP", "KK", "DIPLOMA", "BANK_BOOK"];
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

// ── Skema per bagian (draf: semua opsional; format tetap divalidasi) ─────────────────────────

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const digits = (length: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .refine(
      (v) => v === "" || new RegExp(`^\\d{${length}}$`).test(v),
      `${label} harus ${length} digit.`,
    )
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.")
  .nullable()
  .optional();
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => v === "" || /^(\+62|62|0)8\d{7,12}$/.test(v), "Nomor HP tidak valid (08…).")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const year = z.number().int().min(1950).max(2100).nullable().optional();

export const personalSectionSchema = z
  .object({
    fullName: text(150),
    gender: genderSchema.nullable().optional(),
    birthPlace: text(100),
    birthDate: isoDate,
    ktpNumber: digits(16, "NIK KTP"),
    kkNumber: digits(16, "Nomor KK"),
    religion: religionSchema.nullable().optional(),
    maritalStatus: maritalStatusSchema.nullable().optional(),
    ktpAddress: text(500),
    domicileAddress: text(500),
    originCity: text(100),
    phoneNumber: phone,
    npwpNumber: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s.-]/g, ""))
      .refine((v) => v === "" || /^\d{15,16}$/.test(v), "NPWP 15 atau 16 digit.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    npwpAbsent: z.boolean().optional(),
    bpjsEmploymentNumber: text(20),
    bpjsEmploymentAbsent: z.boolean().optional(),
    bpjsHealthNumber: text(20),
    bpjsHealthAbsent: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const pairs = [
      ["npwpNumber", "npwpAbsent"],
      ["bpjsEmploymentNumber", "bpjsEmploymentAbsent"],
      ["bpjsHealthNumber", "bpjsHealthAbsent"],
    ] as const;
    for (const [number, absent] of pairs) {
      if (v[number] && v[absent]) {
        ctx.addIssue({
          code: "custom",
          path: [absent],
          message: "Isi nomor ATAU centang 'belum punya', tidak keduanya.",
        });
      }
    }
  });
export type PersonalSection = z.input<typeof personalSectionSchema>;

export const emergencySectionSchema = z.object({
  name: text(150),
  relationship: text(50),
  phone,
});
export type EmergencySection = z.input<typeof emergencySectionSchema>;

export const familyMemberSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(150),
  relationship: familyRelationshipSchema,
  birthDate: isoDate,
  phoneNumber: phone,
});
export const familySectionSchema = z.object({ members: z.array(familyMemberSchema).max(20) });
export type FamilySection = z.input<typeof familySectionSchema>;

export const bankSectionSchema = z.object({
  bankName: text(100),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .refine((v) => v === "" || /^\d{6,20}$/.test(v), "Nomor rekening 6–20 digit.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  accountHolder: text(150),
});
export type BankSection = z.input<typeof bankSectionSchema>;

export const educationEntrySchema = z.object({
  level: educationLevelSchema,
  schoolName: z.string().trim().min(1, "Nama sekolah/kampus wajib diisi.").max(150),
  major: text(100),
  graduationYear: year,
});
export const trainingEntrySchema = z.object({
  trainingField: z.string().trim().min(1, "Bidang pelatihan wajib diisi.").max(150),
  organizer: text(150),
  trainingYear: year,
});
export const workExperienceEntrySchema = z.object({
  companyName: z.string().trim().min(1, "Nama perusahaan wajib diisi.").max(150),
  position: z.string().trim().min(1, "Jabatan wajib diisi.").max(100),
  startYear: z.number().int().min(1950).max(2100),
  endYear: year,
});
export const professionalSectionSchema = z.object({
  educations: z.array(educationEntrySchema).max(10),
  trainings: z.array(trainingEntrySchema).max(30),
  workExperiences: z.array(workExperienceEntrySchema).max(30),
});
export type ProfessionalSection = z.input<typeof professionalSectionSchema>;

export const ONBOARDING_SECTIONS = [
  "personal",
  "emergency",
  "family",
  "bank",
  "professional",
] as const;
export type OnboardingSection = (typeof ONBOARDING_SECTIONS)[number];

// ── Kelengkapan (wajib untuk KIRIM) ────────────────────────────────────────────────────────────

export interface OnboardingSnapshot {
  personal: {
    fullName?: string | null;
    gender?: string | null;
    birthPlace?: string | null;
    birthDate?: string | null;
    ktpNumber?: string | null;
    kkNumber?: string | null;
    religion?: string | null;
    maritalStatus?: MaritalStatusValue | null;
    ktpAddress?: string | null;
    domicileAddress?: string | null;
    originCity?: string | null;
    phoneNumber?: string | null;
    npwpNumber?: string | null;
    npwpAbsent?: boolean;
    bpjsEmploymentNumber?: string | null;
    bpjsEmploymentAbsent?: boolean;
    bpjsHealthNumber?: string | null;
    bpjsHealthAbsent?: boolean;
  };
  emergency: { name?: string | null; relationship?: string | null; phone?: string | null };
  family: { name: string; relationship: FamilyRelationshipValue }[];
  bank: { bankName?: string | null; accountNumber?: string | null; accountHolder?: string | null };
  educations: { level: string; schoolName: string }[];
  documents: DocumentType[];
  hasPhoto: boolean;
}

export interface MissingItem {
  section: OnboardingSection | "documents";
  field: string;
  message: string;
}

const PERSONAL_REQUIRED: [keyof OnboardingSnapshot["personal"], string][] = [
  ["fullName", "Nama lengkap"],
  ["gender", "Jenis kelamin"],
  ["birthPlace", "Tempat lahir"],
  ["birthDate", "Tanggal lahir"],
  ["ktpNumber", "NIK KTP"],
  ["kkNumber", "Nomor KK"],
  ["religion", "Agama"],
  ["maritalStatus", "Status pernikahan"],
  ["ktpAddress", "Alamat KTP"],
  ["domicileAddress", "Alamat domisili"],
  ["originCity", "Kota asal"],
  ["phoneNumber", "No. HP"],
];

export function onboardingCompleteness(s: OnboardingSnapshot): MissingItem[] {
  const missing: MissingItem[] = [];
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  for (const [field, label] of PERSONAL_REQUIRED) {
    if (empty(s.personal[field]))
      missing.push({ section: "personal", field, message: `${label} wajib diisi.` });
  }
  if (!s.hasPhoto)
    missing.push({ section: "personal", field: "photo", message: "Foto profil wajib diunggah." });
  const optionalNumbers = [
    ["npwpNumber", "npwpAbsent", "NPWP"],
    ["bpjsEmploymentNumber", "bpjsEmploymentAbsent", "BPJS Ketenagakerjaan"],
    ["bpjsHealthNumber", "bpjsHealthAbsent", "BPJS Kesehatan"],
  ] as const;
  for (const [number, absent, label] of optionalNumbers) {
    if (empty(s.personal[number]) && !s.personal[absent]) {
      missing.push({
        section: "personal",
        field: number,
        message: `${label}: isi nomor atau centang "belum punya".`,
      });
    }
  }
  if (empty(s.emergency.name))
    missing.push({
      section: "emergency",
      field: "name",
      message: "Nama kontak darurat wajib diisi.",
    });
  if (empty(s.emergency.relationship))
    missing.push({
      section: "emergency",
      field: "relationship",
      message: "Hubungan kontak darurat wajib diisi.",
    });
  if (empty(s.emergency.phone))
    missing.push({
      section: "emergency",
      field: "phone",
      message: "No. HP kontak darurat wajib diisi.",
    });
  if (
    s.personal.maritalStatus === "MARRIED" &&
    !s.family.some((m) => m.relationship === "SPOUSE")
  ) {
    missing.push({
      section: "family",
      field: "spouse",
      message: "Data suami/istri wajib diisi (status menikah).",
    });
  }
  if (empty(s.bank.bankName))
    missing.push({ section: "bank", field: "bankName", message: "Nama bank wajib diisi." });
  if (empty(s.bank.accountNumber))
    missing.push({
      section: "bank",
      field: "accountNumber",
      message: "Nomor rekening wajib diisi.",
    });
  if (empty(s.bank.accountHolder))
    missing.push({
      section: "bank",
      field: "accountHolder",
      message: "Nama pemilik rekening wajib diisi.",
    });
  if (s.educations.length === 0) {
    missing.push({
      section: "professional",
      field: "education",
      message: "Pendidikan terakhir wajib diisi.",
    });
  }
  const docs = new Set(s.documents);
  const required = [...REQUIRED_DOCUMENTS];
  if (!empty(s.personal.npwpNumber)) required.push("NPWP");
  if (!empty(s.personal.bpjsEmploymentNumber)) required.push("BPJS_EMPLOYMENT");
  if (!empty(s.personal.bpjsHealthNumber)) required.push("BPJS_HEALTH");
  for (const type of required) {
    if (!docs.has(type)) {
      missing.push({
        section: "documents",
        field: type,
        message: `${DOCUMENT_TYPE_LABELS[type]} wajib diunggah.`,
      });
    }
  }
  return missing;
}

/** Jenjang pendidikan diurutkan dari tertinggi (untuk tampilan "pendidikan terakhir"). */
export const EDUCATION_RANK = Object.fromEntries(EDUCATION_LEVELS.map((level, i) => [level, i]));
