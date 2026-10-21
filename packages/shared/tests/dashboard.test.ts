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
