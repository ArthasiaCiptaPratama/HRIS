export { type ActorLoader, loadActor, requirePermission, requireRole } from "./middleware.ts";
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
} from "./rules.ts";
