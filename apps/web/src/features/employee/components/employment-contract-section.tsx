import {
  CONTRACT_STATUS_LABELS,
  contractStageLabel,
  contractSummary,
  EMPLOYMENT_CATEGORY_LABELS,
  employmentStatusDisplay,
  employmentTier,
  tenure,
} from "@hris/shared";
import { ArrowRight, Ellipsis } from "lucide-react";
import { type ReactNode, useState } from "react";
import { FEATURES } from "@/app/feature-flags";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEmployeeContracts } from "../api";
import type { EmploymentContract } from "../contract-schemas";
import { todayIso } from "../labels";
import type { EmployeeDetail } from "../schemas";
import { type ContractDialogAction, EmploymentContractDialog } from "./employment-contract-dialog";
import { StatusBadge } from "./status-badge";
import { DailyWageDialog, ThlAttendanceStat, ThlStatusBadge, ThlWageStat } from "./thl-section";

function duration(value: ReturnType<typeof tenure>) {
  // Di bawah satu bulan tampilkan hari supaya tidak terbaca "0 th 0 bln".
  if (value.years === 0 && value.months === 0) return `${value.days} hari`;
  return `${value.years} th ${value.months} bln`;
}

const CONTRACT_STATUS_TONE: Record<EmploymentContract["status"], string> = {
  ACTIVE: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
  EXTENDED: "bg-muted text-muted-foreground",
  CONVERTED: "bg-brand-soft text-brand-soft-foreground",
  PASSED: "bg-brand-soft text-brand-soft-foreground",
  ENDED: "bg-muted text-muted-foreground",
};

/**
 * Opsi A (pilihan pengguna 2026-11-26): riwayat kontrak hanya di tab Riwayat, sebagai linimasa
 * vertikal per tahap (terbaru di atas); catatan hanya tampil bila ada.
 */
