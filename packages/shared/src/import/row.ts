// D-042: satu baris mentah (field → nilai sel) → baris bertipe + masalah per field (TANPA nilai).
// Dijalankan di web (pratinjau) dan di api (validasi ulang, sumber kebenaran).

import type { EducationLevel, EmploymentCategory, Gender, PtkpStatus } from "../employee.ts";
import { DRIVING_LICENSE_TYPES, type DrivingLicenseType } from "../personal-fields.ts";
import {
  ATTACHMENT_FIELD_KEYS,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_SPECS,
  driveFileIds,
} from "./attachments.ts";
import type { ImportFieldKey } from "./fields.ts";
import { CERTIFICATIONS, EDUCATION_SLOTS, FAMILY_SLOTS } from "./groups.ts";
import {
  cleanText,
  type ImportMaritalStatus,
  type ImportReligion,
  maritalFromPtkp,
  type Normalized,
  parseAccountNumber,
  parseBloodTypeCell,
  parseBpjs,
  parseCompanyCode,
  parseDate,
  parseDrivingLicenseCell,
  parseEducation,
  parseEmail,
  parseEmployeeNumber,
  parseEmploymentStatus,
  parseExitMarker,
  parseGender,
  parseMaritalStatus,
  parseNationality,
  parseNik16,
  parseNpwp,
  parseOptionalText,
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
  /** D-061: nama unit berjenis Divisi (dicocokkan persis di server, tidak disimpan di karyawan). */
  divisionName?: string;
  workLocationName?: string;
  gradeName?: string;
  workEmail?: string;
  /** D-059: email pribadi (unik). */
  personalEmail?: string;
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
    nickname?: string;
    nationality?: string;
    ethnicity?: string;
    bloodType?: string;
    drivingLicenseTypes?: DrivingLicenseType[];
    drivingLicenseNumber?: string;
    /** Nomor per jenis SIM ("A" → nomor). */
    drivingLicenseNumbers?: Partial<Record<DrivingLicenseType, string>>;
    emergencyContactAddress?: string;
    /** D-061: rincian alamat (teks isian Form) & kontak darurat ke-2. */
    domicileVillage?: string;
    domicileDistrict?: string;
    domicileCity?: string;
    domicileProvince?: string;
    ktpVillage?: string;
    ktpDistrict?: string;
    ktpCity?: string;
    ktpProvince?: string;
    emergencyContact2Name?: string;
    emergencyContact2Relationship?: string;
    emergencyContact2Phone?: string;
    emergencyContact2Address?: string;
  };
  /** D-059: anggota keluarga dari Formulir Data Karyawan (sensitif). */
  family?: ImportFamilyMember[];
  /** D-059: riwayat pendidikan 1–3 (Formulir Data Karyawan). */
  educations?: ImportEducation[];
  /** D-059: sertifikasi → Arsip › Pelatihan (bidang = nama sertifikasi). */
  certifications?: ImportCertification[];
  /** D-060: tautan file Google Drive → antrean lampiran (foto profil / dokumen). */
  attachments?: ImportAttachment[];
  bank: { bankName?: string; accountNumber?: string; accountHolder?: string };
  education?: { level: EducationLevel; schoolName: string | null };
  /** Fase 7 (tidak disimpan sekarang): akhir kontrak & nomor offering. */
  contract: { endDate?: string; permanentHint?: boolean; offeringNumber?: string };
}

export interface ImportFamilyMember {
  /** Field asal (kolom nama) — untuk daftar perubahan di pratinjau. */
  source: ImportFieldKey;
  relationship: "SPOUSE" | "CHILD" | "FATHER" | "MOTHER" | "SIBLING";
  name: string;
  gender?: Gender;
  birthPlace?: string;
  birthDate?: string;
  education?: string;
  occupation?: string;
  ageAtEntry?: number;
  workAddress?: string;
  /** D-061: keterangan hubungan saudara (Kakak/Adik). */
  relationDetail?: string;
}
export interface ImportEducation {
  source: ImportFieldKey;
  level?: EducationLevel;
  schoolName?: string;
  entryYear?: number;
  graduationYear?: number;
}
export interface ImportCertification {
  source: ImportFieldKey;
  key: string;
  name: string;
  number?: string;
  year?: number;
}

