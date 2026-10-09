import {
  type DashboardWidget,
  DEFAULT_DASHBOARD_LAYOUT,
  isSensitivePivotDimension,
  type PivotWidget,
  type ShortcutsWidget,
  STAT_METRICS,
  type StatWidget,
} from "@hris/shared";

// D-065: katalog "Tambah widget" — template grafik siap pakai + widget statistik & Menu Cepat.

const pivot = (
  id: string,
  title: string,
  rows: PivotWidget["rows"],
  cols: PivotWidget["cols"],
  chart: PivotWidget["chart"],
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

const DEFAULT_PIVOTS = DEFAULT_DASHBOARD_LAYOUT.widgets.filter(
  (w): w is PivotWidget => w.kind === "pivot",
);

export const PIVOT_TEMPLATES: PivotWidget[] = [
  ...DEFAULT_PIVOTS,
  pivot("gender-category", "Jenis Kelamin per Kategori", "category", "gender", "percent"),
  pivot("tenure-department", "Masa Kerja per Unit", "department", "tenure", "heatmap", {
    sort: "count",
    size: "lg",
  }),
  pivot("grade-level", "Grade × Level Jabatan", "grade", "positionLevel", "heatmap", {
    sort: "label",
  }),
  pivot("company-category", "Perusahaan per Kategori", "company", "category", "stacked", {
    sort: "count",
  }),
  pivot("city-category", "Kota Lokasi Kerja per Kategori", "city", "category", "grouped", {
    sort: "count",
  }),
  pivot("division-education", "Pendidikan per Divisi", "division", "education", "percent", {
    sort: "count",
    size: "lg",
  }),
  pivot("exits", "Karyawan Keluar per Tahun Masuk", "joinYear", "category", "stacked", {
    status: "inactive",
    horizontal: false,
  }),
  pivot("age-gender", "Kelompok Umur per Jenis Kelamin", "age", "gender", "grouped"),
  pivot("religion", "Distribusi Agama", "religion", null, "donut"),
  pivot(
    "marital-category",
    "Status Pernikahan per Kategori",
    "category",
    "maritalStatus",
    "percent",
  ),
];

export const usesPersonalData = (widget: PivotWidget) =>
  [widget.rows, ...(widget.cols ? [widget.cols] : []), ...Object.keys(widget.filters)].some((d) =>
    isSensitivePivotDimension(d as PivotWidget["rows"]),
  );

export const STAT_TEMPLATES: StatWidget[] = STAT_METRICS.map((metric) => ({
  id: `stat-${metric.toLowerCase()}`,
  kind: "stat",
  size: "sm",
  metric,
}));

export const SHORTCUTS_TEMPLATE: ShortcutsWidget = {
  id: "shortcuts",
  kind: "shortcuts",
  size: "lg",
  title: "Menu Cepat",
  items: [],
};

export const BLANK_PIVOT: PivotWidget = pivot("chart", "Grafik baru", "category", null, "bar");

/** id unik baru (pola dashboardLayoutSchema: huruf kecil, angka, tanda hubung, ≤ 40). */
export function newWidgetId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const stem =
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 28) || "widget";
  for (;;) {
    const id = `${stem}-${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

export function withNewId<T extends DashboardWidget>(widget: T, taken: Iterable<string>): T {
  return { ...widget, id: newWidgetId(widget.id, taken) };
}
