// Interface publik modul employee (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.

export { remindExpiringDocuments } from "./document.service.ts";
export { type EmployeeRouteDeps, registerEmployeeRoutes } from "./employee.routes.ts";
export type { EmployeeDetail, EmployeeListItem } from "./employee.schema.ts";
export {
  employeeLoginDirectory,
  employeeMasterDataSupport,
  employeeScopeForIam,
  withEmployeeCompanyScope,
} from "./employee.service.ts";
export { processInvitations as processOnboardingInvitations } from "./onboarding.service.ts";
export {
  purgeCancelledCandidates,
  remindStaleInvitations,
} from "./onboarding-maintenance.service.ts";
