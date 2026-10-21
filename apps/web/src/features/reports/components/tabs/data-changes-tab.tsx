import {
  DATA_CHANGE_STATUS_LABELS,
  DATA_CHANGE_STATUSES,
  type DataChangeStatus,
} from "@hris/shared";
import { CheckCircle2, ExternalLink, FilePen, Hourglass, Lock, Timer, XCircle } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { type ReportParams, useReport } from "../../api";
import { fmt } from "../../format";
import { MONTHS, personSearch, useOpenProfile } from "../../report-helpers";
import type { DataChangesReport } from "../../schemas";
import { PeopleList, personColumn } from "../people-list";
import { ReportChart } from "../report-chart";
import { AsOf, State } from "../report-state";
import { DataTable, Kpi, KpiGrid, ListSection, Notes, Num, Panel } from "../report-ui";

// ARS-D21 (Laporan batch 2): pengajuan perubahan data diri (D-054) — jumlah & waktu proses untuk
// semua HR; daftar per pengajuan (tanpa isi perubahan) hanya SA / grant `employee.changes.review`.

type Request = DataChangesReport["rows"][number];
const STATUS_BADGE: Record<DataChangeStatus, "warning" | "success" | "destructive" | "muted"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "muted",
};
const days = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("id-ID")} hari`);

export function DataChangesTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("data-changes", params, enabled);
  const openProfile = useOpenProfile();
  const r = query.data;
  if (!r) return <State query={query} />;

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}> · tahun {r.year}</AsOf>
      <KpiGrid>
        <Kpi
          icon={FilePen}
          label="Pengajuan"
          value={fmt.format(r.total)}
          hint={`diajukan ${r.year}`}
        />
        <Kpi
          icon={Hourglass}
          tone={r.pendingNow > 0 ? "warning" : "default"}
          label="Menunggu saat ini"
          value={fmt.format(r.pendingNow)}
          hint={
            r.oldestPendingDays !== null
              ? `terlama ${fmt.format(r.oldestPendingDays)} hari`
              : "antrean kosong"
          }
        />
        <Kpi
          icon={CheckCircle2}
          tone="success"
          label="Disetujui"
          value={fmt.format(r.counts.APPROVED)}
        />
        <Kpi icon={XCircle} label="Ditolak" value={fmt.format(r.counts.REJECTED)} />
        <Kpi
          icon={Timer}
          tone="brand"
          label="Rata-rata proses"
          value={days(r.averageDays)}
          hint="diajukan → diputuskan"
          info="Rata-rata waktu dari pengajuan dikirim sampai disetujui atau ditolak, untuk pengajuan tahun terpilih. Pengajuan dibatalkan tidak dihitung."
        />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Diajukan & diputuskan per bulan">
          <ReportChart
            label={`Grafik pengajuan perubahan data ${r.year}`}
            categories={r.byMonth.map((m) => MONTHS[m.month - 1] as string)}
            series={[
              { name: "Diajukan", data: r.byMonth.map((m) => m.submitted) },
              { name: "Diputuskan", data: r.byMonth.map((m) => m.decided) },
            ]}
          />
        </Panel>
        <Panel className="xl:col-span-5" title="Per bagian data">
          <DataTable
            label="Pengajuan per bagian"
            rows={r.bySection}
            rowKey={(s) => s.key}
            columns={[
              { key: "label", header: "Bagian", sortValue: (s) => s.label, cell: (s) => s.label },
              {
                key: "total",
                header: "Total",
                align: "right",
                sortValue: (s) => s.total,
                cell: (s) => <Num value={s.total} />,
              },
              {
                key: "pending",
                header: "Menunggu",
                align: "right",
                sortValue: (s) => s.PENDING,
                cell: (s) => <Num value={s.PENDING} />,
              },
              {
                key: "avg",
                header: "Rata-rata",
                align: "right",
                sortValue: (s) => s.averageDays ?? -1,
                cell: (s) => <span className="tabular-nums">{days(s.averageDays)}</span>,
              },
            ]}
            empty="Belum ada pengajuan pada tahun ini."
          />
        </Panel>
      </div>

      <ListSection
        title="Daftar pengajuan"
        description="Pengajuan tahun terpilih + yang masih menunggu dari tahun sebelumnya. Isi perubahan tidak ditampilkan."
        aside={
          <Button variant="outline" size="sm" asChild>
            <Link to="/pengajuan-data">
              <ExternalLink /> Buka antrean
            </Link>
          </Button>
        }
      >
        {r.canList ? (
          <PeopleList
            label="Daftar pengajuan perubahan data"
            rows={r.rows}
            rowKey={(x) => x.requestId}
            onRowClick={(x) => openProfile(x.employeeId, "personal")}
            search={(x) => `${personSearch(x)} ${x.section}`}
            initialSort={{ field: "submittedAt", direction: "desc" }}
            columns={[
              personColumn<Request>({ showCompany: true }),
              {
                key: "section",
                header: "Bagian",
                sortValue: (x) => x.section,
                cell: (x) => x.section,
              },
              {
                key: "status",
                header: "Status",
                sortValue: (x) => DATA_CHANGE_STATUSES.indexOf(x.status),
                cell: (x) => (
                  <Badge variant={STATUS_BADGE[x.status]}>
                    {DATA_CHANGE_STATUS_LABELS[x.status]}
                  </Badge>
                ),
              },
              {
                key: "submittedAt",
                header: "Diajukan",
                sortValue: (x) => x.submittedAt,
                cell: (x) => (
                  <span className="whitespace-nowrap tabular-nums">
                    {formatDate(x.submittedAt)}
                  </span>
                ),
              },
              {
                key: "days",
                header: "Lama proses",
                sortValue: (x) => x.days ?? -1,
                cell: (x) => <span className="tabular-nums">{days(x.days)}</span>,
              },
            ]}
            empty={{ title: "Belum ada pengajuan" }}
          />
        ) : (
          <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <Lock className="size-4 shrink-0" aria-hidden />
            Daftar per pengajuan hanya untuk pemeriksa pengajuan data (izin "Periksa pengajuan
            perubahan data"). Angka di atas tetap dihitung dari semua pengajuan.
          </p>
        )}
      </ListSection>

      <Notes>
        <p>Tanggal & waktu proses dihitung dari jam pengajuan dikirim sampai diputuskan.</p>
      </Notes>
    </div>
  );
}
