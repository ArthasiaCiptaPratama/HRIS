import { LayoutDashboard } from "lucide-react";
import { lazy, Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useDashboard } from "@/features/employee/api";
import { access } from "@/lib/access";

const DashboardCharts = lazy(() =>
  import("./dashboard-charts").then((m) => ({ default: m.DashboardCharts })),
);

// Kunci statis untuk kerangka loading (bukan indeks array).
const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

// ── Skeleton ──────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SKELETON_KEYS.slice(0, 4).map((key) => (
          <Card key={key}>
            <CardContent className="flex items-center gap-4 p-5">
              <Skeleton className="size-11 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SKELETON_KEYS.slice(0, 6).map((key) => (
          <Card key={key}>
            <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
              <Skeleton className="size-11 rounded-xl" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {SKELETON_KEYS.slice(0, 2).map((key) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <Skeleton className="mb-1 h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <Skeleton className="h-[180px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {SKELETON_KEYS.slice(0, 2).map((key) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <Skeleton className="mb-1 h-4 w-40" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <Skeleton className="h-[180px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

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

function DashboardHeader({ me }: { me: Me }) {
  const name = me.email.split("@")[0]?.split(/[.+_-]/)[0] ?? "";
  const display = name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
  return (
    <PageHeader
      eyebrow={<p className="text-muted-foreground text-sm">{TODAY.format(new Date())}</p>}
      title={`${greeting()}${display ? `, ${display}` : ""}`}
      description="Ringkasan data kepegawaian."
    />
  );
}

// MANAGER & EMPLOYEE: ringkasan seluruh karyawan bukan need-to-know (PLAN §4) → sapaan saja.
function GreetingDashboard({ me }: { me: Me }) {
  return (
    <>
      <DashboardHeader me={me} />
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

// D-035: Dashboard HRIS — ringkasan data kepegawaian interaktif (SA/HR, GET /dashboard).
export function DashboardPage() {
  const me = useMe().data as Me;
  const canSeeStats = access.manageEmployees(me);
  const query = useDashboard(canSeeStats);

  if (!canSeeStats) return <GreetingDashboard me={me} />;
  if (query.isPending) return <DashboardSkeleton />;

  if (query.isError) {
    return (
      <>
        <DashboardHeader me={me} />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Gagal memuat data dashboard. Periksa koneksi API.
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <DashboardHeader me={me} />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardCharts data={query.data} me={me} />
      </Suspense>
    </>
  );
}
