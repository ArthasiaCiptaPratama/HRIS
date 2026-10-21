import type { PivotChartType, PivotDimension } from "@hris/shared";
import { BarChart, HeatmapChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CHROME, HEATMAP_RAMP, type Mode, SINGLE, seriesColors } from "./palette";
import { type PivotView, percent } from "./pivot-data";

// D-065: satu komponen ECharts untuk semua bentuk widget pivot. Tanpa sumbu ganda; tooltip & legend
// selalu ada untuk ≥ 2 seri; teks memakai warna tinta (bukan warna seri).

echarts.use([
  BarChart,
  HeatmapChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

type ChartOption = Parameters<ReturnType<typeof echarts.init>["setOption"]>[0];

// ── Tema: ikuti kelas .dark di <html> (toggle tema aplikasi) ─────────────────
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const readMode = (): Mode =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
export const useThemeMode = () =>
  useSyncExternalStore<Mode>(subscribeTheme, readMode, () => "light");

const FONT = '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Label master data diisi pengguna → wajib di-escape sebelum masuk tooltip HTML. */
const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
const fmt = new Intl.NumberFormat("id-ID");
const dot = (color: string) =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${color}"></span>`;

export interface PivotChartProps {
  view: PivotView;
  chart: Exclude<PivotChartType, "table">;
  rowsDim: PivotDimension;
  colsDim: PivotDimension | null;
  horizontal: boolean;
  label: string;
  /** Lebar area grafik (px) — widget kecil memakai label & sumbu yang lebih ringkas. */
  width?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function chartHeight(view: PivotView, chart: PivotChartProps["chart"], horizontal: boolean) {
  const rows = view.rows.length;
  if (chart === "donut") return 280;
  if (chart === "heatmap") return Math.min(Math.max(rows * 30 + 90, 220), 620);
  if (!horizontal) return 280;
  const legend = view.cols.length > 1 ? 36 : 0;
  return Math.min(Math.max(rows * 30 + 50 + legend, 180), 620);
}

/**
 * Total donut yang masih tampil: baris yang dimatikan lewat legenda tidak dihitung (permintaan pemilik
 * projek 2026-10-21 — angka tengah ikut berkurang saat ada yang di-unselect).
 */
export function donutVisibleTotal(view: PivotView, hidden: readonly string[]): number {
  if (hidden.length === 0) return view.total;
  const off = new Set(hidden);
  return view.rows.reduce((sum, r) => (off.has(r.label) ? sum : sum + r.total), 0);
}

/** Diekspor untuk pratinjau render di luar React (cek visual). `hidden` = label legenda yang dimatikan. */
export function buildOption(
  props: PivotChartProps,
  mode: Mode,
  animate: boolean,
  hidden: readonly string[] = [],
): ChartOption {
  const { view, chart, horizontal } = props;
  const width = props.width ?? 600;
  // Widget sempit (mis. 1/3 atau 1/4 lebar): sumbu & label diringkas supaya tidak bertumpuk.
  const compact = width < 420;
  const ink = CHROME[mode];
  const base = {
    animation: animate,
    animationDuration: 400,
    textStyle: { fontFamily: FONT, color: ink.ink },
    tooltip: {
      confine: true,
      backgroundColor: mode === "dark" ? "#27272a" : "#ffffff",
      borderColor: ink.axis,
      textStyle: { color: ink.ink, fontSize: 12, fontFamily: FONT },
      extraCssText: "border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);",
    },
  };
  const rowLabels = view.rows.map((r) => r.label);
  const hasSeries = view.cols.length > 0;

  // ── Donut ──
  if (chart === "donut") {
    const colors = seriesColors(
      props.rowsDim,
      view.rows.map((r) => r.key),
      mode,
    );
    const visibleTotal = donutVisibleTotal(view, hidden);
    return {
      ...base,
      title: {
        text: fmt.format(visibleTotal),
        subtext: "karyawan",
        left: "center",
        top: "36%",
        textStyle: { fontSize: 24, fontWeight: 700, color: ink.ink, fontFamily: FONT },
        subtextStyle: { fontSize: 11, color: ink.muted, fontFamily: FONT },
        itemGap: 2,
      },
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (p: { name: string; value: number; color: string }) =>
          `${dot(p.color)}<b>${esc(p.name)}</b><br/>${fmt.format(p.value)} orang · ${percent(p.value, visibleTotal)}%`,
      },
      legend: {
        type: "scroll",
        // Status legenda dipertahankan saat opsi dibangun ulang (setOption notMerge).
        selected: Object.fromEntries(hidden.map((name) => [name, false])),
        bottom: 0,
        icon: "roundRect",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: ink.ink, fontSize: 11 },
        pageTextStyle: { color: ink.muted },
      },
      series: [
        {
          type: "pie",
          radius: ["52%", "76%"],
          center: ["50%", "44%"],
          avoidLabelOverlap: true,
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          itemStyle: { borderColor: ink.surface, borderWidth: 2, borderRadius: 4 },
          data: view.rows.map((r) => ({
            name: r.label,
            value: r.total,
            itemStyle: { color: colors.get(r.key) },
          })),
        },
      ],
    };
  }

  // ── Heatmap (baris × kolom; tanpa kolom = satu kolom "Jumlah") ──
  if (chart === "heatmap") {
    const cols = hasSeries ? view.cols : [{ key: "", label: "Jumlah", total: view.total }];
    const data: { value: [number, number, number]; label: { color: string } }[] = [];
    let max = 0;
    view.rows.forEach((r, y) => {
      cols.forEach((c, x) => {
        const v = hasSeries ? view.value(r.key, c.key) : r.total;
        max = Math.max(max, v);
        if (v > 0) data.push({ value: [x, y, v], label: { color: ink.ink } });
      });
    });
    // Terang: dekat nol = muda; gelap: dekat nol tenggelam ke permukaan (ramp dibalik).
    // Lebar sel menentukan: angka di sel (disembunyikan bila tak muat; tetap ada di tooltip) & label kolom.
    const yLabelWidth = Math.round(clamp(width * 0.3, 56, 140));
    const cellWidth = (width - yLabelWidth - 24) / Math.max(cols.length, 1);
    const cellLabel = cellWidth >= 22;
    const colRotate = cellWidth < 70 ? 90 : cols.length > 4 ? 30 : 0;
    const ramp =
      mode === "light" ? HEATMAP_RAMP.slice(0, 11) : [...HEATMAP_RAMP].reverse().slice(1, 11);
    for (const item of data) {
      const strong = item.value[2] / (max || 1) > 0.55;
      item.label.color =
        mode === "light" ? (strong ? "#ffffff" : ink.ink) : strong ? "#0b0b0b" : ink.ink;
    }
    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (p: { value: [number, number, number] }) => {
          const [x, y, v] = p.value;
          const row = view.rows[y];
          const col = cols[x];
          return `<b>${esc(row?.label ?? "")}</b>${hasSeries ? ` · ${esc(col?.label ?? "")}` : ""}<br/>${fmt.format(v)} orang · ${percent(v, row?.total ?? 0)}% dari baris`;
        },
      },
      grid: { left: 8, right: 8, top: 8, bottom: 44, containLabel: true },
      xAxis: {
        type: "category",
        data: cols.map((c) => c.label),
        position: "top",
        // Banyak kolom → label dimiringkan supaya tidak bertabrakan (nama lengkap ada di tooltip).
        axisLabel: {
          show: cellWidth >= 12,
          color: ink.muted,
          fontSize: compact ? 10 : 11,
          interval: 0,
          rotate: colRotate,
          width:
            colRotate === 90 ? (compact ? 64 : 84) : colRotate ? 96 : Math.max(cellWidth - 4, 40),
          overflow: "truncate",
          hideOverlap: true,
        },
        axisTick: { show: false },
        axisLine: { show: false },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: rowLabels,
        inverse: true,
        axisLabel: {
          color: ink.muted,
          fontSize: compact ? 10 : 11,
          width: yLabelWidth,
          overflow: "truncate",
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      visualMap: {
        min: 0,
        max: Math.max(max, 1),
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemHeight: clamp(width * 0.4, 60, 120),
        itemWidth: 10,
        calculable: false,
        textStyle: { color: ink.muted, fontSize: 10 },
        inRange: { color: ramp },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: cellLabel, fontSize: cellWidth < 30 ? 10 : 11 },
          itemStyle: { borderColor: ink.surface, borderWidth: 2, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: ink.ink, borderWidth: 1 } },
        },
      ],
    };
  }

  // ── Bar: tunggal / bertumpuk / 100% / berdampingan ──
  const multi = hasSeries && chart !== "bar";
  const stack = chart === "stacked" || chart === "percent";
  const asPercent = chart === "percent";
  const colors = seriesColors(props.colsDim ?? props.rowsDim, view.colOrder, mode);

  const categoryAxis = {
    type: "category" as const,
    data: rowLabels,
    inverse: horizontal,
    axisLabel: {
      color: ink.muted,
      width: horizontal ? Math.round(clamp(width * 0.32, 56, 150)) : compact ? 56 : 80,
      overflow: "truncate" as const,
      interval: horizontal ? 0 : ("auto" as const),
      rotate: !horizontal && (rowLabels.length > 8 || (compact && rowLabels.length > 4)) ? 35 : 0,
      fontSize: compact ? 10 : 11,
    },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: ink.axis } },
  };
  const valueAxis = {
    type: "value" as const,
    max: asPercent ? 100 : undefined,
    // Sempit: lebih sedikit garis bantu supaya angka sumbu tidak bertumpuk.
    ...(asPercent
      ? { interval: compact ? 50 : width < 640 ? 25 : 20 }
      : { splitNumber: compact ? 2 : width < 640 ? 3 : 5 }),
    axisLabel: {
      color: ink.muted,
      fontSize: compact ? 10 : 11,
      formatter: asPercent ? "{value}%" : undefined,
      hideOverlap: true,
    },
    splitLine: { lineStyle: { color: ink.grid } },
  };
  const radius = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];

  const series = multi
    ? view.cols.map((c, i) => ({
        name: c.label,
        type: "bar" as const,
        stack: stack ? "total" : undefined,
        barMaxWidth: stack ? 26 : 14,
        emphasis: { focus: "series" as const },
        itemStyle: {
          color: colors.get(c.key),
          borderColor: ink.surface,
          borderWidth: stack ? 1 : 0,
          // Ujung bulat hanya di segmen terluar tumpukan.
          borderRadius: !stack || i === view.cols.length - 1 ? radius : 0,
        },
        data: view.rows.map((r) => {
          const v = view.value(r.key, c.key);
          return asPercent ? percent(v, r.total) : v;
        }),
      }))
    : [
        {
          name: "Jumlah",
          type: "bar" as const,
          barMaxWidth: 26,
          itemStyle: { color: SINGLE[mode], borderRadius: radius },
          label: {
            show: true,
            position: horizontal ? ("right" as const) : ("top" as const),
            color: ink.ink,
            fontSize: 11,
            formatter: (p: { value: number }) => fmt.format(p.value),
          },
          data: view.rows.map((r) => r.total),
        },
      ];

  return {
    ...base,
    legend: multi
      ? {
          type: "scroll",
          top: 0,
          left: 0,
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: ink.ink, fontSize: 11 },
          pageTextStyle: { color: ink.muted },
        }
      : undefined,
    // Label nilai di atas bar tegak butuh ruang di atas; di ujung bar mendatar butuh ruang kanan.
    grid: {
      left: 4,
      right: multi || !horizontal ? 12 : 36,
      top: multi ? 36 : horizontal ? 8 : 22,
      bottom: 4,
      containLabel: true,
    },
    tooltip: {
      ...base.tooltip,
      trigger: "axis",
      axisPointer: {
        type: "shadow",
        shadowStyle: { color: mode === "dark" ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)" },
      },
      formatter: (params: { dataIndex: number; seriesName: string; color: string }[]) => {
        const row = view.rows[params[0]?.dataIndex ?? 0];
        if (!row) return "";
        const head = `<b>${esc(row.label)}</b> · ${fmt.format(row.total)} orang (${percent(row.total, view.total)}%)`;
        if (!multi) return head;
        const lines = params
          .map((p) => {
            const col = view.cols.find((c) => c.label === p.seriesName);
            const v = col ? view.value(row.key, col.key) : 0;
            if (v === 0) return "";
            return `<div style="display:flex;justify-content:space-between;gap:16px">${`<span>${dot(p.color)}${esc(p.seriesName)}</span>`}<span><b>${fmt.format(v)}</b> · ${percent(v, row.total)}%</span></div>`;
          })
          .join("");
        return `${head}<div style="margin-top:6px">${lines}</div>`;
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series,
  };
}

