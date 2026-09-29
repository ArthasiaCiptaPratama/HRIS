import { ArrowLeft, Hammer } from "lucide-react";
import { Link, useLocation } from "react-router";
import { activeTrail, visibleGroups } from "@/app/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { MaintenanceIllustration } from "../components/maintenance-illustration";

// Halaman sementara untuk menu yang belum dikerjakan (D-035: Arsip & Laporan).
export function MaintenancePage() {
  const me = useMe().data as Me;
  const { pathname } = useLocation();
  const trail = activeTrail(visibleGroups(me), pathname);
  const label = trail?.child?.label ?? trail?.item.label ?? "Halaman ini";

  return (
    <div className="grid min-h-[calc(100dvh-12rem)] grid-cols-1 items-center gap-10 py-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="animate-fade-up order-2 space-y-5 lg:order-1">
        <Badge variant="warning" className="gap-1.5 rounded-md px-2.5 py-1">
          <Hammer className="size-3" aria-hidden /> Maintenance
        </Badge>
        <div className="space-y-3">
          {trail ? (
            <p className="text-muted-foreground text-sm">
              {trail.group.label} · {trail.section.label}
            </p>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {label} sedang disiapkan
          </h1>
          <p className="text-muted-foreground max-w-[52ch] leading-relaxed">
            Halaman ini masuk tahap pengembangan berikutnya. Sementara itu, data terkait tetap bisa
            dilihat dari panel detail pegawai di menu Data Pegawai Aktif.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link to="/personal/pegawai-aktif/semua">Buka Data Pegawai Aktif</Link>
          </Button>
          <Button variant="ghost" onClick={() => window.history.back()}>
            <ArrowLeft /> Kembali
          </Button>
        </div>
      </div>
      <div
        className="animate-fade-up order-1 lg:order-2"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        <MaintenanceIllustration className="mx-auto w-full max-w-[420px]" />
      </div>
    </div>
  );
}
