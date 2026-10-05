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
  listDocumentReminderRecipients,
  listManagerEmployeeIds,
  listOnboardingReviewers,
  loadActor,
  notifyExpiringGrants,
  provisionAccount,
  purgeAccountOfEmployee,
  type RequestContext,
  reactivateAccountOfEmployee,
  recoverPrimarySuperAdmin,
} from "./iam.service.ts";
export {
  applyNikLogin,
  type LoginContactDirectory,
  type NikLoginDeps,
  type NikLoginOutcome,
} from "./login.service.ts";
