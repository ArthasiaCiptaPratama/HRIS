// D-042: satu baris mentah (field → nilai sel) → baris bertipe + masalah per field (TANPA nilai).
// Dijalankan di web (pratinjau) dan di api (validasi ulang, sumber kebenaran).

import type { EducationLevel, EmploymentCategory, Gender, PtkpStatus } from "../employee.ts";
import type { ImportFieldKey } from "./fields.ts";
import {
  type ImportMaritalStatus,
  type ImportReligion,
  maritalFromPtkp,
  type Normalized,
  parseAccountNumber,
  parseBpjs,
  parseCompanyCode,
  parseDate,
  parseEducation,
  parseEmail,
  parseEmployeeNumber,
  parseEmploymentStatus,
  parseExitMarker,
  parseGender,
  parseMaritalStatus,
  parseNik16,
  parseNpwp,
  parsePhone,
  parsePtkp,
  parseReligion,
  parseText,
} from "./normalize.ts";

export type RawImportRow = Partial<Record<ImportFieldKey, unknown>>;

export interface ImportRowIssue {
  field: ImportFieldKey | null;
  code: string;
  severity: "ERROR" | "WARNING";
}

export interface NormalizedImportRow {
  employeeNumber?: string;
  fullName?: string;
  companyCode?: string;
  joinDate?: string;
  category?: EmploymentCategory;
  contractSequence?: number;
  durationMonths?: number;
  positionName?: string;
  departmentName?: string;
  workLocationName?: string;
  gradeName?: string;
  workEmail?: string;
  phoneNumber?: string;
  emergencyPhone?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  gender?: Gender;
  exit?: { reason: "RESIGNATION" | "TERMINATION" | "OTHER"; date?: string };
  personal: {
    birthPlace?: string;
    birthDate?: string;
    originCity?: string;
    ptkpStatus?: PtkpStatus;
    maritalStatus?: ImportMaritalStatus;
    religion?: ImportReligion;
    ktpNumber?: string;
    npwpNumber?: string;
    kkNumber?: string;
    bpjsEmploymentNumber?: string;
    bpjsHealthNumber?: string;
    ktpAddress?: string;
    domicileAddress?: string;
  };
  bank: { bankName?: string; accountNumber?: string; accountHolder?: string };
  education?: { level: EducationLevel; schoolName: string | null };
  /** Fase 7 (tidak disimpan sekarang): akhir kontrak & nomor offering. */
  contract: { endDate?: string; permanentHint?: boolean; offeringNumber?: string };
}

// Masalah yang hanya peringatan (baris tetap diimpor tanpa field itu).
const WARNING_CODES = new Set(["BPJS_NOT_A_NUMBER", "UNKNOWN_RELIGION", "UNKNOWN_MARITAL_STATUS"]);

/**
 * Baris tanpa identitas (nama & nomor induk kosong) = baris sisa formula/format → dilewati diam-diam,
 * bukan error (file kantor punya baris bernomor/berformula tanpa data karyawan).
 */
export function isBlankImportRow(raw: RawImportRow): boolean {
  const empty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  return empty(raw.employeeNumber) && empty(raw.fullName);
}

