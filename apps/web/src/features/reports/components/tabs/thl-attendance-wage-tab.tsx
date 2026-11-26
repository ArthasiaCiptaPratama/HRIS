import { formatThlMonth, formatThlWage } from "@/features/employee/components/thl-section";
import { type ReportParams, useReport } from "../../api";
import { State } from "../report-state";
import { DataTable } from "../report-ui";

export function ThlAttendanceWageTab({
  params,
  enabled,
}: {
  params: ReportParams;
  enabled: boolean;
}) {
  const query = useReport("thl-attendance-wage", params, enabled);
  if (query.isError || !query.data) return <State query={query} />;
  const report = query.data;
  return (
    <section aria-label="Rekap Kehadiran & Upah THL" className="space-y-4">
      <h2 className="font-semibold">Rekap Kehadiran & Upah THL · {formatThlMonth(report.month)}</h2>
      <p className="text-muted-foreground text-sm">{report.note}</p>
      <DataTable
        label="Rekap Kehadiran & Upah THL"
        rows={report.rows}
        rowKey={(row) => row.employeeId}
        columns={[
          { key: "employeeNumber", header: "NIP", cell: (row) => row.employeeNumber ?? "—" },
          { key: "fullName", header: "Nama", cell: (row) => row.fullName },
          { key: "company", header: "PT", cell: (row) => row.company },
          { key: "position", header: "Jabatan", cell: (row) => row.position ?? "—" },
          { key: "presentDays", header: "Hari hadir", cell: (row) => row.presentDays },
          { key: "pendingDays", header: "Menunggu persetujuan", cell: (row) => row.pendingDays },
          ...(report.access.wage
            ? [
                {
                  key: "dailyWage",
                  header: "Upah harian",
                  cell: (row: (typeof report.rows)[number]) => formatThlWage(row.dailyWage),
                },
                {
                  key: "estimatedWage",
                  header: "Perkiraan upah (bukan payroll)",
                  cell: (row: (typeof report.rows)[number]) => formatThlWage(row.estimatedWage),
                },
              ]
            : []),
        ]}
        empty="Tidak ada Harian Lepas (THL) dalam cakupan ini."
      />
    </section>
  );
}
