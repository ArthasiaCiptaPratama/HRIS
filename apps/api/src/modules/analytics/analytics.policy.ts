import { ROLE } from "@hris/shared";
import { type Actor, hasPermission } from "../../core/access/index.ts";

// DSB-D1: akses dashboard analitik. Keputusan murni; data dari pemanggil.

export type AnalyticsScope =
  | { kind: "all" }
  | { kind: "companies"; companyIds: string[] }
  | { kind: "team"; managerId: string };

/** SA: semua PT (atau satu PT dipilih); HR: PT ditugaskan; MANAGER: tim (bawahan langsung). */
export function analyticsScope(actor: Actor, companyId?: string): AnalyticsScope | null {
  if (actor.role === ROLE.SUPER_ADMIN) {
    return companyId ? { kind: "companies", companyIds: [companyId] } : { kind: "all" };
  }
  if (actor.role === ROLE.HR_ADMIN) {
    const scope = [...(actor.companyIds ?? [])];
    if (companyId)
      return scope.includes(companyId) ? { kind: "companies", companyIds: [companyId] } : null;
    return { kind: "companies", companyIds: scope };
  }
  if (actor.role === ROLE.MANAGER && actor.employeeId) {
    return { kind: "team", managerId: actor.employeeId };
  }
  return null;
}

/** Proyeksi pensiun memakai tanggal lahir (data pribadi): SA atau grant employee.personal.read. */
export const canSeeBirthDates = (actor: Actor) =>
  actor.role === ROLE.SUPER_ADMIN || hasPermission(actor, "employee.personal.read");
