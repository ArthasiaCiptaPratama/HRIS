import { isPermissionGrantableTo, type Permission, ROLE, type Role } from "@hris/shared";

// Konteks akses per request (PLAN §4, D-008: dimuat dari DB setiap request, bukan dari JWT).
export interface Actor {
  accountId: string;
  authUserId: string;
  email: string;
  role: Role;
  /** Null bila akun tidak terhubung ke data karyawan (hak layanan diri tidak ada, PLAN §4.1). */
  employeeId: string | null;
  isPrimarySuperAdmin: boolean;
  /** Grant aktif saja (belum dicabut, belum kedaluwarsa). */
  grants: ReadonlySet<Permission>;
  /**
   * D-040: cakupan perusahaan. `null` = semua PT (SUPER_ADMIN). HR_ADMIN = PT yang ditugaskan;
   * MANAGER/EMPLOYEE = PT tempat ia terdaftar (dipakai untuk direktori). Set kosong = tidak ada.
   */
  companyIds: ReadonlySet<string> | null;
}

export function hasRole(actor: Actor, roles: readonly Role[]): boolean {
  return roles.includes(actor.role);
}

// PLAN §4.2: SUPER_ADMIN punya semua izin; role lain hanya lewat grant yang boleh diberikan ke role-nya.
export function hasPermission(actor: Actor, permission: Permission): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return actor.grants.has(permission) && isPermissionGrantableTo(permission, actor.role);
}

export interface GrantValidity {
  expiresAt: Date | null;
  revokedAt: Date | null;
}

// PLAN §4.2: grant mati otomatis setelah lewat & bisa dicabut kapan saja.
export function isGrantActive(grant: GrantValidity, now: Date): boolean {
  if (grant.revokedAt !== null) return false;
  return grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime();
}

/** Data minimum karyawan target untuk keputusan akses; diberikan pemanggil (policy tidak query DB). */
export interface EmployeeTarget {
  employeeId: string;
  managerId: string | null;
  /** D-039: perusahaan tempat karyawan target terdaftar. */
  companyId: string;
}

// PLAN §4.3 "sendiri": hanya akun yang terhubung ke data karyawan itu.
export function isSelf(actor: Actor, target: EmployeeTarget): boolean {
  return actor.employeeId !== null && actor.employeeId === target.employeeId;
}

// PLAN §4.1 / D-009: tim = bawahan langsung (manager_id target = employee aktor), satu tingkat.
export function isInTeam(actor: Actor, target: EmployeeTarget): boolean {
  return actor.employeeId !== null && target.managerId === actor.employeeId;
}

// D-040: karyawan target berada di perusahaan dalam cakupan aktor (SUPER_ADMIN: semua).
export function isInCompanyScope(actor: Actor, target: Pick<EmployeeTarget, "companyId">): boolean {
  return actor.companyIds === null || actor.companyIds.has(target.companyId);
}
