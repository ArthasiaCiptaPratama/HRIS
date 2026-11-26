// Interface publik modul employee (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.

// KTR-D5/D6 (K2): pengingat kontrak/masa percobaan untuk cron `contract-daily`.
export { remindContracts } from "./contract-reminder.service.ts";
export {
  type AnalyticsEmployeeBrief,
  type EmployeeBrief,
  type ExitedEmployeeBrief,
  getEmployeeBriefs,
  getEmployeeDocumentRef,
  getEmployeeExitStatuses,
  listActiveEmployeeJoinDates,
  listAnalyticsEmployees,
  listEmployeeBriefs,
  listExitedEmployees,
} from "./directory.service.ts";
export { remindExpiringDocuments } from "./document.service.ts";
export { type EmployeeRouteDeps, registerEmployeeRoutes } from "./employee.routes.ts";
export type { EmployeeDetail, EmployeeListItem } from "./employee.schema.ts";
export {
  correctEmployeeContract,
  createEmployeeContract,
  employeeLoginDirectory,
  employeeMasterDataSupport,
  employeeScopeForIam,
  endEmployeeContract,
  extendEmployeeContract,
  getEmployeeContracts,
  promoteEmployee,
  scopeRequestActor,
  withEmployeeCompanyScope,
} from "./employee.service.ts";
// EMP-D6: homebase per tanggal untuk payroll (tanpa FK lintas modul).
export { getHomebasesOn, type HomebaseOnDate } from "./homebase.service.ts";
export { processInvitations as processOnboardingInvitations } from "./onboarding.service.ts";
export {
  purgeCancelledCandidates,
  remindStaleInvitations,
} from "./onboarding-maintenance.service.ts";
export {
  listBirthdaysInMonth,
  listCompletenessFacts,
  listDataChangeFacts,
  listDemographicFacts,
  listExpiringDocuments,
  listMovements,
  listReportEmployees,
  listRequiredDocumentTypes,
  type ReportCompletenessFacts,
  type ReportDataChange,
  type ReportDemographicFacts,
  type ReportEmployee,
  type ReportEmployeeFilter,
  type ReportExpiringDocument,
  type ReportMovement,
  type RequiredDocumentType,
} from "./report-data.service.ts";
