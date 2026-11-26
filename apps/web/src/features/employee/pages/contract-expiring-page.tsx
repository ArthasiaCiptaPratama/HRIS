import type { EmploymentCategory } from "@hris/shared";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { useCompanyScope, useEmployeeSummary } from "../api";
import { EmployeeDetailSheet, useEmployeeSheet } from "../components/employee-detail-sheet";
import { EmployeeListView, employeeColumns } from "../components/employee-list-view";

// KTR-D5 / KTR-D11 (K2): karyawan PKWT & masa percobaan yang kontrak aktifnya berakhir ≤ 60 hari lagi atau
// sudah lewat tanpa tindakan. Terlihat SA + HR_ADMIN dalam cakupan PT; aksi tetap butuh grant contract.manage.
export const CONTRACT_ENDING_DAYS = 60;

const KINDS: { value: string | null; label: string; category?: EmploymentCategory }[] = [
  { value: null, label: "Semua" },
  { value: "pkwt", label: "PKWT", category: "PKWT" },
  { value: "percobaan", label: "Masa Percobaan", category: "PROBATION" },
];

export function ContractExpiringPage() {
  const sheet = useEmployeeSheet();
  const [params, setParams] = useSearchParams();
  const { showCompany } = useCompanyScope();
  const summary = useEmployeeSummary();
  const kind = KINDS.find((k) => k.value === params.get("jenis")) ?? KINDS[0];
  const columns = useMemo(
    () =>
      employeeColumns("active", undefined, { showCompany, showPkwt: true, showRemaining: true }),
    [showCompany],
  );
  const ending = summary.data?.active.contractsEnding;

  return (
    <>
      <PageHeader
        title="Kontrak Akan Habis"
        description={`Karyawan PKWT dan masa percobaan yang kontraknya berakhir dalam ${CONTRACT_ENDING_DAYS} hari atau sudah lewat. Karyawan tidak dinonaktifkan otomatis: pilih tindakan di tab Kepegawaian.`}
      />
      {ending && ending.overdue > 0 ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {ending.overdue} kontrak sudah lewat tanggal akhir dan belum ada tindakan.
        </p>
      ) : null}
      <nav aria-label="Jenis kontrak" className="mb-4 flex gap-1.5">
        {KINDS.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={kind?.value === item.value}
            onClick={() =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (item.value) next.set("jenis", item.value);
                  else next.delete("jenis");
                  next.delete("page");
                  return next;
                },
                { replace: true },
              )
            }
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm transition-all active:scale-[0.98]",
              kind?.value === item.value
                ? "border-foreground bg-foreground text-background"
                : "bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <EmployeeListView
        key={kind?.value ?? "semua"}
        variant="active"
        category={kind?.category}
        contractEndsWithin={CONTRACT_ENDING_DAYS}
        defaultSort="contractEndDate:asc"
        columns={columns}
        onRowClick={(row) => sheet.open(row.id)}
        emptyTitle="Tidak ada kontrak yang akan habis"
        emptyDescription={`Belum ada kontrak PKWT atau masa percobaan yang berakhir dalam ${CONTRACT_ENDING_DAYS} hari.`}
      />
      <EmployeeDetailSheet />
    </>
  );
}
