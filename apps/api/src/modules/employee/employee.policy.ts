import { type Permission, ROLE } from "@hris/shared";
import {
  type Actor,
  type EmployeeTarget,
  hasPermission,
  isInCompanyScope,
  isInTeam,
  isSelf,
} from "../../core/access/index.ts";

// PROMPT §3.5: keputusan akses murni; default tolak. Data target diberikan pemanggil.
// Sumber: PLAN §4.3 "Karyawan", §4.2 (grant), D-035 (MANAGER hanya membaca tim), D-040 (cakupan PT).

const isAdmin = (actor: Actor) => actor.role === ROLE.SUPER_ADMIN || actor.role === ROLE.HR_ADMIN;

export type EmployeeListScope = "all" | "companies" | "team";

// Data kerja: SA semua; HR PT yang ditugaskan (D-040); MANAGER tim (butuh keterhubungan ke data
// karyawan); EMPLOYEE lewat detail sendiri.
export function employeeListScope(actor: Actor): EmployeeListScope | null {
  if (actor.role === ROLE.SUPER_ADMIN) return "all";
  if (actor.role === ROLE.HR_ADMIN) return "companies";
  if (actor.role === ROLE.MANAGER && actor.employeeId !== null) return "team";
  return null;
}

export function canViewEmployee(actor: Actor, target: EmployeeTarget): boolean {
  if (actor.role === ROLE.SUPER_ADMIN || isSelf(actor, target)) return true;
  if (actor.role === ROLE.HR_ADMIN) return isInCompanyScope(actor, target);
  // D-040: tim MANAGER berlaku lintas PT (bawahan langsung, D-009).
  return actor.role === ROLE.MANAGER && isInTeam(actor, target);
}

// "Tambah/ubah/nonaktifkan karyawan, tempatkan jabatan, isi manager_id": SA ✅ HR ✅.
export function canManageEmployees(actor: Actor): boolean {
  return isAdmin(actor);
}

// Foto profil (D-037): SA/HR untuk pegawai yang boleh mereka lihat; setiap akun untuk fotonya
// sendiri (PLAN §4.3 "Ubah data diri sendiri: … foto"). MANAGER tidak mengubah foto timnya.
export function canChangePhoto(actor: Actor, target: EmployeeTarget): boolean {
  if (isSelf(actor, target)) return true;
  return canManageEmployees(actor) && canViewEmployee(actor, target);
}

// Unduh formulir data pegawai (.xlsx): operator administrasi saja (SA/HR). Isi sensitif di dalamnya
// tetap mengikuti canReadPersonal — tanpa grant, bagian itu dikosongkan.
export function canPrintEmployee(actor: Actor, target: EmployeeTarget): boolean {
  return canManageEmployees(actor) && canViewEmployee(actor, target);
}

// D-040: membuat karyawan baru hanya di PT dalam cakupan aktor.
export function canCreateInCompany(actor: Actor, companyId: string): boolean {
  return canManageEmployees(actor) && isInCompanyScope(actor, { companyId });
}

// Menonaktifkan data karyawan milik sendiri akan ikut mengunci akun sendiri → ditolak.
export function canDeactivateEmployee(actor: Actor, target: EmployeeTarget): boolean {
  return canManageEmployees(actor) && canViewEmployee(actor, target) && !isSelf(actor, target);
}

// Data sensitif: SA ✅; HR 🔑 semua; MANAGER 🔑 tim; semua orang 👁 milik sendiri.
function canReadSensitive(
  actor: Actor,
  target: EmployeeTarget,
  permission: "employee.personal.read" | "employee.bank.read",
): boolean {
  if (actor.role === ROLE.SUPER_ADMIN || isSelf(actor, target)) return true;
  if (!hasPermission(actor, permission)) return false;
  // D-040: grant HR berlaku di PT yang ditugaskan saja.
  if (actor.role === ROLE.HR_ADMIN) return isInCompanyScope(actor, target);
  return actor.role === ROLE.MANAGER && isInTeam(actor, target);
}

