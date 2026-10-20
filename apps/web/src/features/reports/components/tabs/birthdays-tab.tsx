import { Cake, PartyPopper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type ReportParams, useReport } from "../../api";
import { fmt } from "../../format";
import { MONTH_NAMES, personSearch, thisMonth, useOpenProfile } from "../../report-helpers";
import type { BirthdaysReport } from "../../schemas";
import { PeopleList, personColumn, unitColumn } from "../people-list";
import { AsOf, State } from "../report-state";
import { Kpi, KpiGrid, ListSection, Notes } from "../report-ui";

// ARS-D21 (Laporan batch 2): ulang tahun karyawan aktif per bulan — nama + tanggal-bulan saja
// (tanpa tahun lahir/usia), terlihat semua SA/HR di PT-nya.

type Birthday = BirthdaysReport["rows"][number];

export function BirthdaysTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("birthdays", params, enabled);
  const openProfile = useOpenProfile();
  const r = query.data;
  if (!r) return <State query={query} />;
  const monthName = MONTH_NAMES[r.month - 1] as string;
  const today = r.month === thisMonth ? Number(r.asOf.slice(8, 10)) : null;
  const todayCount = today ? r.rows.filter((x) => x.day === today).length : 0;
  const upcoming = today ? r.rows.filter((x) => x.day > today).length : r.rows.length;

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}> · {monthName}</AsOf>
      <KpiGrid>
        <Kpi
          icon={Cake}
          tone="brand"
          label={`Ulang tahun ${monthName}`}
          value={fmt.format(r.total)}
          hint="karyawan aktif"
        />
        {today ? (
          <Kpi
            icon={PartyPopper}
            tone={todayCount > 0 ? "success" : "default"}
            label="Hari ini"
            value={fmt.format(todayCount)}
          />
        ) : null}
        <Kpi
          icon={Cake}
          label={today ? "Sisa bulan ini" : "Sepanjang bulan"}
          value={fmt.format(upcoming)}
        />
      </KpiGrid>

      <ListSection
        title={`Ulang tahun ${monthName}`}
        description="Urut tanggal. Klik baris untuk membuka profil karyawan."
      >
        <PeopleList
          label="Daftar ulang tahun"
          rows={r.rows}
          rowKey={(x) => x.employeeId}
          onRowClick={(x) => openProfile(x.employeeId, "work")}
          search={personSearch}
          initialSort={{ field: "day", direction: "asc" }}
          columns={[
            personColumn<Birthday>(),
            unitColumn<Birthday>(),
            {
              key: "day",
              header: "Tanggal",
              sortValue: (x) => x.day,
              cell: (x) => (
                <span className="inline-flex items-center gap-2 whitespace-nowrap tabular-nums">
                  {x.day} {monthName}
                  {x.day === today ? <Badge variant="success">Hari ini</Badge> : null}
                </span>
              ),
            },
          ]}
          empty={{ title: `Tidak ada ulang tahun pada ${monthName}` }}
        />
      </ListSection>

      <Notes>
        <p>
          Hanya tanggal & bulan yang ditampilkan; tahun lahir dan usia tidak ditampilkan (ARS-D21).
        </p>
        <p>Karyawan tanpa tanggal lahir di data pribadi tidak masuk daftar.</p>
      </Notes>
    </div>
  );
}