export function PivotChart(props: PivotChartProps) {
  const mount = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);
  const mode = useThemeMode();
  const animate = useMemo(
    () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const { view, chart, rowsDim, colsDim, horizontal, label } = props;
  // Donut: label legenda yang dimatikan (angka tengah & persen dihitung dari yang masih tampil).
  const [hidden, setHidden] = useState<string[]>([]);
  // Lebar widget (dibulatkan per 20 px supaya tidak membangun ulang opsi di setiap piksel).
  const [width, setWidth] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: data/bentuk baru → semua item tampil lagi
  useEffect(() => setHidden([]), [view, chart]);
  const option = useMemo(
    () =>
      buildOption(
        { view, chart, rowsDim, colsDim, horizontal, label, ...(width ? { width } : {}) },
        mode,
        animate,
        chart === "donut" ? hidden : [],
      ),
    [view, chart, rowsDim, colsDim, horizontal, label, mode, animate, hidden, width],
  );
  const height = chartHeight(props.view, props.chart, props.horizontal);

  useEffect(() => {
    if (!mount.current) return;
    const chart = echarts.init(mount.current, null, { renderer: "canvas" });
    instance.current = chart;
    const observer = new ResizeObserver((entries) => {
      chart.resize();
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w / 20) * 20);
    });
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

  useEffect(() => {
    const instanceNow = instance.current;
    if (!instanceNow || chart !== "donut") return;
    const onLegend = (event: unknown) => {
      const selected = (event as { selected?: Record<string, boolean> }).selected ?? {};
      setHidden(
        Object.entries(selected)
          .filter(([, on]) => !on)
          .map(([name]) => name),
      );
    };
    instanceNow.on("legendselectchanged", onLegend);
    return () => {
      instanceNow.off("legendselectchanged", onLegend);
    };
  }, [chart]);

  return (
    <div ref={mount} role="img" aria-label={props.label} className="w-full" style={{ height }} />
  );
}
