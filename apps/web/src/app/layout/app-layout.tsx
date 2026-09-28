import { House } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/utils";

interface MenuItem {
  to: string;
  label: string;
  icon: typeof House;
}

// Menu per role diisi mulai Fase 2 memakai lib/access.ts.
const MENU: MenuItem[] = [{ to: "/", label: "Beranda", icon: House }];

export function AppLayout() {
  return (
    <div className="flex min-h-svh">
      <aside className="bg-sidebar text-sidebar-foreground hidden w-60 shrink-0 border-r md:block">
        <div className="flex h-14 items-center border-b px-4 font-semibold">HRIS Arthasia</div>
        <nav aria-label="Menu utama" className="flex flex-col gap-1 p-2">
          {MENU.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "hover:bg-sidebar-accent/60",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b px-4 md:px-6">
          <span className="font-semibold md:hidden">HRIS Arthasia</span>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
