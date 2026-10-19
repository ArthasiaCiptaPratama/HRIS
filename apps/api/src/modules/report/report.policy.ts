import { ROLE } from "@hris/shared";
import { type Actor, hasPermission } from "../../core/access/index.ts";

// ARS-D16 (Laporan batch 1, PLAN §4.3 baris "Laporan"): keputusan akses murni.

/** Menu Laporan: SA, atau HR_ADMIN (cakupan PT ditugaskan, D-040). MANAGER & karyawan tidak. */
export function canViewReports(actor: Actor): boolean {
  return actor.role === ROLE.SUPER_ADMIN || actor.role === ROLE.HR_ADMIN;
}

/** PT yang boleh masuk laporan: null = semua (SA / HR tanpa batas), [] = tidak ada. */
export function reportCompanyScope(actor: Actor): string[] | null {
  if (actor.role === ROLE.SUPER_ADMIN || actor.companyIds === null) return null;
  return [...actor.companyIds];
}

/**
 * Baris per orang untuk dokumen berjenis sensitif (D-055): SA, pemegang `employee.documents.read`, atau —
 * khusus scan SP (`WARNING_LETTER`) — pemegang grant SP (ARS-D14). Jumlah agregat tetap untuk semua HR.
 */
export function canListSensitiveDocument(actor: Actor, typeCode: string): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  if (hasPermission(actor, "employee.documents.read")) return true;
  return (
    typeCode === "WARNING_LETTER" &&
    (hasPermission(actor, "employee.discipline.read") ||
      hasPermission(actor, "employee.discipline.write"))
  );
}

/** Daftar SP per orang (ARS-D13/D16): SA atau HR ber-grant SP; jumlah agregat untuk semua HR. */
export function canListWarningLetters(actor: Actor): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return (
    hasPermission(actor, "employee.discipline.read") ||
    hasPermission(actor, "employee.discipline.write")
  );
}
