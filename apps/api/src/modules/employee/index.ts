// Interface publik modul employee (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.
export { type EmployeeRouteDeps, registerEmployeeRoutes } from "./employee.routes.ts";
export type { EmployeeDetail, EmployeeListItem } from "./employee.schema.ts";
