import {
  CORE_COMPLETENESS_ITEMS,
  CORE_COMPLETENESS_LABELS,
  daysUntil,
  EXPIRY_BUCKET_LABELS,
  EXPIRY_BUCKETS,
  type ExpiryBucket,
  type ReportKind,
  WARNING_LEVEL_LABELS,
  WARNING_LEVELS,
  type WarningLevel,
} from "@hris/shared";
import {
  AlertTriangle,
  ArrowLeftRight,
  Award,
  Building2,
  Cake,
  CalendarClock,
  CalendarX2,
  ChartPie,
  CheckCircle2,
  ExternalLink,
  FileClock,
  FileDown,
  FilePen,
  FileWarning,
  Hourglass,
  ListChecks,
  Loader2,
  MailQuestion,
  Package,
  Percent,
  RotateCcw,
  ShieldAlert,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompanyScope, useMasterData } from "@/features/employee/api";
import { EmployeeDetailSheet } from "@/features/employee/components/employee-detail-sheet";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportReport, type ReportParams, useReport } from "../api";
import { PeopleList, personColumn, unitColumn } from "../components/people-list";
import { ReportChart } from "../components/report-chart";
import { AsOf, State } from "../components/report-state";
import {
  BarCell,
  type Column,
  DataTable,
  FilterChip,
  Kpi,
  KpiGrid,
  ListSection,
  Notes,
  Num,
  Panel,
  PercentBar,
  Segmented,
} from "../components/report-ui";
import { AssetsTab } from "../components/tabs/assets-tab";
import { BirthdaysTab } from "../components/tabs/birthdays-tab";
import { DataChangesTab } from "../components/tabs/data-changes-tab";
import { DemographicsTab } from "../components/tabs/demographics-tab";
import { MovementsTab } from "../components/tabs/movements-tab";
import { TenureTab } from "../components/tabs/tenure-tab";
import { fmt, pct } from "../format";
import {
  type DetailTab,
  MONTH_NAMES,
  MONTHS,
  maxOf,
  personSearch,
  scrollToId,
  sum,
  thisMonth,
  thisYear,
  useOpenProfile,
} from "../report-helpers";
import type {
  CompletenessReport,
  DocumentExpiryReport,
  HeadcountReport,
  WarningLettersReport,
} from "../schemas";

// ARS-D16/D17 (Arsip gelombang 3): Personal Management › Laporan — batch 1 (headcount & turnover,
// dokumen kedaluwarsa, kelengkapan data, SP aktif) + batch 2 ARS-D21 (masa kerja, demografi, mutasi &
// promosi, ulang tahun, aset, pengajuan data; tab di components/tabs/). SA & HR (PT ditugaskan); angka dihitung server;
// daftar per orang yang sensitif hanya bila ber-grant (API). Dashboard tetap ringkasan saat ini.
// URL: ?laporan=<slug>&unit=&tahun=&bulan= (bisa dibagikan); ?pegawai=<id>&tab=<tab detail> membuka profil
// karyawan di panel yang sama (pola halaman Arsip). Saringan hasil klik hanya di tampilan.

const TABS: { kind: ReportKind; slug: string; label: string; icon: typeof Users }[] = [
  { kind: "headcount", slug: "headcount", label: "Headcount & turnover", icon: Users },
  { kind: "document-expiry", slug: "dokumen", label: "Dokumen kedaluwarsa", icon: FileClock },
  { kind: "completeness", slug: "kelengkapan", label: "Kelengkapan data", icon: ListChecks },
  { kind: "warning-letters", slug: "sp", label: "SP aktif", icon: ShieldAlert },
  // Batch 2 (ARS-D21)
  { kind: "tenure", slug: "masa-kerja", label: "Masa kerja", icon: Award },
  { kind: "demographics", slug: "demografi", label: "Demografi", icon: ChartPie },
  { kind: "movements", slug: "mutasi", label: "Mutasi & promosi", icon: ArrowLeftRight },
  { kind: "birthdays", slug: "ulang-tahun", label: "Ulang tahun", icon: Cake },
  { kind: "assets", slug: "aset", label: "Aset", icon: Package },
  { kind: "data-changes", slug: "pengajuan-data", label: "Pengajuan data", icon: FilePen },
];

