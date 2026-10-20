import { GraduationCap, MapPin, UserRound, Users } from "lucide-react";
import { type ReportParams, useReport } from "../../api";
import { fmt, pct } from "../../format";
import { maxOf } from "../../report-helpers";
import { ReportChart } from "../report-chart";
import { AsOf, State } from "../report-state";
import { Kpi, KpiGrid, Notes, Panel } from "../report-ui";

// ARS-D21 (Laporan batch 2): demografi karyawan aktif — angka agregat saja (tanpa daftar orang);
// tanggal lahir & kota asal diolah server menjadi hitungan.

type Slice = { label: string; count: number };

function SliceList({ label, rows, total }: { label: string; rows: Slice[]; total: number }) {
  const max = maxOf(rows, (x) => x.count);
  return (
    <ul className="space-y-1" aria-label={label}>
      {rows.map((x) => (
        <li key={x.label} className="px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{x.label}</span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              <span className="text-foreground font-medium">{fmt.format(x.count)}</span> ·{" "}
              {pct(total > 0 ? Math.round((x.count / total) * 1000) / 10 : 0)}
            </span>
          </div>
          <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-brand h-full rounded-full"
              style={{ width: `${(x.count / Math.max(1, max)) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DemographicsTab({ params, enabled }: { params: ReportParams; enabled: boolean }) {
  const query = useReport("demographics", params, enabled);
  const r = query.data;
  if (!r) return <State query={query} />;
  const of = (rows: Slice[], label: string) => rows.find((x) => x.label === label)?.count ?? 0;
  const topEducation = [...r.education]
    .filter((x) => x.key !== "-")
    .sort((a, b) => b.count - a.count)[0];
  const topCity = r.originCity[0];

  return (
    <div className="space-y-4">
      <AsOf date={r.asOf}> · karyawan aktif · angka agregat</AsOf>
      <KpiGrid>
        <Kpi icon={Users} label="Karyawan aktif" value={fmt.format(r.total)} />
        <Kpi icon={UserRound} label="Laki-laki" value={fmt.format(of(r.gender, "Laki-laki"))} />
        <Kpi icon={UserRound} label="Perempuan" value={fmt.format(of(r.gender, "Perempuan"))} />
        <Kpi
          icon={GraduationCap}
          tone="brand"
          label="Pendidikan terbanyak"
          value={topEducation && topEducation.count > 0 ? topEducation.label : "—"}
          hint={topEducation ? `${fmt.format(topEducation.count)} karyawan` : undefined}
        />
        <Kpi
          icon={MapPin}
          label="Kota asal berbeda"
          value={fmt.format(r.cityCount)}
          hint={topCity && r.cityCount > 0 ? `terbanyak: ${topCity.label}` : undefined}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel className="lg:col-span-8" title="Kelompok usia" description="Usia per tanggal data.">
          <ReportChart
            label="Grafik kelompok usia"
            categories={r.age.map((x) => x.label)}
            series={[{ name: "Karyawan", data: r.age.map((x) => x.count) }]}
          />
        </Panel>
        <Panel className="lg:col-span-4" title="Jenis kelamin">
          <SliceList label="Jenis kelamin" rows={r.gender} total={r.total} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pendidikan tertinggi" description="Jenjang tertinggi yang tercatat.">
          <ReportChart
            label="Grafik pendidikan tertinggi"
            horizontal
            categories={r.education.map((x) => x.label)}
            series={[{ name: "Karyawan", data: r.education.map((x) => x.count) }]}
          />
        </Panel>
        <Panel
          title="Kota asal"
          description="15 kota terbanyak; penulisan huruf besar/kecil disatukan."
        >
          <SliceList label="Kota asal" rows={r.originCity} total={r.total} />
        </Panel>
      </div>

      <Notes>
        <p>
          Laporan ini hanya berisi angka gabungan. Nama, tanggal lahir, dan kota asal per orang
          tidak ditampilkan (ARS-D21).
        </p>
        <p>"Belum diisi" = data pribadi atau pendidikan karyawan belum lengkap.</p>
      </Notes>
    </div>
  );
}
