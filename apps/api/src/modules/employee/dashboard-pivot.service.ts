import {
  AGE_BUCKET_LABELS,
  AGE_BUCKETS,
  EDUCATION_LEVEL_LABELS,
  EMPLOYMENT_CATEGORIES,
  EMPLOYMENT_CATEGORY_LABELS,
  GENDER_LABELS,
  GENDERS,
  isSensitivePivotDimension,
  MARITAL_STATUS_LABELS,
  MARITAL_STATUSES,
  PIVOT_NONE,
  type PivotDimension,
  type PivotQuery,
  type PivotResult,
  POSITION_LEVEL_LABELS,
  POSITION_LEVELS,
  RELIGION_LABELS,
  RELIGIONS,
  TENURE_BUCKET_LABELS,
  TENURE_BUCKETS,
} from "@hris/shared";
import { ForbiddenError } from "../../core/errors.ts";
import { getMasterLookup, type MasterLookup } from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import * as repository from "./employee.repository.ts";
import { type RequestContext, scopeWhere, todayInJakarta } from "./employee.service.ts";

// D-062: pivot agregat karyawan untuk widget Dashboard (baris × kolom opsional + filter). Hanya jumlah —
// tanpa data per orang. Cakupan baris sama dengan GET /dashboard (D-040, D-045).

interface PivotRow {
  isActive: boolean;
  joinDate: Date;
  gender: string | null;
  companyId: string;
  employmentStatusId: string;
  positionId: string;
  workLocationId: string | null;
  gradeId: string | null;
  educations: { level: string | null }[];
  /** Hanya terisi bila dimensi sensitif dipakai (lihat repository.listForPivot). */
  personal?: {
    birthDate: Date | null;
    religion: string | null;
    maritalStatus: string | null;
  } | null;
}

interface Dimension {
  key: (row: PivotRow) => string;
  label: (key: string) => string;
  /** Urutan alami (dimensi ordinal/enum); tanpa = terbanyak dulu. */
  natural?: readonly string[];
  numeric?: boolean;
}

const EDUCATION_ORDER = ["SD", "SMP", "SMA", "D1", "D2", "D3", "D4", "S1", "S2", "S3"] as const;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const NONE_LABEL = "Belum diisi";

/** Jenjang tertinggi; hanya "Lainnya" → OTHER; tanpa riwayat → NONE. */
export function highestEducation(levels: (string | null)[]): string {
  let best = -1;
  let other = false;
  for (const level of levels) {
    if (!level) continue;
    const rank = EDUCATION_ORDER.indexOf(level as (typeof EDUCATION_ORDER)[number]);
    if (rank < 0) other = true;
    else best = Math.max(best, rank);
  }
  if (best >= 0) return EDUCATION_ORDER[best] as string;
  return other ? "OTHER" : PIVOT_NONE;
}

export function tenureBucket(years: number): (typeof TENURE_BUCKETS)[number] {
  if (years < 1) return "<1";
  if (years < 3) return "1-3";
  if (years < 5) return "3-5";
  if (years < 10) return "5-10";
  return "10+";
}

export function ageBucket(years: number): (typeof AGE_BUCKETS)[number] {
  if (years < 25) return "<25";
  if (years < 35) return "25-34";
  if (years < 45) return "35-44";
  if (years < 55) return "45-54";
  return "55+";
}

const labelOf =
  <K extends string>(labels: Record<K, string>, none = NONE_LABEL) =>
  (key: string) =>
    key === PIVOT_NONE ? none : (labels[key as K] ?? key);

