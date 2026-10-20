import { MOVEMENT_KIND_LABELS, MOVEMENT_KINDS, type MovementKind } from "@hris/shared";
import { ArrowLeftRight, CircleHelp, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { type ReportParams, useReport } from "../../api";
import { fmt } from "../../format";
import {
  MONTH_NAMES,
  MONTHS,
  personSearch,
  scrollToId,
  useOpenProfile,
} from "../../report-helpers";
import type { MovementsReport } from "../../schemas";
import { PeopleList, personColumn } from "../people-list";
import { ReportChart } from "../report-chart";
import { AsOf, State } from "../report-state";
import { FilterChip, Kpi, KpiGrid, ListSection, Notes, Panel } from "../report-ui";

// ARS-D21 (Laporan batch 2): mutasi & promosi per tahun dari riwayat jabatan — jenis menurut level
// jabatan (D-050): naik = promosi, turun = demosi, sama = mutasi, kosong = belum bisa dibedakan.

type Move = MovementsReport["rows"][number];
const KIND_ICON = {
  PROMOTION: TrendingUp,
  DEMOTION: TrendingDown,
  TRANSFER: ArrowLeftRight,
  UNRANKED: CircleHelp,
};
const KIND_TONE = {
  PROMOTION: "success",
  DEMOTION: "warning",
  TRANSFER: "brand",
  UNRANKED: "default",
} as const;
const KIND_BADGE = {
  PROMOTION: "success",
  DEMOTION: "warning",
  TRANSFER: "brand",
  UNRANKED: "muted",
} as const;

function Side({
  position,
  level,
  unit,
  company,
}: {
  position: string | null;
  level: string | null;
  unit: string | null;
  company: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate">{position ?? "—"}</p>
      <p className="text-muted-foreground truncate text-xs">
        {[level ?? "level kosong", unit, company].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

export function MovementsTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("movements", params, enabled);
  const openProfile = useOpenProfile();
  const [kind, setKind] = useState<MovementKind | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const r = query.data;
  if (!r) return <State query={query} />;
  const rows = r.rows.filter(
    (x) => (!kind || x.kind === kind) && (!month || Number(x.effectiveDate.slice(5, 7)) === month),
  );
  const pickKind = (k: MovementKind) => {
    setKind(kind === k ? undefined : k);
    scrollToId("daftar-perpindahan");
  };

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}> · tahun {r.year}</AsOf>
      <KpiGrid>
        <Kpi
          icon={Users}
          label="Perpindahan"
          value={fmt.format(r.total)}
          hint={`sepanjang ${r.year}`}
        />
        {MOVEMENT_KINDS.map((k) => (
          <Kpi
            key={k}
            icon={KIND_ICON[k]}
            tone={r.counts[k] > 0 ? KIND_TONE[k] : "default"}
            label={MOVEMENT_KIND_LABELS[k]}
            value={fmt.format(r.counts[k])}
            hint={kind === k ? "disaring — klik lagi untuk batal" : "klik untuk menyaring"}
            pressed={kind === k}
            onClick={() => pickKind(k)}
          />
        ))}
      </KpiGrid>

      <Panel
        title="Perpindahan per bulan"
        description="Klik kolom bulan untuk menyaring daftar."
        info="Promosi = level jabatan naik, Demosi = turun, Mutasi = level sama (termasuk pindah PT tanpa ganti jabatan). Jabatan tanpa level belum bisa dibedakan."
      >
        <ReportChart
          label={`Grafik mutasi dan promosi ${r.year}`}
          stacked
          categories={r.byMonth.map((m) => MONTHS[m.month - 1] as string)}
          series={MOVEMENT_KINDS.map((k) => ({
            name: MOVEMENT_KIND_LABELS[k],
            data: r.byMonth.map((m) => m[k]),
          }))}
          selectedIndex={month ? month - 1 : undefined}
          onSelect={(i) => {
            setMonth(month === i + 1 ? undefined : i + 1);
            scrollToId("daftar-perpindahan");
          }}
        />
      </Panel>

      <div id="daftar-perpindahan" className="scroll-mt-32">
        <ListSection
          title="Daftar perpindahan"
          description="Jabatan lama → baru. Klik baris untuk membuka riwayat karyawan."
        >
          <PeopleList
            key={`${kind}-${month}`}
            label="Daftar perpindahan"
            rows={rows}
            rowKey={(x) => x.historyId}
            onRowClick={(x) => openProfile(x.employeeId, "history")}
            search={personSearch}
            initialSort={{ field: "date", direction: "desc" }}
            toolbar={
              <>
                {kind ? (
                  <FilterChip
                    label={`Jenis: ${MOVEMENT_KIND_LABELS[kind]}`}
                    onClear={() => setKind(undefined)}
                  />
                ) : null}
                {month ? (
                  <FilterChip
                    label={`Bulan: ${MONTH_NAMES[month - 1]}`}
                    onClear={() => setMonth(undefined)}
                  />
                ) : null}
              </>
            }
            columns={[
              personColumn<Move>({ showCompany: true }),
              {
                key: "date",
                header: "Tanggal",
                sortValue: (x) => x.effectiveDate,
                cell: (x) => (
                  <span className="whitespace-nowrap tabular-nums">
                    {formatDate(x.effectiveDate)}
                  </span>
                ),
              },
              {
                key: "kind",
                header: "Jenis",
                sortValue: (x) => x.kind,
                cell: (x) => (
                  <Badge variant={KIND_BADGE[x.kind]}>{MOVEMENT_KIND_LABELS[x.kind]}</Badge>
                ),
              },
              {
                key: "from",
                header: "Dari",
                className: "min-w-[180px]",
                cell: (x) => (
                  <Side
                    position={x.fromPosition}
                    level={x.fromPosition ? x.fromLevel : null}
                    unit={x.fromUnit}
                    company={x.fromCompany}
                  />
                ),
              },
              {
                key: "to",
                header: "Ke",
                className: "min-w-[180px]",
                cell: (x) => (
                  <Side
                    position={x.toPosition}
                    level={x.toPosition ? x.toLevel : null}
                    unit={x.toUnit}
                    company={x.toCompany}
                  />
                ),
              },
            ]}
            empty={{
              title: `Tidak ada perpindahan${month ? ` pada ${MONTH_NAMES[month - 1]}` : ""}`,
            }}
          />
        </ListSection>
      </div>

      <Notes>
        <p>
          Sumber: riwayat kepegawaian (perubahan jabatan & pindah PT). Pindah PT dan ganti jabatan
          pada hari yang sama dihitung satu perpindahan.
        </p>
        <p>
          Laporan memuat karyawan yang <strong>saat ini</strong> ada di PT/unit terpilih; karyawan
          yang sudah pindah ke PT lain tidak tampil di laporan PT asalnya.
        </p>
        <p>
          "Perpindahan (level belum diisi)" muncul bila jabatan lama atau baru belum diberi level di
          Master Data › Jabatan.
        </p>
      </Notes>
    </div>
  );
}
