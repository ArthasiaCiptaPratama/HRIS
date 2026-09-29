import { isPermissionGrantableTo, type Permission, ROLE, type Role } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";

// PROMPT §3.5: keputusan akses murni; default tolak. Data target diberikan pemanggil.
// Aturan jumlah (mis. "SUPER_ADMIN aktif tidak boleh 0") butuh data DB → di service.

export interface AccountTarget {
  accountId: string;
  role: Role;
  isPrimarySuperAdmin: boolean;
  isActive: boolean;
}

const isSuperAdmin = (actor: Actor) => actor.role === ROLE.SUPER_ADMIN;
const isHrAdmin = (actor: Actor) => actor.role === ROLE.HR_ADMIN;
const isSelfAccount = (actor: Actor, target: AccountTarget) => actor.accountId === target.accountId;

// GET /me: setiap akun aktif boleh melihat profil aksesnya sendiri (PLAN §4.3, data "sendiri").
export function canReadOwnAccount(actor: Actor): boolean {
  return actor.accountId.length > 0;
}

// PLAN §4.3 "Undang akun karyawan, nonaktifkan akun": SA ✅ HR ✅.
export function canListAccounts(actor: Actor): boolean {
  return isSuperAdmin(actor) || isHrAdmin(actor);
}

export function canViewAccount(actor: Actor, target: AccountTarget): boolean {
  return canListAccounts(actor) || isSelfAccount(actor, target);
}

// Memberi role = hak SA (§4.3); role SUPER_ADMIN = hak eksklusif Utama (§4.4); HR hanya akun karyawan.
export function canInviteAccount(actor: Actor, role: Role): boolean {
  if (role === ROLE.SUPER_ADMIN) return actor.isPrimarySuperAdmin;
  if (isSuperAdmin(actor)) return true;
  return isHrAdmin(actor) && role === ROLE.EMPLOYEE;
}

// D-028: satu akun satu role. §4.4: memberi/mencabut SUPER_ADMIN hanya Utama; Utama tidak diubah akun lain.
export function canChangeRole(actor: Actor, target: AccountTarget, newRole: Role): boolean {
  if (!isSuperAdmin(actor) || isSelfAccount(actor, target) || target.isPrimarySuperAdmin)
    return false;
  if (target.role === ROLE.SUPER_ADMIN || newRole === ROLE.SUPER_ADMIN)
    return actor.isPrimarySuperAdmin;
  return true;
}

// Keputusan 2026-09-28: HR hanya EMPLOYEE & MANAGER; menonaktifkan SUPER_ADMIN = mencabut kuasanya → Utama.
export function canSetActive(actor: Actor, target: AccountTarget): boolean {
  if (isSelfAccount(actor, target) || target.isPrimarySuperAdmin) return false;
  if (isSuperAdmin(actor)) {
    return target.role !== ROLE.SUPER_ADMIN || actor.isPrimarySuperAdmin;
  }
  return isHrAdmin(actor) && (target.role === ROLE.EMPLOYEE || target.role === ROLE.MANAGER);
}

// §4.4: hanya Utama, ke SUPER_ADMIN lain yang aktif. Konfirmasi password dicek terpisah (login ulang, D-033).
export function canTransferPrimary(actor: Actor, target: AccountTarget): boolean {
  return (
    actor.isPrimarySuperAdmin &&
    !isSelfAccount(actor, target) &&
    target.role === ROLE.SUPER_ADMIN &&
    target.isActive
  );
}

// §4.2: grant hanya oleh SUPER_ADMIN.
export function canManageGrants(actor: Actor): boolean {
  return isSuperAdmin(actor);
}

// §4.2: hanya ke HR_ADMIN/MANAGER aktif, dan izin harus boleh diberikan ke role penerima.
export function canGrantTo(actor: Actor, target: AccountTarget, permission: Permission): boolean {
  return (
    canManageGrants(actor) && target.isActive && isPermissionGrantableTo(permission, target.role)
  );
}

// §4.3 "audit log": hanya SUPER_ADMIN.
export function canReadAuditLogs(actor: Actor): boolean {
  return isSuperAdmin(actor);
}
