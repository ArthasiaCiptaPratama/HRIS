import {
  type ShortcutsWidget,
  STAT_METRIC_LABELS,
  type StatMetric,
  type StatWidget,
} from "@hris/shared";
import {
  Activity,
  ArrowUpRight,
  type LucideIcon,
  TrendingUp,
  UsersRound,
  UserX,
} from "lucide-react";
import { Link } from "react-router";
import { NAV_GROUPS, type NavItem } from "@/app/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import type { Me } from "@/features/auth/schemas";
import { ACTIVE_BASE } from "@/features/employee/active-views";
import { useDashboard } from "@/features/employee/api";
import { cn } from "@/lib/utils";
import { type DragHandleProps, WidgetShell } from "./widget-shell";

// D-062: widget statistik (dari GET /dashboard) & Menu Cepat (pilihan menu sendiri).

const STAT_META: Record<StatMetric, { icon: LucideIcon; to?: string; hint: string }> = {
  total: { icon: UsersRound, to: `${ACTIVE_BASE}/semua`, hint: "Aktif + nonaktif" },
  active: { icon: Activity, to: `${ACTIVE_BASE}/semua`, hint: "Sedang bekerja" },
  inactive: { icon: UserX, to: "/personal/pegawai-tidak-aktif", hint: "Sudah keluar" },
  avgTenure: { icon: TrendingUp, hint: "Karyawan aktif" },
};

const fmt = new Intl.NumberFormat("id-ID");

export function StatWidgetCard({
  widget,
  dragHandle,
}: {
  widget: StatWidget;
  dragHandle?: DragHandleProps | undefined;
}) {
  const query = useDashboard();
  const meta = STAT_META[widget.metric];
  const Icon = meta.icon;
  const overview = query.data?.overview;
  const value = !overview
    ? null
    : widget.metric === "avgTenure"
      ? overview.avgTenureYears === null
        ? "—"
        : `${String(overview.avgTenureYears).replace(".", ",")} thn`
      : fmt.format(overview[widget.metric]);
  const sub =
    overview && widget.metric === "inactive" && overview.total > 0
      ? `${Math.round((overview.inactive / overview.total) * 100)}% dari total`
      : meta.hint;
  const accent = widget.metric === "total";

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
          <p className={cn("truncate text-2xl font-bold tracking-tight", accent && "text-brand")}>
            {value}
          </p>
        )}
        <p className="text-muted-foreground truncate text-xs">{sub}</p>
      </div>
      {meta.to && (
        <ArrowUpRight className="text-muted-foreground ml-auto size-4 opacity-0 transition-opacity group-hover/widget:opacity-100" />
      )}
    </div>
  );

  return (
    <WidgetShell widget={widget} title={STAT_METRIC_LABELS[widget.metric]} dragHandle={dragHandle}>
      {meta.to ? (
        <Link
          to={meta.to}
          className="focus-visible:ring-ring/50 -m-1 block rounded-lg p-1 outline-none focus-visible:ring-[3px]"
        >
          {body}
        </Link>
      ) : (
        body
      )}
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
