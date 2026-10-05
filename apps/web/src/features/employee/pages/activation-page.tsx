import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useCompanyScope, useEmployee } from "../api";
import { EmployeeListView, employeeColumns } from "../components/employee-list-view";
import { ReactivateDialog } from "../components/reactivate-dialog";
import type { EmployeeListItem } from "../schemas";

export function ActivationPage() {
  const [params, setParams] = useSearchParams();
  const [target, setTarget] = useState<EmployeeListItem | null>(null);
  // Datang dari panel detail (?pegawai=<id>) → langsung buka dialog untuk pegawai itu.
  const preselectId = params.get("pegawai");
  const preselect = useEmployee(preselectId, "work");

  useEffect(() => {
    if (preselect.data && !preselect.data.isActive) setTarget(preselect.data);
  }, [preselect.data]);

  const { showCompany } = useCompanyScope();
  const columns = useMemo(
    () =>
      employeeColumns(
        "inactive",
        (row) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              setTarget(row);
            }}
          >
            <RotateCcw /> Aktifkan
          </Button>
        ),
        { showCompany },
      ),
    [showCompany],
  );

  return (
    <>
      <PageHeader
        title="Pengaktifan Karyawan"
        description="Aktifkan kembali karyawan yang sebelumnya keluar (mis. direkrut ulang). Riwayat keluar tetap tersimpan."
      />
      <EmployeeListView
        variant="inactive"
        columns={columns}
        onRowClick={setTarget}
        emptyTitle="Tidak ada karyawan nonaktif"
        emptyDescription="Semua karyawan berstatus aktif."
      />
      <ReactivateDialog
        employee={target}
        onOpenChange={(open) => {
          if (open) return;
          setTarget(null);
          if (preselectId)
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.delete("pegawai");
                return next;
              },
              { replace: true },
            );
        }}
      />
    </>
  );
}
