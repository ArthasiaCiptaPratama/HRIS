import { ROLE_LABELS } from "@hris/shared";
import { Bell, LogOut, Menu, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useNavigation } from "react-router";
import { activeGroup, type NavGroup, visibleGroups } from "@/app/navigation";
import { preloadRoute } from "@/app/route-preload";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMe } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-provider";
import type { Me } from "@/features/auth/schemas";
import { NotificationBell } from "@/features/notification/components/notification-bell";
import { access } from "@/lib/access";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { CollapseButton, SidebarContent, SystemStatus } from "./sidebar";

const COLLAPSE_KEY = "hris.sidebar.collapsed";

// Preferensi tampilan per perangkat; localStorage bisa tidak tersedia (mode privat) → abaikan.
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function Brand() {
  return (
    <NavLink
      to="/"
      aria-label="Arthasia HRIS — beranda"
      className="flex shrink-0 items-center rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <BrandLogo decorative className="h-12" />
    </NavLink>
  );
}

/** Garis progres saat navigasi menunggu chunk halaman (route lazy). */
function RouteProgress() {
  const loading = useNavigation().state !== "idle";
  return (
    <div
      aria-hidden
      className={cn(
        "bg-brand fixed inset-x-0 top-0 z-[70] h-0.5 origin-left transition-[transform,opacity] duration-500 ease-out",
        loading ? "scale-x-75 opacity-100" : "scale-x-100 opacity-0",
      )}
    />
  );
}

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.+_-]/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export function AppLayout() {
  const me = useMe().data as Me;
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groups = useMemo(() => visibleGroups(me), [me]);
  const current = activeGroup(groups, pathname) ?? groups[0];
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const topGroups = groups.filter((group) => group.inTopNav);

  // Ctrl/Cmd + K membuka pencarian cepat.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pindah halaman → gulir ke atas & tutup drawer mobile.
  // biome-ignore lint/correctness/useExhaustiveDependencies: bereaksi pada perubahan path saja
  useEffect(() => {
    setMobileOpen(false);
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      } catch {
        // abaikan: preferensi hanya kenyamanan
      }
      return !value;
    });

  return (
    <TooltipProvider>
      <div className="bg-background min-h-[100dvh]">
        <RouteProgress />
        <a
          href="#main"
          className="bg-foreground text-background sr-only z-[60] rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Lompat ke konten
        </a>

        <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-3 md:gap-6 md:px-5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Buka menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <Brand />

            <nav aria-label="Navigasi utama" className="hidden h-full items-stretch gap-1 md:flex">
              {topGroups.map((group) => (
                <TopNavLink key={group.id} group={group} active={group.id === current?.id} />
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="text-muted-foreground hover:text-foreground hover:border-foreground/20 bg-muted/40 hidden h-9 items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap transition-colors lg:flex lg:w-72"
              >
                <Search className="size-4" aria-hidden />
                <span className="truncate">Cari menu atau karyawan…</span>
                <kbd className="bg-background ml-auto shrink-0 rounded border px-1.5 font-mono text-[10px]">
                  Ctrl K
                </kbd>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Cari"
                onClick={() => setPaletteOpen(true)}
              >
                <Search className="size-5" />
              </Button>
              <NotificationBell />
              <UserMenu
                me={me}
                onNavigate={navigate}
                onSignOut={async () => {
                  await signOut();
                  navigate("/login", { replace: true });
                }}
              />
            </div>
          </div>
        </header>

        <div className="flex">
          {current ? (
            <aside
              className={cn(
                "bg-sidebar sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:flex",
                collapsed ? "w-[68px]" : "w-[18.5rem]",
              )}
            >
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]">
                <SidebarContent group={current} groups={groups} collapsed={collapsed} />
              </div>
              <div
                className={cn(
                  "flex items-center gap-2 border-t px-4 py-3",
                  collapsed ? "flex-col px-2" : "justify-between",
                )}
              >
                <SystemStatus collapsed={collapsed} />
                <CollapseButton collapsed={collapsed} onToggle={toggleCollapsed} />
              </div>
            </aside>
          ) : null}

          <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
            <div key={pathname} className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
              <Outlet />
            </div>
          </main>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[86vw] max-w-xs p-0" aria-describedby={undefined}>
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <MobileMenu groups={groups} current={current} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          groups={groups}
          canSearchEmployees={access.personalMenu(me)}
        />
      </div>
    </TooltipProvider>
  );
}

function TopNavLink({ group, active }: { group: NavGroup; active: boolean }) {
  return (
    <NavLink
      to={group.to}
      onMouseEnter={() => preloadRoute(group.to)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2 px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <group.icon className={cn("size-4", active ? "text-brand" : "")} aria-hidden />
      {group.label}
      <span
        aria-hidden
        className={cn(
          "bg-brand absolute inset-x-3 -bottom-px h-0.5 origin-center rounded-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          active ? "scale-x-100" : "scale-x-0",
        )}
      />
    </NavLink>
  );
}

function MobileMenu({
  groups,
  current,
  onNavigate,
}: {
  groups: NavGroup[];
  current: NavGroup | undefined;
  onNavigate: () => void;
}) {
  const [selected, setSelected] = useState(current?.id ?? groups[0]?.id);
  const group = groups.find((g) => g.id === selected) ?? groups[0];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b px-4 py-4">
        <BrandLogo className="h-16" />
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto border-b px-3 py-3 [scrollbar-width:none]"
        role="tablist"
        aria-label="Kelompok menu"
      >
        {groups
          .filter((g) => g.inTopNav)
          .map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === group?.id}
              onClick={() => setSelected(g.id)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                g.id === group?.id
                  ? "bg-foreground text-background border-foreground"
                  : "text-muted-foreground",
              )}
            >
              <g.icon className="size-3.5" aria-hidden />
              {g.shortLabel ?? g.label}
            </button>
          ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {group ? <SidebarContent group={group} groups={groups} onNavigate={onNavigate} /> : null}
      </div>
    </div>
  );
}

function UserMenu({
  me,
  onNavigate,
  onSignOut,
}: {
  me: Me;
  onNavigate: (to: string) => void;
  onSignOut: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu akun"
          className="hover:bg-accent ml-1 flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="bg-foreground text-background grid size-8 place-items-center rounded-full text-xs font-medium">
            {initialsFromEmail(me.email)}
          </span>
          <span className="hidden text-left leading-tight xl:block">
            <span className="block max-w-40 truncate text-xs font-medium">{me.email}</span>
            <span className="text-muted-foreground block text-[11px]">
              {ROLE_LABELS[me.role]}
              {me.isPrimarySuperAdmin ? " · Utama" : ""}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate">{me.email}</p>
          <p className="text-muted-foreground text-xs font-normal">
            {ROLE_LABELS[me.role]}
            {me.isPrimarySuperAdmin ? " · Utama" : ""}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onNavigate("/profil")}>
          <UserRound className="size-4" aria-hidden /> Profil
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onNavigate("/notifikasi")}>
          <Bell className="size-4" aria-hidden /> Notifikasi
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void onSignOut()}>
          <LogOut className="size-4" aria-hidden /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
