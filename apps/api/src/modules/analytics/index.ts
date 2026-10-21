// Interface publik modul analytics (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.
// DSB-D1: dashboard analitik SDM & biaya (agregat dari modul employee/attendance/leave lewat interface publik).

export { type AnalyticsRouteDeps, registerAnalyticsRoutes } from "./analytics.routes.ts";