export interface ImportAttachment {
  source: ImportFieldKey;
  /** "PHOTO" atau kode jenis dokumen. */
  target: string;
  note: string;
  fileIds: string[];
  documentNumber?: string;
  certKey?: string;
}

// Masalah yang hanya peringatan (baris tetap diimpor tanpa field itu).
const WARNING_CODES = new Set([
  "BPJS_NOT_A_NUMBER",
  "UNKNOWN_RELIGION",
  "UNKNOWN_MARITAL_STATUS",
  "UNKNOWN_BLOOD_TYPE",
  "UNKNOWN_DRIVING_LICENSE",
  "FAMILY_NAME_REQUIRED",
  "INVALID_AGE",
  "INVALID_YEAR",
  "ENTRY_AFTER_GRADUATION",
  "UNKNOWN_EDUCATION_LEVEL",
  "INVALID_DRIVE_LINK",
  "TOO_MANY_FILES",
]);

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
  set("divisionName", take("divisionName", parseText(raw.divisionName, 100)));
  set("workLocationName", take("workLocationName", parseText(raw.workLocationName, 100)));
  set("gradeName", take("gradeName", parseText(raw.gradeName, 50)));
  set("workEmail", take("workEmail", parseEmail(raw.workEmail)));
  set("personalEmail", take("personalEmail", parseEmail(raw.personalEmail)));
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
  setP("nickname", take("nickname", parseOptionalText(raw.nickname, 50)));
  setP("nationality", take("nationality", parseNationality(raw.nationality)));
  setP("ethnicity", take("ethnicity", parseOptionalText(raw.ethnicity, 50)));
  setP("bloodType", take("bloodType", parseBloodTypeCell(raw.bloodType)));
  const licenses = parseDrivingLicenseCell(raw.drivingLicenseTypes);
  if (licenses) {
    if (licenses.types.length > 0) p.drivingLicenseTypes = licenses.types;
    if (licenses.unknown)
      issues.push({
        field: "drivingLicenseTypes",
        code: "UNKNOWN_DRIVING_LICENSE",
        severity: "WARNING",
      });
  }
  setP(
    "drivingLicenseNumber",
    take("drivingLicenseNumber", parseOptionalText(raw.drivingLicenseNumber, 30)),
  );

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

  // ── D-059: bagian berulang Formulir Data Karyawan ──────────────────────────────────────────
  const warn = (field: ImportFieldKey, code: string) =>
    issues.push({ field, code, severity: "WARNING" });
  const text = (key: ImportFieldKey, max: number) => take(key, parseOptionalText(raw[key], max));
  const age = (key: ImportFieldKey) => {
    const t = cleanText(raw[key]);
    if (!t) return undefined;
    const n = Number(/^\d{1,3}/.exec(t)?.[0] ?? Number.NaN);
    if (Number.isInteger(n) && n >= 0 && n <= 130) return n;
    warn(key, "INVALID_AGE");
    return undefined;
  };
  const year = (key: ImportFieldKey) => {
    const t = cleanText(raw[key]);
    if (!t) return undefined;
    const n = Number(t);
    if (Number.isInteger(n) && n >= 1940 && n <= 2100) return n;
    warn(key, "INVALID_YEAR");
    return undefined;
  };
  const date = (key: ImportFieldKey) => {
    const r = parseDate(raw[key]);
    if (r && "issue" in r) {
      warn(key, r.issue);
      return undefined;
    }
    return r?.value;
  };
  const family: ImportFamilyMember[] = [];
  const member = (
    relationship: ImportFamilyMember["relationship"],
    keys: Partial<Record<keyof Omit<ImportFamilyMember, "relationship">, ImportFieldKey>>,
  ) => {
    const nameKey = keys.name as ImportFieldKey;
    const name = text(nameKey, 150);
    const entry: Partial<ImportFamilyMember> = {};
    if (keys.gender) {
      const g = cleanText(raw[keys.gender]) ? parseGender(raw[keys.gender]) : undefined;
      if (g && "value" in g) entry.gender = g.value;
    }
    if (keys.birthPlace) entry.birthPlace = text(keys.birthPlace, 100);
    if (keys.birthDate) entry.birthDate = date(keys.birthDate);
    if (keys.education) entry.education = text(keys.education, 50);
    if (keys.occupation) entry.occupation = text(keys.occupation, 100);
    if (keys.ageAtEntry) entry.ageAtEntry = age(keys.ageAtEntry);
    if (keys.workAddress) entry.workAddress = text(keys.workAddress, 500);
    if (keys.relationDetail) entry.relationDetail = text(keys.relationDetail, 30);
    const filled = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));
    if (name) family.push({ source: nameKey, relationship, name, ...filled });
    else if (Object.keys(filled).length > 0) warn(nameKey, "FAMILY_NAME_REQUIRED");
  };
  member("SPOUSE", {
    name: "spouseName",
    occupation: "spouseOccupation",
    workAddress: "spouseWorkAddress",
    birthPlace: "spouseBirthPlace",
    birthDate: "spouseBirthDate",
  });
  for (const n of FAMILY_SLOTS)
    member("CHILD", {
      name: `child${n}Name`,
      gender: `child${n}Gender`,
      birthPlace: `child${n}BirthPlace`,
      birthDate: `child${n}BirthDate`,
      education: `child${n}Education`,
      occupation: `child${n}Occupation`,
    });
  for (const [rel, who] of [
    ["FATHER", "father"],
    ["MOTHER", "mother"],
  ] as const)
    member(rel, {
      name: `${who}Name`,
      ageAtEntry: `${who}Age`,
      education: `${who}Education`,
      occupation: `${who}Occupation`,
    });
  for (const n of FAMILY_SLOTS)
    member("SIBLING", {
      name: `sibling${n}Name`,
      ageAtEntry: `sibling${n}Age`,
      education: `sibling${n}Education`,
      occupation: `sibling${n}Occupation`,
      relationDetail: `sibling${n}Relation`,
    });
  if (family.length > 0) row.family = family;

  const educations: ImportEducation[] = [];
  for (const n of EDUCATION_SLOTS) {
    const entry: ImportEducation = { source: `education${n}Level` };
    const levelText = cleanText(raw[`education${n}Level`]);
    if (levelText) {
      const parsed = parseEducation(levelText);
      if (parsed && "value" in parsed) entry.level = parsed.value.level;
      else warn(`education${n}Level`, "UNKNOWN_EDUCATION_LEVEL");
    }
    const school = text(`education${n}School`, 150);
    if (school) entry.schoolName = school;
    const graduation = year(`education${n}GraduationYear`);
    const entryYear = year(`education${n}EntryYear`);
    if (graduation !== undefined) entry.graduationYear = graduation;
    if (entryYear !== undefined) {
      if (graduation !== undefined && entryYear > graduation)
        warn(`education${n}EntryYear`, "ENTRY_AFTER_GRADUATION");
      else entry.entryYear = entryYear;
    }
    if (entry.level || entry.schoolName) educations.push(entry);
  }
  if (educations.length > 0) row.educations = educations;

  const certifications: ImportCertification[] = [];
  for (const c of CERTIFICATIONS) {
    const number = text(`cert${c.key}Number`, 60);
    const certYear = year(`cert${c.key}Year`);
    // Sertifikasi yang hanya diunggah filenya (tanpa nomor/tahun) tetap tercatat di Pelatihan.
    const file = driveFileIds(raw[`attachCert${c.key}`]).length > 0;
    if (number || certYear !== undefined || file)
      certifications.push({
        source: `cert${c.key}Number`,
        key: c.key,
        name: c.name,
        ...(number ? { number } : {}),
        ...(certYear !== undefined ? { year: certYear } : {}),
      });
  }
  if (certifications.length > 0) row.certifications = certifications;

  const attachments: ImportAttachment[] = [];
  for (const key of ATTACHMENT_FIELD_KEYS) {
    const value = cleanText(raw[key]);
    if (!value) continue;
    const fileIds = driveFileIds(value);
    if (fileIds.length === 0) {
      warn(key, "INVALID_DRIVE_LINK");
      continue;
    }
    if (fileIds.length > ATTACHMENT_MAX_FILES) {
      warn(key, "TOO_MANY_FILES");
      continue;
    }
    const spec = ATTACHMENT_SPECS[key];
    // D-061: file SIM A/C membawa nomor SIM jenisnya sebagai nomor dokumen.
    const simType = { attachSimA: "A", attachSimC: "C" }[key as string];
    const documentNumber = spec.certKey
      ? certifications.find((c) => c.key === spec.certKey)?.number
      : simType
        ? cleanText(raw[`simNumber${simType}` as ImportFieldKey])?.slice(0, 60)
        : undefined;
    attachments.push({
      source: key,
      target: spec.target,
      note: spec.note,
      fileIds,
      ...(documentNumber ? { documentNumber } : {}),
      ...(spec.certKey ? { certKey: spec.certKey } : {}),
    });
  }
  if (attachments.length > 0) row.attachments = attachments;

  setP("emergencyContactAddress", text("emergencyContactAddress", 500));
  for (const prefix of ["domicile", "ktp"] as const)
    for (const attr of ["Village", "District", "City", "Province"] as const)
      setP(`${prefix}${attr}`, text(`${prefix}${attr}`, 100));
  setP("emergencyContact2Name", text("emergency2Name", 150));
  setP("emergencyContact2Relationship", text("emergency2Relationship", 50));
  setP("emergencyContact2Phone", take("emergency2Phone", parsePhone(raw.emergency2Phone)));
  setP("emergencyContact2Address", text("emergency2Address", 500));
  const simNumbers: Partial<Record<DrivingLicenseType, string>> = {};
  for (const type of DRIVING_LICENSE_TYPES) {
    const number = text(`simNumber${type}`, 30);
    if (number) simNumbers[type] = number;
  }
  if (Object.keys(simNumbers).length > 0) {
    p.drivingLicenseNumbers = simNumbers;
    p.drivingLicenseNumber ??= Object.values(simNumbers)[0];
  }

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
  UNKNOWN_BLOOD_TYPE: "Golongan darah tidak dikenali (A/B/AB/O ± rhesus; dilewati)",
  UNKNOWN_DRIVING_LICENSE: "Sebagian jenis SIM tidak dikenali (dilewati)",
  FAMILY_NAME_REQUIRED: "Data anggota keluarga tanpa nama (dilewati)",
  INVALID_AGE: "Usia tidak dikenali (dilewati)",
  INVALID_YEAR: "Tahun tidak dikenali (dilewati)",
  ENTRY_AFTER_GRADUATION: "Tahun masuk setelah tahun lulus (tahun masuk dilewati)",
  UNKNOWN_EDUCATION_LEVEL: "Jenjang pendidikan tidak dikenali (dilewati)",
  INVALID_DRIVE_LINK: "Bukan tautan Google Drive (lampiran dilewati)",
  TOO_MANY_FILES: "Lebih dari 10 file dalam satu kolom (lampiran dilewati)",
  DUPLICATE_PERSONAL_EMAIL_IN_FILE: "Email pribadi ganda di dalam file",
  PERSONAL_EMAIL_TAKEN: "Email pribadi sudah dipakai karyawan lain",
  UNKNOWN_PTKP: "Status PTKP tidak dikenali (TK/0–K/3)",
  UNKNOWN_EMPLOYMENT_STATUS: "Status karyawan tidak dikenali",
  INVALID_COMPANY_CODE: "Kode perusahaan tidak valid",
  INVALID_EMPLOYEE_NUMBER: "NIP hanya huruf, angka, titik, garis miring, tanda hubung",
  INVALID_ACCOUNT_NUMBER: "Nomor rekening harus 6–20 digit",
  BANK_NAME_REQUIRED: "Nama bank wajib bila nomor rekening diisi",
  TOO_LONG: "Terlalu panjang",
  EXIT_DATE_REQUIRED: "Tanggal keluar wajib untuk karyawan resign",
  DUPLICATE_IN_FILE: "NIP ganda di dalam file",
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
  ONBOARDING_IN_PROGRESS:
    "NIP ini milik calon yang sedang onboarding (dikelola di menu Penerimaan Karyawan Baru)",
  SENSITIVE_OWN_ROW: "Data sensitif milik akun Anda sendiri tidak diubah lewat import",
  EXIT_BEFORE_JOIN: "Tanggal keluar sebelum tanggal masuk",
  MANAGER_NOT_FOUND: "Atasan tidak ditemukan",
  DIVISION_UNKNOWN:
    "Divisi tidak ditemukan: harus sama persis dengan unit berjenis Divisi di Struktur Organisasi",
  DIVISION_MISMATCH: "Departemen ini tidak berada di bawah divisi tersebut",
  EXIT_EXISTING_IGNORED:
    "Status keluar karyawan yang sudah ada tidak diubah lewat import (pakai Ubah Status)",
};
