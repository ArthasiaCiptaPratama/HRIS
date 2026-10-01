import { z } from "zod";

// D-035/D-038: kategori navigasi "Data Karyawan Aktif". Nilai sama dengan enum Prisma `EmploymentCategory`.
export const EMPLOYMENT_CATEGORIES = [
  "PERMANENT",
  "PROBATION",
  "PKWT",
  "DAILY_WORKER",
  "INTERNSHIP",
  "OUTSOURCING",
  "VENDOR",
] as const;
export const employmentCategorySchema = z.enum(EMPLOYMENT_CATEGORIES);
export type EmploymentCategory = z.infer<typeof employmentCategorySchema>;

export const EMPLOYMENT_CATEGORY_LABELS: Record<EmploymentCategory, string> = {
  PERMANENT: "Karyawan Tetap",
  PROBATION: "Karyawan Percobaan",
  PKWT: "PKWT",
  DAILY_WORKER: "Pekerja Harian",
  INTERNSHIP: "Magang",
  OUTSOURCING: "Outsourcing",
  VENDOR: "Vendor",
};

// D-038: kelompok kategori di sidebar & filter `?group=` (satu sumber untuk API dan web).
export const EMPLOYMENT_CATEGORY_GROUPS = ["INTERNAL", "INTERNSHIP", "EXTERNAL"] as const;
export const employmentCategoryGroupSchema = z.enum(EMPLOYMENT_CATEGORY_GROUPS);
export type EmploymentCategoryGroup = z.infer<typeof employmentCategoryGroupSchema>;

export const CATEGORIES_BY_GROUP: Record<EmploymentCategoryGroup, readonly EmploymentCategory[]> = {
  INTERNAL: ["PERMANENT", "PROBATION", "PKWT", "DAILY_WORKER"],
  INTERNSHIP: ["INTERNSHIP"],
  EXTERNAL: ["OUTSOURCING", "VENDOR"],
};

export const EMPLOYMENT_CATEGORY_GROUP_LABELS: Record<EmploymentCategoryGroup, string> = {
  INTERNAL: "Karyawan Internal",
  INTERNSHIP: "Program Magang",
  EXTERNAL: "Tenaga Kerja Eksternal",
};

// D-035: alasan pegawai dinonaktifkan. Nilai sama dengan enum Prisma `EmployeeExitReason`.
export const EXIT_REASONS = [
  "RESIGNATION",
  "TERMINATION",
  "CONTRACT_ENDED",
  "RETIREMENT",
  "DECEASED",
  "OTHER",
] as const;
export const exitReasonSchema = z.enum(EXIT_REASONS);
export type ExitReason = z.infer<typeof exitReasonSchema>;

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  RESIGNATION: "Mengundurkan diri",
  TERMINATION: "PHK",
  CONTRACT_ENDED: "Kontrak berakhir",
  RETIREMENT: "Pensiun",
  DECEASED: "Meninggal dunia",
  OTHER: "Lainnya",
};

export const EMPLOYMENT_CHANGE_TYPES = [
  "HIRED",
  "STATUS_CHANGED",
  "POSITION_CHANGED",
  "DEACTIVATED",
  "REACTIVATED",
  "COMPANY_CHANGED",
] as const;
export const employmentChangeTypeSchema = z.enum(EMPLOYMENT_CHANGE_TYPES);
export type EmploymentChangeType = z.infer<typeof employmentChangeTypeSchema>;

export const EMPLOYMENT_CHANGE_LABELS: Record<EmploymentChangeType, string> = {
  HIRED: "Mulai bekerja",
  STATUS_CHANGED: "Ubah status kepegawaian",
  POSITION_CHANGED: "Ubah jabatan",
  DEACTIVATED: "Dinonaktifkan",
  REACTIVATED: "Diaktifkan kembali",
  COMPANY_CHANGED: "Pindah perusahaan",
};

export const GENDERS = ["MALE", "FEMALE"] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;
export const GENDER_LABELS: Record<Gender, string> = { MALE: "Laki-laki", FEMALE: "Perempuan" };

export const EMPLOYEE_SORT_FIELDS = ["fullName", "employeeNumber", "joinDate", "endDate"] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

// D-041: status PTKP. Nilai sama dengan enum Prisma `PtkpStatus` (TK0 = "TK/0").
export const PTKP_STATUSES = ["TK0", "TK1", "TK2", "TK3", "K0", "K1", "K2", "K3"] as const;
export const ptkpStatusSchema = z.enum(PTKP_STATUSES);
export type PtkpStatus = z.infer<typeof ptkpStatusSchema>;
export const PTKP_LABELS: Record<PtkpStatus, string> = {
  TK0: "TK/0",
  TK1: "TK/1",
  TK2: "TK/2",
  TK3: "TK/3",
  K0: "K/0",
  K1: "K/1",
  K2: "K/2",
  K3: "K/3",
};

// D-041: jenjang pendidikan. Nilai sama dengan enum Prisma `EducationLevel`.
export const EDUCATION_LEVELS = [
  "SD",
  "SMP",
  "SMA",
  "D1",
  "D2",
  "D3",
  "D4",
  "S1",
  "S2",
  "S3",
  "OTHER",
] as const;
export const educationLevelSchema = z.enum(EDUCATION_LEVELS);
export type EducationLevel = z.infer<typeof educationLevelSchema>;
export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  SD: "SD",
  SMP: "SMP",
  SMA: "SMA/SMK",
  D1: "D1",
  D2: "D2",
  D3: "D3",
  D4: "D4",
  S1: "S1",
  S2: "S2",
  S3: "S3",
  OTHER: "Lainnya",
};