export function normalizeImportRow(raw: RawImportRow): {
  row: NormalizedImportRow;
  issues: ImportRowIssue[];
} {
  const issues: ImportRowIssue[] = [];
  const take = <T>(field: ImportFieldKey, result: Normalized<T>): T | undefined => {
    if (result === undefined) return undefined;
    if ("issue" in result) {
      issues.push({
        field,
        code: result.issue,
        severity: WARNING_CODES.has(result.issue) ? "WARNING" : "ERROR",
      });
      return undefined;
    }
    return result.value;
  };

  const row: NormalizedImportRow = { personal: {}, bank: {}, contract: {} };
  const set = <K extends keyof NormalizedImportRow>(
    key: K,
    value: NormalizedImportRow[K] | undefined,
  ) => {
    if (value !== undefined) row[key] = value;
  };

  set("employeeNumber", take("employeeNumber", parseEmployeeNumber(raw.employeeNumber)));
  set("fullName", take("fullName", parseText(raw.fullName, 150)));
  set("companyCode", take("companyCode", parseCompanyCode(raw.companyCode)));
  set("joinDate", take("joinDate", parseDate(raw.joinDate)));
  set("positionName", take("positionName", parseText(raw.positionName, 100)));
  set("departmentName", take("departmentName", parseText(raw.departmentName, 100)));
  set("workLocationName", take("workLocationName", parseText(raw.workLocationName, 100)));
  set("gradeName", take("gradeName", parseText(raw.gradeName, 50)));
  set("workEmail", take("workEmail", parseEmail(raw.workEmail)));
  set("phoneNumber", take("phoneNumber", parsePhone(raw.phoneNumber)));
  set("emergencyPhone", take("emergencyPhone", parsePhone(raw.emergencyPhone)));
  set(
    "emergencyContactName",
    take("emergencyContactName", parseText(raw.emergencyContactName, 150)),
  );
  set(
    "emergencyContactRelationship",
    take("emergencyContactRelationship", parseText(raw.emergencyContactRelationship, 50)),
  );
  set("gender", take("gender", parseGender(raw.gender)));

  const status = take("employmentStatusText", parseEmploymentStatus(raw.employmentStatusText));
  // Akhir kontrak berisi teks "Permanent" = petunjuk Karyawan Tetap (file kantor, kolom END OF DATE).
  const endText =
    typeof raw.contractEndDate === "string" ? raw.contractEndDate.trim().toLowerCase() : "";
  if (/permanen|permanent|tetap/.test(endText)) row.contract.permanentHint = true;
  else {
    const end = take("contractEndDate", parseDate(raw.contractEndDate));
    if (end) row.contract.endDate = end;
  }
  if (status) {
    row.category = status.category;
    if (status.contractSequence) row.contractSequence = status.contractSequence;
    if (status.durationMonths) row.durationMonths = status.durationMonths;
  } else if (row.contract.permanentHint) {
    row.category = "PERMANENT";
  }
  const offering = take("offeringNumber", parseText(raw.offeringNumber, 100));
  if (offering) row.contract.offeringNumber = offering;

  const p = row.personal;
  const setP = <K extends keyof NormalizedImportRow["personal"]>(
    key: K,
    value: NormalizedImportRow["personal"][K] | undefined,
  ) => {
    if (value !== undefined) p[key] = value;
  };
  setP("birthPlace", take("birthPlace", parseText(raw.birthPlace, 100)));
  setP("birthDate", take("birthDate", parseDate(raw.birthDate)));
  setP("originCity", take("originCity", parseText(raw.originCity, 100)));
  setP("ptkpStatus", take("ptkpStatus", parsePtkp(raw.ptkpStatus)));
  setP("maritalStatus", take("maritalStatus", parseMaritalStatus(raw.maritalStatus)));
  if (!p.maritalStatus && p.ptkpStatus) p.maritalStatus = maritalFromPtkp(p.ptkpStatus);
  setP("religion", take("religion", parseReligion(raw.religion)));
  setP("ktpNumber", take("ktpNumber", parseNik16(raw.ktpNumber)));
  setP("npwpNumber", take("npwpNumber", parseNpwp(raw.npwpNumber)));
  setP("kkNumber", take("kkNumber", parseNik16(raw.kkNumber)));
  setP("bpjsEmploymentNumber", take("bpjsEmploymentNumber", parseBpjs(raw.bpjsEmploymentNumber)));
  setP("bpjsHealthNumber", take("bpjsHealthNumber", parseBpjs(raw.bpjsHealthNumber)));
  setP("ktpAddress", take("ktpAddress", parseText(raw.ktpAddress, 500)));
  setP("domicileAddress", take("domicileAddress", parseText(raw.domicileAddress, 500)));

  const bankName = take("bankName", parseText(raw.bankName, 100));
  if (bankName) row.bank.bankName = bankName;
  const account = take("bankAccountNumber", parseAccountNumber(raw.bankAccountNumber));
  if (account) row.bank.accountNumber = account;
  const holder = take("bankAccountHolder", parseText(raw.bankAccountHolder, 150));
  if (holder) row.bank.accountHolder = holder;
  if (row.bank.accountNumber && !row.bank.bankName) {
    issues.push({ field: "bankName", code: "BANK_NAME_REQUIRED", severity: "ERROR" });
  }

  const education = take("educationText", parseEducation(raw.educationText));
  if (education) row.education = education;

  const exit = take("exitMarker", parseExitMarker(raw.exitMarker));
  const exitDate = take("exitDate", parseDate(raw.exitDate));
  if (exit) row.exit = exitDate ? { reason: exit, date: exitDate } : { reason: exit };
  else if (exitDate) row.exit = { reason: "RESIGNATION", date: exitDate };

  // Nomor induk = kunci baris, wajib selalu. Nama & data kerja lain wajib hanya untuk karyawan BARU
  // (diperiksa server, butuh data DB): pada UPSERT sel kosong berarti "tidak diubah".
  if (!row.employeeNumber && !issues.some((i) => i.field === "employeeNumber"))
    issues.push({ field: "employeeNumber", code: "REQUIRED", severity: "ERROR" });
  if (row.exit && !row.exit.date)
    issues.push({ field: "exitDate", code: "EXIT_DATE_REQUIRED", severity: "ERROR" });

  return { row, issues };
}

