import {
  LEAVE_ATTACHMENT_TYPES,
  LEAVE_CATEGORY_LABELS,
  LEAVE_LEDGER_KIND_LABELS,
  LEAVE_REQUEST_STATUS_LABELS,
  type LeaveCategory,
  type LeaveLedgerKind,
  type LeaveRequestStatus,
} from "@hris/shared";
import { CalendarPlus, FileText, Inbox, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
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
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApprovalSteps, addDays, todayIn, workDateLabel } from "../components/display";
import {
  type BalanceSummary,
  type LeaveRequest,
  useLeaveActions,
  useLeavePreview,
  useLeaveTypes,
  useMyLeave,
} from "../leave-api";

// D-072: cuti tahunan (memotong saldo; hutang boleh), izin & sakit (tidak memotong). Saldo per tahun
// jatah: sisa tahun lalu berlaku s.d. 31 Maret. Approval paralel Atasan + HR.

const STATUS_VARIANT: Record<LeaveRequestStatus, "warning" | "success" | "destructive" | "muted"> =
  {
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "destructive",
    CANCELLED: "muted",
  };

/** Aturan lampiran sebuah jenis untuk ditampilkan ke karyawan (null = tidak pernah wajib). */
function documentRule(requiredAfterDays: number | null): string {
  if (requiredAfterDays === null) return "opsional";
  if (requiredAfterDays === 0) return "wajib dilampirkan";
  return `wajib bila lebih dari ${requiredAfterDays} hari, selain itu opsional`;
}

export function LeaveStatusBadge({ status }: { status: string }) {
  const key = status as LeaveRequestStatus;
  return (
    <Badge variant={STATUS_VARIANT[key] ?? "muted"}>
      {LEAVE_REQUEST_STATUS_LABELS[key] ?? status}
    </Badge>
  );
}

export function dateRange(start: string, end: string) {
  return start === end ? workDateLabel(start) : `${workDateLabel(start)} – ${workDateLabel(end)}`;
}

