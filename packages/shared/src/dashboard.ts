import { z } from "zod";

// Dashboard SA/HR yang bisa diatur (tambahan 2026-10-09): pivot agregat karyawan (GET /dashboard/pivot)
// + susunan widget per akun (GET/PUT /me/dashboard-layout). Satu sumber untuk API dan web.

// ── Dimensi pivot ────────────────────────────────────────────────────────────

export const PIVOT_DIMENSIONS = [
  "category",
  "education",
  "company",
  "location",
  "city",
  "directorate",
  "division",
  "department",
  "position",
  "positionLevel",
  "grade",
  "gender",
  "joinYear",
  "tenure",
  "status",
  // Sensitif (PLAN §4.2): hanya SA atau pemegang grant employee.personal.read.
  "religion",
  "maritalStatus",
  "age",
] as const;
export const pivotDimensionSchema = z.enum(PIVOT_DIMENSIONS);
export type PivotDimension = z.infer<typeof pivotDimensionSchema>;

export const SENSITIVE_PIVOT_DIMENSIONS: readonly PivotDimension[] = [
  "religion",
  "maritalStatus",
  "age",
];
export const isSensitivePivotDimension = (dimension: PivotDimension) =>
  SENSITIVE_PIVOT_DIMENSIONS.includes(dimension);

export const PIVOT_DIMENSION_LABELS: Record<PivotDimension, string> = {
  category: "Kategori kepegawaian",
  education: "Pendidikan terakhir",
  company: "Perusahaan",
  location: "Lokasi kerja",
  city: "Kota lokasi kerja",
  directorate: "Direktorat",
  division: "Divisi",
  department: "Unit organisasi",
  position: "Jabatan",
  positionLevel: "Level jabatan",
  grade: "Grade",
  gender: "Jenis kelamin",
  joinYear: "Tahun masuk",
  tenure: "Masa kerja",
  status: "Status aktif",
  religion: "Agama",
  maritalStatus: "Status pernikahan",
  age: "Kelompok umur",
};

/** Kunci baris tanpa nilai (mis. lokasi belum diisi) — selalu di urutan terakhir. */
export const PIVOT_NONE = "NONE";

export const TENURE_BUCKETS = ["<1", "1-3", "3-5", "5-10", "10+"] as const;
export const TENURE_BUCKET_LABELS: Record<(typeof TENURE_BUCKETS)[number], string> = {
  "<1": "< 1 tahun",
  "1-3": "1–3 tahun",
  "3-5": "3–5 tahun",
  "5-10": "5–10 tahun",
  "10+": "≥ 10 tahun",
};

export const AGE_BUCKETS = ["<25", "25-34", "35-44", "45-54", "55+"] as const;
export const AGE_BUCKET_LABELS: Record<(typeof AGE_BUCKETS)[number], string> = {
  "<25": "< 25 tahun",
  "25-34": "25–34 tahun",
  "35-44": "35–44 tahun",
  "45-54": "45–54 tahun",
  "55+": "≥ 55 tahun",
};

export const PIVOT_STATUSES = ["active", "inactive", "all"] as const;
export const pivotStatusSchema = z.enum(PIVOT_STATUSES);
export type PivotStatus = z.infer<typeof pivotStatusSchema>;
export const PIVOT_STATUS_LABELS: Record<PivotStatus, string> = {
  active: "Karyawan aktif",
  inactive: "Karyawan nonaktif",
  all: "Semua karyawan",
};

/** Filter pivot: dimensi → nilai yang dipertahankan (kunci baris dari hasil pivot). */
export const pivotFiltersSchema = z
  .partialRecord(pivotDimensionSchema, z.array(z.string().min(1).max(64)).min(1).max(50))
  .default({});
export type PivotFilters = z.infer<typeof pivotFiltersSchema>;

/** `filter=dim:nilai` (boleh berulang) ↔ objek filter. */
export function encodePivotFilters(filters: PivotFilters): string[] {
  return Object.entries(filters).flatMap(([dimension, values]) =>
    (values ?? []).map((value) => `${dimension}:${value}`),
  );
}

