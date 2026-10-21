import {
  ANALYTICS_STAT_METRICS,
  SEVERANCE_SCENARIO_LABELS,
  type SeveranceScenario,
  type ShortcutsWidget,
  STAT_METRIC_LABELS,
  type StatMetric,
  type StatWidget,
} from "@hris/shared";
import {
  Activity,
  ArrowUpRight,
  Gauge,
  type LucideIcon,
  Plane,
  Repeat,
  Scale,
  TrendingUp,
  UsersRound,
  UserX,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { NAV_GROUPS, type NavItem } from "@/app/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import type { Me } from "@/features/auth/schemas";
import { ACTIVE_BASE } from "@/features/employee/active-views";
import { useDashboard } from "@/features/employee/api";
import { access } from "@/lib/access";
import { ApiError } from "@/lib/api-client";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct, fmtPoints, fmtRupiahShort, useAnalytics } from "./analytics";
import type { DashboardAnalytics } from "./api";
import { type DragHandleProps, useBoard, WidgetShell } from "./widget-shell";

// D-065: widget statistik (dari GET /dashboard) & Menu Cepat (pilihan menu sendiri).

const STAT_META: Record<StatMetric, { icon: LucideIcon; to?: string; hint: string }> = {
  total: { icon: UsersRound, to: `${ACTIVE_BASE}/semua`, hint: "Aktif + nonaktif" },
  active: { icon: Activity, to: `${ACTIVE_BASE}/semua`, hint: "Sedang bekerja" },
  inactive: { icon: UserX, to: "/personal/pegawai-tidak-aktif", hint: "Sudah keluar" },
  avgTenure: { icon: TrendingUp, hint: "Karyawan aktif" },
  turnover: { icon: Repeat, hint: "Keluar ÷ rata-rata aktif" },
  onLeave: { icon: Plane, to: "/time/persetujuan-cuti", hint: "Cuti disetujui" },
  efficiency: { icon: Gauge, hint: "Jam efektif ÷ jam terjadwal" },
  liability: { icon: Scale, hint: "Estimasi pesangon, UPMK & cuti" },
};

const fmt = new Intl.NumberFormat("id-ID");