function BalanceCard({
  summary,
  title,
  hint,
}: {
  summary: BalanceSummary;
  title: string;
  hint?: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{title}</p>
      <p
        className={cn(
          "text-3xl font-semibold tabular-nums",
          summary.balance < 0 && "text-destructive",
        )}
      >
        {summary.balance}
        <span className="text-muted-foreground ml-1 text-sm font-normal">hari</span>
      </p>
      {summary.balance < 0 ? (
        <p className="text-destructive text-xs">
          Hutang cuti — dilunasi dari jatah tahun berikutnya.
        </p>
      ) : null}
      <p className="text-muted-foreground mt-2 text-xs">
        Jatah {summary.granted + summary.adjusted} · terpakai {summary.used} · ditahan{" "}
        {summary.held}
        {summary.collective ? ` · cuti bersama ${summary.collective}` : ""}
        {summary.expired ? ` · hangus ${summary.expired}` : ""}
      </p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

export function LeavePage() {
  const mine = useMyLeave();
  const { cancel } = useLeaveActions();
  const [open, setOpen] = useState(false);
  const data = mine.data;
  const carry = data?.balances.find((b) => b.year === data.year - 1);
  const current = data?.balances.find((b) => b.year === data.year);
  const carryOpen = data ? todayIn() <= data.carryUntil : false;

  return (
    <div>
      <PageHeader
        title="Cuti, Izin & Sakit"
        description="Hanya hari kerja roster yang dihitung. Cuti tahunan memotong saldo; izin dan sakit tidak. Persetujuan oleh Atasan dan HR."
        actions={
          <Button variant="brand" onClick={() => setOpen(true)} disabled={!data}>
            <CalendarPlus /> Ajukan
          </Button>
        }
      />
      {mine.isPending ? (
        <Skeleton className="h-60" />
      ) : mine.isError || !data ? (
        <EmptyState icon={Inbox} title="Gagal memuat" description={errorMessage(mine.error)} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {current ? <BalanceCard summary={current} title={`Saldo cuti ${data.year}`} /> : null}
            {carry && (carry.balance !== 0 || carryOpen) ? (
              <BalanceCard
                summary={carry}
                title={`Sisa ${data.year - 1}`}
                hint={
                  carryOpen
                    ? `Berlaku s.d. ${workDateLabel(data.carryUntil)} dan dipakai lebih dulu.`
                    : undefined
                }
              />
            ) : null}
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Pengajuan saya</h2>
            {data.requests.length === 0 ? (
              <EmptyState icon={FileText} title="Belum ada pengajuan" />
            ) : (
              <ul className="space-y-3">
                {data.requests.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    onCancel={
                      r.canCancel
                        ? () =>
                            cancel.mutate(r.id, {
                              onSuccess: () => toast.success("Pengajuan dibatalkan."),
                              onError: (e) => toast.error(errorMessage(e)),
                            })
                        : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          {data.ledger.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Riwayat saldo</h2>
              <ul className="bg-card divide-y rounded-xl border text-sm">
                {data.ledger.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="text-muted-foreground w-12 text-xs tabular-nums">
                      {e.year}
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
              </ul>
            </section>
          ) : null}
        </div>
      )}
      {open ? <RequestDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export function RequestCard({
  request,
  onCancel,
  children,
}: {
  request: LeaveRequest;
  onCancel?: (() => void) | undefined;
  children?: React.ReactNode;
}) {
  return (
    <li className="bg-card space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {request.type.name} · {request.days} hari
            {request.type.category !== "ANNUAL" && request.annualDays > 0
              ? ` (${request.annualDays} hari memotong cuti tahunan)`
              : ""}
          </p>
          <p className="text-sm">{dateRange(request.startDate, request.endDate)}</p>
          <p className="text-muted-foreground text-xs">
            Diajukan {formatDateTime(request.createdAt)} · “{request.reason}”
          </p>
        </div>
        <LeaveStatusBadge status={request.status} />
      </div>
      <ApprovalSteps approval={request.approval} />
      {children}
      {onCancel ? (
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Batalkan pengajuan
        </Button>
      ) : null}
    </li>
  );
}

function RequestDialog({ onClose }: { onClose: () => void }) {
  const types = useLeaveTypes();
  const preview = useLeavePreview();
  const { create } = useLeaveActions();
  const tomorrow = addDays(todayIn(), 1);
  const [typeId, setTypeId] = useState("");
  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState(tomorrow);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const active = (types.data ?? []).filter((t) => t.isActive);
  const type = active.find((t) => t.id === typeId);
  const p = preview.data;

  // Pratinjau ulang setiap kali jenis/rentang berubah.
  useEffect(() => {
    if (!typeId || !startDate || !endDate || endDate < startDate) return;
    preview.mutate({ leaveTypeId: typeId, startDate, endDate });
  }, [typeId, startDate, endDate, preview.mutate]);

  const submit = async () => {
    try {
      await create.mutateAsync({ leaveTypeId: typeId, startDate, endDate, reason, file });
      toast.success("Pengajuan dikirim ke Atasan & HR.");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  // Izin boleh melebihi batas (kelebihan memotong cuti tahunan); batas hanya mengikat untuk sakit.
  const tooMany = Boolean(
    type?.category === "SICK" && type.maxDaysPerRequest && p && p.days > type.maxDaysPerRequest,
  );
  const valid =
    Boolean(type && p && p.days > 0 && p.conflicts.length === 0 && !tooMany) &&
    reason.trim().length >= 3 &&
    (!p?.documentRequired || file !== null);

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajukan cuti, izin, atau sakit</DialogTitle>
          <DialogDescription>Hari OFF roster dan tanggal merah tidak dihitung.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <FormSelect
              value={typeId}
              onChange={setTypeId}
              placeholder="Pilih jenis"
              options={active.map((t) => ({
                value: t.id,
                label: `${t.name} (${LEAVE_CATEGORY_LABELS[t.category as LeaveCategory]})`,
              }))}
            />
            {type?.description || type?.documentLabel ? (
              <div className="bg-muted/50 space-y-0.5 rounded-md px-2.5 py-2 text-xs">
                {type.description ? <p>{type.description}</p> : null}
                {type.documentLabel ? (
                  <p className="text-muted-foreground">
                    Berkas: <span className="text-foreground">{type.documentLabel}</span> —{" "}
                    {documentRule(type.documentRequiredAfterDays)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {type?.maxDaysPerRequest ? (
              <p className="text-muted-foreground text-xs">
                {type.category === "PERMIT"
                  ? `Jatah ${type.maxDaysPerRequest} hari per pengajuan; kelebihannya memotong cuti tahunan.`
                  : `Maksimal ${type.maxDaysPerRequest} hari per pengajuan.`}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="lv-start">Mulai</Label>
              <Input
                id="lv-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lv-end">Selesai</Label>
              <Input
                id="lv-end"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {preview.isPending ? <Skeleton className="h-14" /> : null}
          {preview.isError ? (
            <p className="text-destructive text-sm">{errorMessage(preview.error)}</p>
          ) : null}
          {p && type ? (
            <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-sm">
              <p>
                <b>{p.days}</b> hari kerja terhitung
                {p.dates.length ? `: ${p.dates.map((d) => d.slice(8)).join(", ")}` : ""}
              </p>
              {type.category === "ANNUAL" ? (
                <p className="text-muted-foreground text-xs">
                  Dipotong dari{" "}
                  {p.charges.map((c) => `${c.days} hari saldo ${c.year}`).join(" + ") || "—"}. Saldo
                  boleh minus (hutang), dilunasi dari jatah tahun berikutnya.
                </p>
              ) : p.annualDays > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <b>{p.days - p.annualDays}</b> hari {type.name} +{" "}
                  <b>{p.annualDays} hari memotong cuti tahunan</b> (
                  {p.charges.map((c) => `saldo ${c.year}`).join(" + ")}) karena melebihi jatah{" "}
                  {type.maxDaysPerRequest} hari. Saldo boleh minus (hutang).
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">Tidak memotong saldo cuti tahunan.</p>
              )}
              {p.days === 0 ? (
                <p className="text-destructive text-xs">
                  Tidak ada hari kerja roster di rentang ini.
                </p>
              ) : null}
              {tooMany ? (
                <p className="text-destructive text-xs">Melebihi kuota jenis ini.</p>
              ) : null}
              {p.conflicts.length ? (
                <p className="text-destructive text-xs">
                  Sudah ada absen pada: {p.conflicts.join(", ")}.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="lv-reason">Alasan</Label>
            <Textarea
              id="lv-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lv-file">
              Lampiran{type?.documentLabel ? ` — ${type.documentLabel}` : ""}{" "}
              {p?.documentRequired ? (
                <span className="text-destructive">* wajib</span>
              ) : (
                <span className="text-muted-foreground font-normal">(opsional)</span>
              )}
            </Label>
            <Input
              id="lv-file"
              type="file"
              accept={LEAVE_ATTACHMENT_TYPES.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <Paperclip className="size-3" /> {file.name}
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={!valid || create.isPending}
            onClick={() => void submit()}
          >
            {create.isPending ? "Mengirim…" : "Kirim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
