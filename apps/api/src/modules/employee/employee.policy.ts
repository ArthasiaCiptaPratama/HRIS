import { ROLE } from "@hris/shared";
import {
  type Actor,
  type EmployeeTarget,
  hasPermission,
  isInTeam,
  isSelf,
} from "../../core/access/index.ts";

// PROMPT §3.5: keputusan akses murni; default tolak. Data target diberikan pemanggil.
// Sumber: PLAN §4.3 "Karyawan", §4.2 (grant), D-035 (MANAGER hanya membaca tim).

const isAdmin = (actor: Actor) => actor.role === ROLE.SUPER_ADMIN || actor.role === ROLE.HR_ADMIN;

export type EmployeeListScope = "all" | "team";

// Data kerja: SA/HR semua; MANAGER tim (butuh keterhubungan ke data karyawan); EMPLOYEE lewat detail sendiri.
export function employeeListScope(actor: Actor): EmployeeListScope | null {
  if (isAdmin(actor)) return "all";
  if (actor.role === ROLE.MANAGER && actor.employeeId !== null) return "team";
  return null;
}

export function canViewEmployee(actor: Actor, target: EmployeeTarget): boolean {
  if (isAdmin(actor) || isSelf(actor, target)) return true;
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

// Menonaktifkan data karyawan milik sendiri akan ikut mengunci akun sendiri → ditolak.
export function canDeactivateEmployee(actor: Actor, target: EmployeeTarget): boolean {
  return canManageEmployees(actor) && !isSelf(actor, target);
}

// Data sensitif: SA ✅; HR 🔑 semua; MANAGER 🔑 tim; semua orang 👁 milik sendiri.
function canReadSensitive(
  actor: Actor,
  target: EmployeeTarget,
  permission: "employee.personal.read" | "employee.bank.read",
): boolean {
  if (actor.role === ROLE.SUPER_ADMIN || isSelf(actor, target)) return true;
  if (!hasPermission(actor, permission)) return false;
  if (actor.role === ROLE.HR_ADMIN) return true;
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

// D-042 / PLAN §4.3 "Import karyawan (CSV/Excel)": SA ✅ HR ✅.
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