export function decodePivotFilters(raw: string | string[] | undefined): PivotFilters | null {
  const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const filters: Partial<Record<PivotDimension, string[]>> = {};
  for (const item of items) {
    const at = item.indexOf(":");
    const dimension = pivotDimensionSchema.safeParse(item.slice(0, at));
    const value = item.slice(at + 1);
    if (at < 1 || !dimension.success || value.length === 0 || value.length > 64) return null;
    const list = filters[dimension.data] ?? [];
    if (!list.includes(value)) list.push(value);
    filters[dimension.data] = list;
  }
  return filters;
}

export const pivotQuerySchema = z.object({
  rows: pivotDimensionSchema,
  cols: pivotDimensionSchema.optional(),
  status: pivotStatusSchema.default("active"),
  filters: pivotFiltersSchema,
});
export type PivotQuery = z.infer<typeof pivotQuerySchema>;

const pivotKey = z.object({ key: z.string(), label: z.string() });
export const pivotResultSchema = z.object({
  rows: pivotDimensionSchema,
  cols: pivotDimensionSchema.nullable(),
  /** Urutan alami dimensi (ordinal: SD→S3, masa kerja, …) atau terbanyak dulu; "NONE" terakhir. */
  rowKeys: z.array(pivotKey.extend({ total: z.number().int() })),
  colKeys: z.array(pivotKey.extend({ total: z.number().int() })),
  /** Sel bernilai > 0 saja. `col` = "" bila tanpa dimensi kolom. */
  cells: z.array(z.object({ row: z.string(), col: z.string(), count: z.number().int() })),
  total: z.number().int(),
});
export type PivotResult = z.infer<typeof pivotResultSchema>;

/** Dimensi berurutan (ordinal) — sumbu mengikuti urutan alami, warna memakai ramp satu hue. */
export const ORDINAL_PIVOT_DIMENSIONS: readonly PivotDimension[] = [
  "education",
  "positionLevel",
  "joinYear",
  "tenure",
  "age",
];

// ── Widget & susunan dashboard ───────────────────────────────────────────────

export const WIDGET_SIZES = ["sm", "md", "lg"] as const;
export const widgetSizeSchema = z.enum(WIDGET_SIZES);
export type WidgetSize = z.infer<typeof widgetSizeSchema>;
export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  sm: "Kecil (¼)",
  md: "Sedang (½)",
  lg: "Lebar penuh",
};

export const STAT_METRICS = ["total", "active", "inactive", "avgTenure"] as const;
export const statMetricSchema = z.enum(STAT_METRICS);
export type StatMetric = z.infer<typeof statMetricSchema>;
export const STAT_METRIC_LABELS: Record<StatMetric, string> = {
  total: "Total Karyawan",
  active: "Karyawan Aktif",
  inactive: "Karyawan Nonaktif",
  avgTenure: "Rata-rata Masa Kerja",
};

export const PIVOT_CHART_TYPES = [
  "bar",
  "stacked",
  "percent",
  "grouped",
  "heatmap",
  "donut",
  "table",
] as const;
export const pivotChartTypeSchema = z.enum(PIVOT_CHART_TYPES);
export type PivotChartType = z.infer<typeof pivotChartTypeSchema>;
export const PIVOT_CHART_TYPE_LABELS: Record<PivotChartType, string> = {
  bar: "Bar",
  stacked: "Bar bertumpuk",
  percent: "Bar 100%",
  grouped: "Bar berdampingan",
  heatmap: "Heatmap",
  donut: "Donut",
  table: "Tabel",
};

export const PIVOT_SORTS = ["natural", "count", "label"] as const;
export const pivotSortSchema = z.enum(PIVOT_SORTS);
export type PivotSort = z.infer<typeof pivotSortSchema>;
export const PIVOT_SORT_LABELS: Record<PivotSort, string> = {
  natural: "Urutan bawaan",
  count: "Terbanyak dulu",
  label: "Abjad",
};

