import { TENURE_BUCKETS } from "@hris/shared";
import { Award, Hourglass, Sparkles, Timer, Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { type ReportParams, useReport } from "../../api";
import { fmt } from "../../format";
import { MONTH_NAMES, maxOf, personSearch, scrollToId, useOpenProfile } from "../../report-helpers";
import type { TenureReport } from "../../schemas";
import { PeopleList, personColumn, unitColumn } from "../people-list";
import { ReportChart } from "../report-chart";
import { AsOf, State } from "../report-state";
import {
  BarCell,
  DataTable,
  Kpi,
  KpiGrid,
  ListSection,
  Notes,
  Num,
  Panel,
  Segmented,
} from "../report-ui";

// ARS-D21 (Laporan batch 2): masa kerja karyawan aktif per hari ini + jubilee bulan terpilih.

type Jubilee = TenureReport["jubilees"][number];

export function TenureTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("tenure", params, enabled);
  const openProfile = useOpenProfile();
  const [group, setGroup] = useState<"unit" | "company">("unit");
  const r = query.data;
  if (!r) return <State query={query} />;
  const rows = group === "unit" ? r.byUnit : r.byCompany;
  const count = (key: string) => r.buckets.find((b) => b.key === key)?.count ?? 0;
  const maxTotal = maxOf(rows, (x) => x.total);
  const period = `${MONTH_NAMES[r.month - 1]} ${r.year}`;

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}> · karyawan aktif · jubilee {period}</AsOf>
      <KpiGrid>
        <Kpi icon={Users} label="Karyawan aktif" value={fmt.format(r.total)} />
        <Kpi
          icon={Timer}
          tone="brand"
          label="Rata-rata masa kerja"
          value={`${r.averageYears.toLocaleString("id-ID")} th`}
          hint="tahun penuh sejak tanggal masuk"
        />
        <Kpi
          icon={Hourglass}
          label="< 1 tahun"
          value={fmt.format(count("<1"))}
          hint="karyawan baru"
        />
        <Kpi
          icon={Award}
          label="≥ 10 tahun"
          value={fmt.format(count("10+"))}
          hint="karyawan senior"
        />
        <Kpi
          icon={Sparkles}
          tone={r.jubilees.length > 0 ? "success" : "default"}
          label={`Jubilee ${MONTH_NAMES[r.month - 1]}`}
          value={fmt.format(r.jubilees.length)}
          hint="genap 5/10/15/20/25 tahun"
          onClick={() => scrollToId("daftar-jubilee")}
        />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-4"
          title="Sebaran masa kerja"
          description="Jumlah karyawan aktif per kelompok masa kerja."
        >
          <ReportChart
            label="Grafik sebaran masa kerja"
            categories={r.buckets.map((b) => b.label)}
            series={[{ name: "Karyawan", data: r.buckets.map((b) => b.count) }]}
          />
        </Panel>
        <Panel
          className="xl:col-span-8"
          title="Rincian"
          description="Jumlah karyawan per kelompok masa kerja."
          aside={
            <Segmented
              label="Kelompokkan"
              value={group}
              onChange={setGroup}
              options={[
                { value: "unit", label: "Unit" },
                { value: "company", label: "PT" },
              ]}
            />
          }
        >
          <DataTable
            key={group}
            label={group === "unit" ? "Masa kerja per unit" : "Masa kerja per PT"}
            rows={rows}
            rowKey={(x) => x.label}
            limit={8}
            columns={[
              { key: "label", header: "Nama", sortValue: (x) => x.label, cell: (x) => x.label },
              ...TENURE_BUCKETS.map((b) => ({
                key: b,
                header: r.buckets.find((x) => x.key === b)?.label ?? b,
                align: "right" as const,
                sortValue: (x: (typeof rows)[number]) => x[b],
                cell: (x: (typeof rows)[number]) => <Num value={x[b]} />,
              })),
              {
                key: "total",
                header: "Total",
                align: "right",
                sortValue: (x) => x.total,
                cell: (x) => <BarCell value={x.total} max={maxTotal} />,
              },
            ]}
            footer={["Total", ...r.buckets.map((b) => fmt.format(b.count)), fmt.format(r.total)]}
          />
        </Panel>
      </div>

      <div id="daftar-jubilee" className="scroll-mt-32">
        <ListSection
          title={`Jubilee ${period}`}
          description="Karyawan yang genap 5, 10, 15, 20, atau 25 tahun bekerja pada bulan ini. Klik baris untuk membuka profil."
        >
          <PeopleList
            label="Daftar jubilee"
            rows={r.jubilees}
            rowKey={(x) => x.employeeId}
            onRowClick={(x) => openProfile(x.employeeId, "work")}
            search={personSearch}
            initialSort={{ field: "years", direction: "desc" }}
            columns={[
              personColumn<Jubilee>(),
              unitColumn<Jubilee>(),
              {
                key: "joinDate",
                header: "Tanggal masuk",
                sortValue: (x) => x.joinDate.slice(5),
                cell: (x) => (
                  <span className="whitespace-nowrap tabular-nums">{formatDate(x.joinDate)}</span>
                ),
              },
              {
                key: "years",
                header: "Genap",
                sortValue: (x) => x.years,
                cell: (x) => <Badge variant="success">{x.years} tahun</Badge>,
              },
            ]}
            empty={{ title: `Tidak ada jubilee pada ${period}` }}
          />
        </ListSection>
      </div>

      <Notes>
        <p>Masa kerja dihitung dalam tahun penuh dari tanggal masuk sampai tanggal data.</p>
        <p>
          Rincian per unit memakai unit karyawan <strong>saat ini</strong>. Kelompok masa kerja sama
          dengan Dashboard.
        </p>
      </Notes>
    </div>
  );
}