export function canReadPersonal(actor: Actor, target: EmployeeTarget): boolean {
  return canReadSensitive(actor, target, "employee.personal.read");
}

export function canReadBank(actor: Actor, target: EmployeeTarget): boolean {
  return canReadSensitive(actor, target, "employee.bank.read");
}

// Direktori (nama, jabatan, departemen): 👁 untuk semua role.
export function canReadOrgStructure(actor: Actor): boolean {
  return actor.accountId.length > 0;
}

// D-040 + keputusan pemilik projek 2026-09-30: direktori (struktur, pencarian) SA semua PT; HR PT yang
// ditugaskan; MANAGER/EMPLOYEE PT tempat ia terdaftar. `null` = semua.
export function directoryCompanyIds(actor: Actor): ReadonlySet<string> | null {
  if (actor.role === ROLE.SUPER_ADMIN) return null;
  return actor.companyIds ?? new Set();
}

// D-042 / PLAN §4.3 "Import karyawan (CSV/Excel)": SA ✅ HR ✅ (HR hanya ke PT dalam cakupan — dicek
// per baris dengan canCreateInCompany / canViewEmployee).
export function canImportEmployees(actor: Actor): boolean {
  return canManageEmployees(actor);
}

// D-042 poin 5: kolom sensitif lewat import hanya SA atau HR ber-grant `employee.*.write` (§4.2).
export function canWriteSensitiveViaImport(actor: Actor, section: "personal" | "bank"): boolean {
  if (!canImportEmployees(actor)) return false;
  return hasPermission(
    actor,
    section === "personal" ? "employee.personal.write" : "employee.bank.write",
  );
}

// Dashboard agregat kepegawaian (ringkasan seluruh karyawan): SA & HR saja. MANAGER/EMPLOYEE melihat
// dashboard sapaan (ringkasan seluruh karyawan bukan need-to-know mereka, PLAN §4).
export function canViewDashboard(actor: Actor): boolean {
  return canManageEmployees(actor);
}

// D-045 / PLAN §4.3 "Penerimaan karyawan baru": SA semua PT, HR_ADMIN PT yang ditugaskan (D-040),
// tanpa grant (data dari portal belum sensitif; data sensitif diisi calon sendiri, D-046).
export function canRunOnboarding(actor: Actor): boolean {
  return canManageEmployees(actor);
}

export function canOnboardInCompany(actor: Actor, companyId: string): boolean {
  return canCreateInCompany(actor, companyId);
}

// D-047: review & keputusan data onboarding — SUPER_ADMIN; HR_ADMIN hanya dengan grant
// `employee.onboarding.review` dan untuk PT yang ditugaskan (D-040). Termasuk melihat data sensitif calon.
export function canReviewOnboarding(actor: Actor, companyId: string): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return (
    actor.role === ROLE.HR_ADMIN &&
    hasPermission(actor, "employee.onboarding.review") &&
    isInCompanyScope(actor, { companyId })
  );
}

// D-054 (Arsip 1a, design/arsip-karyawan.md §8): tabel lintas karyawan memakai cakupan daftar karyawan
// (SA semua, HR PT ditugaskan, MANAGER tim — kolom kerja saja); EMPLOYEE tidak (data sendiri lewat
// detail/ESS). Kelola item per karyawan: SA/HR atas karyawan yang boleh mereka lihat.
export function canReadArchive(actor: Actor): boolean {
  return employeeListScope(actor) !== null;
}

export function canManageArchive(actor: Actor, target: EmployeeTarget): boolean {
  return canManageEmployees(actor) && canViewEmployee(actor, target);
}

/** Biaya pelatihan: data administrasi SA/HR (bukan need-to-know MANAGER). */
export function canSeeArchiveCost(actor: Actor, target: EmployeeTarget): boolean {
  return canManageArchive(actor, target);
}