function buildDimensions(lookup: MasterLookup, today: number): Record<PivotDimension, Dimension> {
  const yearsSince = (date: Date) => Math.max(0, today - date.getTime()) / MS_PER_YEAR;
  const name = (map: Map<string, { name: string }>) => (key: string) =>
    key === PIVOT_NONE ? NONE_LABEL : (map.get(key)?.name ?? "—");
  const departmentOf = (row: PivotRow) => lookup.positions.get(row.positionId)?.departmentId;
  // Unit induk berjenis tertentu (unit itu sendiri bila jenisnya sama); batas kedalaman cegah siklus.
  const ancestorOfType = (row: PivotRow, unitType: string) => {
    let id = departmentOf(row);
    for (let depth = 0; id && depth < 12; depth += 1) {
      const unit = lookup.departments.get(id);
      if (!unit) break;
      if (unit.unitType === unitType) return unit.id;
      id = unit.parentId ?? undefined;
    }
    return PIVOT_NONE;
  };

  return {
    category: {
      key: (row) => lookup.statuses.get(row.employmentStatusId)?.category ?? PIVOT_NONE,
      label: labelOf(EMPLOYMENT_CATEGORY_LABELS, "Tanpa kategori"),
      natural: EMPLOYMENT_CATEGORIES,
    },
    education: {
      key: (row) => highestEducation(row.educations.map((e) => e.level)),
      label: labelOf(EDUCATION_LEVEL_LABELS),
      natural: [...EDUCATION_ORDER, "OTHER"],
    },
    company: { key: (row) => row.companyId, label: name(lookup.companies) },
    location: { key: (row) => row.workLocationId ?? PIVOT_NONE, label: name(lookup.locations) },
    city: {
      key: (row) =>
        (row.workLocationId ? lookup.locations.get(row.workLocationId)?.city : null) ?? PIVOT_NONE,
      label: (key) => (key === PIVOT_NONE ? NONE_LABEL : key),
    },
    directorate: {
      key: (row) => ancestorOfType(row, "DIRECTORATE"),
      label: name(lookup.departments),
    },
    division: { key: (row) => ancestorOfType(row, "DIVISION"), label: name(lookup.departments) },
    department: {
      key: (row) => departmentOf(row) ?? PIVOT_NONE,
      label: name(lookup.departments),
    },
    position: { key: (row) => row.positionId, label: name(lookup.positions) },
    positionLevel: {
      key: (row) => lookup.positions.get(row.positionId)?.level ?? PIVOT_NONE,
      label: labelOf(POSITION_LEVEL_LABELS),
      natural: POSITION_LEVELS,
    },
    grade: { key: (row) => row.gradeId ?? PIVOT_NONE, label: name(lookup.grades) },
    gender: {
      key: (row) => row.gender ?? PIVOT_NONE,
      label: labelOf(GENDER_LABELS),
      natural: GENDERS,
    },
    joinYear: {
      key: (row) => String(row.joinDate.getUTCFullYear()),
      label: (key) => key,
      numeric: true,
    },
    tenure: {
      key: (row) => tenureBucket(yearsSince(row.joinDate)),
      label: labelOf(TENURE_BUCKET_LABELS),
      natural: TENURE_BUCKETS,
    },
    status: {
      key: (row) => (row.isActive ? "active" : "inactive"),
      label: (key) => (key === "active" ? "Aktif" : "Nonaktif"),
      natural: ["active", "inactive"],
    },
    religion: {
      key: (row) => row.personal?.religion ?? PIVOT_NONE,
      label: labelOf(RELIGION_LABELS),
      natural: RELIGIONS,
    },
    maritalStatus: {
      key: (row) => row.personal?.maritalStatus ?? PIVOT_NONE,
      label: labelOf(MARITAL_STATUS_LABELS),
      natural: MARITAL_STATUSES,
    },
    age: {
      key: (row) =>
        row.personal?.birthDate ? ageBucket(yearsSince(row.personal.birthDate)) : PIVOT_NONE,
      label: labelOf(AGE_BUCKET_LABELS),
      natural: AGE_BUCKETS,
    },
  };
}

/** Kunci terurut: alami/numerik bila ada, selain itu terbanyak dulu; "NONE" selalu terakhir. */
function orderKeys(dimension: Dimension, totals: Map<string, number>) {
  const keys = [...totals.keys()];
  const rank = (key: string) => dimension.natural?.indexOf(key) ?? -1;
  return keys.sort((a, b) => {
    if (a === PIVOT_NONE || b === PIVOT_NONE) return a === PIVOT_NONE ? 1 : -1;
    if (dimension.numeric) return Number(a) - Number(b);
    if (dimension.natural) return rank(a) - rank(b);
    return (
      (totals.get(b) ?? 0) - (totals.get(a) ?? 0) ||
      dimension.label(a).localeCompare(dimension.label(b), "id")
    );
  });
}

export async function getDashboardPivot(
  ctx: RequestContext,
  query: PivotQuery,
  now = new Date(),
): Promise<PivotResult> {
  if (!policy.canViewDashboard(ctx.actor)) throw new ForbiddenError();
  const used = [query.rows, ...(query.cols ? [query.cols] : []), ...Object.keys(query.filters)];
  const withPersonal = (used as PivotDimension[]).some(isSensitivePivotDimension);
  if (withPersonal && !policy.canPivotPersonal(ctx.actor)) {
    throw new ForbiddenError(
      "Dimensi agama, status pernikahan, dan umur butuh grant employee.personal.read.",
    );
  }

  const where: repository.EmployeeWhere =
    query.status === "all"
      ? scopeWhere(ctx.actor)
      : { AND: [scopeWhere(ctx.actor), { isActive: query.status === "active" }] };
  const [lookup, rows]: [MasterLookup, PivotRow[]] = await Promise.all([
    getMasterLookup(),
    repository.listForPivot(where, withPersonal),
  ]);
  const dimensions = buildDimensions(
    lookup,
    new Date(`${todayInJakarta(now)}T00:00:00Z`).getTime(),
  );

  const filters = Object.entries(query.filters).map(([dimension, values]) => ({
    key: dimensions[dimension as PivotDimension].key,
    allowed: new Set(values),
  }));
  const rowDim = dimensions[query.rows];
  const colDim = query.cols ? dimensions[query.cols] : null;

  const cells = new Map<string, Map<string, number>>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (!filters.every((filter) => filter.allowed.has(filter.key(row)))) continue;
    const r = rowDim.key(row);
    const c = colDim ? colDim.key(row) : "";
    const line = cells.get(r) ?? new Map<string, number>();
    line.set(c, (line.get(c) ?? 0) + 1);
    cells.set(r, line);
    rowTotals.set(r, (rowTotals.get(r) ?? 0) + 1);
    if (colDim) colTotals.set(c, (colTotals.get(c) ?? 0) + 1);
    total += 1;
  }

  return {
    rows: query.rows,
    cols: query.cols ?? null,
    rowKeys: orderKeys(rowDim, rowTotals).map((key) => ({
      key,
      label: rowDim.label(key),
      total: rowTotals.get(key) ?? 0,
    })),
    colKeys: colDim
      ? orderKeys(colDim, colTotals).map((key) => ({
          key,
          label: colDim.label(key),
          total: colTotals.get(key) ?? 0,
        }))
      : [],
    cells: [...cells].flatMap(([row, line]) =>
      [...line].map(([col, count]) => ({ row, col, count })),
    ),
    total,
  };
}
