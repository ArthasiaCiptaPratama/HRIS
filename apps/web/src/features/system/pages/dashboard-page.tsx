import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";

function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta",
    }).format(now),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

const TODAY = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

// D-035: Dashboard dapat diakses tapi isinya menyusul.
export function DashboardPage() {
  const me = useMe().data as Me;
  const name = me.email.split("@")[0]?.split(/[.+_-]/)[0] ?? "";
  const display = name ? name.charAt(0).toUpperCase() + name.slice(1) : "";

  return (
    <>
      <PageHeader
        eyebrow={<p className="text-muted-foreground text-sm">{TODAY.format(new Date())}</p>}
        title={`${greeting()}${display ? `, ${display}` : ""}`}
        description="Ringkasan HR akan tampil di sini."
      />
      <div className="animate-fade-up rounded-2xl border border-dashed">
        <EmptyState
          icon={LayoutDashboard}
          title="Dashboard masih kosong"
          description="Widget ringkasan (kehadiran, cuti, kontrak) ditambahkan pada fase berikutnya."
          className="py-24"
        />
      </div>
    </>
  );
}
