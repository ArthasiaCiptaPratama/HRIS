import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { activeTrail, visibleGroups } from "@/app/navigation";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";

// Judul halaman + breadcrumb otomatis (kelompok besar → kelompok kecil → isi) dari navigation.ts.
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  const me = useMe().data as Me;
  const { pathname } = useLocation();
  const trail = activeTrail(visibleGroups(me), pathname);

  return (
    <header className="animate-fade-up mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-1.5">
        {trail ? (
          <nav
            aria-label="Breadcrumb"
            className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs"
          >
            <Link to={trail.group.to} className="hover:text-foreground transition-colors">
              {trail.group.label}
            </Link>
            <ChevronRight className="size-3" aria-hidden />
            <span>{trail.section.label}</span>
            {trail.child ? (
              <>
                <ChevronRight className="size-3" aria-hidden />
                <Link to={trail.item.to} className="hover:text-foreground transition-colors">
                  {trail.item.label}
                </Link>
              </>
            ) : null}
          </nav>
        ) : null}
        {eyebrow}
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground max-w-[65ch] text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
