import { z } from "zod";

// D-035: kategori navigasi "Data Pegawai Aktif". Nilai sama dengan enum Prisma `EmploymentCategory`.
export const EMPLOYMENT_CATEGORIES = [
  "PERMANENT",
  "PKWT",
  "INTERNSHIP",
  "DAILY_WORKER",
  "OUTSOURCING",
] as const;
export const employmentCategorySchema = z.enum(EMPLOYMENT_CATEGORIES);
export type EmploymentCategory = z.infer<typeof employmentCategorySchema>;

export const EMPLOYMENT_CATEGORY_LABELS: Record<EmploymentCategory, string> = {
  PERMANENT: "Pegawai Tetap",
  PKWT: "PKWT",
  INTERNSHIP: "Internship",
  DAILY_WORKER: "Daily Worker",
  OUTSOURCING: "Outsourcing",
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
] as const;
export const employmentChangeTypeSchema = z.enum(EMPLOYMENT_CHANGE_TYPES);
export type EmploymentChangeType = z.infer<typeof employmentChangeTypeSchema>;

export const EMPLOYMENT_CHANGE_LABELS: Record<EmploymentChangeType, string> = {
  HIRED: "Mulai bekerja",
  STATUS_CHANGED: "Ubah status kepegawaian",
  POSITION_CHANGED: "Ubah jabatan",
  DEACTIVATED: "Dinonaktifkan",
  REACTIVATED: "Diaktifkan kembali",
};

export const GENDERS = ["MALE", "FEMALE"] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;
export const GENDER_LABELS: Record<Gender, string> = { MALE: "Laki-laki", FEMALE: "Perempuan" };

export const EMPLOYEE_SORT_FIELDS = ["fullName", "employeeNumber", "joinDate", "endDate"] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];
