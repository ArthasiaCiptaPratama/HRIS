import { isPermissionGrantableTo, type Permission, ROLE, type Role } from "@hris/shared";

// Konteks akses per request (PLAN §4, D-008: dimuat dari DB setiap request, bukan dari JWT).
export interface OnboardingState {
  status: string;
  completionRequired: boolean;
  submitted: boolean;
  locked: boolean;
}

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
  /**
   * D-045: status onboarding karyawan milik akun (diisi employee saat aktor dimuat). `locked` = calon
   * yang belum disetujui → hanya endpoint wizard yang boleh (middleware kunci di app.ts).
   */
  onboarding?: OnboardingState | null;
  /**
   * ORG-D9: punya ≥1 bawahan langsung aktif (manager_id = karyawan aktor), apa pun role akunnya. Diisi modul
   * employee saat aktor dimuat; tidak diisi = false. Hanya membuka antrean/keputusan langkah "Atasan" untuk
   * bawahan langsung — bukan hak tim MANAGER lain (direktori, arsip, aset, SP, analitik, rekap).
   */
  isSupervisor?: boolean;
  /**
   * IAM-D3: akun HR ber-"Tanpa akses karyawan Head Office" → id semua karyawan yang lokasi kerjanya SAAT
   * INI berpenanda Head Office (dimuat iam `loadActor` per request). Tidak diisi = tidak dibatasi.
   * Karyawan ini diperlakukan seperti di luar cakupan PT (404/403), di semua jalur baca & tulis.
   */
  hiddenEmployeeIds?: ReadonlySet<string>;
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

/**
 * ORG-D9: pemutus langkah "Atasan" (antrean approval, verifikasi Alpha, SPL): akun MANAGER ber-karyawan atau
 * akun role apa pun yang punya bawahan langsung aktif. Cakupan tetap bawahan langsung (dicek per target).
 */
export function isApprover(actor: Actor): boolean {
  return actor.employeeId !== null && (actor.role === ROLE.MANAGER || actor.isSupervisor === true);
}

/** IAM-D3: karyawan tersembunyi dari aktor (Head Office untuk akun HR yang dibatasi). */
export function isHiddenEmployee(actor: Actor, employeeId: string): boolean {
  return actor.hiddenEmployeeIds?.has(employeeId) ?? false;
}

/**
 * D-040 + IAM-D3: target berada dalam cakupan aktor — PT ditugaskan (SUPER_ADMIN: semua) DAN, bila
 * targetnya karyawan, bukan karyawan tersembunyi. `employeeId: null` hanya untuk aksi tingkat PT
 * (master/pengaturan per perusahaan) — wajib ditulis eksplisit agar tiap pemanggil ditinjau.
 */
export function isInCompanyScope(
  actor: Actor,
  target: { companyId: string; employeeId: string | null },
): boolean {
  if (target.employeeId !== null && isHiddenEmployee(actor, target.employeeId)) return false;
  return actor.companyIds === null || actor.companyIds.has(target.companyId);
}

/** IAM-D3: PT dalam cakupan saja (aksi tingkat PT). Sama dengan `isInCompanyScope(..., employeeId: null)`. */
export function isCompanyInScope(actor: Actor, companyId: string): boolean {
  return actor.companyIds === null || actor.companyIds.has(companyId);
}

/** IAM-D3: akun berstatus "Tanpa akses karyawan Head Office" (walau saat ini tidak ada karyawan HO). */
export function isHeadOfficeRestricted(actor: Actor): boolean {
  return actor.hiddenEmployeeIds !== undefined;
}

/** IAM-D3: aktor punya karyawan tersembunyi (akun dibatasi). */
export function hasHiddenEmployees(actor: Actor): boolean {
  return (actor.hiddenEmployeeIds?.size ?? 0) > 0;
}

/**
 * IAM-D3: penyaring Prisma untuk kolom id karyawan (`employeeId`, atau `id` pada tabel karyawan):
 * `{ notIn: [...] }` bila aktor punya karyawan tersembunyi, selain itu `undefined` (tanpa penyaring).
 * Pakai: `...hiddenFilter(actor, "employeeId")`.
 */
export function hiddenFilter<K extends string>(
  actor: Actor,
  field: K,
): Partial<Record<K, { notIn: string[] }>> {
  if (!hasHiddenEmployees(actor)) return {};
  return { [field]: { notIn: [...(actor.hiddenEmployeeIds ?? [])] } } as Record<
    K,
    { notIn: string[] }
  >;
}

/** IAM-D3: buang id karyawan tersembunyi dari daftar (penyaring di memori). */
export function visibleEmployeeIds(actor: Actor, ids: readonly string[]): string[] {
  return hasHiddenEmployees(actor) ? ids.filter((id) => !isHiddenEmployee(actor, id)) : [...ids];
}