const widgetId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const widgetTitle = z.string().trim().min(1).max(80);

export const statWidgetSchema = z.object({
  id: widgetId,
  kind: z.literal("stat"),
  size: widgetSizeSchema,
  metric: statMetricSchema,
});

export const pivotWidgetSchema = z.object({
  id: widgetId,
  kind: z.literal("pivot"),
  size: widgetSizeSchema,
  title: widgetTitle,
  rows: pivotDimensionSchema,
  cols: pivotDimensionSchema.nullable(),
  chart: pivotChartTypeSchema,
  status: pivotStatusSchema,
  filters: pivotFiltersSchema,
  sort: pivotSortSchema,
  /** Baris terbanyak yang digambar; sisanya digabung "Lainnya". */
  limit: z.number().int().min(3).max(50),
  horizontal: z.boolean(),
});

export const shortcutsWidgetSchema = z.object({
  id: widgetId,
  kind: z.literal("shortcuts"),
  size: widgetSizeSchema,
  title: widgetTitle,
  /** id item navigasi (NAV_GROUPS di web); item yang tak boleh diakses diabaikan saat tampil. */
  items: z.array(z.string().min(1).max(60)).max(16),
});

export const dashboardWidgetSchema = z.discriminatedUnion("kind", [
  statWidgetSchema,
  pivotWidgetSchema,
  shortcutsWidgetSchema,
]);
export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;
export type StatWidget = z.infer<typeof statWidgetSchema>;
export type PivotWidget = z.infer<typeof pivotWidgetSchema>;
export type ShortcutsWidget = z.infer<typeof shortcutsWidgetSchema>;

export const DASHBOARD_LAYOUT_VERSION = 1;
export const MAX_DASHBOARD_WIDGETS = 40;

export const dashboardLayoutSchema = z
  .object({
    version: z.literal(DASHBOARD_LAYOUT_VERSION),
    widgets: z.array(dashboardWidgetSchema).max(MAX_DASHBOARD_WIDGETS),
  })
  .refine((layout) => new Set(layout.widgets.map((w) => w.id)).size === layout.widgets.length, {
    message: "id widget harus unik",
    path: ["widgets"],
  });
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

const pivot = (
  id: string,
  title: string,
  rows: PivotDimension,
  cols: PivotDimension | null,
  chart: PivotChartType,
  extra: Partial<PivotWidget> = {},
): PivotWidget => ({
  id,
  kind: "pivot",
  size: "md",
  title,
  rows,
  cols,
  chart,
  status: "active",
  filters: {},
  sort: "natural",
  limit: 12,
  horizontal: true,
  ...extra,
});

/** Susunan bawaan (akun yang belum pernah menyimpan, atau "Reset ke bawaan"). */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  version: DASHBOARD_LAYOUT_VERSION,
  widgets: [
    { id: "stat-total", kind: "stat", size: "sm", metric: "total" },
    { id: "stat-active", kind: "stat", size: "sm", metric: "active" },
    { id: "stat-inactive", kind: "stat", size: "sm", metric: "inactive" },
    { id: "stat-tenure", kind: "stat", size: "sm", metric: "avgTenure" },
    {
      id: "shortcuts",
      kind: "shortcuts",
      size: "lg",
      title: "Menu Cepat",
      items: ["active-semua", "import", "onboarding", "structure", "master-companies", "accounts"],
    },
    pivot("category", "Distribusi Kategori", "category", null, "donut"),
    pivot("education", "Pendidikan per Kategori", "education", "category", "stacked"),
    pivot("location", "Lokasi Kerja per Kategori", "location", "category", "stacked", {
      sort: "count",
      limit: 10,
    }),
    pivot("department", "Distribusi Unit per Kategori", "department", "category", "stacked", {
      sort: "count",
      limit: 10,
    }),
    pivot("position-level", "Level Jabatan", "positionLevel", null, "bar"),
    pivot("join-year", "Tren Tahun Masuk", "joinYear", null, "bar", { horizontal: false }),
  ],
};
