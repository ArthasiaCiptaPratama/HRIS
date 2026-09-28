// Interface publik modul iam (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.
export { type IamRouteDeps, registerIamRoutes } from "./iam.routes.ts";
export type { MeResponse } from "./iam.schema.ts";
export { type BootstrapOutcome, bootstrapPrimarySuperAdmin, loadActor } from "./iam.service.ts";
