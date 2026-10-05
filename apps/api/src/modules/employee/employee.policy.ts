import { ROLE } from "@hris/shared";
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
