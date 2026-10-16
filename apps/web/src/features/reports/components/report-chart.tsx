import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef } from "react";
import { CHROME } from "@/features/dashboard/palette";
import { useThemeMode } from "@/features/dashboard/pivot-chart";
import { cn } from "@/lib/utils";

// ARS-D16: grafik batang sederhana untuk laporan (palet & tinta sama dengan Dashboard D-065: urutan
// slot kategorikal aman buta warna). Selalu didampingi tabel angka di halaman (relief rule).

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const PALETTE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
} as const;
const FONT = '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

export interface ReportChartProps {
  label: string;
  categories: string[];
  series: { name: string; data: number[] }[];
  stacked?: boolean;
  horizontal?: boolean;
  height?: number;
  /** Klik kolom kategori (di mana saja dalam area grafik) → indeks kategori. */
  onSelect?: (index: number) => void;
  /** Kategori terpilih: kategori lain diredupkan. */
  selectedIndex?: number | undefined;
}

export function ReportChart({
  label,
  categories,
  series,
  stacked = false,
  horizontal = false,
  height = 260,
  onSelect,
  selectedIndex,
}: ReportChartProps) {
  const mount = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);
  const mode = useThemeMode();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const horizontalRef = useRef(horizontal);
  horizontalRef.current = horizontal;
  const option = useMemo(() => {
    const ink = CHROME[mode];
    const category = {
      type: "category" as const,
      data: categories,
      axisLine: { lineStyle: { color: ink.axis } },
      axisTick: { show: false },
      axisLabel: { color: ink.muted, fontSize: 11, fontFamily: FONT },
    };
    const value = {
      type: "value" as const,
      minInterval: 1,
      splitLine: { lineStyle: { color: ink.grid } },
      axisLabel: { color: ink.muted, fontSize: 11, fontFamily: FONT },
    };
    return {
      animation: false,
      color: [...PALETTE[mode]],
      textStyle: { fontFamily: FONT, color: ink.ink },
      grid: { left: 8, right: 16, top: series.length > 1 ? 36 : 12, bottom: 8, containLabel: true },
      legend:
        series.length > 1
          ? {
              top: 0,
              icon: "roundRect",
              itemWidth: 10,
              itemHeight: 10,
              textStyle: { color: ink.ink },
            }
          : undefined,
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: mode === "dark" ? "#27272a" : "#ffffff",
        borderColor: ink.axis,
        textStyle: { color: ink.ink, fontSize: 12, fontFamily: FONT },
      },
      xAxis: horizontal ? value : category,
      yAxis: horizontal ? { ...category, inverse: true } : value,
      series: series.map((s) => ({
        name: s.name,
        type: "bar",
        data: s.data.map((v, i) =>
          selectedIndex === undefined || i === selectedIndex
            ? v
            : { value: v, itemStyle: { opacity: 0.3 } },
        ),
        cursor: onSelect ? "pointer" : "default",
        stack: stacked ? "total" : undefined,
        barMaxWidth: 28,
        itemStyle: { borderRadius: stacked ? 0 : 3 },
      })),
    };
  }, [categories, series, stacked, horizontal, mode, selectedIndex, onSelect]);

  useEffect(() => {
    if (!mount.current) return;
    const chart = echarts.init(mount.current, null, { renderer: "canvas" });
    instance.current = chart;
    // Klik di mana saja dalam kolom kategori (bukan hanya batang): bulan dengan nilai 0 tetap bisa dipilih.
    chart.getZr().on("click", (event) => {
      const point = [event.offsetX, event.offsetY];
      if (!onSelectRef.current || !chart.containPixel("grid", point)) return;
      const [x, y] = chart.convertFromPixel("grid", point) as number[];
      const index = Math.round((horizontalRef.current ? y : x) ?? -1);
      if (index >= 0) onSelectRef.current(index);
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(mount.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    instance.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={mount}
      role="img"
      aria-label={label}
      className={cn("w-full", onSelect && "cursor-pointer")}
      style={{ height }}
    />
  );
}
