import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useCompanyScope } from "../api";
import { EmployeeDetailSheet, useEmployeeSheet } from "../components/employee-detail-sheet";
import { EmployeeListView, employeeColumns } from "../components/employee-list-view";

export function InactiveEmployeesPage() {
  const sheet = useEmployeeSheet();
  const { showCompany } = useCompanyScope();
  const columns = useMemo(
    () => employeeColumns("inactive", undefined, { showCompany }),
    [showCompany],
  );

  return (
    <>
      <PageHeader
        title="Data Karyawan Tidak Aktif"
        description="Arsip karyawan yang sudah keluar: resign, PHK, kontrak berakhir, pensiun, dan lainnya. Data hanya bisa dibaca."
      />
      <EmployeeListView
        variant="inactive"
        columns={columns}
        onRowClick={(row) => sheet.open(row.id)}
        emptyTitle="Belum ada karyawan nonaktif"
        emptyDescription="Karyawan yang dinonaktifkan lewat menu Ubah Status Karyawan akan muncul di sini."
      />
      <EmployeeDetailSheet />
    </>
  );
}
