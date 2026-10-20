import { ASSET_STATUS_LABELS, ASSET_STATUSES } from "@hris/shared";
import { AlarmClock, ExternalLink, Package, PackageX, UserRound, Wrench } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { type ReportParams, useReport } from "../../api";
import { fmt } from "../../format";
import { maxOf, personSearch, scrollToId, useOpenProfile } from "../../report-helpers";
import type { AssetsReport } from "../../schemas";
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

// ARS-D21 (Laporan batch 2): aset per status/kategori/lokasi/PT + aset & APD wajib kembali yang masih
// dipegang karyawan keluar. Harga beli tidak pernah tampil (ARS-D3).

type Unreturned = AssetsReport["unreturned"][number];
type Group = "category" | "location" | "company";

export function AssetsTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("assets", params, enabled);
  const openProfile = useOpenProfile();
  const [group, setGroup] = useState<Group>("category");
  const r = query.data;
  if (!r) return <State query={query} />;
  const rows =
    group === "category" ? r.byCategory : group === "location" ? r.byLocation : r.byCompany;
  const maxTotal = maxOf(rows, (x) => x.total);
  const top = r.byCategory.slice(0, 10);

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}> · semua aset dalam cakupan PT</AsOf>
      <KpiGrid>
        <Kpi
          icon={Package}
          label="Total aset"
          value={fmt.format(r.total)}
          hint={`${fmt.format(r.counts.AVAILABLE)} ${ASSET_STATUS_LABELS.AVAILABLE.toLowerCase()}`}
        />
        <Kpi
          icon={UserRound}
          tone="brand"
          label={ASSET_STATUS_LABELS.ASSIGNED}
          value={fmt.format(r.counts.ASSIGNED)}
        />
        <Kpi
          icon={Wrench}
          tone={r.counts.MAINTENANCE > 0 ? "warning" : "default"}
          label={ASSET_STATUS_LABELS.MAINTENANCE}
          value={fmt.format(r.counts.MAINTENANCE)}
          hint={`${fmt.format(r.counts.LOST)} hilang`}
        />
        <Kpi
          icon={AlarmClock}
          tone={r.overdueLoans > 0 ? "danger" : "default"}
          label="Pinjaman terlambat"
          value={fmt.format(r.overdueLoans)}
          hint="lewat tanggal kembali"
        />
        <Kpi
          icon={PackageX}
          tone={r.unreturned.length > 0 ? "danger" : "default"}
          label="Belum kembali"
          value={fmt.format(r.unreturned.length)}
          hint="dari karyawan keluar"
          onClick={() => scrollToId("daftar-belum-kembali")}
        />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-4"
          title="Status per kategori"
          description="10 kategori dengan aset terbanyak."
        >
          <ReportChart
            label="Grafik status aset per kategori"
            stacked
            horizontal
            categories={top.map((x) => x.label)}
            series={ASSET_STATUSES.map((s) => ({
              name: ASSET_STATUS_LABELS[s],
              data: top.map((x) => x[s]),
            }))}
          />
        </Panel>
        <Panel
          className="xl:col-span-8"
          title="Rincian"
          description="Jumlah aset per status."
          aside={
            <Segmented
              label="Kelompokkan"
              value={group}
              onChange={setGroup}
              options={[
                { value: "category", label: "Kategori" },
                { value: "location", label: "Lokasi" },
                { value: "company", label: "PT" },
              ]}
            />
          }
        >
          <DataTable
            key={group}
            label={
              group === "category"
                ? "Aset per kategori"
                : group === "location"
                  ? "Aset per lokasi"
                  : "Aset per PT"
            }
            rows={rows}
            rowKey={(x) => x.label}
            limit={8}
            columns={[
              { key: "label", header: "Nama", sortValue: (x) => x.label, cell: (x) => x.label },
              ...ASSET_STATUSES.map((s) => ({
                key: s,
                header: ASSET_STATUS_LABELS[s],
                align: "right" as const,
                sortValue: (x: (typeof rows)[number]) => x[s],
                cell: (x: (typeof rows)[number]) => <Num value={x[s]} />,
              })),
              {
                key: "total",
                header: "Total",
                align: "right",
                sortValue: (x) => x.total,
                cell: (x) => <BarCell value={x.total} max={maxTotal} />,
              },
            ]}
            footer={[
              "Total",
              ...ASSET_STATUSES.map((s) => fmt.format(r.counts[s])),
              fmt.format(r.total),
            ]}
          />
        </Panel>
      </div>

      <div id="daftar-belum-kembali" className="scroll-mt-32">
        <ListSection
          title="Belum kembali dari karyawan keluar"
          description="Aset & APD wajib kembali yang masih tercatat dipegang karyawan nonaktif. Klik baris untuk membuka tab Aset karyawan."
          aside={
            <Button variant="outline" size="sm" asChild>
              <Link to="/personal/arsip/aset?tab=belum-kembali">
                <ExternalLink /> Buka Data Assets
              </Link>
            </Button>
          }
        >
          <PeopleList
            label="Aset belum kembali"
            rows={r.unreturned}
            rowKey={(x) => `${x.employeeId}-${x.kind}-${x.item}-${x.since}`}
            onRowClick={(x) => openProfile(x.employeeId, "assets")}
            search={(x) => `${personSearch(x)} ${x.item}`}
            initialSort={{ field: "endDate", direction: "asc" }}
            columns={[
              personColumn<Unreturned>(),
              unitColumn<Unreturned>(),
              {
                key: "endDate",
                header: "Tanggal keluar",
                sortValue: (x) => x.endDate ?? "",
                cell: (x) => (
                  <span className="whitespace-nowrap tabular-nums">
                    {x.endDate ? formatDate(x.endDate) : "—"}
                  </span>
                ),
              },
              {
                key: "item",
                header: "Barang",
                className: "min-w-[180px]",
                sortValue: (x) => x.item,
                cell: (x) => (
                  <span className="inline-flex items-center gap-2">
                    <Badge variant={x.kind === "Aset" ? "brand" : "muted"}>{x.kind}</Badge>
                    {x.item}
                    {x.quantity > 1 ? ` × ${fmt.format(x.quantity)}` : ""}
                  </span>
                ),
              },
              {
                key: "since",
                header: "Diterima sejak",
                sortValue: (x) => x.since,
                cell: (x) => (
                  <span className="whitespace-nowrap tabular-nums">{formatDate(x.since)}</span>
                ),
              },
            ]}
            empty={{ title: "Semua aset & APD wajib kembali sudah dikembalikan" }}
          />
        </ListSection>
      </div>

      <Notes>
        <p>Harga beli aset tidak ditampilkan di laporan (ARS-D3).</p>
        <p>
          Filter unit hanya berlaku untuk daftar belum kembali — aset terikat PT & lokasi, bukan
          unit.
        </p>
      </Notes>
    </div>
  );
}
