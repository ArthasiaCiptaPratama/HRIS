import { type Actor, hasPermission, isInCompanyScope } from "../../core/access/index.ts";

// PLAN §4.3: HR memerlukan grant, berlaku hanya di PT yang ditugaskan (D-040).
export function canManageContracts(actor: Actor): boolean {
  return (
    actor.role === "SUPER_ADMIN" ||
    (actor.role === "HR_ADMIN" && hasPermission(actor, "contract.manage"))
  );
}
export function canManageContractsInCompany(actor: Actor, companyId: string): boolean {
  return (
    actor.role === "SUPER_ADMIN" ||
    (canManageContracts(actor) && isInCompanyScope(actor, { companyId }))
  );
}
