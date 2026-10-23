import { ROLE } from "@hris/shared";
import { type Actor, hasPermission } from "../../core/access/index.ts";

// Time Management (PLAN §4.3, desain time-management.md §9). Keputusan murni; data target dari pemanggil.

const isSa = (actor: Actor) => actor.role === ROLE.SUPER_ADMIN;
const isHr = (actor: Actor) => actor.role === ROLE.HR_ADMIN;

// Kalender libur: SA kelola; semua akun melihat (PLAN §4.3 "Kalender libur").
export const canReadHolidays = (actor: Actor) => actor.accountId.length > 0;
export const canManageHolidays = (actor: Actor) => isSa(actor);

// Pengaturan Time Management: SA ubah; semua akun membaca (zona waktu jam shift dipakai semua layar).
export const canReadTimeSettings = (actor: Actor) => actor.accountId.length > 0;
export const canManageTimeSettings = (actor: Actor) => isSa(actor);

// ── Roster (D-069, desain §9) ───────────────────────────────────────────────────
/** Kelola shift, pola, crew, grid, import roster untuk PT tertentu: SA semua; HR PT ditugaskan. */
export function canManageRoster(actor: Actor, companyId: string): boolean {
  if (isSa(actor)) return true;
  return isHr(actor) && (actor.companyIds?.has(companyId) ?? false);
}

/** TM-D1: atur lokasi absen per karyawan PT tertentu: SA semua; HR PT ditugaskan (sama dengan kelola roster). */
export function canManageAttendanceLocation(actor: Actor, companyId: string): boolean {
  return canManageRoster(actor, companyId);
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

/**
 * TM-D13 Fase B: verifikasi Alpha — atasan karyawan (snapshot hari absen); SA; HR PT-nya (karyawan tanpa
 * atasan / atasan berhalangan). Karyawan tidak memverifikasi Alpha-nya sendiri.
 */
export function canVerifyAlpha(
  actor: Actor,
  target: { employeeId: string; companyId: string; managerEmployeeId: string | null },
): boolean {
  if (actor.employeeId !== null && actor.employeeId === target.employeeId) return false;
  if (isSa(actor)) return true;
  if (isHr(actor) && (actor.companyIds?.has(target.companyId) ?? false)) return true;
  return actor.employeeId !== null && target.managerEmployeeId === actor.employeeId;
}

/** Antrean verifikasi Alpha: SA, HR, atau akun yang punya bawahan (atasan). */
export const canViewAlphaVerifications = (actor: Actor) =>
  isSa(actor) || isHr(actor) || (actor.role === ROLE.MANAGER && actor.employeeId !== null);

/** Ajukan perubahan roster: karyawan untuk dirinya; MANAGER juga atas nama tim (desain §4.2). */
export function canRequestRosterChange(actor: Actor, target: RosterTarget): boolean {
  if (actor.employeeId === null) return false;
  if (actor.employeeId === target.employeeId) return true;
  return actor.role === ROLE.MANAGER && target.managerId === actor.employeeId;
}

// ── TM-D6 lembur & biaya / TM-D7 istirahat ─────────────────────────────────────
/** Rupiah per orang & tabel upah grade: SA; HR ber-grant `labor.cost.read` (PT dicek pemanggil). */
export const canSeeLaborCost = (actor: Actor) =>
  isSa(actor) || (isHr(actor) && hasPermission(actor, "labor.cost.read"));
/** Ubah upah grade: SA saja. */
export const canManageGradeWages = (actor: Actor) => isSa(actor);
/** Lokasi wajib absen istirahat: SA + HR (sama dengan pengaturan lokasi absen). */
export const canManageBreakLocations = (actor: Actor) => isSa(actor) || isHr(actor);
/** Atasan melihat TOTAL rupiah lembur timnya per bulan (bukan per orang). */
export const canSeeTeamCostTotal = (actor: Actor) =>
  actor.role === ROLE.MANAGER && actor.employeeId !== null;