export function ContractTimeline({ contracts }: { contracts: EmploymentContract[] }) {
  const ordered = [...contracts].sort(
    (a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id),
  );
  return (
    <section aria-label="Riwayat kontrak" className="space-y-3">
      <h4 className="text-sm font-semibold">Kontrak</h4>
      {ordered.length ? (
        <ol className="border-border relative ml-2 space-y-4 border-l">
          {ordered.map((contract) => {
            const active = contract.status === "ACTIVE";
            return (
              <li key={contract.id} className="relative pl-6">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 rounded-full",
                    active
                      ? "bg-brand ring-brand/25 -left-[6px] size-[11px] ring-4"
                      : "bg-muted-foreground/40 -left-[4.5px] size-2",
                  )}
                />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {contractStageLabel(contract.kind, contract.sequence)}
                  </span>
                  <span
                    className={cn("text-sm whitespace-nowrap", !active && "text-muted-foreground")}
                  >
                    {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      CONTRACT_STATUS_TONE[contract.status],
                    )}
                  >
                    {CONTRACT_STATUS_LABELS[contract.status]}
                  </span>
                </div>
                {contract.note ? (
                  <p className="text-muted-foreground mt-1 text-xs">Catatan: {contract.note}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
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
  return <ContractTimeline contracts={query.data.contracts} />;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const STAT_COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

const REMAINING_TONE = {
  ok: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
  warn: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
  expired: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
};

/**
 * Kartu ringkas Status kepegawaian (Opsi A, pilihan pengguna 2026-11-26): kepala satu baris
 * (badge · periode · sisa), angka ringkas dalam grid, satu aksi utama + sekunder, sisanya di
 * menu "Lainnya". Pola sama untuk PKWT, Masa Percobaan, THL, dan Karyawan Tetap.
 */
export function EmploymentContractSection({
  employee,
  onOpenHistory,
}: {
  employee: EmployeeDetail;
  /** Pindah ke tab Riwayat (bagian Kontrak); tautan disembunyikan bila tidak diberikan. */
  onOpenHistory?: () => void;
}) {
  const category = employee.employmentStatus.category;
  const tier = employmentTier(category);
  const query = useEmployeeContracts(employee.id, tier !== null);
  const [action, setAction] = useState<ContractDialogAction | null>(null);
  const [editingWage, setEditingWage] = useState(false);
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
  const probation = category === "PROBATION";
  const thl = FEATURES.thlEvaluation && category === "DAILY_WORKER" ? data.thl : null;
  const pkwtLimit = category === "PKWT" && active?.sequence === 3;
  const canExtend =
    category === "PKWT" && active && active.sequence !== null && active.sequence < 3;
  const canPromote = category === "DAILY_WORKER" || (needsContract && Boolean(active));
  const wageAccess = Boolean(thl?.access.wage);

  const stats: { label: string; content: ReactNode }[] = [];
  if (needsContract && summary) {
    stats.push({
      label: probation ? "Masa percobaan berjalan" : "Masa kerja tahap ini",
      content: <p className="mt-1 text-base font-semibold">{duration(summary.stageTenure)}</p>,
    });
    if (summary.totalPkwt)
      stats.push({
        label: "Total masa PKWT",
        content: (
          <>
            <p className="mt-1 text-base font-semibold">
              {duration(
                tenure(
                  summary.totalPkwt.firstStartDate,
                  today < summary.endDate ? today : summary.endDate,
                ),
              )}{" "}
              <span className="text-muted-foreground text-sm font-normal">/ maks 4 th</span>
            </p>
            {/* Bar div (bukan <progress>): warna konsisten di semua browser; kuning ≥ 90% dari 4 tahun. */}
            <div
              role="progressbar"
              aria-label="Total masa PKWT"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(100, summary.totalPkwt.percent))}
              className="bg-border mt-2 h-1.5 w-full overflow-hidden rounded-full"
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  summary.totalPkwt.percent >= 90 ? "bg-amber-500" : "bg-sky-600",
                )}
                style={{ width: `${Math.min(100, summary.totalPkwt.percent)}%` }}
              />
            </div>
          </>
        ),
      });
  }
  if (thl) {
    stats.push({ label: "Hari hadir 3 bulan terakhir", content: <ThlAttendanceStat thl={thl} /> });
    if (wageAccess) stats.push({ label: "Upah harian", content: <ThlWageStat thl={thl} /> });
  }
  stats.push({
    label: "Masa kerja di perusahaan",
    content: (
      <>
        <p className="mt-1 text-base font-semibold">{duration(data.companyTenure)}</p>
        <p className="text-muted-foreground text-xs">sejak {formatDate(data.joinDate)}</p>
      </>
    ),
  });
  if (tier === "PKWTT" && !probation)
    stats.push({
      label: "Masa kerja PKWTT",
      content:
        data.pkwttStartDate && data.pkwttTenure ? (
          <>
            <p className="mt-1 text-base font-semibold">{duration(data.pkwttTenure)}</p>
            <p className="text-muted-foreground text-xs">sejak {formatDate(data.pkwttStartDate)}</p>
          </>
        ) : (
          <p className="mt-1 text-base font-semibold">—</p>
        ),
    });

  // Aksi utama satu, sekunder satu; koreksi & pengakhiran di menu "Lainnya" (Opsi A).
  const primary: { label: string; action: ContractDialogAction } | null = canExtend
    ? { label: `Perpanjang ke PKWT ${(active?.sequence ?? 0) + 1}`, action: "extend" }
    : canPromote
      ? { label: probation ? "Lulus → Permanen" : "Jadikan Karyawan Tetap", action: "promote" }
      : null;
  const secondaryPromote = canExtend && canPromote;
  const menu: { label: string; action: ContractDialogAction; destructive?: boolean }[] = [];
  if (needsContract && active) {
    // KTR-D12: koreksi tanggal kontrak aktif (salah input), bukan perpanjangan.
    menu.push({ label: "Koreksi data kontrak", action: "correct" });
    menu.push(
      probation
        ? { label: "Tidak lulus", action: "fail", destructive: true }
        : { label: "Akhiri kontrak", action: "end", destructive: true },
    );
  }
  const showActions = (manage && (primary || menu.length)) || wageAccess;
  const statusLabel = employmentStatusDisplay(category, active?.sequence ?? null);

  return (
    <section
      aria-label="Status kepegawaian"
      className="bg-card space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <h3 className="sr-only">Status kepegawaian</h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge
          name={employee.employmentStatus.name}
          category={category}
          stage={category === "PKWT" ? (active?.sequence ?? null) : undefined}
          label={statusLabel}
          className="px-2 py-0.5 text-sm font-semibold"
        />
        {needsContract && summary ? (
          <>
            <span className="text-sm whitespace-nowrap">
              {formatDate(summary.startDate)} – {formatDate(summary.endDate)}
            </span>
            <span
              data-tone={summary.color}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                REMAINING_TONE[summary.color],
              )}
            >
              <span className="sr-only">
                {probation ? "Sisa masa percobaan: " : "Sisa kontrak: "}
              </span>
              {summary.remainingDays < 0
                ? probation
                  ? `Masa percobaan lewat ${Math.abs(summary.remainingDays)} hari`
                  : `Kontrak lewat ${Math.abs(summary.remainingDays)} hari`
                : summary.remainingDays === 0
                  ? "Berakhir hari ini"
                  : `${summary.remainingDays} hari lagi`}
            </span>
          </>
        ) : null}
        {thl ? <ThlStatusBadge status={thl.evaluation.status} /> : null}
        {thl?.evaluation.status === "REQUIRED" ? (
          <span className="text-destructive text-xs">
            PP 35/2021 Ps. 10: ≥ 21 hari hadir 3 bulan berturut-turut
          </span>
        ) : null}
        {onOpenHistory && data.contracts.length ? (
          <Button
            variant="link"
            size="sm"
            className="text-brand ml-auto h-auto px-0"
            onClick={onOpenHistory}
          >
            Riwayat kontrak ({data.contracts.length}) <ArrowRight />
          </Button>
        ) : null}
      </div>

      {needsContract && !active ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p>Tahap belum diisi</p>
          {manage ? (
            <Button variant="outline" size="sm" onClick={() => setAction("create")}>
              Isi tahap kontrak
            </Button>
          ) : null}
        </div>
      ) : null}

      <dl
        className={cn(
          "bg-muted/60 divide-border grid grid-cols-1 divide-y rounded-lg sm:divide-x sm:divide-y-0",
          STAT_COLUMNS[Math.min(stats.length, 3)],
        )}
      >
        {stats.map((stat) => (
          <Stat key={stat.label} label={stat.label}>
            {stat.content}
          </Stat>
        ))}
      </dl>

      {data.access.missingGrant ? (
        <p className="text-muted-foreground text-sm">
          Aksi kontrak butuh izin <strong>Kelola kontrak</strong> dari Super Admin.
        </p>
      ) : null}

      {showActions ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {manage && primary ? (
            <Button variant="brand" onClick={() => setAction(primary.action)}>
              {primary.label}
            </Button>
          ) : null}
          {manage && secondaryPromote ? (
            <Button variant="outline" onClick={() => setAction("promote")}>
              Jadikan Karyawan Tetap
            </Button>
          ) : null}
          {wageAccess ? (
            <Button variant="outline" onClick={() => setEditingWage(true)}>
              Ubah upah harian
            </Button>
          ) : null}
          {manage && pkwtLimit ? (
            <p className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Batas PKWT tercapai: jadikan Karyawan Tetap atau akhiri kontrak.
            </p>
          ) : null}
          {manage && menu.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto">
                  <Ellipsis /> Lainnya
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {menu.map((item) => (
                  <DropdownMenuItem
                    key={item.action}
                    variant={item.destructive ? "destructive" : "default"}
                    onSelect={() => setAction(item.action)}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : pkwtLimit ? (
        <p className="text-muted-foreground text-sm">
          Batas PKWT tercapai: jadikan Karyawan Tetap atau akhiri kontrak.
        </p>
      ) : null}

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
      {editingWage && thl ? (
        <DailyWageDialog
          employeeId={employee.id}
          amount={thl.dailyWage?.amount}
          onClose={() => setEditingWage(false)}
        />
      ) : null}
    </section>
  );
}
