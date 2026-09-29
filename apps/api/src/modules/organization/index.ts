// Interface publik modul organization (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.
export { type OrganizationRouteDeps, registerOrganizationRoutes } from "./organization.routes.ts";
export type {
  DepartmentDto,
  EmploymentStatusDto,
  GradeDto,
  PositionDto,
  WorkLocationDto,
} from "./organization.schema.ts";
export {
  getMasterLookup,
  type MasterLookup,
  positionIdsInDepartment,
  statusIdsForCategory,
} from "./organization.service.ts";
