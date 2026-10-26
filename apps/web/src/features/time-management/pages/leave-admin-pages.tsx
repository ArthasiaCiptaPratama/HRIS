import {
  EXIT_REASON_LABELS,
  type ExitReason,
  LEAVE_CATEGORIES,
  LEAVE_CATEGORY_LABELS,
  LEAVE_EXIT_STATUS_LABELS,
  LEAVE_LEDGER_KIND_LABELS,
  LEAVE_REQUEST_STATUS_LABELS,
  LEAVE_REQUEST_STATUSES,
  type LeaveCategory,
  type LeaveExitStatus,
  type LeaveLedgerKind,
} from "@hris/shared";
import {
  Check,
  ExternalLink,
  Eye,
  FileUp,
  Inbox,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Scale,
  UserMinus,
  X,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import { useDecideApproval } from "../api";
import { StepBadge, workDateLabel } from "../components/display";
import { RefreshButton } from "../components/refresh-button";
import {
  type BalanceRow,
  type ExitSettlement,
  type LeaveRequest,
  type LeaveType,
  useBalanceActions,
  useEmployeeLedger,
  useExitSettlements,
  useLeaveBalances,
  useLeaveMaster,
  useLeaveRequest,
  useLeaveRequests,
  useLeaveTypes,
  useLeaveYears,
  useMarkExitPaid,
  useRecalculateExit,
} from "../leave-api";
import { RosterFileError, readRosterFile } from "../roster-file";
import { dateRange, RequestCard } from "./leave-page";
import { useRosterCompany } from "./roster-page";

// D-072: persetujuan cuti/izin/sakit (Atasan tim + HR PT, paralel), saldo per PT (penyesuaian & import
// saldo awal), Master Cuti per tahun & jenis (SA kelola, lainnya lihat).

// ── Persetujuan ────────────────────────────────────────────────────────────────

export function LeaveApprovalsPage() {
  const { companies, companyId, setCompanyId } = useRosterCompany();
  const [tab, setTab] = useState<"inbox" | "all">("inbox");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const openRequest = (list: LeaveRequest[] | undefined) =>
    list?.find((r) => r.id === openId) ?? null;
  const list = useLeaveRequests({
    scope: tab,
    companyId: companies.length > 1 ? companyId : undefined,
    status: tab === "all" ? status || undefined : undefined,
  });
  return (
    <div>
      <PageHeader
        title="Persetujuan Cuti & Izin"
        description="Setiap pengajuan disetujui Atasan dan HR. Lampiran (mis. surat dokter) dapat dibuka dari kartu pengajuan."
        actions={
          <div className="flex items-center gap-2">
            {companies.length > 1 ? (
              <FormSelect
                aria-label="Perusahaan"
                className="h-9 w-56"
                value={companyId}
                onChange={setCompanyId}
                placeholder="Perusahaan"
                options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
              />
            ) : null}
            <RefreshButton />
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "inbox" | "all")}>
          <TabsList>
            <TabsTrigger value="inbox">Perlu keputusan</TabsTrigger>
            <TabsTrigger value="all">Semua</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "all" ? (
          <FormSelect
            aria-label="Status"
            className="h-9 w-56"
            value={status}
            onChange={setStatus}
            placeholder="Semua status"
            noneLabel="Semua status"
            options={LEAVE_REQUEST_STATUSES.map((s) => ({
              value: s,
              label: LEAVE_REQUEST_STATUS_LABELS[s],
            }))}
          />
        ) : null}
      </div>
      {list.isPending ? (
        <Skeleton className="h-60" />
      ) : list.isError ? (
        <EmptyState icon={Inbox} title="Gagal memuat" description={errorMessage(list.error)} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tab === "inbox" ? "Tidak ada yang perlu diputuskan" : "Belum ada pengajuan"}
        />
      ) : (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Karyawan</th>
                <th className="px-3 py-2 text-left font-medium">Kategori</th>
                <th className="px-3 py-2 text-left font-medium">Tgl mulai</th>
                <th className="px-3 py-2 text-left font-medium">Tgl selesai</th>
                <th className="px-3 py-2 text-right font-medium">Hari</th>
                <th className="px-3 py-2 text-center font-medium">Bukti</th>
                <th className="px-3 py-2 text-center font-medium">Atasan</th>
                <th className="px-3 py-2 text-center font-medium">HRD</th>
                <th className="px-3 py-2 text-right font-medium">Kontrol</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(list.data ?? []).map((r) => (
                <DecisionRow key={r.id} request={r} onOpen={() => setOpenId(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openRequest(list.data) ? (
        <Dialog open onOpenChange={(open) => !open && setOpenId(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Detail pengajuan</DialogTitle>
              <DialogDescription>Tolak atau ambil alih wajib menulis alasan.</DialogDescription>
            </DialogHeader>
            <ul>
              <DecisionCard request={openRequest(list.data) as LeaveRequest} />
            </ul>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function DecisionRow({ request, onOpen }: { request: LeaveRequest; onOpen: () => void }) {
  const decide = useDecideApproval();
  const approval = request.approval;
  const canQuick = approval?.status === "PENDING" && approval.canDecide;
  const canAct = approval?.status === "PENDING" && (approval.canDecide || approval.canOverride);
  return (
    <tr className="hover:bg-muted/40">
      <td className="px-3 py-2">
        <p className="font-medium whitespace-nowrap">{request.employee.fullName}</p>
        <p className="text-muted-foreground font-mono text-xs">
          {request.employee.employeeNumber ?? "—"}
        </p>
      </td>
      <td className="px-3 py-2">
        <p className="flex flex-wrap items-center gap-1 whitespace-nowrap">
          {request.type.name}
          {request.resubmittedFrom ? <Badge variant="brand">Pengajuan ulang</Badge> : null}
        </p>
        <p className="text-muted-foreground line-clamp-1 max-w-48 text-xs" title={request.reason}>
          {request.reason}
        </p>
        {request.resubmittedFrom ? (
          <p
            className="text-muted-foreground line-clamp-2 max-w-56 text-[11px]"
            title={request.resubmittedFrom.rejectionNote ?? undefined}
          >
            {dateRange(request.resubmittedFrom.startDate, request.resubmittedFrom.endDate)} —
            Sebelumnya ditolak: {request.resubmittedFrom.rejectionNote ?? "tanpa catatan"}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{workDateLabel(request.startDate)}</td>
      <td className="px-3 py-2 whitespace-nowrap">{workDateLabel(request.endDate)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {request.days}
        {request.type.category !== "ANNUAL" && request.annualDays > 0 ? (
          <span
            className="block text-[11px] text-amber-700 dark:text-amber-300"
            title="Izin melebihi jatah jenisnya; kelebihannya memotong cuti tahunan"
          >
            {request.annualDays} potong cuti
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-center">
        {request.attachmentUrl ? (
          <a
            href={request.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-brand inline-flex"
            aria-label="Buka bukti"
          >
            <Paperclip className="size-4" />
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <StepBadge approval={approval} kind="MANAGER" />
      </td>
      <td className="px-3 py-2 text-center">
        <StepBadge approval={approval} kind="HR" />
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          {canQuick ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="text-success"
              aria-label="Setujui"
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate(
                  { requestId: approval.id, decision: "APPROVED" },
                  {
                    onSuccess: () => toast.success(`${request.employee.fullName}: disetujui.`),
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              <Check />
            </Button>
          ) : null}
          {canAct ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="text-destructive"
              aria-label="Tolak"
              onClick={onOpen}
            >
              <X />
            </Button>
          ) : null}
          <Button size="icon-sm" variant="ghost" aria-label="Detail" onClick={onOpen}>
            <Eye />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function DecisionCard({ request }: { request: LeaveRequest }) {
  const decide = useDecideApproval();
  const [note, setNote] = useState("");
  const [showAttachment, setShowAttachment] = useState(false);
  const detail = useLeaveRequest(showAttachment ? request.id : null);
  const approval = request.approval;
  const canAct = approval?.status === "PENDING" && (approval.canDecide || approval.canOverride);
  const overrideOnly = Boolean(approval && !approval.canDecide && approval.canOverride);
  const run = (decision: "APPROVED" | "REJECTED") => {
    if (!approval) return;
    if ((decision === "REJECTED" || overrideOnly) && !note.trim()) {
      toast.error(
        decision === "REJECTED" ? "Tulis alasan penolakan." : "Tulis alasan pengambilalihan.",
      );
      return;
    }
    decide.mutate(
      { requestId: approval.id, decision, note: note.trim() || undefined },
      {
        onSuccess: () =>
          toast.success(decision === "APPROVED" ? "Pengajuan disetujui." : "Pengajuan ditolak."),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  return (
    <RequestCard request={request}>
      <p className="text-sm">
        <span className="font-medium">{request.employee.fullName}</span>{" "}
        <span className="text-muted-foreground font-mono text-xs">
          {request.employee.employeeNumber ?? ""}
        </span>
      </p>
      {request.workDates.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Hari terhitung: {request.workDates.map((d) => workDateLabel(d)).join(", ")}
        </p>
      ) : null}
      {showAttachment ? (
        detail.data?.attachmentUrl ? (
          <a
            href={detail.data.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-brand inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ExternalLink className="size-3" /> Buka lampiran
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">
            {detail.isPending ? "Memuat lampiran…" : "Tanpa lampiran."}
          </span>
        )
      ) : (
        <Button size="xs" variant="outline" onClick={() => setShowAttachment(true)}>
          Lihat lampiran
        </Button>
      )}
      {canAct ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              overrideOnly ? "Alasan pengambilalihan (wajib)" : "Catatan (wajib bila ditolak)"
            }
            aria-label="Catatan keputusan"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => run("REJECTED")}
            >
              <X /> Tolak
            </Button>
            <Button
              size="sm"
              variant="brand"
              disabled={decide.isPending}
              onClick={() => run("APPROVED")}
            >
              <Check /> Setujui
            </Button>
          </div>
        </div>
      ) : null}
    </RequestCard>
  );
}

// ── Saldo per PT ───────────────────────────────────────────────────────────────

export function LeaveBalancesPage() {
  const { companies, companyId, setCompanyId } = useRosterCompany();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const balances = useLeaveBalances(companyId || undefined, year, q);
  const [ledgerFor, setLedgerFor] = useState<BalanceRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<"balances" | "exits">("balances");
  const rows = balances.data ?? [];
  return (
    <div>
      <PageHeader
        title="Saldo Cuti"
        description="Saldo per tahun jatah; sisa hangus 31 Desember dan tidak dibawa ke tahun berikutnya. Saldo minus = hutang yang dilunasi akhir Januari."
        actions={
          tab === "balances" ? (
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!companyId}>
              <FileUp /> Import saldo awal
            </Button>
          ) : null
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as "balances" | "exits")} className="mb-4">
        <TabsList>
          <TabsTrigger value="balances">Saldo</TabsTrigger>
          <TabsTrigger value="exits">Karyawan keluar</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "exits" ? (
        <>
          {companies.length > 1 ? (
            <div className="mb-4">
              <FormSelect
                aria-label="Perusahaan"
                className="h-9 sm:w-56"
                value={companyId}
                onChange={setCompanyId}
                placeholder="Perusahaan"
                options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
              />
            </div>
          ) : null}
          <ExitSettlementsTab companyId={companyId || undefined} />
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            {companies.length > 1 ? (
              <FormSelect
                aria-label="Perusahaan"
                className="h-9 sm:w-56"
                value={companyId}
                onChange={setCompanyId}
                placeholder="Perusahaan"
                options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
              />
            ) : null}
            <Input
              type="number"
              aria-label="Tahun"
              className="h-9 sm:w-28"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Cari nama atau NIP…"
              aria-label="Cari karyawan"
            />
          </div>
          {balances.isPending ? (
            <Skeleton className="h-80" />
          ) : balances.isError ? (
            <EmptyState
              icon={Scale}
              title="Gagal memuat"
              description={errorMessage(balances.error)}
            />
          ) : rows.length === 0 ? (
            <EmptyState icon={Scale} title="Tidak ada karyawan" />
          ) : (
            <div className="bg-card overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Karyawan</th>
                    <th className="px-3 py-2 text-right font-medium">Sisa {year - 1}</th>
                    <th className="px-3 py-2 text-right font-medium">Jatah</th>
                    <th className="px-3 py-2 text-right font-medium">Terpakai</th>
                    <th className="px-3 py-2 text-right font-medium">Ditahan</th>
                    <th className="px-3 py-2 text-right font-medium">Cuti bersama</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo {year}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.employee.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.employee.fullName}</p>
                        <p className="text-muted-foreground font-mono text-xs">
                          {r.employee.employeeNumber ?? "—"}
                        </p>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          r.carryBalance < 0 && "text-destructive",
                        )}
                      >
                        {r.carryBalance}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.granted + r.adjusted}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.used}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.held}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.collective}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-semibold tabular-nums",
                          r.balance < 0 && "text-destructive",
                        )}
                      >
                        {r.balance}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="xs" variant="outline" onClick={() => setLedgerFor(r)}>
                          Rincian
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {ledgerFor ? (
        <LedgerDialog row={ledgerFor} year={year} onClose={() => setLedgerFor(null)} />
      ) : null}
      {importOpen && companyId ? (
        <BalanceImportDialog
          companyId={companyId}
          year={year}
          onClose={() => setImportOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ── TM-D9: hak cuti karyawan keluar ────────────────────────────────────────────

const EXIT_STATUS_VARIANT: Record<LeaveExitStatus, "warning" | "success" | "muted"> = {
  OPEN: "warning",
  PAID: "success",
  CANCELLED: "muted",
};

const DIVISOR_LABEL: Record<ExitSettlement["formula"], string> = {
  SIX_DAY: "pola 6 hari",
  FIVE_DAY: "pola 5 hari",
};

/** Sisa saldo dibayar, hutang dipotong saat payroll akhir; rupiah hanya bila penanya ber-grant Biaya. */
function ExitSettlementsTab({ companyId }: { companyId: string | undefined }) {
  const list = useExitSettlements(companyId);
  const recalc = useRecalculateExit();
  const [paying, setPaying] = useState<ExitSettlement | null>(null);
  const rows = list.data ?? [];
  // Rupiah hanya untuk SA / HR ber-grant labor.cost.read (API juga mengosongkannya tanpa grant).
  const showPay = tmAccess.viewGradeWages(useMe().data as Me);
  if (list.isPending) return <Skeleton className="h-60" />;
  if (list.isError)
    return (
      <EmptyState icon={UserMinus} title="Gagal memuat" description={errorMessage(list.error)} />
    );
  if (rows.length === 0)
    return (
      <EmptyState
        icon={UserMinus}
        title="Belum ada karyawan keluar"
        description="Hak cuti dihitung otomatis saat karyawan dinonaktifkan: sisa saldo dibayar, hutang dipotong di payroll akhir."
      />
    );
  return (
    <>
      <div className="bg-card overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-b text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Karyawan</th>
              <th className="px-3 py-2 text-left font-medium">Keluar</th>
              <th className="px-3 py-2 text-right font-medium">Tahun</th>
              <th className="px-3 py-2 text-right font-medium">Sisa (dibayar)</th>
              <th className="px-3 py-2 text-right font-medium">Hutang (dipotong)</th>
              <th className="px-3 py-2 text-left font-medium">Pembagi</th>
              {showPay ? (
                <>
                  <th className="px-3 py-2 text-right font-medium">Upah harian</th>
                  <th className="px-3 py-2 text-right font-medium">Rupiah</th>
                </>
              ) : null}
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Kontrol</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <p className="font-medium whitespace-nowrap">{r.employee.fullName}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {r.employee.employeeNumber ?? "—"}
                  </p>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <p>{formatDate(r.exitDate)}</p>
                  <p className="text-muted-foreground text-xs">
                    {r.exitReason
                      ? (EXIT_REASON_LABELS[r.exitReason as ExitReason] ?? r.exitReason)
                      : "—"}
                  </p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.year}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.remainingDays}
                  {r.pendingDays > 0 ? (
                    <span
                      className="block text-[11px] text-amber-700 dark:text-amber-300"
                      title="Pengajuan cuti yang masih menunggu keputusan"
                    >
                      {r.pendingDays} menunggu
                    </span>
                  ) : null}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    r.debtDays > 0 && "text-destructive",
                  )}
                >
                  {r.debtDays}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  ÷{r.divisor}{" "}
                  <span className="text-muted-foreground text-xs">{DIVISOR_LABEL[r.formula]}</span>
                </td>
                {showPay ? (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatRupiah(r.dailyWage)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {r.wageMissing ? (
                        <span className="text-xs text-amber-700 dark:text-amber-300">
                          upah grade belum diisi
                        </span>
                      ) : (
                        <>
                          {r.payAmount ? (
                            <p className="text-success">+{formatRupiah(r.payAmount)}</p>
                          ) : null}
                          {r.debtAmount ? (
                            <p className="text-destructive">−{formatRupiah(r.debtAmount)}</p>
                          ) : null}
                          {r.payAmount === null && r.debtAmount === null
                            ? "—"
                            : !r.payAmount && !r.debtAmount
                              ? formatRupiah(0)
                              : null}
                        </>
                      )}
                    </td>
                  </>
                ) : null}
                <td className="px-3 py-2">
                  <Badge variant={EXIT_STATUS_VARIANT[r.status]}>
                    {LEAVE_EXIT_STATUS_LABELS[r.status]}
                  </Badge>
                  {r.status === "PAID" && (r.decidedAt || r.note) ? (
                    <p className="text-muted-foreground mt-0.5 max-w-48 text-[11px]">
                      {r.decidedAt ? formatDate(r.decidedAt) : ""}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {r.status === "OPEN" ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={recalc.isPending}
                        onClick={() =>
                          recalc.mutate(r.id, {
                            onSuccess: () =>
                              toast.success(`${r.employee.fullName}: dihitung ulang.`),
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                      >
                        <RotateCcw /> Hitung ulang
                      </Button>
                      <Button size="xs" variant="brand" onClick={() => setPaying(r)}>
                        <Check /> Tandai diproses
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paying ? <MarkExitPaidDialog row={paying} onClose={() => setPaying(null)} /> : null}
    </>
  );
}

function MarkExitPaidDialog({ row, onClose }: { row: ExitSettlement; onClose: () => void }) {
  const paid = useMarkExitPaid();
  const [note, setNote] = useState("");
  const submit = () =>
    paid.mutate(
      { id: row.id, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`${row.employee.fullName}: ditandai sudah diproses.`);
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tandai diproses · {row.employee.fullName}</DialogTitle>
          <DialogDescription>
            Sisa {row.remainingDays} hari dibayar dan hutang {row.debtDays} hari dipotong di payroll
            akhir. Setelah ditandai, angka tidak bisa dihitung ulang.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="exit-note">Catatan (opsional)</Label>
          <Textarea
            id="exit-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mis. dibayar di payroll Oktober"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant="brand" disabled={paid.isPending} onClick={submit}>
            {paid.isPending ? "Menyimpan…" : "Tandai diproses"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LedgerDialog({
  row,
  year,
  onClose,
}: {
  row: BalanceRow;
  year: number;
  onClose: () => void;
}) {
  const ledger = useEmployeeLedger(row.employee.id, year);
  const { adjust } = useBalanceActions();
  const [days, setDays] = useState(0);
  const [note, setNote] = useState("");
  const submit = () =>
    adjust.mutate(
      { employeeId: row.employee.id, year, days, note },
      {
        onSuccess: () => {
          toast.success("Penyesuaian dicatat.");
          setDays(0);
          setNote("");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row.employee.fullName} · saldo {year}
          </DialogTitle>
          <DialogDescription>
            Setiap perubahan saldo tercatat di buku besar dan audit log.
          </DialogDescription>
        </DialogHeader>
        {ledger.isPending ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border text-sm">
            {(ledger.data?.entries ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-muted-foreground w-24 text-xs">
                  {formatDate(e.createdAt)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {LEAVE_LEDGER_KIND_LABELS[e.kind as LeaveLedgerKind] ?? e.kind}
                  {e.note ? <span className="text-muted-foreground"> · {e.note}</span> : null}
                </span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    e.days < 0 ? "text-destructive" : "text-success",
                  )}
                >
                  {e.days > 0 ? `+${e.days}` : e.days}
                </span>
              </li>
            ))}
            {ledger.data?.entries.length === 0 ? (
              <li className="text-muted-foreground px-3 py-2">Belum ada catatan.</li>
            ) : null}
          </ul>
        )}
        <div className="bg-muted/50 space-y-2 rounded-lg p-3">
          <p className="text-sm font-medium">Penyesuaian</p>
          <div className="flex gap-2">
            <Input
              type="number"
              aria-label="Jumlah hari (+/−)"
              className="w-24"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
            <Input
              placeholder="Alasan (wajib)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="brand"
            disabled={!days || note.trim().length < 3 || adjust.isPending}
            onClick={submit}
          >
            Simpan penyesuaian
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BalanceImportDialog({
  companyId,
  year,
  onClose,
}: {
  companyId: string;
  year: number;
  onClose: () => void;
}) {
  const { previewImport, commitImport } = useBalanceActions();
  const [rows, setRows] = useState<{ employeeNumber: string; balance: number }[]>([]);
  const [error, setError] = useState("");
  const onFile = async (file: File | undefined) => {
    setError("");
    previewImport.reset();
    if (!file) return;
    try {
      const grid = await readRosterFile(file);
      const header = (grid[0] ?? []).map((c) =>
        String(c ?? "")
          .trim()
          .toLowerCase(),
      );
      const nip = header.findIndex((h) => ["nip", "nik", "no induk", "nomor induk"].includes(h));
      const bal = header.findIndex((h) => ["saldo", "sisa", "balance", "sisa cuti"].includes(h));
      if (nip < 0 || bal < 0)
        throw new RosterFileError('Butuh kolom "NIP" dan "Saldo" di baris pertama.');
      const parsed = grid
        .slice(1)
        .filter((r) => String(r[nip] ?? "").trim())
        .map((r) => ({
          employeeNumber: String(r[nip]).trim(),
          balance: Math.trunc(Number(r[bal])),
        }));
      if (parsed.some((r) => !Number.isFinite(r.balance)))
        throw new RosterFileError("Ada nilai saldo yang bukan angka.");
      if (parsed.length === 0) throw new RosterFileError("Tidak ada baris yang terbaca.");
      setRows(parsed);
      previewImport.mutate({ companyId, year, rows: parsed });
    } catch (e) {
      setError(e instanceof RosterFileError ? e.message : errorMessage(e));
    }
  };
  const result = previewImport.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import saldo awal {year}</DialogTitle>
          <DialogDescription>
            File .xlsx/.csv berkolom <b>NIP</b> dan <b>Saldo</b>. Saldo karyawan diatur menjadi
            nilai itu (selisihnya dicatat sebagai penyesuaian). Disimpan hanya bila semua baris
            valid.
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".xlsx,.csv" onChange={(e) => void onFile(e.target.files?.[0])} />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {previewImport.isPending ? <Skeleton className="h-12" /> : null}
        {previewImport.isError ? (
          <p className="text-destructive text-sm">{errorMessage(previewImport.error)}</p>
        ) : null}
        {result ? (
          <div className="space-y-2 text-sm">
            <p>
              {result.total} baris · {result.changed} saldo berubah
            </p>
            {result.issues.length ? (
              <ul className="text-destructive max-h-40 overflow-y-auto text-xs">
                {result.issues.map((i) => (
                  <li key={i.index}>
                    Baris {i.index + 2} ({i.employeeNumber}): {i.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant="brand"
            disabled={!result || result.issues.length > 0 || commitImport.isPending}
            onClick={() =>
              commitImport.mutate(
                { companyId, year, rows },
                {
                  onSuccess: (r) => {
                    toast.success(`${r.saved} saldo diperbarui.`);
                    onClose();
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Master Cuti & jenis ────────────────────────────────────────────────────────

export function LeaveMasterPage() {
  const me = useMe().data as Me;
  const manage = tmAccess.manageLeaveMaster(me);
  return (
    <div>
      <PageHeader
        title="Master Cuti"
        description="Kuota cuti tahunan per tahun (dibagikan otomatis 1 Januari, prorata untuk karyawan baru) dan jenis izin/sakit."
      />
      <Tabs defaultValue="years">
        <TabsList>
          <TabsTrigger value="years">Kuota per tahun</TabsTrigger>
          <TabsTrigger value="types">Jenis cuti/izin/sakit</TabsTrigger>
        </TabsList>
        <TabsContent value="years" className="mt-4">
          <YearsTab manage={manage} />
        </TabsContent>
        <TabsContent value="types" className="mt-4">
          <TypesTab manage={manage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function YearsTab({ manage }: { manage: boolean }) {
  const years = useLeaveYears();
  const { saveYear } = useLeaveMaster();
  const [year, setYear] = useState(new Date().getFullYear() + 1);
  const [quota, setQuota] = useState(12);
  return (
    <div className="space-y-3">
      {manage ? (
        <div className="bg-card flex flex-wrap items-end gap-2 rounded-xl border p-3">
          <div className="space-y-1">
            <Label htmlFor="ly-year">Tahun</Label>
            <Input
              id="ly-year"
              type="number"
              className="w-28"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ly-quota">Kuota (hari)</Label>
            <Input
              id="ly-quota"
              type="number"
              className="w-28"
              value={quota}
              onChange={(e) => setQuota(Number(e.target.value))}
            />
          </div>
          <Button
            variant="brand"
            disabled={saveYear.isPending}
            onClick={() =>
              saveYear.mutate(
                { year, quota, isActive: true },
                {
                  onSuccess: () => toast.success("Master Cuti disimpan."),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <Plus /> Simpan tahun
          </Button>
        </div>
      ) : null}
      {years.isPending ? (
        <Skeleton className="h-32" />
      ) : (years.data ?? []).length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Belum ada Master Cuti"
          description="Tahun berjalan dibuat otomatis (12 hari) saat cron pertama."
        />
      ) : (
        <ul className="bg-card divide-y rounded-xl border text-sm">
          {(years.data ?? []).map((y) => (
            <li key={y.year} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-16 font-semibold tabular-nums">{y.year}</span>
              <span>{y.quota} hari</span>
              {!y.isActive ? <Badge variant="muted">Nonaktif</Badge> : null}
              <span className="text-muted-foreground ml-auto text-xs">
                {y.grantedAt ? `Dibagikan ${formatDate(y.grantedAt)}` : "Belum dibagikan"}
                {y.settledAt ? ` · hutang dilunasi ${formatDate(y.settledAt)}` : ""}
                {y.expiredAt ? ` · sisa hangus ${formatDate(y.expiredAt)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TypesTab({ manage }: { manage: boolean }) {
  const types = useLeaveTypes();
  const [editing, setEditing] = useState<LeaveType | "new" | null>(null);
  return (
    <div className="space-y-3">
      {manage ? (
        <div className="flex justify-end">
          <Button variant="brand" onClick={() => setEditing("new")}>
            <Plus /> Tambah jenis
          </Button>
        </div>
      ) : null}
      {types.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="bg-card divide-y rounded-xl border text-sm">
          {(types.data ?? []).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{t.name}</span>{" "}
                <span className="text-muted-foreground font-mono text-xs">{t.code}</span>
                {t.description ? (
                  <span className="text-muted-foreground block text-xs">{t.description}</span>
                ) : null}
                {t.documentLabel ? (
                  <span className="text-muted-foreground block text-xs">
                    Berkas: {t.documentLabel}
                    {t.documentRequiredAfterDays === null ? " (opsional)" : ""}
                  </span>
                ) : null}
              </span>
              <Badge
                variant={
                  t.category === "ANNUAL" ? "brand" : t.category === "SICK" ? "warning" : "muted"
                }
              >
                {LEAVE_CATEGORY_LABELS[t.category]}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {t.maxDaysPerRequest ? `maks ${t.maxDaysPerRequest} hari` : "tanpa batas"}
                {t.documentRequiredAfterDays !== null
                  ? ` · dokumen wajib ${t.documentRequiredAfterDays === 0 ? "selalu" : `> ${t.documentRequiredAfterDays} hari`}`
                  : ""}
              </span>
              {!t.isActive ? <Badge variant="muted">Nonaktif</Badge> : null}
              {manage ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Ubah ${t.name}`}
                  onClick={() => setEditing(t)}
                >
                  <Pencil />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <TypeDialog type={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function TypeDialog({ type, onClose }: { type: LeaveType | null; onClose: () => void }) {
  const { saveType } = useLeaveMaster();
  const [form, setForm] = useState({
    code: type?.code ?? "",
    name: type?.name ?? "",
    category: (type?.category ?? "PERMIT") as LeaveCategory,
    maxDaysPerRequest: type?.maxDaysPerRequest?.toString() ?? "",
    documentRequiredAfterDays: type?.documentRequiredAfterDays?.toString() ?? "",
    description: type?.description ?? "",
    documentLabel: type?.documentLabel ?? "",
    isActive: type?.isActive ?? true,
  });
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const submit = () =>
    saveType.mutate(
      {
        id: type?.id,
        code: form.code,
        name: form.name,
        category: form.category,
        maxDaysPerRequest: num(form.maxDaysPerRequest),
        documentRequiredAfterDays: num(form.documentRequiredAfterDays),
        description: form.description.trim() || null,
        documentLabel: form.documentLabel.trim() || null,
        isActive: form.isActive,
      },
      {
        onSuccess: () => {
          toast.success("Jenis disimpan.");
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type ? `Ubah ${type.name}` : "Tambah jenis"}</DialogTitle>
          <DialogDescription>
            Cuti tahunan memotong saldo. Izin yang melebihi maks hari/pengajuan memotong cuti
            tahunan untuk kelebihannya. Keterangan & berkas tampil di form pengajuan karyawan.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lt-code">Kode</Label>
            <Input
              id="lt-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <FormSelect
              value={form.category}
              disabled={type !== null}
              onChange={(v) => setForm({ ...form, category: v as LeaveCategory })}
              placeholder="Kategori"
              options={LEAVE_CATEGORIES.map((c) => ({ value: c, label: LEAVE_CATEGORY_LABELS[c] }))}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="lt-name">Nama</Label>
            <Input
              id="lt-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lt-max">Maks hari/pengajuan</Label>
            <Input
              id="lt-max"
              type="number"
              placeholder="tanpa batas"
              value={form.maxDaysPerRequest}
              onChange={(e) => setForm({ ...form, maxDaysPerRequest: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lt-doc">Dokumen wajib bila &gt; hari</Label>
            <Input
              id="lt-doc"
              type="number"
              placeholder="tidak wajib"
              value={form.documentRequiredAfterDays}
              onChange={(e) => setForm({ ...form, documentRequiredAfterDays: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="lt-desc">Keterangan untuk karyawan</Label>
            <Textarea
              id="lt-desc"
              rows={2}
              maxLength={300}
              placeholder="Kapan izin ini dipakai, mis. Pernikahan karyawan sendiri."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="lt-doclabel">Berkas yang diperlukan</Label>
            <Input
              id="lt-doclabel"
              maxLength={120}
              placeholder="mis. Surat keterangan dokter"
              value={form.documentLabel}
              onChange={(e) => setForm({ ...form, documentLabel: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Wajib/opsional mengikuti "Dokumen wajib bila &gt; hari". Kosongkan kolom itu agar
              lampiran tetap opsional.
            </p>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand size-4"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Aktif (bisa dipilih saat pengajuan)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={saveType.isPending || form.name.trim().length < 2}
            onClick={submit}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