/** Pesan Indonesia untuk kode masalah (dipakai web & laporan baris gagal). */
export const IMPORT_ISSUE_MESSAGES: Record<string, string> = {
  REQUIRED: "Wajib diisi",
  INVALID_DATE: "Tanggal tidak dikenali",
  INVALID_LENGTH_16: "Harus 16 digit",
  INVALID_NPWP: "NPWP harus 15 atau 16 digit",
  BPJS_NOT_A_NUMBER: "Tidak berisi nomor BPJS (dilewati)",
  INVALID_PHONE: "Nomor telepon tidak valid",
  INVALID_EMAIL: "Email tidak valid",
  UNKNOWN_GENDER: "Jenis kelamin tidak dikenali",
  UNKNOWN_RELIGION: "Agama tidak dikenali (dilewati)",
  UNKNOWN_MARITAL_STATUS: "Status pernikahan tidak dikenali (dilewati)",
  UNKNOWN_PTKP: "Status PTKP tidak dikenali (TK/0–K/3)",
  UNKNOWN_EMPLOYMENT_STATUS: "Status karyawan tidak dikenali",
  INVALID_COMPANY_CODE: "Kode perusahaan tidak valid",
  INVALID_EMPLOYEE_NUMBER: "Nomor induk hanya huruf, angka, titik, garis miring, tanda hubung",
  INVALID_ACCOUNT_NUMBER: "Nomor rekening harus 6–20 digit",
  BANK_NAME_REQUIRED: "Nama bank wajib bila nomor rekening diisi",
  TOO_LONG: "Terlalu panjang",
  EXIT_DATE_REQUIRED: "Tanggal keluar wajib untuk karyawan resign",
  DUPLICATE_IN_FILE: "Nomor induk ganda di dalam file",
  DUPLICATE_KTP_IN_FILE: "NIK KTP ganda di dalam file",
  DUPLICATE_EMAIL_IN_FILE: "Email ganda di dalam file",
  EXISTS_SKIPPED: "Sudah ada di sistem (mode tambah saja: dilewati)",
  COMPANY_REQUIRED: "Perusahaan belum ditentukan",
  COMPANY_UNKNOWN: "Kode perusahaan tidak terdaftar",
  COMPANY_OUT_OF_SCOPE: "Perusahaan di luar cakupan akun Anda",
  CATEGORY_REQUIRED: "Status karyawan wajib untuk karyawan baru",
  STATUS_NOT_CONFIGURED: "Belum ada status kepegawaian untuk kategori ini",
  JOIN_DATE_REQUIRED: "Tanggal masuk wajib untuk karyawan baru",
  POSITION_REQUIRED: "Jabatan & departemen wajib untuk karyawan baru",
  MASTER_ARCHIVED:
    "Master data ini diarsipkan: pulihkan di Administrasi › Master Data atau petakan ke yang lain",
  KTP_TAKEN: "NIK KTP sudah dipakai karyawan lain",
  EMAIL_TAKEN: "Email sudah dipakai karyawan lain",
  EXISTING_OUT_OF_SCOPE: "Karyawan ini ada di perusahaan di luar cakupan akun Anda",
  SENSITIVE_OWN_ROW: "Data sensitif milik akun Anda sendiri tidak diubah lewat import",
  EXIT_BEFORE_JOIN: "Tanggal keluar sebelum tanggal masuk",
  MANAGER_NOT_FOUND: "Atasan tidak ditemukan",
  EXIT_EXISTING_IGNORED:
    "Status keluar karyawan yang sudah ada tidak diubah lewat import (pakai Ubah Status)",
};
