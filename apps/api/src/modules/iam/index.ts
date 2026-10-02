// Interface publik modul iam (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.
export { type IamRouteDeps, registerIamRoutes } from "./iam.routes.ts";
export type { MeResponse } from "./iam.schema.ts";
export {
  type AccountDeactivationOutcome,
  type AccountSummary,
  accountEmailsInUse,
  type BootstrapOutcome,
  bootstrapPrimarySuperAdmin,
  configureIam,
  deactivateAccountOfEmployee,
  type EmployeeAccountLink,
  type EmployeeAccountState,
  type EmployeeInviteOutcome,
  getAccountLinksForEmployees,
  getAccountSummaries,
  getEmployeeAccountStates,
  type IamEmployeeScope,
  inviteEmployeeAccount,
  listManagerEmployeeIds,
  listOnboardingReviewers,
  loadActor,
  notifyExpiringGrants,
  provisionAccount,
  type RequestContext,
  recoverPrimarySuperAdmin,
} from "./iam.service.ts";
