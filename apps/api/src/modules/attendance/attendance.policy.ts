import { ROLE } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";

// Time Management (PLAN §4.3, desain time-management.md §9). Keputusan murni; data target dari pemanggil.

const isSa = (actor: Actor) => actor.role === ROLE.SUPER_ADMIN;
const isHr = (actor: Actor) => actor.role === ROLE.HR_ADMIN;

// Kalender libur: SA kelola; semua akun melihat (PLAN §4.3 "Kalender libur").
export const canReadHolidays = (actor: Actor) => actor.accountId.length > 0;
export const canManageHolidays = (actor: Actor) => isSa(actor);

// Pengaturan Time Management: SA ubah; semua akun membaca (zona waktu jam shift dipakai semua layar).
export const canReadTimeSettings = (actor: Actor) => actor.accountId.length > 0;
export const canManageTimeSettings = (actor: Actor) => isSa(actor);

// ── Roster (D-068, desain §9) ───────────────────────────────────────────────────
/** Kelola shift, pola, crew, grid, import roster untuk PT tertentu: SA semua; HR PT ditugaskan. */
export function canManageRoster(actor: Actor, companyId: string): boolean {
  if (isSa(actor)) return true;
  return isHr(actor) && (actor.companyIds?.has(companyId) ?? false);
}

/** Lihat master roster (shift, pola, crew) PT: SA, HR PT-nya, MANAGER & karyawan PT tempat ia terdaftar. */
export function canViewRosterSetup(actor: Actor, companyId: string): boolean {
  if (isSa(actor)) return true;
  return actor.companyIds?.has(companyId) ?? false;
}

export interface RosterTarget {
  employeeId: string;
  companyId: string;
  managerId: string | null;
}

/** Lihat roster seorang karyawan: SA; HR PT-nya; MANAGER tim; karyawan sendiri. */
export function canViewEmployeeRoster(actor: Actor, target: RosterTarget): boolean {
  if (isSa(actor)) return true;
  if (actor.employeeId !== null && actor.employeeId === target.employeeId) return true;
  if (isHr(actor) && (actor.companyIds?.has(target.companyId) ?? false)) return true;
  return (
    actor.role === ROLE.MANAGER &&
    actor.employeeId !== null &&
    target.managerId === actor.employeeId
  );
}

/** Ajukan perubahan roster: karyawan untuk dirinya; MANAGER juga atas nama tim (desain §4.2). */
export function canRequestRosterChange(actor: Actor, target: RosterTarget): boolean {
  if (actor.employeeId === null) return false;
  if (actor.employeeId === target.employeeId) return true;
  return actor.role === ROLE.MANAGER && target.managerId === actor.employeeId;
}
