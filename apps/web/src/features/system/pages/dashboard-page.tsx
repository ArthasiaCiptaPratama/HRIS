import {
  Activity,
  TrendingUp,
  UserX,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { EChartsBarChart } from "@/components/evilcharts/charts/echarts-bar-chart";
import { EChartsPieChart } from "@/components/evilcharts/charts/echarts-pie-chart";
import type { ChartConfig } from "@/components/evilcharts/charts/echarts-bar-chart";
import { Link } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useDashboard } from "@/features/employee/api";
import { NAV_GROUPS, type NavItem } from "@/app/navigation";

// ── Color palettes (all light, soft, non-neon) ──────────────────────────────
const BRAND = "#0d9488"; // teal-600

// Category: vivid sky blue → teal → violet → pink → orange
const CATEGORY_PALETTE = ["#38bdf8", "#2dd4bf", "#a78bfa", "#f472b6", "#fb923c"];
const CATEGORY_COLORS_SERIES = ["#38bdf8", "#2dd4bf", "#a78bfa", "#f472b6", "#fb923c"];

// Education levels: vivid teal (darkest) → soft mint (lightest), all readable
const LEVEL_COLORS_SERIES = ["#2dd4bf", "#5eead4", "#99f6e4", "#a7f3d0", "#ccfbf1"];

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      {accent && (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,var(--brand-soft)_0%,transparent_60%)]" />
      )}
      <CardContent className="relative flex items-center gap-4 p-5">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={
            accent
              ? { backgroundColor: BRAND, color: "white", boxShadow: `0 4px 12px rgba(13,148,136,0.25)` }
              : { backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }
          }
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
          <p className="truncate text-2xl font-bold tabular-nums tracking-tight" style={accent ? { color: BRAND } : undefined}>
            {value}
          </p>
          {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Pie chart card — matches EducationDonutCard layout ───────────────────────────
function PieChartCard({
  title,
  description,
  data,
  config,
}: {
  title: string;
  description?: string;
  data: Array<{ name: string; value: number }>;
  config: ChartConfig;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-4 pb-5 pt-0">
        <div className="flex items-center gap-6">
          {/* Donut — same size as EducationDonutCard */}
          <div className="h-[220px] w-[220px] shrink-0">
            <EChartsPieChart
              data={data}
              config={config}
              dataKey="value"
              nameKey="name"
              className="h-full w-full"
            >
              <EChartsPieChart.Pie innerRadius="62%" outerRadius="92%" paddingAngle={2} />
              <EChartsPieChart.Tooltip />
            </EChartsPieChart>
          </div>

          {/* Stats + legend */}
          <div className="min-w-0 flex-1">
            <div className="mb-3">
              <span className="text-muted-foreground text-xs">Total</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight" style={{ color: BRAND }}>{total}</span>
                <span className="text-muted-foreground text-sm">pegawai</span>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wide">Status</p>
              <div className="flex flex-col gap-1.5">
                {data.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between gap-4 text-[12px]">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: CATEGORY_COLORS_SERIES[i % CATEGORY_COLORS_SERIES.length] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{d.value}</span>
                      <span className="text-muted-foreground text-[10px]">org</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Bar chart card ────────────────────────────────────────────────────────────
function BarChartCard({
  title,
  description,
  data,
  config,
  layout = "horizontal",
}: {
  title: string;
  description?: string;
  data: Array<{ name: string; value: number }>;
  config: ChartConfig;
  layout?: "horizontal" | "vertical";
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0]);
  const isHorizontal = layout === "horizontal";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Total</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: BRAND }}>{total}</span>
              <span className="text-muted-foreground text-sm">{isHorizontal ? "lokasi" : "entry"}</span>
            </div>
            {peak && (
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: `${BRAND}18`, color: BRAND }}
                >
                  Tertinggi
                </span>
                <span className="text-muted-foreground truncate max-w-[80px] text-[10px]" title={peak.name}>
                  {peak.name}
                </span>
                <span className="text-[10px] font-medium">{peak.value}</span>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 h-[180px] w-full">
          <EChartsBarChart
            data={data}
            config={config}
            xDataKey="name"
            layout={layout}
            enableMaxValueHighlight
            className="h-full w-full"
          >
            <EChartsBarChart.XAxis />
            <EChartsBarChart.YAxis />
            <EChartsBarChart.Grid />
            <EChartsBarChart.Tooltip />
            <EChartsBarChart.Bar dataKey="value" radius={5} />
          </EChartsBarChart>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Shortcut widget — reads from NAV_GROUPS ───────────────────────────────────
function ShortcutWidget({ me }: { me: Me }) {
  const personal = NAV_GROUPS.find((g) => g.id === "personal");
  if (!personal) return null;

  const items: NavItem[] = personal.sections
    .flatMap((s) => s.items)
    .filter((item) => {
      if (!item.visible || !item.visible(me)) return false;
      if (item.children?.length) return false; // skip parents with children
      return true;
    })
    .filter((item) => !item.maintenance) // hide maintenance items
    .slice(0, 6); // max 6 shortcuts

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.id} to={item.to}>
            <Card className="cursor-pointer border-transparent bg-secondary/50 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--border)]">
              <CardContent className="flex flex-col items-center gap-2.5 p-4 text-center">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "var(--background)", color: "var(--muted-foreground)" }}
                >
                  <Icon className="size-5" />
                </div>
                <p className="text-xs font-medium leading-tight">{item.label}</p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