const YEAR_KINDS = new Set<ReportKind>([
  "headcount",
  "warning-letters",
  "tenure",
  "movements",
  "data-changes",
]);

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab =
    TABS.find((t) => t.slug === params.get("laporan")) ?? (TABS[0] as (typeof TABS)[number]);
  const unitId = params.get("unit") ?? "";
  const yearParam = Number(params.get("tahun"));
  const year = yearParam >= 2000 && yearParam <= thisYear ? yearParam : thisYear;
  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const scope = useCompanyScope();
  const master = useMasterData();
  // 10 tab tidak muat di HP: tab aktif (mis. dari URL) digulir supaya terlihat.
  useEffect(() => {
    document
      .querySelector(`#report-tabs [id$="-trigger-${tab.slug}"]`)
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [tab.slug]);
  const monthParam = Number(params.get("bulan"));
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : thisMonth;
  const usesMonth = tab.kind === "tenure" || tab.kind === "birthdays";
  // Ulang tahun hanya butuh bulan; tahun tetap dikirim (skema API) tanpa pilihan di layar.
  const usesYear = YEAR_KINDS.has(tab.kind);
  const filter: ReportParams = {
    companyId: scope.selectedId,
    unitId: unitId || undefined,
    ...(usesYear || usesMonth ? { year: usesYear ? year : thisYear } : {}),
    ...(usesMonth ? { month } : {}),
  };
  const units = (master.data?.departments ?? []).filter(
    (d) => !scope.selectedId || !d.companyId || d.companyId === scope.selectedId,
  );
  const company = scope.companies.find((c) => c.id === scope.selectedId);
  const dirty =
    Boolean(unitId) || (usesYear && year !== thisYear) || (usesMonth && month !== thisMonth);
  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    setExporting(true);
    try {
      const file = await exportReport(tab.kind, filter);
      toast.success(`${file.fileName} (${fmt.format(file.rows)} baris) diunduh.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title="Laporan"
        description="Rekap per periode untuk HR. Klik angka, grafik, atau nama karyawan untuk menelusuri; data sensitif per orang hanya tampil bila Anda punya izinnya."
      />
      <Tabs value={tab.slug} onValueChange={(slug) => setParam("laporan", slug)} className="gap-4">
        {/* HP: tab digulir ke samping (tab aktif digulir masuk layar); md ke atas: turun baris bila tidak muat. */}
        <TabsList
          id="report-tabs"
          className="max-w-full justify-start overflow-x-auto [scrollbar-width:none] md:flex-wrap md:gap-y-1 md:overflow-visible"
        >
          {TABS.map((t) => (
            <TabsTrigger key={t.slug} value={t.slug}>
              <t.icon /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* Bilah filter menempel di bawah header aplikasi (layar md ke atas). */}
        <div className="bg-background/90 supports-[backdrop-filter]:bg-background/75 z-20 -mx-1 rounded-xl px-1 py-1 backdrop-blur md:sticky md:top-0">
          <div className="bg-card flex flex-col gap-2 rounded-xl border p-2 shadow-xs sm:flex-row sm:flex-wrap sm:items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="bg-muted inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium">
                  <Building2 className="text-muted-foreground size-4" aria-hidden />
                  {company ? company.code : "Semua PT"}
                </span>
              </TooltipTrigger>
              <TooltipContent>PT mengikuti pilihan di bilah atas aplikasi</TooltipContent>
            </Tooltip>
            <FormSelect
              aria-label="Unit"
              className="h-9 sm:w-60"
              value={unitId}
              onChange={(v) => setParam("unit", v || undefined)}
              placeholder="Semua unit"
              noneLabel="Semua unit"
              options={units.map((u) => ({ value: u.id, label: u.name }))}
            />
            {usesYear ? (
              <FormSelect
                aria-label="Tahun"
                className="h-9 sm:w-28"
                value={String(year)}
                onChange={(v) => setParam("tahun", v === String(thisYear) ? undefined : v)}
                placeholder="Tahun"
                options={Array.from({ length: 6 }, (_, i) => String(thisYear - i)).map((y) => ({
                  value: y,
                  label: y,
                }))}
              />
            ) : null}
            {usesMonth ? (
              <FormSelect
                aria-label="Bulan"
                className="h-9 sm:w-36"
                value={String(month)}
                onChange={(v) => setParam("bulan", v === String(thisMonth) ? undefined : v)}
                placeholder="Bulan"
                options={MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))}
              />
            ) : null}
            {dirty ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() =>
                  setParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete("unit");
                      next.delete("tahun");
                      next.delete("bulan");
                      return next;
                    },
                    { replace: true },
                  )
                }
              >
                <RotateCcw /> Reset
              </Button>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 sm:ml-auto"
                  onClick={() => void onExport()}
                  disabled={exporting}
                >
                  {exporting ? <Loader2 className="animate-spin" /> : <FileDown />} Ekspor Excel
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Berisi ringkasan + seluruh rincian sesuai filter PT/unit/periode. Saringan hasil
                klik di halaman tidak ikut.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <TabsContent value="headcount">
          <HeadcountTab params={filter} enabled={tab.kind === "headcount"} />
        </TabsContent>
        <TabsContent value="dokumen">
          <DocumentExpiryTab params={filter} enabled={tab.kind === "document-expiry"} />
        </TabsContent>
        <TabsContent value="kelengkapan">
          <CompletenessTab params={filter} enabled={tab.kind === "completeness"} />
        </TabsContent>
        <TabsContent value="sp">
          <WarningLettersTab params={filter} enabled={tab.kind === "warning-letters"} />
        </TabsContent>
        <TabsContent value="masa-kerja">
          <TenureTab params={filter} enabled={tab.kind === "tenure"} />
        </TabsContent>
        <TabsContent value="demografi">
          <DemographicsTab params={filter} enabled={tab.kind === "demographics"} />
        </TabsContent>
        <TabsContent value="mutasi">
          <MovementsTab params={filter} enabled={tab.kind === "movements"} />
        </TabsContent>
        <TabsContent value="ulang-tahun">
          <BirthdaysTab params={filter} enabled={tab.kind === "birthdays"} />
        </TabsContent>
        <TabsContent value="aset">
          <AssetsTab params={filter} enabled={tab.kind === "assets"} />
        </TabsContent>
        <TabsContent value="pengajuan-data">
          <DataChangesTab params={filter} enabled={tab.kind === "data-changes"} />
        </TabsContent>
      </Tabs>
      <EmployeeDetailSheet />
    </div>
  );
}

// --- (1) Headcount & turnover ---

type Breakdown = HeadcountReport["byCompany"][number];
type Mover = {
  employeeId: string;
  fullName: string;
  employeeNumber: string | null;
  company: string;
  unit: string | null;
  position: string | null;
  date: string;
  reason: string | null;
};

function HeadcountTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("headcount", params, enabled);
  const openProfile = useOpenProfile();
  const [month, setMonth] = useState<number | undefined>();
  const [reason, setReason] = useState<string | undefined>();
  const [list, setList] = useState<"left" | "joined">("left");
  const [group, setGroup] = useState<"company" | "unit" | "status">("unit");
  const r = query.data;
  if (!r) return <State query={query} />;

  const selectMonth = (m: number) => {
    const row = r.months.find((x) => x.month === m);
    if (!row) return;
    const next = month === m ? undefined : m;
    setMonth(next);
    if (next && row.left === 0 && row.joined > 0) setList("joined");
    else if (next && row.left > 0) setList("left");
    scrollToId("daftar-masuk-keluar");
  };
  const selectReason = (label: string) => {
    setReason(reason === label ? undefined : label);
    setList("left");
    scrollToId("daftar-masuk-keluar");
  };
  const inMonth = (iso: string) => !month || Number(iso.slice(5, 7)) === month;
  const movers: Mover[] =
    list === "left"
      ? r.leavers
          .filter(
            (l) => inMonth(l.endDate) && (!reason || (l.exitReason ?? "Tanpa alasan") === reason),
          )
          .map((l) => ({ ...l, date: l.endDate, reason: l.exitReason }))
      : r.joiners
          .filter((j) => inMonth(j.joinDate))
          .map((j) => ({ ...j, date: j.joinDate, reason: null }));
  const breakdown: Breakdown[] =
    group === "company" ? r.byCompany : group === "unit" ? r.byUnit : r.byStatus;
  const maxTurnover = maxOf(r.months, (m) => m.turnover);
  const maxActive = maxOf(breakdown, (b) => b.active);
  const maxReason = maxOf(r.exitReasons, (e) => e.count);

  const monthColumns: Column<HeadcountReport["months"][number]>[] = [
    {
      key: "month",
      header: "Bulan",
      cell: (m) => (
        <span className="inline-flex items-center gap-1.5 font-medium">
          {MONTH_NAMES[m.month - 1]}
          {m.left > 0 ? (
            <span
              className="bg-warning size-1.5 rounded-full"
              title="Ada karyawan keluar"
              aria-hidden
            />
          ) : null}
        </span>
      ),
    },
    {
      key: "start",
      header: "Aktif awal",
      align: "right",
      cell: (m) => <Num value={m.startActive} />,
    },
    { key: "end", header: "Aktif akhir", align: "right", cell: (m) => <Num value={m.endActive} /> },
    {
      key: "joined",
      header: "Masuk",
      align: "right",
      cell: (m) => (
        <span className={cn(m.joined > 0 && "text-success-soft-foreground font-medium")}>
          <Num value={m.joined} format={(n) => (n > 0 ? `+${fmt.format(n)}` : "0")} />
        </span>
      ),
    },
    {
      key: "left",
      header: "Keluar",
      align: "right",
      cell: (m) => (
        <span className={cn(m.left > 0 && "text-destructive font-medium")}>
          <Num value={m.left} format={(n) => (n > 0 ? `−${fmt.format(n)}` : "0")} />
        </span>
      ),
    },
    {
      key: "turnover",
      header: "Turnover",
      align: "right",
      cell: (m) => (
        <BarCell
          value={m.turnover}
          max={maxTurnover}
          tone="warning"
          label={<Num value={m.turnover} format={pct} />}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}> · tahun {r.year}</AsOf>
      <KpiGrid>
        <Kpi icon={Users} label="Aktif 1 Januari" value={fmt.format(r.summary.startActive)} />
        <Kpi
          icon={UserCheck}
          label={`Aktif per ${formatDate(r.asOf)}`}
          value={fmt.format(r.summary.endActive)}
          hint={<Delta from={r.summary.startActive} to={r.summary.endActive} />}
        />
        <Kpi
          icon={UserPlus}
          tone="success"
          label="Masuk"
          value={fmt.format(r.summary.joined)}
          hint="karyawan baru tahun ini"
          onClick={() => {
            setList("joined");
            setMonth(undefined);
            scrollToId("daftar-masuk-keluar");
          }}
        />
        <Kpi
          icon={UserMinus}
          tone={r.summary.left > 0 ? "warning" : "default"}
          label="Keluar"
          value={fmt.format(r.summary.left)}
          hint="berhenti tahun ini"
          onClick={() => {
            setList("left");
            setMonth(undefined);
            setReason(undefined);
            scrollToId("daftar-masuk-keluar");
          }}
        />
        <Kpi
          icon={Percent}
          tone="brand"
          label={`Turnover ${r.year}`}
          value={pct(r.summary.turnover)}
          hint="keluar ÷ rata-rata headcount"
          info={
            <>
              <p className="font-medium">Rumus turnover (ARS-D17)</p>
              <p className="mt-1">
                Keluar ÷ ((aktif awal + aktif akhir) ÷ 2) × 100. Aktif pada suatu tanggal = sudah
                masuk dan belum keluar. Bulan setelah hari ini tidak dihitung.
              </p>
            </>
          }
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          className="lg:col-span-8"
          title="Masuk & keluar per bulan"
          description="Klik kolom bulan untuk melihat siapa yang masuk/keluar."
        >
          <ReportChart
            label={`Grafik masuk dan keluar ${r.year}`}
            categories={r.months.map((m) => MONTHS[m.month - 1] as string)}
            series={[
              { name: "Masuk", data: r.months.map((m) => m.joined) },
              { name: "Keluar", data: r.months.map((m) => m.left) },
            ]}
            selectedIndex={month ? month - 1 : undefined}
            onSelect={(i) => selectMonth(i + 1)}
          />
        </Panel>
        <Panel
          className="lg:col-span-4"
          title="Alasan keluar"
          description="Klik alasan untuk menyaring daftar."
        >
          {r.exitReasons.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Tidak ada karyawan keluar pada {r.year}.
            </p>
          ) : (
            <ul className="space-y-1">
              {r.exitReasons.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    aria-pressed={reason === e.label}
                    onClick={() => selectReason(e.label)}
                    className={cn(
                      "hover:bg-muted/60 w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                      reason === e.label && "bg-brand-soft/60",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{e.label}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        <span className="text-foreground font-medium">{fmt.format(e.count)}</span> ·{" "}
                        {pct(Math.round((e.count / Math.max(1, r.summary.left)) * 100))}
                      </span>
                    </div>
                    <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-warning h-full rounded-full"
                        style={{ width: `${(e.count / Math.max(1, maxReason)) * 100}%` }}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          title="Rincian per bulan"
          description="Titik kuning = ada karyawan keluar. Klik baris untuk menyaring daftar."
        >
          <DataTable
            label="Headcount per bulan"
            rows={r.months}
            columns={monthColumns}
            rowKey={(m) => String(m.month)}
            onRowClick={(m) => selectMonth(m.month)}
            rowClassName={(m) => (m.month === month ? "bg-brand-soft/50" : undefined)}
            footer={[
              "Setahun",
              fmt.format(r.summary.startActive),
              fmt.format(r.summary.endActive),
              fmt.format(r.summary.joined),
              fmt.format(r.summary.left),
              pct(r.summary.turnover),
            ]}
            empty="Belum ada bulan yang dihitung."
          />
        </Panel>
        <Panel
          className="xl:col-span-5"
          title="Komposisi"
          description="Aktif akhir periode, masuk, dan keluar."
          aside={
            <Segmented
              label="Kelompokkan"
              value={group}
              onChange={setGroup}
              options={[
                { value: "unit", label: "Unit" },
                { value: "company", label: "PT" },
                { value: "status", label: "Status" },
              ]}
            />
          }
        >
          <DataTable
            key={group}
            label={
              group === "company"
                ? "Per PT"
                : group === "unit"
                  ? "Per unit"
                  : "Per status kepegawaian"
            }
            rows={breakdown}
            columns={[
              { key: "label", header: "Nama", sortValue: (b) => b.label, cell: (b) => b.label },
              {
                key: "active",
                header: "Aktif",
                align: "right",
                sortValue: (b) => b.active,
                cell: (b) => <BarCell value={b.active} max={maxActive} />,
              },
              {
                key: "joined",
                header: "Masuk",
                align: "right",
                sortValue: (b) => b.joined,
                cell: (b) => <Num value={b.joined} />,
              },
              {
                key: "left",
                header: "Keluar",
                align: "right",
                sortValue: (b) => b.left,
                cell: (b) => <Num value={b.left} />,
              },
            ]}
            rowKey={(b) => b.key}
            limit={8}
            footer={[
              "Total",
              fmt.format(sum(breakdown, (b) => b.active)),
              fmt.format(sum(breakdown, (b) => b.joined)),
              fmt.format(sum(breakdown, (b) => b.left)),
            ]}
          />
        </Panel>
      </div>

      <div id="daftar-masuk-keluar" className="scroll-mt-32">
        <ListSection
          title={list === "left" ? "Karyawan keluar" : "Karyawan masuk"}
          description="Klik baris untuk membuka profil karyawan."
          aside={
            <Segmented
              label="Daftar"
              value={list}
              onChange={(v) => {
                setList(v);
                if (v === "joined") setReason(undefined);
              }}
              options={[
                { value: "left", label: `Keluar (${fmt.format(r.leavers.length)})` },
                { value: "joined", label: `Masuk (${fmt.format(r.joiners.length)})` },
              ]}
            />
          }
        >
          <PeopleList
            key={list}
            label={list === "left" ? "Karyawan keluar" : "Karyawan masuk"}
            rows={movers}
            rowKey={(x) => `${x.employeeId}-${x.date}`}
            onRowClick={(x) => openProfile(x.employeeId, list === "left" ? "history" : "work")}
            search={personSearch}
            initialSort={{ field: "date", direction: "desc" }}
            toolbar={
              <>
                {month ? (
                  <FilterChip
                    label={`Bulan: ${MONTH_NAMES[month - 1]}`}
                    onClear={() => setMonth(undefined)}
                  />
                ) : null}
                {reason ? (
                  <FilterChip label={`Alasan: ${reason}`} onClear={() => setReason(undefined)} />
                ) : null}
              </>
            }
            columns={[
              personColumn<Mover>(),
              unitColumn<Mover>(),
              {
                key: "date",
                header: list === "left" ? "Tanggal keluar" : "Tanggal masuk",
                sortValue: (x) => x.date,
                cell: (x) => (
                  <span className="whitespace-nowrap tabular-nums">{formatDate(x.date)}</span>
                ),
              },
              ...(list === "left"
                ? [
                    {
                      key: "reason",
                      header: "Alasan",
                      sortValue: (x: Mover) => x.reason ?? "",
                      cell: (x: Mover) =>
                        x.reason ? <Badge variant="muted">{x.reason}</Badge> : "—",
                    },
                  ]
                : []),
            ]}
            empty={{
              title:
                list === "left"
                  ? `Tidak ada karyawan keluar${month ? ` pada ${MONTH_NAMES[month - 1]}` : ""}`
                  : `Tidak ada karyawan masuk${month ? ` pada ${MONTH_NAMES[month - 1]}` : ""}`,
            }}
          />
        </ListSection>
      </div>

      <Notes>
        <p>
          Rincian per unit/status memakai unit & status karyawan <strong>saat ini</strong> (belum
          ada riwayat per tanggal).
        </p>
        <p>Karyawan yang diaktifkan kembali tidak lagi terhitung keluar pada periode sebelumnya.</p>
      </Notes>
    </div>
  );
}

function Delta({ from, to }: { from: number; to: number }) {
  const diff = to - from;
  if (diff === 0) return <span>sama dengan 1 Januari</span>;
  return (
    <span className={diff > 0 ? "text-success-soft-foreground" : "text-destructive"}>
      {diff > 0 ? "▲" : "▼"} {fmt.format(Math.abs(diff))} sejak 1 Januari
    </span>
  );
}

// --- (2) Dokumen kedaluwarsa ---

const BUCKET_TONE = {
  EXPIRED: "destructive",
  D30: "warning",
  D60: "warning",
  D90: "muted",
} as const;
const BUCKET_ICON = { EXPIRED: CalendarX2, D30: AlertTriangle, D60: Hourglass, D90: CalendarClock };
const BUCKET_KPI_TONE = {
  EXPIRED: "danger",
  D30: "warning",
  D60: "warning",
  D90: "default",
} as const;

function relativeDays(days: number) {
  if (days < 0) return `lewat ${fmt.format(-days)} hari`;
  if (days === 0) return "hari ini";
  return `${fmt.format(days)} hari lagi`;
}

type ExpiryRow = DocumentExpiryReport["rows"][number];

function DocumentExpiryTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("document-expiry", params, enabled);
  const openProfile = useOpenProfile();
  const [bucket, setBucket] = useState<ExpiryBucket | undefined>();
  const [docType, setDocType] = useState<string | undefined>();
  const r = query.data;
  if (!r) return <State query={query} />;
  const total = sum(EXPIRY_BUCKETS, (b) => r.counts[b] ?? 0);
  const rows = r.rows.filter(
    (x) => (!bucket || x.bucket === bucket) && (!docType || x.documentType === docType),
  );
  const urgent = r.rows.filter((x) => x.bucket === "EXPIRED" || x.bucket === "D30").slice(0, 6);
  const maxType = maxOf(r.byType, (t) => t.total);
  const pickBucket = (b: ExpiryBucket) => {
    setBucket(bucket === b ? undefined : b);
    scrollToId("daftar-dokumen");
  };
  const pickType = (t: string) => {
    setDocType(docType === t ? undefined : t);
    scrollToId("daftar-dokumen");
  };

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}> · dokumen berlaku ≤ 90 hari dari hari ini</AsOf>
      <KpiGrid>
        <Kpi
          icon={FileWarning}
          tone="brand"
          label="Perlu diperbarui"
          value={fmt.format(total)}
          hint="lewat + ≤ 90 hari"
          info="Dokumen karyawan aktif yang sudah lewat masa berlaku atau akan habis dalam 90 hari. Dokumen tanpa tanggal berlaku tidak dihitung."
        />
        {EXPIRY_BUCKETS.map((b) => (
          <Kpi
            key={b}
            icon={BUCKET_ICON[b]}
            tone={(r.counts[b] ?? 0) > 0 ? BUCKET_KPI_TONE[b] : "default"}
            label={EXPIRY_BUCKET_LABELS[b]}
            value={fmt.format(r.counts[b] ?? 0)}
            hint={bucket === b ? "disaring — klik lagi untuk batal" : "klik untuk menyaring"}
            pressed={bucket === b}
            onClick={() => pickBucket(b)}
          />
        ))}
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          className="lg:col-span-8"
          title="Per jenis dokumen"
          description="Klik baris untuk menyaring daftar."
        >
          <DataTable
            label="Dokumen kedaluwarsa per jenis"
            rows={r.byType}
            rowKey={(t) => t.documentType}
            onRowClick={(t) => pickType(t.documentType)}
            rowClassName={(t) => (t.documentType === docType ? "bg-brand-soft/50" : undefined)}
            limit={8}
            columns={[
              {
                key: "type",
                header: "Jenis dokumen",
                cell: (t) => <span className="font-medium">{t.documentType}</span>,
              },
              ...EXPIRY_BUCKETS.map((b) => ({
                key: b,
                header: EXPIRY_BUCKET_LABELS[b],
                align: "right" as const,
                className: b === "D90" || b === "D60" ? "hidden sm:table-cell" : undefined,
                cell: (t: DocumentExpiryReport["byType"][number]) => (
                  <span
                    className={cn(b === "EXPIRED" && t[b] > 0 && "text-destructive font-medium")}
                  >
                    <Num value={t[b]} />
                  </span>
                ),
              })),
              {
                key: "total",
                header: "Total",
                align: "right",
                cell: (t) => <BarCell value={t.total} max={maxType} />,
              },
            ]}
            empty="Tidak ada dokumen yang kedaluwarsa atau akan kedaluwarsa dalam 90 hari."
          />
        </Panel>
        <Panel
          className="lg:col-span-4"
          title="Paling mendesak"
          description="Sudah lewat atau habis ≤ 30 hari."
        >
          {urgent.length === 0 ? (
            <p className="text-muted-foreground flex items-center justify-center gap-1.5 py-6 text-sm">
              <CheckCircle2 className="text-success size-4" aria-hidden /> Tidak ada yang mendesak.
            </p>
          ) : (
            <ul className="divide-y">
              {urgent.map((x) => {
                const days = daysUntil(x.expiresAt, r.asOf);
                return (
                  <li key={`${x.employeeId}-${x.documentType}-${x.expiresAt}`}>
                    <button
                      type="button"
                      onClick={() => openProfile(x.employeeId, "documents")}
                      className="hover:bg-muted/60 -mx-2 flex w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-lg px-2 py-2 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{x.fullName}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {x.documentType}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium whitespace-nowrap",
                          days < 0 ? "text-destructive" : "text-warning-soft-foreground",
                        )}
                      >
                        {relativeDays(days)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div id="daftar-dokumen" className="scroll-mt-32">
        <ListSection
          title="Daftar dokumen"
          description="Urut dari yang paling dulu habis. Klik baris untuk membuka tab Dokumen karyawan."
          aside={
            r.hiddenSensitive > 0 ? (
              <span className="text-muted-foreground bg-muted rounded-md px-2 py-1 text-xs">
                {r.hiddenSensitive} dokumen sensitif tidak ditampilkan (butuh izin lihat dokumen)
              </span>
            ) : null
          }
        >
          <PeopleList
            key={`${bucket}-${docType}`}
            label="Daftar dokumen kedaluwarsa"
            rows={rows}
            rowKey={(x) => `${x.employeeId}-${x.documentType}-${x.expiresAt}`}
            onRowClick={(x) => openProfile(x.employeeId, "documents")}
            search={(x) => `${personSearch(x)} ${x.documentType}`}
            searchPlaceholder="Cari nama, NIP, atau dokumen…"
            initialSort={{ field: "expires", direction: "asc" }}
            toolbar={
              <>
                {bucket ? (
                  <FilterChip
                    label={EXPIRY_BUCKET_LABELS[bucket]}
                    onClear={() => setBucket(undefined)}
                  />
                ) : null}
                {docType ? (
                  <FilterChip label={docType} onClear={() => setDocType(undefined)} />
                ) : null}
              </>
            }
            columns={[
              personColumn<ExpiryRow>(),
              unitColumn<ExpiryRow>(),
              {
                key: "type",
                header: "Jenis dokumen",
                sortValue: (x) => x.documentType,
                cell: (x) => <span className="font-medium">{x.documentType}</span>,
              },
              {
                key: "expires",
                header: "Berlaku s/d",
                sortValue: (x) => x.expiresAt,
                cell: (x) => {
                  const days = daysUntil(x.expiresAt, r.asOf);
                  return (
                    <div className="whitespace-nowrap">
                      <p className="tabular-nums">{formatDate(x.expiresAt)}</p>
                      <p
                        className={cn(
                          "text-xs",
                          days < 0 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {relativeDays(days)}
                      </p>
                    </div>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                cell: (x) => (
                  <Badge variant={BUCKET_TONE[x.bucket]}>{EXPIRY_BUCKET_LABELS[x.bucket]}</Badge>
                ),
              },
            ]}
            empty={{
              title: "Tidak ada dokumen",
              description: "Tidak ada dokumen kedaluwarsa untuk saringan ini.",
            }}
          />
        </ListSection>
      </div>
    </div>
  );
}

// --- (3) Kelengkapan data ---

/** Item kelengkapan → tab profil tempat data itu diisi. */
const ITEM_TAB: Record<string, DetailTab> = {
  KTP: "personal",
  NPWP: "personal",
  BPJS_TK: "personal",
  BPJS_KES: "personal",
  BANK: "bank",
  EMERGENCY: "work",
  WORK_EMAIL: "work",
};
const tabForItem = (key: string | undefined): DetailTab => {
  if (!key) return "work";
  return key.startsWith("DOC:") ? "documents" : (ITEM_TAB[key] ?? "work");
};

type CompletenessRow = CompletenessReport["rows"][number];

function MissingList({ labels }: { labels: string[] }) {
  const shown = labels.slice(0, 4);
  const rest = labels.length - shown.length;
  return (
    <div className="flex max-w-xl flex-wrap gap-1" title={labels.join(", ")}>
      {shown.map((label) => (
        <Badge key={label} variant="warning" className="font-normal">
          {label}
        </Badge>
      ))}
      {rest > 0 ? (
        <Badge variant="muted" className="font-normal">
          +{rest} lainnya
        </Badge>
      ) : null}
    </div>
  );
}

function CompletenessTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("completeness", params, enabled);
  const openProfile = useOpenProfile();
  const [item, setItem] = useState<{ key: string; label: string } | undefined>();
  const r = query.data;
  if (!r) return <State query={query} />;
  const rows = item ? r.rows.filter((x) => x.missingKeys.includes(item.key)) : r.rows;
  const maxItem = maxOf(r.byItem, (i) => i.missing);
  const incomplete = r.total - r.complete;
  const pickItem = (i: { key: string; label: string }) => {
    setItem(item?.key === i.key ? undefined : i);
    scrollToId("daftar-belum-lengkap");
  };
  const open = (x: CompletenessRow) =>
    openProfile(x.employeeId, tabForItem(item?.key ?? x.missingKeys[0]));

  return (
    <div className="space-y-4">
      <AsOf date={new Date().toISOString().slice(0, 10)}> · karyawan aktif</AsOf>
      <KpiGrid className="xl:grid-cols-4">
        <Kpi
          icon={Percent}
          tone="brand"
          label="Persen lengkap"
          value={pct(r.percent)}
          info={
            <>
              <p className="font-medium">Definisi lengkap (ARS-D17)</p>
              <p className="mt-1">
                Semua {CORE_COMPLETENESS_ITEMS.length} data inti terisi (
                {CORE_COMPLETENESS_ITEMS.map((k) => CORE_COMPLETENESS_LABELS[k]).join(", ")}) dan
                seluruh dokumen wajib sesuai jabatan sudah diunggah. NPWP/BPJS yang ditandai "tidak
                punya" dianggap lengkap.
              </p>
            </>
          }
        >
          <PercentBar percent={r.percent} showValue={false} className="mt-2" />
        </Kpi>
        <Kpi icon={Users} label="Karyawan aktif" value={fmt.format(r.total)} />
        <Kpi
          icon={CheckCircle2}
          tone="success"
          label="Data lengkap"
          value={fmt.format(r.complete)}
        />
        <Kpi
          icon={UserX}
          tone={incomplete > 0 ? "warning" : "default"}
          label="Belum lengkap"
          value={fmt.format(incomplete)}
          hint="klik untuk melihat daftar"
          onClick={() => {
            setItem(undefined);
            scrollToId("daftar-belum-lengkap");
          }}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title="Data yang paling sering kosong"
          description="Klik item untuk melihat siapa saja yang belum mengisi."
        >
          {r.byItem.length === 0 ? (
            <p className="text-muted-foreground flex items-center justify-center gap-1.5 py-6 text-sm">
              <CheckCircle2 className="text-success size-4" aria-hidden /> Semua data lengkap.
            </p>
          ) : (
            <ul className="space-y-0.5" aria-label="Data kosong per jenis">
              {r.byItem.map((i) => {
                const share = r.total > 0 ? Math.round((i.missing / r.total) * 100) : 0;
                return (
                  <li key={i.key}>
                    <button
                      type="button"
                      aria-pressed={item?.key === i.key}
                      onClick={() => pickItem(i)}
                      className={cn(
                        "hover:bg-muted/60 grid w-full grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors sm:grid-cols-[minmax(0,14rem)_1fr_auto]",
                        item?.key === i.key && "bg-brand-soft/60",
                      )}
                    >
                      <span className="truncate">{i.label}</span>
                      <span className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
                        <span
                          className="bg-warning block h-full rounded-full"
                          style={{ width: `${(i.missing / Math.max(1, maxItem)) * 100}%` }}
                        />
                      </span>
                      <span className="text-muted-foreground w-24 text-right text-xs tabular-nums">
                        <span className="text-foreground font-medium">{fmt.format(i.missing)}</span>{" "}
                        org · {share}%
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel
          className="lg:col-span-5"
          title="Per PT"
          description="Merah < 60%, kuning < 85%, hijau ≥ 85%."
        >
          <DataTable
            label="Kelengkapan per PT"
            rows={r.byCompany}
            rowKey={(c) => c.label}
            limit={8}
            columns={[
              {
                key: "pt",
                header: "PT",
                cell: (c) => <span className="font-medium">{c.label}</span>,
              },
              {
                key: "count",
                header: "Lengkap",
                align: "right",
                cell: (c) => (
                  <span className="tabular-nums whitespace-nowrap">
                    {fmt.format(c.complete)}
                    <span className="text-muted-foreground">/{fmt.format(c.total)}</span>
                  </span>
                ),
              },
              {
                key: "percent",
                header: "%",
                className: "w-1/2",
                cell: (c) => <PercentBar percent={c.percent} label={`Persen lengkap ${c.label}`} />,
              },
            ]}
          />
        </Panel>
      </div>

      <div id="daftar-belum-lengkap" className="scroll-mt-32">
        <ListSection
          title="Karyawan belum lengkap"
          description="Klik baris untuk membuka profil di tab tempat data itu diisi."
        >
          <PeopleList
            key={item?.key ?? "all"}
            label="Karyawan belum lengkap"
            rows={rows}
            rowKey={(x) => x.employeeId}
            onRowClick={open}
            search={personSearch}
            initialSort={{ field: "count", direction: "desc" }}
            toolbar={
              item ? (
                <FilterChip label={`Belum: ${item.label}`} onClear={() => setItem(undefined)} />
              ) : null
            }
            columns={[
              personColumn<CompletenessRow>(),
              unitColumn<CompletenessRow>(),
              {
                key: "count",
                header: "Kurang",
                sortValue: (x) => x.missing.length,
                cell: (x) => (
                  <span
                    className={cn(
                      "inline-flex min-w-7 justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                      x.missing.length >= 5
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning-soft text-warning-soft-foreground",
                    )}
                  >
                    {x.missing.length}
                  </span>
                ),
              },
              {
                key: "missing",
                header: "Data kurang",
                cell: (x) => <MissingList labels={x.missing} />,
              },
            ]}
            empty={{
              title: item
                ? `Semua karyawan sudah mengisi ${item.label}`
                : "Semua karyawan aktif sudah lengkap",
            }}
          />
        </ListSection>
      </div>

      <Notes>
        <p>
          Hanya status terisi/kosong yang ditampilkan — nilai data pribadi tidak pernah muncul di
          laporan.
        </p>
        {r.siteTypesSkipped.length > 0 ? (
          <p>
            Dokumen wajib khusus karyawan site belum dihitung ({r.siteTypesSkipped.join(", ")}):
            penanda lokasi site belum tersedia.
          </p>
        ) : null}
      </Notes>
    </div>
  );
}

// --- (4) SP aktif ---

const LEVEL_TONE: Record<WarningLevel, "warning" | "destructive"> = {
  SP1: "warning",
  SP2: "warning",
  SP3: "destructive",
};
type LetterRow = WarningLettersReport["rows"][number];

function WarningLettersTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("warning-letters", params, enabled);
  const openProfile = useOpenProfile();
  const [level, setLevel] = useState<WarningLevel | undefined>();
  const [violation, setViolation] = useState<string | undefined>();
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false);
  const r = query.data;
  if (!r) return <State query={query} />;
  const rows = r.rows.filter(
    (x) =>
      (!level || x.level === level) &&
      (!violation || x.violation === violation) &&
      (!unconfirmedOnly || !x.confirmed),
  );
  const maxViolation = maxOf(r.byViolation, (v) => v.count);
  const issuedTotal = sum(r.issuedByMonth, (m) => m.SP1 + m.SP2 + m.SP3);
  const jump = () => scrollToId("daftar-sp");
  const listOnly = (fn: () => void) => (r.canList ? fn : undefined);

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}>
        {" "}
        · terbit sepanjang {r.year}: {fmt.format(issuedTotal)} SP
      </AsOf>
      <KpiGrid>
        <Kpi
          icon={ShieldAlert}
          tone="brand"
          label="SP berlaku"
          value={fmt.format(r.activeTotal)}
          hint={`per ${formatDate(r.asOf)}`}
          info="SP yang masa berlakunya mencakup hari ini (tanggal terbit ≤ hari ini ≤ berlaku s/d) dan tidak dicabut."
        />
        {WARNING_LEVELS.map((lv) => (
          <Kpi
            key={lv}
            icon={ShieldAlert}
            glyph={
              <span className="text-sm leading-none font-bold tabular-nums" aria-hidden>
                {lv.slice(2)}
              </span>
            }
            tone={r.activeByLevel[lv] > 0 ? (lv === "SP1" ? "warning" : "danger") : "default"}
            label={WARNING_LEVEL_LABELS[lv]}
            value={fmt.format(r.activeByLevel[lv])}
            pressed={level === lv}
            onClick={listOnly(() => {
              setLevel(level === lv ? undefined : lv);
              jump();
            })}
          />
        ))}
        <Kpi
          icon={MailQuestion}
          tone={r.unconfirmed > 0 ? "warning" : "default"}
          label="Belum dikonfirmasi"
          value={fmt.format(r.unconfirmed)}
          hint="atasan / karyawan"
          pressed={unconfirmedOnly}
          onClick={listOnly(() => {
            setUnconfirmedOnly(!unconfirmedOnly);
            jump();
          })}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          className="lg:col-span-8"
          title={`SP terbit per bulan ${r.year}`}
          description="Bertumpuk per tingkat SP."
        >
          <ReportChart
            label={`Grafik SP terbit per bulan ${r.year}`}
            categories={MONTHS}
            series={WARNING_LEVELS.map((lv) => ({
              name: WARNING_LEVEL_LABELS[lv],
              data: r.issuedByMonth.map((m) => m[lv]),
            }))}
            stacked
          />
        </Panel>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <Panel
            title="Per jenis pelanggaran"
            description={r.canList ? "Klik untuk menyaring daftar." : undefined}
          >
            {r.byViolation.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Tidak ada SP yang berlaku.
              </p>
            ) : (
              <ul className="space-y-1" aria-label="SP berlaku per jenis pelanggaran">
                {r.byViolation.map((v) => (
                  <li key={v.label}>
                    <button
                      type="button"
                      disabled={!r.canList}
                      aria-pressed={violation === v.label}
                      onClick={() => {
                        setViolation(violation === v.label ? undefined : v.label);
                        jump();
                      }}
                      className={cn(
                        "w-full rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-muted/60",
                        violation === v.label && "bg-brand-soft/60",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{v.label}</span>
                        <span className="font-medium tabular-nums">{fmt.format(v.count)}</span>
                      </div>
                      <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                        <div
                          className="bg-warning h-full rounded-full"
                          style={{ width: `${(v.count / Math.max(1, maxViolation)) * 100}%` }}
                        />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Per PT">
            <DataTable
              label="SP berlaku per PT"
              rows={r.byCompany}
              rowKey={(c) => c.label}
              limit={8}
              columns={[
                {
                  key: "pt",
                  header: "PT",
                  cell: (c) => <span className="font-medium">{c.label}</span>,
                },
                ...WARNING_LEVELS.map((lv) => ({
                  key: lv,
                  header: lv,
                  align: "right" as const,
                  cell: (c: WarningLettersReport["byCompany"][number]) => <Num value={c[lv]} />,
                })),
                {
                  key: "total",
                  header: "Total",
                  align: "right",
                  cell: (c) => (
                    <span className="font-semibold">
                      <Num value={c.total} />
                    </span>
                  ),
                },
              ]}
              empty="Tidak ada SP yang berlaku."
            />
          </Panel>
        </div>
      </div>

      <div id="daftar-sp" className="scroll-mt-32">
        <ListSection
          title="Daftar SP berlaku"
          description={
            r.canList ? "Klik baris untuk membuka tab SP di profil karyawan." : undefined
          }
        >
          {r.canList ? (
            <PeopleList
              key={`${level}-${violation}-${unconfirmedOnly}`}
              label="Daftar SP berlaku"
              rows={rows}
              rowKey={(x) => x.letterId}
              onRowClick={(x) => openProfile(x.employeeId, "warnings")}
              search={(x) => `${personSearch(x)} ${x.number ?? ""}`}
              searchPlaceholder="Cari nama, NIP, atau nomor SP…"
              initialSort={{ field: "until", direction: "asc" }}
              toolbar={
                <>
                  {level ? (
                    <FilterChip
                      label={WARNING_LEVEL_LABELS[level]}
                      onClear={() => setLevel(undefined)}
                    />
                  ) : null}
                  {violation ? (
                    <FilterChip label={violation} onClear={() => setViolation(undefined)} />
                  ) : null}
                  {unconfirmedOnly ? (
                    <FilterChip
                      label="Belum dikonfirmasi"
                      onClear={() => setUnconfirmedOnly(false)}
                    />
                  ) : null}
                </>
              }
              columns={[
                personColumn<LetterRow>(),
                unitColumn<LetterRow>(),
                {
                  key: "level",
                  header: "Tingkat",
                  sortValue: (x) => x.level,
                  cell: (x) => (
                    <Badge variant={LEVEL_TONE[x.level]}>{WARNING_LEVEL_LABELS[x.level]}</Badge>
                  ),
                },
                {
                  key: "number",
                  header: "Nomor & pelanggaran",
                  cell: (x) => (
                    <div className="min-w-48">
                      <p className="font-mono text-xs">{x.number ?? "—"}</p>
                      <p className="text-muted-foreground text-xs">{x.violation}</p>
                    </div>
                  ),
                },
                {
                  key: "until",
                  header: "Berlaku s/d",
                  sortValue: (x) => x.effectiveUntil,
                  cell: (x) => (
                    <div className="whitespace-nowrap">
                      <p className="tabular-nums">{formatDate(x.effectiveUntil)}</p>
                      <p className="text-muted-foreground text-xs">
                        {relativeDays(daysUntil(x.effectiveUntil, r.asOf))}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "confirmed",
                  header: "Konfirmasi",
                  sortValue: (x) => (x.confirmed ? 1 : 0),
                  cell: (x) =>
                    x.confirmed ? (
                      <Badge variant="success">Lengkap</Badge>
                    ) : (
                      <Badge variant="warning">Belum</Badge>
                    ),
                },
                {
                  key: "open",
                  header: "",
                  className: "text-right",
                  cell: (x) => (
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                      <Link
                        to={`/personal/arsip/peringatan?sp=${x.letterId}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Buka SP ${x.number ?? ""} ${x.fullName}`}
                      >
                        Buka SP <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>
                  ),
                },
              ]}
              empty={{ title: "Tidak ada SP", description: "Tidak ada SP untuk saringan ini." }}
            />
          ) : (
            <p className="bg-card text-muted-foreground rounded-2xl border px-4 py-6 text-center text-sm">
              Daftar per orang hanya untuk HR dengan izin surat peringatan.
            </p>
          )}
        </ListSection>
      </div>
    </div>
  );
}