// D-055 (Arsip 1b, design §8 "Dokumen"): jenis biasa (sertifikat, ijazah, SK) mengikuti cakupan lihat
// karyawan; jenis sensitif (KTP, KK, rekening, MCU, kontrak, SP, …) butuh grant baca — SA & pemilik
// dokumen selalu boleh. Tulis: SA/HR atas karyawan dalam cakupan; jenis sensitif butuh grant tulis.
export function canReadDocuments(
  actor: Actor,
  target: EmployeeTarget,
  sensitive: boolean,
): boolean {
  if (!canViewEmployee(actor, target)) return false;
  if (!sensitive || actor.role === ROLE.SUPER_ADMIN || isSelf(actor, target)) return true;
  return hasPermission(actor, "employee.documents.read");
}

export function canWriteDocuments(
  actor: Actor,
  target: EmployeeTarget,
  sensitive: boolean,
): boolean {
  if (!canManageArchive(actor, target)) return false;
  return (
    !sensitive ||
    actor.role === ROLE.SUPER_ADMIN ||
    hasPermission(actor, "employee.documents.write")
  );
}

/** Tabel lintas karyawan Data File: jenis sensitif disertakan (cakupan baris tetap per role). */
export function seesAllSensitiveDocuments(actor: Actor): boolean {
  return actor.role === ROLE.SUPER_ADMIN || hasPermission(actor, "employee.documents.read");
}

// Jenis dokumen (master data): kelola SA saja; daftar dibaca semua akun (nama jenis bukan data sensitif).
export function canManageDocumentTypes(actor: Actor): boolean {
  return actor.role === ROLE.SUPER_ADMIN;
}

// D-054 / OD-6 (Arsip 1c, design §8): perubahan data diri lewat pengajuan. Pengaju = pemilik data (role
// apa pun yang terhubung ke data karyawan). Pemeriksa: SA; HR ber-grant `employee.changes.review` di PT
// karyawan + grant lihat & ubah bagian sensitif (pribadi/keluarga → personal, rekening → bank, dokumen
// sensitif → documents). Tidak ada yang memeriksa pengajuannya sendiri.
export type DataChangeSectionKey = "PERSONAL" | "EMERGENCY" | "FAMILY" | "BANK" | "DOCUMENT";

export function canSubmitDataChange(actor: Actor, target: EmployeeTarget): boolean {
  return isSelf(actor, target);
}

export function canViewDataChangeQueue(actor: Actor): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return actor.role === ROLE.HR_ADMIN && hasPermission(actor, "employee.changes.review");
}

const SECTION_GRANTS: Record<DataChangeSectionKey, readonly Permission[]> = {
  PERSONAL: ["employee.personal.read", "employee.personal.write"],
  FAMILY: ["employee.personal.read", "employee.personal.write"],
  BANK: ["employee.bank.read", "employee.bank.write"],
  EMERGENCY: [],
  DOCUMENT: [],
};

export function canReviewDataChange(
  actor: Actor,
  target: EmployeeTarget,
  section: DataChangeSectionKey,
  sensitiveDocument: boolean,
): boolean {
  if (isSelf(actor, target)) return false;
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  if (!canViewDataChangeQueue(actor) || !isInCompanyScope(actor, target)) return false;
  const needed: readonly Permission[] =
    section === "DOCUMENT" && sensitiveDocument
      ? ["employee.documents.read", "employee.documents.write"]
      : SECTION_GRANTS[section];
  return needed.every((permission) => hasPermission(actor, permission));
}

// Arsip › Data Keluarga & Data Bank: daftar lintas karyawan hanya untuk SA atau pemegang grant baca
// (cakupan baris tetap per role); setiap pembacaan diaudit.
export function seesFamilyArchive(actor: Actor): boolean {
  return actor.role === ROLE.SUPER_ADMIN || hasPermission(actor, "employee.personal.read");
}

export function seesBankArchive(actor: Actor): boolean {
  return actor.role === ROLE.SUPER_ADMIN || hasPermission(actor, "employee.bank.read");
}
