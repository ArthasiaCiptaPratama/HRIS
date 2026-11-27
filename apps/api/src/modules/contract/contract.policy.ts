import { type Actor, hasPermission, isInCompanyScope } from "../../core/access/index.ts";

// PLAN §4.3: HR memerlukan grant, berlaku hanya di PT yang ditugaskan (D-040).
export function canManageContracts(actor: Actor): boolean {
  return (
    actor.role === "SUPER_ADMIN" ||
    (actor.role === "HR_ADMIN" && hasPermission(actor, "contract.manage"))
  );
}
/** IAM-D3: `employeeId` = karyawan kontrak yang disentuh (null = aksi tingkat PT, mis. daftar/laporan). */
export function canManageContractsInCompany(
  actor: Actor,
  target: { companyId: string; employeeId: string | null },
): boolean {
  return (
    actor.role === "SUPER_ADMIN" || (canManageContracts(actor) && isInCompanyScope(actor, target))
  );
}

// KTR-D13: pengecualian khusus THL; grant tidak memberikan akses kepada manager/karyawan.
export function canAccessDailyWage(actor: Actor): boolean {
  return (
    actor.role === "SUPER_ADMIN" ||
    (actor.role === "HR_ADMIN" && hasPermission(actor, "labor.cost.read"))
  );
}
export function canAccessDailyWageInCompany(
  actor: Actor,
  target: { companyId: string; employeeId: string | null },
): boolean {
  return (
    canAccessDailyWage(actor) && (actor.role === "SUPER_ADMIN" || isInCompanyScope(actor, target))
  );
}
