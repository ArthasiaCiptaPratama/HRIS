import type { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import type { StorageAdmin } from "../../core/storage.ts";
import { configureAttendance, registerAttendanceIntegrations } from "./attendance.service.ts";
import { registerAttendanceDayRoutes } from "./attendance-day.routes.ts";
import { registerCalendarRoutes } from "./calendar.routes.ts";
import { registerPeriodRoutes } from "./period.routes.ts";
import { configurePeriod, registerPeriodIntegrations } from "./period.service.ts";
import { registerRosterRoutes } from "./roster.routes.ts";
import { registerRosterChangeHandler } from "./roster-change.service.ts";

// Pintu masuk route modul attendance (Time Management, D-067–D-072). Tahap berikutnya menambah grup route di sini.
export interface AttendanceRouteDeps {
  protect: MiddlewareHandler[];
  /** D-067: selfie absensi di Supabase Storage (bucket private attendance-selfies). */
  storage: StorageAdmin;
  storagePathPrefix?: string | undefined;
}

export function registerAttendanceRoutes(app: OpenAPIHono, deps: AttendanceRouteDeps): void {
  registerCalendarRoutes(app, deps.protect);
  registerRosterRoutes(app, deps.protect);
  // Status final approval → diterapkan ke roster (D-069).
  registerRosterChangeHandler();
  configureAttendance({ storage: deps.storage, storagePathPrefix: deps.storagePathPrefix ?? "" });
  registerAttendanceDayRoutes(app, deps.protect);
  // Approval hari absen (D-068) & kunci roster untuk hari yang sudah disetujui.
  registerAttendanceIntegrations();
  // Tahap F (D-071): rekap, tutup periode, surat pernyataan, koreksi.
  configurePeriod({ storage: deps.storage, storagePathPrefix: deps.storagePathPrefix ?? "" });
  registerPeriodRoutes(app, deps.protect);
  registerPeriodIntegrations();
}
