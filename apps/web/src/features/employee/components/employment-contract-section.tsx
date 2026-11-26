import {
  CONTRACT_STATUS_LABELS,
  contractStageLabel,
  contractSummary,
  EMPLOYMENT_CATEGORY_LABELS,
  employmentStatusDisplay,
  employmentTier,
  tenure,
} from "@hris/shared";
import { useState } from "react";
import { FEATURES } from "@/app/feature-flags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useEmployeeContracts } from "../api";
import type { EmploymentContract } from "../contract-schemas";
import { todayIso } from "../labels";
import type { EmployeeDetail } from "../schemas";
import { type ContractDialogAction, EmploymentContractDialog } from "./employment-contract-dialog";
import { ThlSection } from "./thl-section";

function duration(value: ReturnType<typeof tenure>) {
  // Di bawah satu bulan tampilkan hari supaya tidak terbaca "0 th 0 bln".
  if (value.years === 0 && value.months === 0) return `${value.days} hari`;
  return `${value.years} th ${value.months} bln`;
}

export function ContractHistoryTable({ contracts }: { contracts: EmploymentContract[] }) {
  return (
    <section aria-label="Riwayat kontrak" className="space-y-3">
      <h4 className="text-sm font-semibold">Riwayat kontrak</h4>
      {contracts.length ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                {["Tahap", "Mulai", "Akhir", "Status", "Catatan"].map((label) => (
                  <th key={label} className="p-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id} className="border-t">
                  <td className="p-3 whitespace-nowrap">
                    {contractStageLabel(contract.kind, contract.sequence)}
                  </td>
                  <td className="p-3 whitespace-nowrap">{formatDate(contract.startDate)}</td>
                  <td className="p-3 whitespace-nowrap">{formatDate(contract.endDate)}</td>
                  <td className="p-3">{CONTRACT_STATUS_LABELS[contract.status]}</td>
                  <td className="p-3">{contract.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Belum ada riwayat kontrak.</p>
      )}
    </section>
  );
}

export function EmployeeContractHistory({ employeeId }: { employeeId: string }) {
  const query = useEmployeeContracts(employeeId);
  if (query.isPending)
    return <p className="text-muted-foreground text-sm">Memuat riwayat kontrak…</p>;
  if (query.isError)
    return (
      <div role="alert" className="text-destructive text-sm">
        {errorMessage(query.error)}{" "}
        <Button variant="outline" onClick={() => query.refetch()}>
          Coba lagi riwayat kontrak
        </Button>
      </div>
    );
  return <ContractHistoryTable contracts={query.data.contracts} />;
}

export function EmploymentContractSection({ employee }: { employee: EmployeeDetail }) {
  const category = employee.employmentStatus.category;
  const tier = employmentTier(category);
  const query = useEmployeeContracts(employee.id, tier !== null);
  const [action, setAction] = useState<ContractDialogAction | null>(null);
  if (!tier)
    return (
      <p className="text-sm">
        {category ? EMPLOYMENT_CATEGORY_LABELS[category] : employee.employmentStatus.name}
      </p>
    );
  if (query.isPending)
    return <p className="text-muted-foreground text-sm">Memuat status kepegawaian…</p>;
  if (query.isError)
    return (
      <div role="alert" className="text-destructive text-sm">
        Status kepegawaian gagal dimuat: {errorMessage(query.error)}{" "}
        <Button variant="outline" onClick={() => query.refetch()}>
          Coba lagi kontrak
        </Button>
      </div>
    );
  const data = query.data;
  const today = todayIso();
  const summary = contractSummary(data.contracts, today);
  const active = data.contracts.find((c) => c.status === "ACTIVE");
  const manage = data.access.manage && employee.isActive;
  const needsContract = category === "PKWT" || category === "PROBATION";
  const colors = {
    ok: "text-green-700",
    warn: "text-amber-700",
    danger: "text-red-700",
    expired: "text-red-700",
  };
  return (
    <section aria-label="Status kepegawaian" className="space-y-4 rounded-xl border p-4">
      <h3 className="font-semibold">Status kepegawaian</h3>
      <div className="flex gap-2">
        <Badge>{employmentStatusDisplay(category, active?.sequence ?? null)}</Badge>
      </div>
      {needsContract && !active ? (
        <div className="space-y-3 rounded-md bg-amber-50 p-3 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p>Tahap belum diisi</p>
          {manage ? (
            <Button variant="outline" onClick={() => setAction("create")}>
              Isi tahap kontrak
            </Button>
          ) : null}
        </div>
      ) : null}
      {needsContract && summary ? (
        <div className="space-y-3 text-sm">
          <p>
            {formatDate(summary.startDate)} – {formatDate(summary.endDate)}
          </p>
          <p className={colors[summary.color]}>
            {category === "PROBATION" ? "Sisa masa percobaan" : "Sisa kontrak"}:{" "}
            {summary.remainingDays < 0
              ? category === "PROBATION"
                ? "Masa percobaan lewat"
                : `Kontrak lewat ${Math.abs(summary.remainingDays)} hari`
              : `${summary.remainingDays} hari lagi`}
          </p>
          <p>Masa kerja tahap ini: {duration(summary.stageTenure)}</p>
          {summary.totalPkwt ? (
            <div className="space-y-2">
              <p>
                Total masa PKWT:{" "}
                {duration(
                  tenure(
                    summary.totalPkwt.firstStartDate,
                    today < summary.endDate ? today : summary.endDate,
                  ),
                )}{" "}
                dari maks 4 tahun
              </p>
              <progress
                className="h-2 w-full accent-sky-600"
                aria-label="Total masa PKWT"
                value={Math.min(100, summary.totalPkwt.percent)}
                max={100}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {FEATURES.thlEvaluation && data.thl ? (
        <ThlSection employeeId={employee.id} thl={data.thl} />
      ) : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Masa kerja di perusahaan</dt>
          <dd>
            {duration(data.companyTenure)}{" "}
            <span className="text-muted-foreground">(sejak {formatDate(data.joinDate)})</span>
          </dd>
        </div>
        {tier === "PKWTT" ? (
          <div>
            <dt className="text-muted-foreground">Masa kerja PKWTT</dt>
            <dd>
              {data.pkwttStartDate && data.pkwttTenure ? (
                <>
                  {duration(data.pkwttTenure)}{" "}
                  <span className="text-muted-foreground">
                    (sejak {formatDate(data.pkwttStartDate)})
                  </span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        ) : null}
      </dl>
      {data.access.missingGrant ? (
        <p className="text-muted-foreground text-sm">
          Aksi kontrak butuh izin <strong>Kelola kontrak</strong> dari Super Admin.
        </p>
      ) : null}
      {category === "PKWT" && active?.sequence === 3 ? (
        <p className="text-muted-foreground text-sm">
          Batas PKWT tercapai: jadikan Karyawan Tetap atau akhiri kontrak.
        </p>
      ) : null}
      {manage ? (
        <div className="flex flex-wrap gap-2">
          {category === "PKWT" && active && active.sequence !== null && active.sequence < 3 ? (
            <Button variant="outline" onClick={() => setAction("extend")}>
              Perpanjang ke PKWT {active.sequence + 1}
            </Button>
          ) : null}
          {category === "DAILY_WORKER" ||
          ((category === "PKWT" || category === "PROBATION") && active) ? (
            <Button
              variant={
                FEATURES.thlEvaluation && data.thl?.evaluation.status === "REQUIRED"
                  ? "destructive"
                  : "outline"
              }
              onClick={() => setAction("promote")}
            >
              {category === "PROBATION" ? "Lulus → Permanen" : "Jadikan Karyawan Tetap"}
            </Button>
          ) : null}
          {(category === "PKWT" || category === "PROBATION") && active ? (
            // KTR-D12: koreksi tanggal kontrak aktif (salah input), bukan perpanjangan.
            <Button variant="ghost" onClick={() => setAction("correct")}>
              Koreksi data kontrak
            </Button>
          ) : null}
          {category === "PKWT" && active ? (
            <Button variant="destructive" onClick={() => setAction("end")}>
              Akhiri kontrak
            </Button>
          ) : null}
          {category === "PROBATION" && active ? (
            <Button variant="destructive" onClick={() => setAction("fail")}>
              Tidak lulus
            </Button>
          ) : null}
        </div>
      ) : null}
      <ContractHistoryTable contracts={data.contracts} />
      {action ? (
        <EmploymentContractDialog
          employeeId={employee.id}
          action={action}
          data={data}
          active={active}
          firstStart={summary?.totalPkwt?.firstStartDate}
          onClose={() => setAction(null)}
        />
      ) : null}
    </section>
  );
}
