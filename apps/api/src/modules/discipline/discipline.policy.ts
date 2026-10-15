import { ROLE } from "@hris/shared";
import {
  type Actor,
  type EmployeeTarget,
  hasPermission,
  isInCompanyScope,
  isInTeam,
  isSelf,
} from "../../core/access/index.ts";

// ARS-D10/ARS-D13 (PLAN §4.3 baris "surat peringatan"): keputusan akses murni; data target dari pemanggil.

export interface LetterTarget {
  companyId: string;
  status: "DRAFT" | "ISSUED" | "EXPIRED" | "REVOKED";
  /** Atasan saat terbit (ARS-D9); null = karyawan tanpa atasan / masih draft. */
  managerEmployeeId: string | null;
}

/** Buat, terbitkan, cabut & lampirkan scan SP di PT `companyId`: SA, atau HR ber-grant write di PT itu. */
export function canWriteLetters(actor: Actor, companyId: string): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return (
    actor.role === ROLE.HR_ADMIN &&
    hasPermission(actor, "employee.discipline.write") &&
    isInCompanyScope(actor, { companyId })
  );
}

/** HR yang hanya melihat: grant read atau write di PT itu. */
function canReadAsHr(actor: Actor, companyId: string): boolean {
  return (
    actor.role === ROLE.HR_ADMIN &&
    (hasPermission(actor, "employee.discipline.read") ||
      hasPermission(actor, "employee.discipline.write")) &&
    isInCompanyScope(actor, { companyId })
  );
}

/** Alasan eskalasi, bukti ALPHA & surat pernyataan: SA + HR ber-grant SP di PT itu (bukan MANAGER/karyawan). */
export function canSeeInternalNotes(actor: Actor, companyId: string): boolean {
  return canWriteLetters(actor, companyId) || canReadAsHr(actor, companyId);
}

/** Master jenis pelanggaran berlaku semua PT: SA atau HR ber-grant write (ARS-D12). */
export function canManageViolationTypes(actor: Actor): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return actor.role === ROLE.HR_ADMIN && hasPermission(actor, "employee.discipline.write");
}

/** Daftar jenis pelanggaran & pengaturan dibaca SA dan HR ber-grant SP (read/write). */
export function canReadDisciplineMasters(actor: Actor): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return (
    actor.role === ROLE.HR_ADMIN &&
    (hasPermission(actor, "employee.discipline.read") ||
      hasPermission(actor, "employee.discipline.write"))
  );
}

/** ARS-D8: masa berlaku bawaan hanya diubah SA. */
export function canChangeSettings(actor: Actor): boolean {
  return actor.role === ROLE.SUPER_ADMIN;
}

/**
 * ARS-D13: SA semua; HR ber-grant read/write semua riwayat di PT-nya (draft hanya penulis);
 * MANAGER SP tim (atau yang ia terima sebagai atasan saat terbit); karyawan SP miliknya. Draft hanya penulis.
 */
export function canViewLetter(
  actor: Actor,
  letter: LetterTarget,
  employee: EmployeeTarget,
): boolean {
  if (canWriteLetters(actor, letter.companyId)) return true;
  if (letter.status === "DRAFT") return false;
  if (canReadAsHr(actor, letter.companyId)) return true;
  if (isSelf(actor, employee)) return true;
  return actor.role === ROLE.MANAGER && isLetterManager(actor, letter, employee);
}

function isLetterManager(actor: Actor, letter: LetterTarget, employee: EmployeeTarget): boolean {
  if (!actor.employeeId) return false;
  return letter.managerEmployeeId === actor.employeeId || isInTeam(actor, employee);
}

/**
 * ARS-D9: "Sudah disampaikan" oleh atasan (saat terbit atau atasan sekarang). Karyawan tanpa atasan →
 * penulis SP di PT itu yang menyampaikan.
 */
export function canDeliver(actor: Actor, letter: LetterTarget, employee: EmployeeTarget): boolean {
  if (isSelf(actor, employee)) return false;
  if (letter.managerEmployeeId === null && employee.managerId === null)
    return canWriteLetters(actor, letter.companyId);
  return isLetterManager(actor, letter, employee);
}

/** ARS-D9: "Sudah menerima" hanya oleh karyawan penerima SP. */
export function canAcknowledge(actor: Actor, employee: EmployeeTarget): boolean {
  return isSelf(actor, employee);
}

export type LetterListScope =
  | { kind: "all"; drafts: boolean }
  | { kind: "companies"; companyIds: string[]; draftCompanyIds: string[] }
  | { kind: "team"; managerId: string };

/** Cakupan daftar Arsip › Surat Peringatan. EMPLOYEE melihat miliknya lewat `/self/warning-letters`. */
export function letterListScope(actor: Actor): LetterListScope | null {
  if (actor.role === ROLE.SUPER_ADMIN) return { kind: "all", drafts: true };
  if (actor.role === ROLE.HR_ADMIN) {
    const writes = hasPermission(actor, "employee.discipline.write");
    if (!writes && !hasPermission(actor, "employee.discipline.read")) return null;
    if (actor.companyIds === null) return { kind: "all", drafts: writes };
    const companyIds = [...actor.companyIds];
    if (companyIds.length === 0) return null;
    return { kind: "companies", companyIds, draftCompanyIds: writes ? companyIds : [] };
  }
  if (actor.role === ROLE.MANAGER && actor.employeeId) {
    return { kind: "team", managerId: actor.employeeId };
  }
  return null;
}
