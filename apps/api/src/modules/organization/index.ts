// Interface publik modul organization (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.

export { listOrgPosts, type OrgPostNode } from "./org-post.service.ts";
export { type OrganizationRouteDeps, registerOrganizationRoutes } from "./organization.routes.ts";
export type {
  CompanyDto,
  DepartmentDto,
  EmploymentStatusDto,
  GradeDto,
  PositionDto,
  WorkLocationDto,
} from "./organization.schema.ts";
export {
  archivedMasterIndex,
  createMissingMasterData,
  getMasterLookup,
  type MasterDataNames,
  type MasterLookup,
  masterIndex,
  masterKey,
  missingMasterData,
  positionIdsInDepartment,
  positionKey,
  statusIdsForCategories,
} from "./organization.service.ts";
export {
  configureOrganization,
  type EmployeeMasterDataSupport,
} from "./organization-support.ts";
