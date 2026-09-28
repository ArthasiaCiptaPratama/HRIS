import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useEmployeeSummary } from "../api";
import { EmployeeDetailSheet, useEmployeeSheet } from "../components/employee-detail-sheet";
import { EmployeeListView, employeeColumns } from "../components/employee-list-view";

export function InactiveEmployeesPage() {
  const sheet = useEmployeeSheet();
  const summary = useEmployeeSummary();
  const columns = useMemo(() => employeeColumns("inactive"), []);

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-baseline gap-3">
            Data Pegawai Tidak Aktif
            {summary.data ? (
              <span className="text-muted-foreground font-mono text-base font-normal tabular-nums">
                {summary.data.inactive}
              </span>
            ) : null}
          </span>
        }
        description="Arsip pegawai yang sudah keluar: resign, PHK, kontrak berakhir, pensiun, dan lainnya. Data hanya bisa dibaca."
      />
      <EmployeeListView
        variant="inactive"
        columns={columns}
        onRowClick={(row) => sheet.open(row.id)}
        emptyTitle="Belum ada pegawai nonaktif"
        emptyDescription="Pegawai yang dinonaktifkan lewat menu Ubah Status Pegawai akan muncul di sini."
      />
      <EmployeeDetailSheet />
    </>
  );
}