// ── Education donut — outer ring: category, inner ring: per-level breakdown ───
const LEVEL_ORDER = ["SD", "SMP", "SMA", "Kuliah", "Tanpa Data"];

function EducationDonutCard({
  data,
}: {
  data: Array<{
    category: string;
    label: string;
    levels: Array<{ level: string; count: number }>;
    total: number;
  }>;
}) {
  const totalEmployees = data.reduce((s, d) => s + d.total, 0);

  // Outer ring: categories
  const categoryData = data.map((d) => ({ name: d.label, value: d.total }));
  const categoryConfig = Object.fromEntries(
    data.map((d, i) => [
      d.label,
      {
        label: d.label,
        colors: {
          light: [CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]],
          dark: [CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]],
        },
      },
    ]),
  ) satisfies ChartConfig;

  // Inner ring: each education level shows breakdown by category
  // Structure: [{ level: "SMA", items: [{cat: "Pegawai Tetap", count: 5}, {cat: "PKWT", count: 3}] }]
  const innerPieSeries = LEVEL_ORDER.flatMap((level) => {
    return data.flatMap((cat, catIdx) => {
      const lvlEntry = cat.levels.find((l) => l.level === level);
      if (!lvlEntry || lvlEntry.count === 0) return [];
      return {
        name: `${level} · ${cat.label}`,
        value: lvlEntry.count,
        itemStyle: {
          color: LEVEL_COLORS_SERIES[catIdx % LEVEL_COLORS_SERIES.length],
          borderRadius: 3,
        },
      };
    });
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-sm font-semibold">Pendidikan &amp; Kategori</CardTitle>
        <CardDescription className="text-xs">Jenjang pendidikan per status kepegawaian</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-5 pt-0">
        <div className="flex items-center gap-6">
          {/* Donut */}
          <div className="h-[220px] w-[220px] shrink-0">
            <EChartsPieChart
              data={categoryData}
              config={categoryConfig}
              dataKey="value"
              nameKey="name"
              className="h-full w-full"
              chartOptions={{
                series: [
                  {
                    id: "inner",
                    type: "pie",
                    radius: ["42%", "62%"],
                    center: ["50%", "50%"],
                    clockwise: false,
                    padAngle: 2,
                    label: { show: false },
                    data: innerPieSeries,
                  },
                ],
              }}
            >
              <EChartsPieChart.Pie innerRadius="62%" outerRadius="92%" paddingAngle={2} />
              <EChartsPieChart.Tooltip />
            </EChartsPieChart>
          </div>

          {/* Legend breakdown */}
          <div className="min-w-0 flex-1">
            <div className="mb-3">
              <span className="text-muted-foreground text-xs">Total</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight" style={{ color: BRAND }}>{totalEmployees}</span>
                <span className="text-muted-foreground text-sm">pegawai</span>
              </div>
            </div>

            {/* Outer ring legend — status */}
            <div className="mb-3 border-t pt-3">
              <p className="text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wide">Status</p>
              <div className="flex flex-col gap-1.5">
                {data.map((cat, i) => (
                  <div key={cat.category} className="flex items-center justify-between gap-4 text-[12px]">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }} />
                      <span className="text-muted-foreground">{cat.label}</span>
                    </div>
                    <span className="font-semibold">{cat.total}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Inner ring legend — education × status breakdown */}
            <div className="border-t pt-3">
              <p className="text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wide">Pendidikan</p>
              <div className="flex flex-col gap-1">
                {data.map((cat, ci) => {
                  const visibleLevels = cat.levels.filter((l) => l.count > 0);
                  if (visibleLevels.length === 0) return null;
                  return (
                    <div key={cat.category}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="size-2 shrink-0 rounded-[2px]" style={{ background: CATEGORY_PALETTE[ci % CATEGORY_PALETTE.length] }} />
                        <span className="text-[11px] font-medium text-foreground">{cat.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 ml-3">
                        {visibleLevels.map((l) => {
                          const li = LEVEL_ORDER.indexOf(l.level);
                          return (
                            <div key={l.level} className="flex items-center gap-1 text-[11px]">
                              <span className="size-1.5 shrink-0 rounded-[2px]" style={{ background: LEVEL_COLORS_SERIES[ci % LEVEL_COLORS_SERIES.length] }} />
                              <span className="text-muted-foreground">{l.level}:</span>
                              <span className="font-medium">{l.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Dashboard charts ──────────────────────────────────────────────────────────
function DashboardCharts({ data, me }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]>; me: Me }) {
  const { overview, byCategory, byLocation, byDepartment, byPosition, byJoinYear, byEducationPivot } = data;

  const categoryData = byCategory.map((c) => ({ name: c.name, value: c.count }));

  const categoryConfig = Object.fromEntries(
    categoryData.map((c, i) => [
      c.name,
      {
        label: c.name,
        colors: {
          light: [CATEGORY_COLORS_SERIES[i % CATEGORY_COLORS_SERIES.length]],
          dark: [CATEGORY_COLORS_SERIES[i % CATEGORY_COLORS_SERIES.length]],
        },
      },
    ]),
  ) satisfies ChartConfig;

  const locationData = byLocation
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((l) => ({ name: l.city ? `${l.name} (${l.city})` : l.name, value: l.count }));

  const deptData = byDepartment
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((d) => ({ name: d.name, value: d.count }));

  const positionData = byPosition.slice(0, 8).map((p) => ({ name: p.name, value: p.count }));

  const joinYearData = byJoinYear.map((j) => ({ name: String(j.year), value: j.count }));

  const barChartConfig = {
    value: {
      label: "Jumlah",
      colors: {
        light: ["#2dd4bf", "#5eead4"],
        dark: ["#2dd4bf", "#5eead4"],
      },
    },
  } satisfies ChartConfig;

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={UsersRound} label="Total Pegawai" value={overview.total} accent />
        <StatCard icon={Activity} label="Aktif" value={overview.active} sub="Sedang bekerja" />
        <StatCard
          icon={UserX}
          label="Nonaktif"
          value={overview.inactive}
          sub={
            overview.total > 0
              ? `${Math.round((overview.inactive / overview.total) * 100)}% dari total`
              : undefined
          }
        />
        <StatCard
          icon={TrendingUp}
          label="Rata-rata Masa Kerja"
          value={overview.avgTenureYears !== null ? `${overview.avgTenureYears} thn` : "—"}
          sub="Tenure rata-rata"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PieChartCard title="Distribusi Kategori" description="Status kepegawaian" data={categoryData} config={categoryConfig} />
        <EducationDonutCard data={byEducationPivot} />
      </div>

      {/* Shortcuts — from navigation */}
      <div>
        <p className="mb-3 text-sm font-semibold">Menu Cepat</p>
        <ShortcutWidget me={me} />
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChartCard title="Lokasi Kerja" description="Jumlah pegawai per lokasi" data={locationData} config={barChartConfig} />
        <BarChartCard title="Distribusi Departemen" description="Jumlah pegawai per departemen" data={deptData} config={barChartConfig} />
      </div>

      {/* Charts Row 3 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChartCard title="Distribusi Jabatan" description="Top 8 jabatan dengan pegawai terbanyak" data={positionData} config={barChartConfig} />
        <BarChartCard title="Trend Tahun Masuk" description="Jumlah pegawai per tahun masuk" data={joinYearData} config={barChartConfig} layout="vertical" />
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
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
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
              <Skeleton className="size-11 rounded-xl" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
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
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
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

// D-035: Dashboard HRIS — ringkasan data kepegawaian interaktif
export function DashboardPage() {
  const me = useMe().data as Me;
  const query = useDashboard(true);

  if (query.isLoading || query.isFetching) return <DashboardSkeleton />;

  if (query.isError) {
    return (
      <>
        <PageHeader title="Dashboard" description="Ringkasan data kepegawaian." />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Gagal memuat data dashboard. Periksa koneksi API.
          </CardContent>
        </Card>
      </>
    );
  }

  if (!query.data) return <DashboardSkeleton />;

  return (
    <>
      <PageHeader title="Dashboard" description="Ringkasan data kepegawaian." />
      <DashboardCharts data={query.data} me={me} />
    </>
  );
}
