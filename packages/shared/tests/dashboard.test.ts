import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  dashboardLayoutSchema,
  decodePivotFilters,
  encodePivotFilters,
  isSensitivePivotDimension,
} from "../src/dashboard.ts";

describe("filter pivot (query `filter=dim:nilai`)", () => {
  test("encode → decode kembali ke objek yang sama", () => {
    const filters = { category: ["PERMANENT", "PKWT"], education: ["SD"] };
    expect(decodePivotFilters(encodePivotFilters(filters))).toEqual(filters);
  });

  test("satu nilai (bukan array) dan nilai ganda dirapikan", () => {
    expect(decodePivotFilters("gender:MALE")).toEqual({ gender: ["MALE"] });
    expect(decodePivotFilters(["gender:MALE", "gender:MALE"])).toEqual({ gender: ["MALE"] });
    expect(decodePivotFilters(undefined)).toEqual({});
  });

  test("nilai boleh mengandung titik dua (hanya pemisah pertama yang dipakai)", () => {
    expect(decodePivotFilters("city:A:B")).toEqual({ city: ["A:B"] });
  });

  test("dimensi tak dikenal / tanpa nilai / tanpa pemisah → null (400)", () => {
    expect(decodePivotFilters("salary:10")).toBeNull();
    expect(decodePivotFilters("gender:")).toBeNull();
    expect(decodePivotFilters("gender")).toBeNull();
    expect(decodePivotFilters(`city:${"x".repeat(65)}`)).toBeNull();
  });
});

describe("susunan dashboard", () => {
  test("susunan bawaan valid", () => {
    expect(dashboardLayoutSchema.safeParse(DEFAULT_DASHBOARD_LAYOUT).success).toBe(true);
  });

  test("id widget ganda ditolak", () => {
    const [first] = DEFAULT_DASHBOARD_LAYOUT.widgets;
    const result = dashboardLayoutSchema.safeParse({
      version: 1,
      widgets: [first, first],
    });
    expect(result.success).toBe(false);
  });

  test("versi lain & jenis widget tak dikenal ditolak", () => {
    expect(dashboardLayoutSchema.safeParse({ version: 2, widgets: [] }).success).toBe(false);
    expect(
      dashboardLayoutSchema.safeParse({
        version: 1,
        widgets: [{ id: "x", kind: "script", size: "sm" }],
      }).success,
    ).toBe(false);
  });

  test("dimensi sensitif ditandai", () => {
    expect(isSensitivePivotDimension("religion")).toBe(true);
    expect(isSensitivePivotDimension("age")).toBe(true);
    expect(isSensitivePivotDimension("education")).toBe(false);
  });
});

describe("widget kecil hanya donut / bar (2026-10-21)", () => {
  test("dikecilkan → grafik selain donut/bar menjadi donut; ukuran lain tidak berubah", async () => {
    const { chartAllowedForSize, fitWidgetToSize } = await import("../src/index.ts");
    const found = DEFAULT_DASHBOARD_LAYOUT.widgets.find((w) => w.kind === "pivot");
    if (found?.kind !== "pivot") throw new Error("layout bawaan tanpa widget pivot");
    const base: typeof found = { ...found, size: "sm", chart: "heatmap" };
    expect(chartAllowedForSize("bar", "sm")).toBe(true);
    expect(chartAllowedForSize("stacked", "sm")).toBe(false);
    expect(chartAllowedForSize("heatmap", "md")).toBe(true);
    expect(fitWidgetToSize(base).chart).toBe("donut");
    expect(fitWidgetToSize<typeof found>({ ...base, chart: "bar" }).chart).toBe("bar");
    expect(fitWidgetToSize<typeof found>({ ...base, size: "md" }).chart).toBe("heatmap");
  });
});

describe("dashboard 3 section tetap (2026-10-21)", () => {
  test("angka → Menu Cepat → grafik; urutan di dalam section dipertahankan", async () => {
    const { orderBySection, widgetSection } = await import("../src/index.ts");
    const widgets = [...DEFAULT_DASHBOARD_LAYOUT.widgets].reverse();
    const ordered = orderBySection(widgets);
    const sections = ordered.map(widgetSection);
    expect(sections).toEqual(
      [...sections].sort(
        (a, b) =>
          ["stats", "shortcuts", "charts"].indexOf(a) - ["stats", "shortcuts", "charts"].indexOf(b),
      ),
    );
    const charts = widgets.filter((w) => w.kind === "pivot").map((w) => w.id);
    expect(ordered.filter((w) => w.kind === "pivot").map((w) => w.id)).toEqual(charts);
  });
});

describe("widget Analitik SDM & biaya (DSB-D1)", () => {
  test("widget insight valid; jenis insight tak dikenal ditolak", () => {
    const ok = dashboardLayoutSchema.safeParse({
      version: 1,
      widgets: [{ id: "insight-x", kind: "insight", size: "sm", insight: "liability" }],
    });
    expect(ok.success).toBe(true);
    const bad = dashboardLayoutSchema.safeParse({
      version: 1,
      widgets: [{ id: "insight-x", kind: "insight", size: "sm", insight: "salary" }],
    });
    expect(bad.success).toBe(false);
  });

  test("susunan lama (tanpa insight & statistik analitik) tetap valid", () => {
    const old = {
      version: 1,
      widgets: DEFAULT_DASHBOARD_LAYOUT.widgets.filter(
        (w) => w.kind === "pivot" || w.kind === "shortcuts" || w.id === "stat-total",
      ),
    };
    expect(old.widgets.some((w) => w.kind === "insight")).toBe(false);
    expect(dashboardLayoutSchema.safeParse(old).success).toBe(true);
  });

  test("insight → section Grafik; statistik analitik → Angka ringkas; ukuran tidak diubah", async () => {
    const { fitWidgetToSize, widgetSection } = await import("../src/index.ts");
    const widget = { id: "i", kind: "insight", size: "sm", insight: "headcount" } as const;
    expect(widgetSection(widget)).toBe("charts");
    expect(widgetSection({ id: "s", kind: "stat", size: "sm", metric: "turnover" })).toBe("stats");
    expect(fitWidgetToSize(widget)).toEqual(widget);
  });

  test("susunan bawaan memuat statistik & insight analitik setelah widget lama", () => {
    const ids = DEFAULT_DASHBOARD_LAYOUT.widgets.map((w) => w.id);
    expect(ids.slice(4, 6)).toEqual(["stat-turnover", "stat-onleave"]);
    expect(ids.slice(-7)).toEqual([
      "insight-headcount",
      "insight-gender",
      "insight-tenureleave",
      "insight-efficiency",
      "insight-projection",
      "insight-laborcost",
      "insight-liability",
    ]);
  });
});