/** Isi kartu angka: ikon, nilai (+ perubahan vs bulan lalu), keterangan; tautan bila ada tujuan. */
function StatBody({
  metric,
  value,
  valueTitle,
  delta,
  sub,
}: {
  metric: StatMetric;
  value: string | null;
  valueTitle?: string | undefined;
  delta?: { text: string; tone: "good" | "bad" | "neutral"; title: string } | null | undefined;
  sub: ReactNode;
}) {
  const meta = STAT_META[metric];
  const Icon = meta.icon;
  const accent = metric === "total";
  const body = (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          accent ? "bg-brand text-brand-foreground" : "bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        {value === null ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span
              title={valueTitle}
              className={cn("truncate text-2xl font-bold tracking-tight", accent && "text-brand")}
            >
              {value}
            </span>
            {delta ? (
              <span
                title={delta.title}
                className={cn(
                  "shrink-0 text-xs font-medium tabular-nums",
                  delta.tone === "good" && "text-emerald-600 dark:text-emerald-400",
                  delta.tone === "bad" && "text-red-600 dark:text-red-400",
                  delta.tone === "neutral" && "text-muted-foreground",
                )}
              >
                {delta.text}
              </span>
            ) : null}
          </p>
        )}
        <p className="text-muted-foreground truncate text-xs">{sub}</p>
      </div>
      {meta.to && (
        <ArrowUpRight className="text-muted-foreground ml-auto size-4 opacity-0 transition-opacity group-hover/widget:opacity-100" />
      )}
    </div>
  );
  return meta.to ? (
    <Link
      to={meta.to}
      className="focus-visible:ring-ring/50 -m-1 block rounded-lg p-1 outline-none focus-visible:ring-[3px]"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

/** Perubahan poin persentase vs bulan lalu; `higherIsBetter` menentukan warna. */
function pointsDelta(now: number, before: number | undefined, higherIsBetter: boolean) {
  if (before === undefined) return null;
  const diff = Math.round((now - before) * 10) / 10;
  const tone = diff === 0 ? "neutral" : diff > 0 === higherIsBetter ? "good" : "bad";
  return { text: fmtPoints(diff), tone, title: `Bulan lalu ${fmtPct(before)}` } as const;
}

function analyticsStat(
  metric: StatMetric,
  data: DashboardAnalytics,
  scenario: SeveranceScenario,
): {
  value: string;
  valueTitle?: string;
  delta?: ReturnType<typeof pointsDelta>;
  sub: string;
} {
  const { headcount, leave, efficiency, liability } = data;
  if (metric === "turnover") {
    const prev = headcount.history.at(-2);
    return {
      value: fmtPct(headcount.turnoverPct),
      delta: pointsDelta(headcount.turnoverPct, prev?.turnoverPct, false),
      sub: `${fmtNum(headcount.left)} keluar · ${fmtNum(headcount.end)} aktif akhir bulan`,
    };
  }
  if (metric === "onLeave") {
    return {
      value: fmtNum(leave.onLeaveToday),
      sub: `${fmtNum(leave.pendingRequests)} menunggu persetujuan`,
    };
  }
  if (metric === "efficiency") {
    const delta = pointsDelta(efficiency.efficiencyPct, efficiency.prevEfficiencyPct, true);
    return {
      value: fmtPct(efficiency.efficiencyPct),
      delta,
      sub: delta ? `${delta.text} vs bulan lalu` : STAT_META.efficiency.hint,
    };
  }
  return {
    value: liability ? fmtRupiahShort(liability.total) : "—",
    valueTitle: liability ? formatRupiah(liability.total) : undefined,
    sub: SEVERANCE_SCENARIO_LABELS[scenario],
  };
}

/** Statistik analitik (DSB-D1). Kewajiban rupiah disembunyikan bagi akun tanpa grant "Biaya". */
function AnalyticsStatCard({
  widget,
  canSeeCost,
  dragHandle,
}: {
  widget: StatWidget;
  canSeeCost: boolean;
  dragHandle?: DragHandleProps | undefined;
}) {
  const board = useBoard();
  const query = useAnalytics();
  const title = STAT_METRIC_LABELS[widget.metric];
  const costHidden =
    widget.metric === "liability" &&
    (!canSeeCost || (query.data !== undefined && !query.data.showCost));
  if (costHidden) {
    // Saat mengatur dashboard tetap tampil (redup) supaya bisa dihapus; selain itu tidak dirender.
    if (!board.editing) return null;
    return (
      <WidgetShell widget={widget} title={title} dragHandle={dragHandle} className="opacity-60">
        <p className="text-muted-foreground py-2 text-xs">Butuh izin Biaya (labor.cost.read).</p>
      </WidgetShell>
    );
  }
  const stat = query.data ? analyticsStat(widget.metric, query.data, "PHK_NORMAL") : null;
  const failed = query.isError && !query.data;
  return (
    <WidgetShell widget={widget} title={title} dragHandle={dragHandle}>
      <StatBody
        metric={widget.metric}
        value={failed ? "—" : (stat?.value ?? null)}
        valueTitle={stat?.valueTitle}
        delta={stat?.delta}
        sub={
          failed
            ? query.error instanceof ApiError && query.error.status === 403
              ? "Tidak ada akses analitik"
              : "Gagal memuat analitik"
            : (stat?.sub ?? STAT_META[widget.metric].hint)
        }
      />
    </WidgetShell>
  );
}

export function StatWidgetCard({
  widget,
  me,
  dragHandle,
}: {
  widget: StatWidget;
  me: Me;
  dragHandle?: DragHandleProps | undefined;
}) {
  if (ANALYTICS_STAT_METRICS.includes(widget.metric)) {
    return (
      <AnalyticsStatCard
        widget={widget}
        canSeeCost={access.viewLaborCost(me)}
        dragHandle={dragHandle}
      />
    );
  }
  return <OverviewStatCard widget={widget} dragHandle={dragHandle} />;
}

function OverviewStatCard({
  widget,
  dragHandle,
}: {
  widget: StatWidget;
  dragHandle?: DragHandleProps | undefined;
}) {
  const query = useDashboard();
  const meta = STAT_META[widget.metric];
  const overview = query.data?.overview;
  const metric = widget.metric as "total" | "active" | "inactive" | "avgTenure";
  const value = !overview
    ? null
    : metric === "avgTenure"
      ? overview.avgTenureYears === null
        ? "—"
        : `${String(overview.avgTenureYears).replace(".", ",")} thn`
      : fmt.format(overview[metric]);
  const sub =
    overview && metric === "inactive" && overview.total > 0
      ? `${Math.round((overview.inactive / overview.total) * 100)}% dari total`
      : meta.hint;

  return (
    <WidgetShell widget={widget} title={STAT_METRIC_LABELS[widget.metric]} dragHandle={dragHandle}>
      <StatBody metric={widget.metric} value={value} sub={sub} />
    </WidgetShell>
  );
}

/** Semua menu yang boleh jadi pintasan bagi akun ini (tanpa Maintenance & tanpa induk bertingkat). */
export function shortcutCandidates(me: Me): { group: string; item: NavItem }[] {
  return NAV_GROUPS.filter((group) => group.visible(me) && group.id !== "dashboard").flatMap(
    (group) =>
      group.sections.flatMap((section) =>
        section.items
          .flatMap((item) => (item.children?.length ? item.children : [item]))
          .filter((item) => (item.visible?.(me) ?? true) && !item.maintenance)
          .map((item) => ({ group: group.label, item })),
      ),
  );
}

export function ShortcutsWidgetCard({
  widget,
  me,
  dragHandle,
}: {
  widget: ShortcutsWidget;
  me: Me;
  dragHandle?: DragHandleProps | undefined;
}) {
  const allowed = new Map(shortcutCandidates(me).map(({ item }) => [item.id, item]));
  const items = widget.items.flatMap((id) => allowed.get(id) ?? []);
  return (
    <WidgetShell widget={widget} title={widget.title} dragHandle={dragHandle}>
      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-xs">
          Belum ada menu. Buka ⋯ → Ubah widget untuk memilih menu yang sering dipakai.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                to={item.to}
                className="bg-secondary/50 hover:bg-secondary focus-visible:ring-ring/50 group/sc flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-all outline-none hover:-translate-y-0.5 focus-visible:ring-[3px]"
              >
                <span className="bg-background text-muted-foreground group-hover/sc:text-brand flex size-9 items-center justify-center rounded-lg transition-colors">
                  <Icon className="size-4.5" />
                </span>
                <span className="text-xs leading-tight font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
