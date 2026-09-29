// Interface publik modul iam (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.
export { type IamRouteDeps, registerIamRoutes } from "./iam.routes.ts";
export type { MeResponse } from "./iam.schema.ts";
export {
  type AccountDeactivationOutcome,
  type AccountSummary,
  type BootstrapOutcome,
  bootstrapPrimarySuperAdmin,
  deactivateAccountOfEmployee,
  type EmployeeAccountLink,
  getAccountLinksForEmployees,
  getAccountSummaries,
  listManagerEmployeeIds,
  loadActor,
  notifyExpiringGrants,
  provisionAccount,
  type RequestContext,
  recoverPrimarySuperAdmin,
} from "./iam.service.ts";
