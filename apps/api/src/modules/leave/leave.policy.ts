import { ROLE } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";

// Modul leave (desain time-management.md §9, PLAN §4.3). Keputusan murni; data target dari pemanggil.

const isSa = (actor: Actor) => actor.role === ROLE.SUPER_ADMIN;
const isHr = (actor: Actor) => actor.role === ROLE.HR_ADMIN;
const hrOf = (actor: Actor, companyId: string) =>
  isHr(actor) && (actor.companyIds?.has(companyId) ?? false);

/** Jenis cuti/izin/sakit: semua akun melihat (dipakai form pengajuan cuti karyawan). SA kelola. */
export const canViewLeaveMaster = (actor: Actor) => actor.accountId.length > 0;
export const canManageLeaveMaster = (actor: Actor) => isSa(actor);
/**
 * Halaman Master Cuti (kuota per tahun): SA, HR, MANAGER — tidak untuk karyawan biasa (pemilik projek
 * 2026-10-19). Karyawan tetap melihat saldo & jenis cuti miliknya lewat halaman Cuti.
 */
export const canViewLeaveYears = (actor: Actor) =>
  isSa(actor) || isHr(actor) || actor.role === ROLE.MANAGER;

export interface LeaveTarget {
  employeeId: string;
  companyId: string;
  managerId: string | null;
}

/** Lihat saldo & pengajuan seorang karyawan: SA; HR PT-nya; MANAGER tim; karyawan sendiri. */
export function canViewEmployeeLeave(actor: Actor, target: LeaveTarget): boolean {
  if (isSa(actor)) return true;
  if (actor.employeeId !== null && actor.employeeId === target.employeeId) return true;
  if (hrOf(actor, target.companyId)) return true;
  return (
    actor.role === ROLE.MANAGER &&
    actor.employeeId !== null &&
    target.managerId === actor.employeeId
  );
}

/** Daftar saldo/pengajuan per PT & penyesuaian/import saldo: SA; HR PT ditugaskan. */
export const canManageBalances = (actor: Actor, companyId: string) =>
  isSa(actor) || hrOf(actor, companyId);

/** Mengajukan cuti/izin/sakit: hanya untuk diri sendiri (akun terhubung ke data karyawan). */
export const canRequestLeave = (actor: Actor, employeeId: string) =>
  actor.employeeId !== null && actor.employeeId === employeeId;

/** Menjalankan pekerjaan harian cuti secara manual (jatah, pelunasan, hangus, cuti bersama). */
export const canRunLeaveJobs = (actor: Actor) => isSa(actor);
