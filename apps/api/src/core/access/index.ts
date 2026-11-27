export { type ActorLoader, loadActor, requirePermission, requireRole } from "./middleware.ts";
export { enforceOnboardingLock, isAllowedWhileOnboarding } from "./onboarding-lock.ts";
export {
  type Actor,
  type EmployeeTarget,
  type GrantValidity,
  hasHiddenEmployees,
  hasPermission,
  hasRole,
  hiddenFilter,
  isApprover,
  isCompanyInScope,
  isGrantActive,
  isHeadOfficeRestricted,
  isHiddenEmployee,
  isInCompanyScope,
  isInTeam,
  isSelf,
  type OnboardingState,
  visibleEmployeeIds,
} from "./rules.ts";
