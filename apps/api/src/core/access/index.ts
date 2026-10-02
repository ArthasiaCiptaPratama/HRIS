export { type ActorLoader, loadActor, requirePermission, requireRole } from "./middleware.ts";
export { enforceOnboardingLock, isAllowedWhileOnboarding } from "./onboarding-lock.ts";
export {
  type Actor,
  type EmployeeTarget,
  type GrantValidity,
  hasPermission,
  hasRole,
  isGrantActive,
  isInCompanyScope,
  isInTeam,
  isSelf,
  type OnboardingState,
} from "./rules.ts";
