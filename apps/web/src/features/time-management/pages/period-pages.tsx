import {
  CORRECTION_STATUS_LABELS,
  CORRECTION_WINDOW_DAYS,
  STATEMENT_ATTACHMENT_TYPES,
} from "@hris/shared";
import {
  Check,
  Download,
  ExternalLink,
  FileWarning,
  Lock,
  PenLine,
  Plus,
  Sheet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import { useAttendanceDays, useDecideApproval, useEmployeeRoster, useTimezone } from "../api";
import { MyAttendanceRecord } from "../components/attendance-record";
import {
  ApprovalSteps,
  addDays,
  CoordLink,
  DayStatusBadge,
  hhmm,
  LabelChips,
  StepBadge,
  timeIn,
  todayIn,
  workDateLabel,
} from "../components/display";
import { SelfieThumb } from "../components/selfie-thumb";
import {
  type Correction,
  type RecapRow,
  type StatementRow,
  useCorrectionActions,
  useCorrections,
  useCreateStatement,
  useMyStatements,
  usePeriodClose,
  useRecap,
  useStatements,
} from "../period-api";
import { useRosterCompany } from "./roster-page";

// D-071: koreksi absensi (paralel Atasan + HR, selama periode terbuka), surat pernyataan untuk hari
// ALPHA (catatan kepatuhan), rekap bulanan, dan tutup periode (SA / HR ber-grant payroll.period.prepare).

const previousMonth = () => addDays(`${todayIn().slice(0, 7)}-01`, -1).slice(0, 7);

// ── Karyawan: koreksi & surat pernyataan ───────────────────────────────────────

export function CorrectionsStatementsPage() {
  const me = useMe().data as Me;
  const self = me.employeeId !== null;
  const decide = tmAccess.decideLeave(me);
  return (
    <div>
      <PageHeader
        title="Koreksi & Surat Pernyataan"
        description="Hari kerja tanpa absen langsung menjadi Alpha. Koreksi (lupa absen / absen ditolak) hanya bisa diajukan paling lambat 3 hari setelah tanggal kerja — setelah itu tetap Alpha dan wajib dibuatkan surat pernyataan."
      />
      <Tabs defaultValue={self ? "corrections" : "inbox"}>
        <TabsList>
          {self ? <TabsTrigger value="corrections">Koreksi saya</TabsTrigger> : null}
          {self ? <TabsTrigger value="statements">Surat pernyataan</TabsTrigger> : null}
          {decide ? <TabsTrigger value="inbox">Koreksi perlu keputusan</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="corrections" className="mt-4">
          <MyCorrections />
        </TabsContent>
        <TabsContent value="statements" className="mt-4">
          <MyStatements />
        </TabsContent>
        <TabsContent value="inbox" className="mt-4">
          <CorrectionInbox />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CorrectionCard({ row, children }: { row: Correction; children?: React.ReactNode }) {
  const TZ = useTimezone();
  return (
    <li className="bg-card space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {row.employee.fullName} · {workDateLabel(row.workDate)}
          </p>
          <p className="text-sm tabular-nums">
            Masuk {timeIn(row.checkInAt, TZ)} · Pulang {timeIn(row.checkOutAt, TZ)}
          </p>
          <p className="text-muted-foreground text-xs">
            Diajukan {formatDateTime(row.createdAt)} · “{row.reason}”
          </p>
        </div>
        <Badge
          variant={
            row.status === "APPROVED" ? "success" : row.status === "PENDING" ? "warning" : "muted"
          }
        >
          {CORRECTION_STATUS_LABELS[row.status as keyof typeof CORRECTION_STATUS_LABELS] ??
            row.status}
        </Badge>
      </div>
      <ApprovalSteps approval={row.approval} />
      {children}
    </li>
  );
}

function MyCorrections() {
  const list = useCorrections("mine");
  const { cancel } = useCorrectionActions();
  // TM-D3: tanggal terisi otomatis saat koreksi dibuka dari daftar hari Alpha.
  const [open, setOpen] = useState<{ workDate?: string } | null>(null);
  return (
    <div className="space-y-3">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Hari Alpha & rekam jejak</h2>
        <MyAttendanceRecord onCorrect={(workDate) => setOpen({ workDate })} />
      </section>
      <div className="flex items-center justify-between gap-2 pt-2">
        <h2 className="text-sm font-semibold">Pengajuan koreksi</h2>
        <Button variant="brand" onClick={() => setOpen({})}>
          <Plus /> Ajukan koreksi
        </Button>
      </div>
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState icon={PenLine} title="Belum ada koreksi" />
      ) : (
        <ul className="space-y-3">
          {(list.data ?? []).map((row) => (
            <CorrectionCard key={row.id} row={row}>
              {row.canCancel ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    cancel.mutate(row.id, {
                      onSuccess: () => toast.success("Koreksi dibatalkan."),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  Batalkan
                </Button>
              ) : null}
            </CorrectionCard>
          ))}
        </ul>
      )}
      {open ? <CorrectionDialog workDate={open.workDate} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function CorrectionDialog({
  workDate: preset,
  onClose,
}: {
  workDate?: string | undefined;
  onClose: () => void;
}) {
  const { create } = useCorrectionActions();
  const [workDate, setWorkDate] = useState(preset ?? addDays(todayIn(), -1));
  const [checkIn, setCheckIn] = useState("07:00");
  const [checkOut, setCheckOut] = useState("19:00");
  const [reason, setReason] = useState("");
  const submit = () =>
    create.mutate(
      {
        workDate,
        reason,
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Koreksi dikirim ke Atasan & HR.");
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajukan koreksi absensi</DialogTitle>
          <DialogDescription>
            Jam mengikuti zona waktu jam shift (WITA). Jam pulang lebih kecil = keesokan hari.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cr-date">Tanggal kerja</Label>
            <Input
              id="cr-date"
              type="date"
              min={addDays(todayIn(), -CORRECTION_WINDOW_DAYS)}
              max={addDays(todayIn(), -1)}
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Paling lambat {CORRECTION_WINDOW_DAYS} hari setelah tanggal kerja.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cr-in">Jam masuk</Label>
              <Input
                id="cr-in"
                type="time"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-out">Jam pulang</Label>
              <Input
                id="cr-out"
                type="time"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-reason">Alasan</Label>
            <Textarea
              id="cr-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={create.isPending || reason.trim().length < 5 || (!checkIn && !checkOut)}
            onClick={submit}
          >
            Kirim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CorrectionInbox() {
  const list = useCorrections("inbox");
  const decide = useDecideApproval();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const run = (row: Correction, decision: "APPROVED" | "REJECTED") => {
    const approval = row.approval;
    if (!approval) return;
    const note = notes[row.id]?.trim() ?? "";
    const overrideOnly = !approval.canDecide && approval.canOverride;
    if ((decision === "REJECTED" || overrideOnly) && !note) {
      toast.error(
        decision === "REJECTED" ? "Tulis alasan penolakan." : "Tulis alasan pengambilalihan.",
      );
      return;
    }
    decide.mutate(
      { requestId: approval.id, decision, note: note || undefined },
      {
        onSuccess: () =>
          toast.success(decision === "APPROVED" ? "Koreksi disetujui." : "Koreksi ditolak."),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  if (list.isPending) return <Skeleton className="h-40" />;
  if ((list.data ?? []).length === 0)
    return <EmptyState icon={PenLine} title="Tidak ada koreksi yang perlu diputuskan" />;
  return (
    <ul className="space-y-3">
      {(list.data ?? []).map((row) => (
        <CorrectionCard key={row.id} row={row}>
          <Textarea
            rows={2}
            aria-label="Catatan keputusan"
            placeholder="Catatan (wajib bila ditolak)"
            value={notes[row.id] ?? ""}
            onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => run(row, "REJECTED")}
            >
              <X /> Tolak
            </Button>
            <Button
              size="sm"
              variant="brand"
              disabled={decide.isPending}
              onClick={() => run(row, "APPROVED")}
            >
              <Check /> Setujui
            </Button>
          </div>
        </CorrectionCard>
      ))}
    </ul>
  );
}

function MyStatements() {
  const list = useMyStatements();
  const [writing, setWriting] = useState<StatementRow | null>(null);
  if (list.isPending) return <Skeleton className="h-40" />;
  if ((list.data ?? []).length === 0)
    return <EmptyState icon={FileWarning} title="Tidak ada hari Alpha" />;
  return (
    <>
      <ul className="space-y-2">
        {(list.data ?? []).map((row) => (
          <li
            key={row.dayId}
            className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{workDateLabel(row.workDate)}</p>
              {row.statement ? (
                <p className="text-muted-foreground text-xs">
                  Pernyataan dibuat {formatDateTime(row.statement.createdAt)}: “
                  {row.statement.reason}”
                </p>
              ) : (
                <p className="text-destructive text-xs">Belum ada surat pernyataan.</p>
              )}
            </div>
            <Badge variant="destructive">Alpha</Badge>
            {!row.statement ? (
              <Button size="sm" variant="brand" onClick={() => setWriting(row)}>
                Buat pernyataan
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {writing ? <StatementDialog row={writing} onClose={() => setWriting(null)} /> : null}
    </>
  );
}

function StatementDialog({ row, onClose }: { row: StatementRow; onClose: () => void }) {
  const create = useCreateStatement();
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Surat Pernyataan Absensi · {workDateLabel(row.workDate)}</DialogTitle>
          <DialogDescription>
            Jelaskan alasan tidak hadir / tidak absen. Pernyataan ini dicatat untuk HR dan tidak
            mengubah status Alpha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Penjelasan"
          />
          <div className="space-y-1.5">
            <Label htmlFor="st-file">
              Lampiran <span className="text-muted-foreground font-normal">(opsional)</span>
            </Label>
            <Input
              id="st-file"
              type="file"
              accept={STATEMENT_ATTACHMENT_TYPES.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={create.isPending || reason.trim().length < 10}
            onClick={() =>
              create.mutate(
                { dayId: row.dayId, reason, file },
                {
                  onSuccess: () => {
                    toast.success("Surat pernyataan tersimpan.");
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

// ── HR: rekap, tutup periode, daftar ALPHA ─────────────────────────────────────

const RECAP_COLUMNS: { key: keyof Omit<RecapRow, "employee">; label: string }[] = [
  { key: "workDays", label: "Hari kerja" },
  { key: "present", label: "Hadir" },
  { key: "pending", label: "Menunggu" },
  { key: "rejected", label: "Ditolak" },
  { key: "noRecord", label: "Tanpa absen" },
  { key: "alpha", label: "Alpha" },
  { key: "expired", label: "Alpha permanen" },
  { key: "corrected", label: "Alpha dikoreksi" },
  { key: "leave", label: "Cuti/izin/sakit" },
  { key: "late", label: "Telat" },
  { key: "earlyLeave", label: "Pulang cepat" },
  { key: "outsideRoster", label: "Di luar roster" },
  { key: "statements", label: "Pernyataan" },
];

function downloadCsv(month: string, rows: RecapRow[]) {
  const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ["NIP", "Nama", ...RECAP_COLUMNS.map((c) => c.label)].map(quote).join(";"),
    ...rows.map((r) =>
      [r.employee.employeeNumber ?? "", r.employee.fullName, ...RECAP_COLUMNS.map((c) => r[c.key])]
        .map(quote)
        .join(";"),
    ),
  ];
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekap-absensi-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RecapPage() {
  // Tautan dari Data Absen Harian: ?tab=alpha langsung membuka daftar Alpha (peringatan & SP).
  const tabParam = new URLSearchParams(useLocation().search).get("tab");
  const { companies, companyId, setCompanyId } = useRosterCompany();
  const [month, setMonth] = useState(previousMonth);
  const recap = useRecap(companyId || undefined, month);
  const [closing, setClosing] = useState(false);
  const [person, setPerson] = useState<RecapRow | null>(null);
  const r = recap.data;
  return (
    <div>
      <PageHeader
        title="Rekap & Tutup Periode"
        description="Rekap kehadiran per bulan — klik nama karyawan untuk melihat absensinya per hari. Menutup periode mengubah hari kerja yang belum disetujui atau tanpa absen menjadi Alpha dan mengunci bulan itu."
        actions={
          <>
            <Button
              variant="outline"
              disabled={!r?.rows.length}
              onClick={() => r && downloadCsv(month, r.rows)}
            >
              <Download /> Unduh CSV
            </Button>
            {r?.canClose && r.period.status !== "CLOSED" ? (
              <Button variant="destructive" onClick={() => setClosing(true)}>
                <Lock /> Tutup periode
              </Button>
            ) : null}
          </>
        }
      />
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
          type="month"
          aria-label="Bulan"
          className="h-9 sm:w-44"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
        {r ? (
          r.period.status === "CLOSED" ? (
            <Badge variant="muted">
              <Lock className="size-3" /> Ditutup {formatDateTime(r.period.closedAt)}
            </Badge>
          ) : (
            <Badge variant="success">Periode terbuka</Badge>
          )
        ) : null}
      </div>
      <Tabs defaultValue={tabParam === "alpha" ? "alpha" : "recap"}>
        <TabsList>
          <TabsTrigger value="recap">Rekap</TabsTrigger>
          <TabsTrigger value="alpha">Alpha & pernyataan</TabsTrigger>
        </TabsList>
        <TabsContent value="recap" className="mt-4">
          {recap.isPending ? (
            <Skeleton className="h-80" />
          ) : recap.isError || !r ? (
            <EmptyState
              icon={Sheet}
              title="Gagal memuat rekap"
              description={errorMessage(recap.error)}
            />
          ) : r.rows.length === 0 ? (
            <EmptyState icon={Sheet} title="Tidak ada karyawan" />
          ) : (
            <div className="bg-card overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="bg-card sticky left-0 px-3 py-2 text-left font-medium">
                      Karyawan
                    </th>
                    {RECAP_COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className="px-2 py-2 text-right font-medium whitespace-nowrap"
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {r.rows.map((row) => (
                    <tr
                      key={row.employee.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => setPerson(row)}
                      title="Lihat absensi per hari"
                    >
                      <td className="bg-card sticky left-0 px-3 py-2">
                        <p className="font-medium whitespace-nowrap">{row.employee.fullName}</p>
                        <p className="text-muted-foreground font-mono text-xs">
                          {row.employee.employeeNumber ?? "—"}
                        </p>
                      </td>
                      {RECAP_COLUMNS.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-2 py-2 text-right tabular-nums",
                            row[c.key] === 0 && "text-muted-foreground",
                            (c.key === "alpha" || c.key === "noRecord" || c.key === "expired") &&
                              row[c.key] > 0 &&
                              "text-destructive font-medium",
                          )}
                        >
                          {row[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="alpha" className="mt-4">
          <AlphaList companyId={companyId} month={month} />
        </TabsContent>
      </Tabs>
      {person && companyId ? (
        <EmployeeRecapDialog
          row={person}
          companyId={companyId}
          month={month}
          onClose={() => setPerson(null)}
        />
      ) : null}
      {closing && companyId ? (
        <CloseDialog companyId={companyId} month={month} onClose={() => setClosing(false)} />
      ) : null}
    </div>
  );
}

function AlphaList({ companyId, month }: { companyId: string; month: string }) {
  const list = useStatements(companyId || undefined, month);
  if (list.isPending) return <Skeleton className="h-40" />;
  if (list.isError)
    return (
      <EmptyState icon={FileWarning} title="Gagal memuat" description={errorMessage(list.error)} />
    );
  if ((list.data ?? []).length === 0)
    return <EmptyState icon={FileWarning} title="Tidak ada hari Alpha bulan ini" />;
  return (
    <ul className="bg-card divide-y rounded-xl border text-sm">
      {(list.data ?? []).map((row) => (
        <li key={row.dayId} className="flex flex-wrap items-start gap-3 px-4 py-3">
          <span className="w-28 shrink-0 tabular-nums">{workDateLabel(row.workDate)}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{row.employee.fullName}</span>{" "}
            <span className="text-muted-foreground font-mono text-xs">
              {row.employee.employeeNumber ?? ""}
            </span>
            {row.statement ? (
              <span className="text-muted-foreground block text-xs">“{row.statement.reason}”</span>
            ) : (
              <span className="text-destructive block text-xs">Belum membuat surat pernyataan</span>
            )}
          </span>
          {row.statement?.attachmentUrl ? (
            <a
              href={row.statement.attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand inline-flex items-center gap-1 text-xs hover:underline"
            >
              <ExternalLink className="size-3" /> Lampiran
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CloseDialog({
  companyId,
  month,
  onClose,
}: {
  companyId: string;
  month: string;
  onClose: () => void;
}) {
  const { preview, close } = usePeriodClose();
  const [confirm, setConfirm] = useState("");
  const runPreview = preview.mutate;
  useEffect(() => {
    runPreview({ companyId, month });
  }, [companyId, month, runPreview]);
  const p = preview.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tutup periode {month}</DialogTitle>
          <DialogDescription>
            Tindakan ini tidak bisa dibatalkan dari aplikasi. Absen, roster, koreksi, dan cuti pada
            bulan ini akan terkunci.
          </DialogDescription>
        </DialogHeader>
        {preview.isPending ? (
          <Skeleton className="h-32" />
        ) : preview.isError ? (
          <p className="text-destructive text-sm">{errorMessage(preview.error)}</p>
        ) : p ? (
          <div className="space-y-3 text-sm">
            <p>
              <b>{p.alpha}</b> hari akan menjadi <b>Alpha</b>: {p.noAttendance} tanpa absen,{" "}
              {p.pending} belum disetujui, {p.rejected} ditolak.
            </p>
            {p.sample.length ? (
              <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-xs">
                {p.sample.map((s) => (
                  <li key={`${s.employee.id}-${s.date}`} className="flex gap-2 px-3 py-1.5">
                    <span className="w-24 tabular-nums">{workDateLabel(s.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{s.employee.fullName}</span>
                    <span className="text-muted-foreground">{s.status ?? "tanpa absen"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="close-confirm">
                Ketik <span className="font-mono">{month}</span> untuk konfirmasi
              </Label>
              <Input
                id="close-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={!p || confirm !== month || close.isPending}
            onClick={() =>
              close.mutate(
                { companyId, month },
                {
                  onSuccess: (result) => {
                    toast.success(`Periode ${month} ditutup; ${result.alpha} hari menjadi Alpha.`);
                    onClose();
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <Lock /> Tutup periode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rekap per karyawan: absensi harian satu orang dalam sebulan ─────────────────

function monthDates(month: string): string[] {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

function EmployeeRecapDialog({
  row,
  companyId,
  month,
  onClose,
}: {
  row: RecapRow;
  companyId: string;
  month: string;
  onClose: () => void;
}) {
  const TZ = useTimezone();
  const dates = monthDates(month);
  const from = dates[0] as string;
  const to = dates[dates.length - 1] as string;
  const days = useAttendanceDays({
    scope: "all",
    from,
    to,
    companyId,
    employeeId: row.employee.id,
  });
  const roster = useEmployeeRoster(row.employee.id, from, to);
  const dayByDate = new Map((days.data ?? []).map((d) => [d.workDate, d]));
  const rosterByDate = new Map((roster.data ?? []).map((r) => [r.date, r]));
  const today = todayIn();

  const download = () => {
    const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = [
      "Tanggal",
      "Shift",
      "Jadwal Masuk",
      "Jadwal Pulang",
      "Clock In",
      "Lat In",
      "Long In",
      "Alt In",
      "Clock Out",
      "Lat Out",
      "Long Out",
      "Alt Out",
      "Status",
      "Label",
    ];
    const lines = dates.map((date) => {
      const day = dayByDate.get(date);
      const r = rosterByDate.get(date);
      const p = (kind: "IN" | "OUT") => day?.punches.find((x) => x.kind === kind);
      const cells = (kind: "IN" | "OUT") => {
        const punch = p(kind);
        return [
          punch ? timeIn(punch.at, TZ) : "",
          punch?.latitude ?? "",
          punch?.longitude ?? "",
          punch?.altitudeM ?? "",
        ];
      };
      return [
        date,
        r?.code ?? "",
        r?.shift ? hhmm(r.shift.startMinute) : "",
        r?.shift ? hhmm(r.shift.endMinute) : "",
        ...cells("IN"),
        ...cells("OUT"),
        day?.status ?? (r?.shift && date < today ? "TANPA ABSEN" : ""),
        day?.labels.join(" ") ?? "",
      ]
        .map(quote)
        .join(";");
    });
    const blob = new Blob([`\uFEFF${[header.map(quote).join(";"), ...lines].join("\r\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absensi-${row.employee.employeeNumber ?? row.employee.id}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary: [string, number, string?][] = [
    ["Hari kerja", row.workDays],
    ["Hadir", row.present, "text-success"],
    ["Menunggu", row.pending],
    ["Ditolak", row.rejected, "text-destructive"],
    ["Tanpa absen", row.noRecord, "text-destructive"],
    ["Alpha", row.alpha, "text-destructive"],
    ["Cuti/izin/sakit", row.leave],
    ["Telat", row.late],
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[min(96vw,1400px)]">
        <DialogHeader>
          <DialogTitle>
            {row.employee.fullName}{" "}
            <span className="text-muted-foreground font-mono text-sm font-normal">
              {row.employee.employeeNumber ?? ""}
            </span>
          </DialogTitle>
          <DialogDescription>Absensi per hari · {month}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {summary.map(([label, value, tone]) => (
            <span key={label} className="bg-muted rounded-lg px-2.5 py-1 text-xs">
              {label} <b className={cn("tabular-nums", value > 0 && tone)}>{value}</b>
            </span>
          ))}
          <Button size="sm" variant="outline" className="ml-auto" onClick={download}>
            <Download /> Unduh CSV
          </Button>
        </div>
        {days.isPending || roster.isPending ? (
          <Skeleton className="h-96" />
        ) : days.isError ? (
          <p className="text-destructive text-sm">{errorMessage(days.error)}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  {[
                    "Tanggal",
                    "Jadwal",
                    "Clock In",
                    "Foto In",
                    "Lokasi In",
                    "Persetujuan In",
                    "Clock Out",
                    "Foto Out",
                    "Lokasi Out",
                    "Persetujuan Out",
                    "Status",
                  ].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {dates.map((date) => {
                  const day = dayByDate.get(date);
                  const r = rosterByDate.get(date);
                  const off = r && !r.shift;
                  return (
                    <tr key={date} className={cn(off && "bg-muted/30 text-muted-foreground")}>
                      <td className="px-2 py-2 whitespace-nowrap">{workDateLabel(date)}</td>
                      <td className="px-2 py-2 text-xs whitespace-nowrap tabular-nums">
                        {r?.shift
                          ? `${r.code} ${hhmm(r.shift.startMinute)}–${hhmm(r.shift.endMinute)}`
                          : (r?.code ?? "—")}
                      </td>
                      {(["IN", "OUT"] as const).map((kind) => {
                        const punch = day?.punches.find((x) => x.kind === kind);
                        return [
                          <td
                            key={`${kind}-t`}
                            className="px-2 py-2 font-semibold whitespace-nowrap tabular-nums"
                          >
                            {punch ? timeIn(punch.at, TZ) : "—"}
                            {punch?.source === "MANUAL" ? (
                              <Badge variant="muted" className="ml-1 text-[10px]">
                                Manual
                              </Badge>
                            ) : null}
                          </td>,
                          <td key={`${kind}-f`} className="px-2 py-2">
                            {punch ? <SelfieThumb punch={punch} /> : "—"}
                          </td>,
                          <td key={`${kind}-l`} className="px-2 py-2">
                            {punch && punch.latitude !== null && punch.longitude !== null ? (
                              <CoordLink
                                latitude={punch.latitude}
                                longitude={punch.longitude}
                                altitudeM={punch.altitudeM}
                              />
                            ) : (
                              "—"
                            )}
                          </td>,
                          <td key={`${kind}-a`} className="px-2 py-2">
                            {punch ? (
                              <div className="grid grid-cols-[auto_auto] items-center gap-x-1 gap-y-0.5 text-[10px]">
                                <span className="text-muted-foreground">Atasan</span>
                                <StepBadge approval={punch.approval} kind="MANAGER" />
                                <span className="text-muted-foreground">HR</span>
                                <StepBadge approval={punch.approval} kind="HR" />
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>,
                        ];
                      })}
                      <td className="px-2 py-2">
                        {day ? (
                          <div className="space-y-1">
                            <DayStatusBadge status={day.status} />
                            <LabelChips labels={day.labels} />
                          </div>
                        ) : r?.shift && date < today ? (
                          <Badge variant="destructive">Tanpa absen</Badge>
                        ) : off ? (
                          <span className="text-xs">Libur (OFF)</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
