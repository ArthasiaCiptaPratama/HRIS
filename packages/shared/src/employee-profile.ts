import { z } from "zod";
import { educationLevelSchema, genderSchema, ptkpStatusSchema } from "./employee.ts";
import {
  familyRelationshipSchema,
  maritalStatusSchema,
  religionSchema,
} from "./onboarding-form.ts";
import { BLOOD_TYPE_PATTERN, drivingLicenseTypeSchema } from "./personal-fields.ts";

// EMP-D2: data profil lengkap saat HR menambah karyawan manual (form bertahap mengikuti urutan Google
// Form "Formulir Data Karyawan", D-059/D-061). Semua opsional; disimpan bersama data kerja dalam satu
// transaksi. Bagian pribadi/keluarga butuh grant employee.personal.write, rekening employee.bank.write.

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const required = (max: number, message: string) => z.string().trim().min(1, message).max(max);
const digits = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .refine((v) => v === "" || pattern.test(v), message)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const isoDate = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Format tanggal YYYY-MM-DD.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const phone = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\+?[0-9 ()-]{6,30}$/.test(v), "Nomor telepon tidak valid.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const year = z.number().int().min(1950, "Tahun tidak valid.").max(2100).nullable().optional();

export const profilePersonalInputSchema = z.object({
  nickname: text(50),
  /** D-041: kota asal & status PTKP (pajak). */
  originCity: text(100),
  ptkpStatus: ptkpStatusSchema.nullable().optional(),
  birthPlace: text(100),
  birthDate: isoDate,
  religion: religionSchema.nullable().optional(),
  maritalStatus: maritalStatusSchema.nullable().optional(),
  nationality: text(50),
  ethnicity: text(50),
  bloodType: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || BLOOD_TYPE_PATTERN.test(v), "Golongan darah: A, B, AB, atau O.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  personalEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email tidak valid.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  ktpNumber: digits(/^\d{16}$/, "NIK KTP harus 16 digit."),
  kkNumber: digits(/^\d{16}$/, "Nomor KK harus 16 digit."),
  npwpNumber: digits(/^\d{15,16}$/, "NPWP 15 atau 16 digit."),
  bpjsEmploymentNumber: text(20),
  bpjsHealthNumber: text(20),
  domicileAddress: text(500),
  domicileVillage: text(100),
  domicileDistrict: text(100),
  domicileCity: text(100),
  domicileProvince: text(100),
  ktpAddress: text(500),
  ktpVillage: text(100),
  ktpDistrict: text(100),
  ktpCity: text(100),
  ktpProvince: text(100),
  /** Nomor per jenis SIM; jenis tanpa nomor tetap dicatat sebagai jenis yang dimiliki. */
  drivingLicenses: z
    .array(z.object({ type: drivingLicenseTypeSchema, number: text(30) }))
    .max(11)
    .default([]),
  emergencyContactAddress: text(500),
  emergencyContact2Name: text(150),
  emergencyContact2Relationship: text(50),
  emergencyContact2Phone: phone,
  emergencyContact2Address: text(500),
});

export const profileFamilyInputSchema = z.object({
  relationship: familyRelationshipSchema,
  name: required(150, "Nama anggota keluarga wajib diisi."),
  gender: genderSchema.nullable().optional(),
  birthPlace: text(100),
  birthDate: isoDate,
  education: text(50),
  occupation: text(100),
  workAddress: text(500),
  /** Saudara: Kakak/Adik. */
  relationDetail: text(30),
  ageAtEntry: z.number().int().min(0).max(130).nullable().optional(),
  isDeceased: z.boolean().default(false),
  phoneNumber: phone,
  address: text(500),
});

export const profileEducationInputSchema = z.object({
  level: educationLevelSchema.nullable().optional(),
  schoolName: required(150, "Nama sekolah/kampus wajib diisi."),
  major: text(100),
  entryYear: year,
  graduationYear: year,
});

export const profileCertificationInputSchema = z.object({
  name: required(150, "Jenis sertifikasi wajib diisi."),
  number: text(60),
  year,
});

export const profileBankInputSchema = z.object({
  bankName: required(100, "Nama bank wajib diisi."),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .refine((v) => /^\d{6,20}$/.test(v), "Nomor rekening 6–20 digit."),
  accountHolder: text(150),
});

export const employeeProfileInputSchema = z.object({
  personal: profilePersonalInputSchema.nullable().optional(),
  family: z.array(profileFamilyInputSchema).max(30, "Maksimal 30 anggota keluarga.").default([]),
  educations: z.array(profileEducationInputSchema).max(10, "Maksimal 10 pendidikan.").default([]),
  certifications: z
    .array(profileCertificationInputSchema)
    .max(30, "Maksimal 30 sertifikasi.")
    .default([]),
  bank: profileBankInputSchema.nullable().optional(),
});
export type EmployeeProfileInput = z.input<typeof employeeProfileInputSchema>;
export type EmployeeProfile = z.output<typeof employeeProfileInputSchema>;

/**
 * EMP-D4: HR ber-grant mengubah data sensitif karyawan langsung dari detail. Bagian yang dikirim
 * diganti utuh: `personal` (semua kolom pribadi + email pribadi), `family` (daftar lengkap pengganti),
 * `bank` (rekening). Bagian yang tidak dikirim tidak berubah.
 */
export const employeeProfileUpdateSchema = z
  .object({
    personal: profilePersonalInputSchema.optional(),
    family: z.array(profileFamilyInputSchema).max(30, "Maksimal 30 anggota keluarga.").optional(),
    bank: profileBankInputSchema.optional(),
  })
  .refine(
    (v) => v.personal !== undefined || v.family !== undefined || v.bank !== undefined,
    "Tidak ada perubahan yang dikirim.",
  );
export type EmployeeProfileUpdateInput = z.input<typeof employeeProfileUpdateSchema>;
export type EmployeeProfileUpdate = z.output<typeof employeeProfileUpdateSchema>;
