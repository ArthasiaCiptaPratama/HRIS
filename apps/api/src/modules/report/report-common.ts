import { reportFilterSchema, type XlsxCell, type XlsxFormat, type XlsxSheet } from "@hris/shared";
import type { z } from "zod";
import type { Actor } from "../../core/access/index.ts";
import { ForbiddenError, ValidationError } from "../../core/errors.ts";
import { listReportEmployees, type ReportEmployee } from "../employee/index.ts";
import { getMasterLookup, type MasterLookup } from "../organization/index.ts";
import * as policy from "./report.policy.ts";

// Bagian bersama laporan batch 1 (ARS-D16/D17) & batch 2 (ARS-D21): cakupan PT + filter, data orang,
// dan pembantu ekspor xlsx.

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

export const NO_MATCH = "00000000-0000-0000-0000-000000000000";
const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
export const todayInJakarta = (now = new Date()) => JAKARTA_DATE.format(now);
export const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function parse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

// --- Cakupan & filter ---

/** Unit + seluruh sub-unitnya (D-050). */
export function unitSubtree(lookup: MasterLookup, unitId: string): Set<string> {
  const ids = new Set([unitId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of lookup.departments.values()) {
      if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) {
        ids.add(d.id);
        grew = true;
      }
    }
  }
  return ids;
}

export async function scopedEmployees(ctx: RequestContext, raw: unknown) {
  if (!policy.canViewReports(ctx.actor)) throw new ForbiddenError();
  const filter = parse(reportFilterSchema, raw);
  const lookup = await getMasterLookup();
  const scope = policy.reportCompanyScope(ctx.actor);
  let companyIds: string[] | null = scope;
  if (filter.companyId) {
    companyIds = scope && !scope.includes(filter.companyId) ? [NO_MATCH] : [filter.companyId];
  }
  if (companyIds && companyIds.length === 0) companyIds = [NO_MATCH];
  let positionIds: string[] | null = null;
  if (filter.unitId) {
    const units = unitSubtree(lookup, filter.unitId);
    positionIds = [...lookup.positions.values()]
      .filter((p) => p.departmentId && units.has(p.departmentId))
      .map((p) => p.id);
    if (positionIds.length === 0) positionIds = [NO_MATCH];
  }
  const employees = await listReportEmployees({
    companyIds,
    positionIds,
    workLocationId: filter.workLocationId,
  });
  return { employees, lookup, filter };
}

export const unitOf = (lookup: MasterLookup, e: ReportEmployee) => {
  const departmentId = lookup.positions.get(e.positionId)?.departmentId;
  return departmentId ? (lookup.departments.get(departmentId)?.name ?? null) : null;
};
export const personDto = (lookup: MasterLookup, e: ReportEmployee) => ({
  employeeId: e.id,
  fullName: e.fullName,
  employeeNumber: e.employeeNumber,
  company: lookup.companies.get(e.companyId)?.code ?? "",
  unit: unitOf(lookup, e),
  position: lookup.positions.get(e.positionId)?.name ?? null,
});

export function group<T>(items: readonly T[], key: (t: T) => string) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return map;
}

// --- Ekspor ---

export const d = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
export const dmy = (iso: string) => iso.split("-").reverse().join("/");
export const PERSON_HEADERS = ["NIP", "Nama", "PT", "Unit", "Jabatan"];
export const PERSON_FORMATS: XlsxFormat[] = ["text", "text", "text", "text", "text"];
export const person = (r: {
  employeeNumber: string | null;
  fullName: string;
  company: string;
  unit: string | null;
  position: string | null;
}): XlsxCell[] => [r.employeeNumber, r.fullName, r.company, r.unit, r.position];
export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
export const pct = (value: number): XlsxCell => ({ value, format: "percent" });
export const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
/** Sheet data per orang: NIP + Nama ikut dibekukan saat menggulir ke kanan. */
export const people = (sheet: Omit<XlsxSheet, "freezeColumns">): XlsxSheet => ({
  ...sheet,
  freezeColumns: 2,
});
