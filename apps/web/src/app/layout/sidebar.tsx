import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { activeTrail, type NavGroup, type NavItem, type SummaryKey } from "@/app/navigation";
import { preloadRoute } from "@/app/route-preload";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { prefetchEmployees, useEmployeeSummary } from "@/features/employee/api";
import type { EmployeeSummary } from "@/features/employee/schemas";
import { useHealth } from "@/features/system/api";
import { cn } from "@/lib/utils";

function summaryCount(summary: EmployeeSummary | undefined, key: SummaryKey | undefined) {
  if (!summary || !key) return undefined;
  if (key === "ALL") return summary.active.total;
  if (key === "INACTIVE") return summary.inactive;
  return summary.active.byCategory[key];
}

function Count({ value, active }: { value: number | undefined; active?: boolean }) {
  if (value === undefined) return null;
  return (
    <span
      className={cn(
        "ml-auto min-w-6 rounded-md px-1.5 text-center font-mono text-[11px] leading-5 tabular-nums transition-colors",
        active ? "bg-brand/15 text-brand-soft-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}

/** Isi sidebar untuk satu kelompok besar; dipakai di desktop & drawer mobile. */
export function SidebarContent({
  group,
  groups,
  collapsed = false,
  onNavigate,
}: {
  group: NavGroup;
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const trail = activeTrail(groups, pathname);
  const summary = useEmployeeSummary(group.id === "personal").data;

  // Prefetch kode halaman + halaman pertama data saat kursor/fokus di atas menu.
  const warm = (item: NavItem) => {
    preloadRoute(item.to);
    const slug = item.to.match(/^\/personal\/pegawai-aktif\/(.+)$/)?.[1];
    const category =
      item.summaryKey && !["ALL", "INACTIVE"].includes(item.summaryKey)
        ? (item.summaryKey as Exclude<SummaryKey, "ALL" | "INACTIVE">)
        : undefined;
    if (slug) {
      void prefetchEmployees(queryClient, {
        page: 1,
        pageSize: 20,
        active: true,
        category,
        sort: "fullName:asc",
      });
    }
  };

  return (
    <nav aria-label="Menu samping" className="flex flex-col gap-1 px-3 pb-6">
      {!collapsed ? (
        <div className="flex items-center gap-2.5 px-2 pt-5 pb-2">
          <span className="bg-muted text-foreground grid size-7 place-items-center rounded-lg">
            <group.icon className="size-3.5" aria-hidden />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight">{group.label}</span>
        </div>
      ) : (
        <div className="h-3" />
      )}
      {group.sections.map((section) => (
        <div key={section.id} className="mt-3 first:mt-1">
          {collapsed ? (
            <div className="bg-border mx-auto my-2 h-px w-6" aria-hidden />
          ) : (
            <p className="text-muted-foreground/80 px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] uppercase">
              {section.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                collapsed={collapsed}
                activeId={trail?.child?.id ?? trail?.item.id}
                parentActive={trail?.item.id === item.id}
                summary={summary}
                onWarm={warm}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarItem({
  item,
  collapsed,
  activeId,
  parentActive,
  summary,
  onWarm,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  activeId: string | undefined;
  parentActive: boolean;
  summary: EmployeeSummary | undefined;
  onWarm: (item: NavItem) => void;
  onNavigate?: (() => void) | undefined;
}) {
  const hasChildren = Boolean(item.children?.length) && !collapsed;
  const [open, setOpen] = useState(true);
  const selfActive = activeId === item.id && !hasChildren;
  const Icon = item.icon;

  const link = (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onMouseEnter={() => onWarm(item)}
      onFocus={() => onWarm(item)}
      onClick={onNavigate}
      aria-current={selfActive || (collapsed && parentActive) ? "page" : undefined}
      className={cn(
        "group/item relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        collapsed && "justify-center px-0",
        selfActive || (collapsed && parentActive)
          ? "bg-brand-soft text-brand-soft-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      {selfActive && !collapsed ? (
        <span
          className="bg-brand absolute top-2 bottom-2 -left-3 w-0.5 rounded-r-full"
          aria-hidden
        />
      ) : null}
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          selfActive || parentActive
            ? "text-brand"
            : "text-muted-foreground group-hover/item:text-foreground",
        )}
        aria-hidden
      />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
      {!collapsed && item.maintenance ? (
        <span className="text-muted-foreground/70 ml-auto text-[10px] tracking-wide uppercase">
          Segera
        </span>
      ) : null}
      {!collapsed && !hasChildren && !item.maintenance ? (
        <Count value={summaryCount(summary, item.summaryKey)} active={selfActive} />
      ) : null}
    </NavLink>
  );

  if (collapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">
            {item.label}
            {item.maintenance ? " · segera" : ""}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  if (!hasChildren) return <li>{link}</li>;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "hover:bg-sidebar-accent flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          parentActive ? "text-foreground font-medium" : "text-sidebar-foreground",
        )}
      >
        <Icon
          className={cn("size-4 shrink-0", parentActive ? "text-brand" : "text-muted-foreground")}
          aria-hidden
        />
        <span className="truncate">{item.label}</span>
        <ChevronDown
          className={cn(
            "text-muted-foreground ml-auto size-3.5 transition-transform duration-200",
            !open && "-rotate-90",
          )}
          aria-hidden
        />
      </button>
      {/* grid-rows 0fr→1fr: buka/tutup halus tanpa menganimasikan height */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <ul className="border-border ml-[18px] min-h-0 space-y-0.5 overflow-hidden border-l pl-3">
          {item.children?.map((child) => {
            const active = activeId === child.id;
            return (
              <li key={child.id} className="first:pt-0.5">
                <NavLink
                  to={child.to}
                  onMouseEnter={() => onWarm(child)}
                  onFocus={() => onWarm(child)}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active
                      ? "bg-brand-soft text-brand-soft-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span
                      className="bg-brand absolute top-1.5 bottom-1.5 -left-[13px] w-0.5 rounded-full"
                      aria-hidden
                    />
                  ) : null}
                  <span className="truncate">{child.label}</span>
                  <Count value={summaryCount(summary, child.summaryKey)} active={active} />
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

export function SystemStatus({ collapsed }: { collapsed: boolean }) {
  const health = useHealth();
  const ok = health.data?.status === "ok";
  const label = health.isPending
    ? "Memeriksa sistem…"
    : health.isError
      ? "API tidak terjangkau"
      : ok
        ? "Sistem normal"
        : "Database terganggu";
  return (
    <div
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-xs",
        collapsed && "justify-center",
      )}
      title={label}
    >
      <span className="relative flex size-2">
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            health.isPending
              ? "bg-muted-foreground/40"
              : ok
                ? "bg-success animate-pulse-dot"
                : "bg-destructive",
          )}
        />
      </span>
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </div>
  );
}

export function CollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? "Lebarkan menu samping" : "Ciutkan menu samping"}
      className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent grid size-8 place-items-center rounded-lg transition-colors"
    >
      {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
    </button>
  );
}
