import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { EmployeeDetailSheet, useEmployeeSheet } from "../components/employee-detail-sheet";
import { EmployeeListView, employeeColumns } from "../components/employee-list-view";

export function InactiveEmployeesPage() {
  const sheet = useEmployeeSheet();
  const columns = useMemo(() => employeeColumns("inactive"), []);

  return (
    <>
      <PageHeader
        title="Data Pegawai Tidak Aktif"
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
