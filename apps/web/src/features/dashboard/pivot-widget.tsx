import {
  ORDINAL_PIVOT_DIMENSIONS,
  PIVOT_CHART_TYPE_LABELS,
  PIVOT_CHART_TYPES,
  PIVOT_DIMENSION_LABELS,
  PIVOT_STATUS_LABELS,
  type PivotChartType,
  type PivotWidget,
} from "@hris/shared";
import {
  ChartBar,
  ChartBarStacked,
  ChartColumn,
  ChartPie,
  Grid3x3,
  type LucideIcon,
  Percent,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { usePivot } from "./api";
import { PivotChart } from "./pivot-chart";
import { buildPivotView, type PivotView, percent } from "./pivot-data";
import { type DragHandleProps, useBoard, WidgetShell } from "./widget-shell";

// D-062: widget pivot — grafik bebas atur (baris × kolom + filter) atau tabel.

export const CHART_ICONS: Record<PivotChartType, LucideIcon> = {
  bar: ChartBar,
  stacked: ChartBarStacked,
  percent: Percent,
  grouped: ChartColumn,
  heatmap: Grid3x3,
  donut: ChartPie,
  table: Table2,
};

/** Bentuk yang butuh dimensi kolom. */
export const NEEDS_COLUMNS: readonly PivotChartType[] = ["stacked", "percent", "grouped"];

const fmt = new Intl.NumberFormat("id-ID");

export function describePivot(widget: PivotWidget, total?: number) {
  const parts = [
    `${PIVOT_DIMENSION_LABELS[widget.rows]}${widget.cols ? ` × ${PIVOT_DIMENSION_LABELS[widget.cols]}` : ""}`,
  ];
  if (widget.status !== "active") parts.push(PIVOT_STATUS_LABELS[widget.status]);
  const filters = Object.keys(widget.filters).length;
  if (filters > 0) parts.push(`${filters} filter`);
  if (total !== undefined) parts.push(`${fmt.format(total)} karyawan`);
  return parts.join(" · ");
}

export function PivotTable({ view, widget }: { view: PivotView; widget: PivotWidget }) {
  const hasCols = view.cols.length > 0;
  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-muted/60 sticky top-0 backdrop-blur">
          <tr>
            <th className="px-3 py-2 text-left font-medium">
              {PIVOT_DIMENSION_LABELS[widget.rows]}
            </th>
            {view.cols.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {c.label}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold">Total</th>
            <th className="text-muted-foreground px-3 py-2 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.key} className="hover:bg-muted/40 border-t">
              <td className="max-w-[220px] truncate px-3 py-1.5" title={r.label}>
                {r.label}
              </td>
              {view.cols.map((c) => {
                const v = view.value(r.key, c.key);
                return (
                  <td
                    key={c.key}
                    className={cn("px-3 py-1.5 text-right", v === 0 && "text-muted-foreground/50")}
                  >
                    {v === 0 ? "–" : fmt.format(v)}
                  </td>
                );
              })}
              <td className="px-3 py-1.5 text-right font-semibold">{fmt.format(r.total)}</td>
              <td className="text-muted-foreground px-3 py-1.5 text-right">
                {percent(r.total, view.total)}%
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/40 border-t font-semibold">
          <tr>
            <td className="px-3 py-2">Total</td>
            {hasCols &&
              view.cols.map((c) => (
                <td key={c.key} className="px-3 py-2 text-right">
                  {fmt.format(c.total)}
                </td>
              ))}
            <td className="px-3 py-2 text-right">{fmt.format(view.total)}</td>
            <td className="text-muted-foreground px-3 py-2 text-right">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Isi widget (tanpa bingkai) — dipakai widget di board dan pratinjau di pembuat grafik. */
export function PivotBody({
  widget,
  forceTable = false,
  onTotal,
}: {
  widget: PivotWidget;
  forceTable?: boolean;
  onTotal?: (total: number) => void;
}) {
  const params = useMemo(
    () => ({
      rows: widget.rows,
      cols: widget.cols,
      status: widget.status,
      filters: widget.filters,
    }),
    [widget.rows, widget.cols, widget.status, widget.filters],
  );
  const query = usePivot(params);
  const chart: PivotChartType =
    !widget.cols && NEEDS_COLUMNS.includes(widget.chart) ? "bar" : widget.chart;
  const asTable = forceTable || chart === "table";
  const ordinalCols = widget.cols !== null && ORDINAL_PIVOT_DIMENSIONS.includes(widget.cols);

  const view = useMemo(
    () =>
      query.data
        ? buildPivotView(query.data, {
            sort: widget.sort,
            limit: asTable ? null : widget.limit,
            rowsAsSeries: chart === "donut",
            seriesLimit: ordinalCols ? 12 : undefined,
          })
        : null,
    [query.data, widget.sort, widget.limit, asTable, chart, ordinalCols],
  );
  const total = view?.total;
  useEffect(() => {
    if (total !== undefined) onTotal?.(total);
  }, [total, onTotal]);

  if (query.isPending) return <Skeleton className="h-[220px] w-full rounded-lg" />;
  if (query.isError) {
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <div className="text-muted-foreground flex h-[180px] items-center justify-center rounded-lg border border-dashed px-6 text-center text-xs">
        {forbidden
          ? "Widget ini memakai data pribadi (agama, status pernikahan, umur) yang butuh grant baca data pribadi."
          : "Gagal memuat data widget."}
      </div>
    );
  }
  if (!view || view.total === 0) {
    return (
      <div className="text-muted-foreground flex h-[180px] items-center justify-center rounded-lg border border-dashed text-xs">
        Tidak ada karyawan yang cocok dengan pengaturan ini.
      </div>
    );
  }
  if (asTable) return <PivotTable view={view} widget={widget} />;
  return (
    <div className={cn("transition-opacity", query.isFetching && "opacity-60")}>
      <PivotChart
        view={view}
        chart={chart}
        rowsDim={widget.rows}
        colsDim={widget.cols}
        horizontal={widget.horizontal}
        label={`${widget.title}: ${describePivot(widget, view.total)}`}
      />
    </div>
  );
}

function ChartTypeSwitch({ widget }: { widget: PivotWidget }) {
  const board = useBoard();
  const Icon = CHART_ICONS[widget.chart];
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Ganti jenis grafik"
              className="text-muted-foreground size-7"
            >
              <Icon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Ganti jenis grafik</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup
          value={widget.chart}
          onValueChange={(chart) => board.update({ ...widget, chart: chart as PivotChartType })}
        >
          {PIVOT_CHART_TYPES.map((type) => {
            const TypeIcon = CHART_ICONS[type];
            const disabled = !widget.cols && NEEDS_COLUMNS.includes(type);
            return (
              <DropdownMenuRadioItem key={type} value={type} disabled={disabled}>
                <TypeIcon className="text-muted-foreground" />
                {PIVOT_CHART_TYPE_LABELS[type]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PivotWidgetCard({
  widget,
  dragHandle,
}: {
  widget: PivotWidget;
  dragHandle?: DragHandleProps | undefined;
}) {
  const [table, setTable] = useState(false);
  const [total, setTotal] = useState<number>();
  return (
    <WidgetShell
      widget={widget}
      title={widget.title}
      subtitle={describePivot(widget, total)}
      dragHandle={dragHandle}
      toolbar={
        <>
          <ChartTypeSwitch widget={widget} />
          {widget.chart !== "table" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={table ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-pressed={table}
                  aria-label={table ? "Tampilkan grafik" : "Tampilkan tabel"}
                  className="text-muted-foreground size-7"
                  onClick={() => setTable((v) => !v)}
                >
                  <Table2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{table ? "Tampilkan grafik" : "Tampilkan tabel"}</TooltipContent>
            </Tooltip>
          )}
        </>
      }
    >
      <PivotBody widget={widget} forceTable={table} onTotal={setTotal} />
    </WidgetShell>
  );
}
