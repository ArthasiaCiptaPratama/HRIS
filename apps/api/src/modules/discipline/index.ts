// Interface publik modul discipline (PLAN §3.2.5): hanya file ini yang boleh di-import dari luar modul.

export { type DisciplineRouteDeps, registerDisciplineRoutes } from "./discipline.routes.ts";
export { runDisciplineDaily } from "./discipline-daily.service.ts";
export { listWarningLettersForReport, type ReportWarningLetter } from "./report-data.service.ts";
