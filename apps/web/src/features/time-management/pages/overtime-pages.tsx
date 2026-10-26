import {
  formatMinutes,
  OVERTIME_DAY_TYPE_LABELS,
  OVERTIME_FLAG_TEXT,
  OVERTIME_FORMULA_LABELS,
  OVERTIME_STATUS_LABELS,
} from "@hris/shared";
import { Check, Coffee, Eye, Inbox, Pencil, Timer, Wallet, X } from "lucide-react";
import { useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { errorMessage } from "@/lib/errors";
import { formatRupiah } from "@/lib/format";
import { tmAccess } from "../access";
import { useDecideApproval, useTimezone } from "../api";
import { StepBadge, timeIn, todayIn, workDateLabel } from "../components/display";
import { RefreshButton } from "../components/refresh-button";
import {
  type GradeWage,
  type Overtime,
  useBreakLocations,
  useGradeWages,
  useOvertimeList,
  useOvertimeSummary,
  useSetBreakLocations,
  useSetGradeWage,
} from "../overtime-api";
import { useRosterCompany } from "./roster-page";

// TM-D6 — lembur: usulan otomatis dari absen vs jadwal (kelebihan − telat − istirahat lebih; ≥ 60 menit,
// bulat ke atas per 30 menit), diputuskan Atasan + HR. Rupiah hanya untuk SA / HR ber-grant "Biaya";
// atasan melihat total rupiah tim di rekap.

type Tab = "inbox" | "all" | "me" | "summary";

const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: last };
};

export function OvertimePage() {
  const me = useMe().data as Me;
  const decider = tmAccess.decideOvertime(me);
  const { companies, companyId, setCompanyId } = useRosterCompany();
  const [tab, setTab] = useState<Tab>(decider ? "inbox" : "me");
  const [month, setMonth] = useState(() => todayIn().slice(0, 7));
  const range = monthRange(month);
  const company = companies.length > 1 ? companyId : undefined;
  const list = useOvertimeList(
    {
      scope: tab === "summary" ? "all" : tab,
      ...range,
      ...(company ? { companyId: company } : {}),
    },
    tab !== "summary",
  );
  const summary = useOvertimeSummary(month, company ?? "", tab === "summary");
  const [open, setOpen] = useState<Overtime | null>(null);

  return (
    <div>
      <PageHeader
        title="Lembur"
        description="Usulan lembur dibuat otomatis dari absen: kelebihan jam di luar jadwal dikurangi telat & istirahat lebih, diakui bila ≥ 60 menit lalu dibulatkan ke atas per 30 menit. Disetujui Atasan dan HR."
        actions={
          <div className="flex items-center gap-2">
            {companies.length > 1 && decider ? (
              <FormSelect
                aria-label="Perusahaan"
                className="h-9 w-56"
                value={companyId}
                onChange={setCompanyId}
                placeholder="Perusahaan"
                options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
              />
            ) : null}
            {decider ? <RefreshButton /> : null}
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {decider ? <TabsTrigger value="inbox">Perlu keputusan</TabsTrigger> : null}
            {decider ? <TabsTrigger value="all">Semua</TabsTrigger> : null}
            {me.employeeId ? <TabsTrigger value="me">Lembur saya</TabsTrigger> : null}
            {decider ? <TabsTrigger value="summary">Rekap bulanan</TabsTrigger> : null}
          </TabsList>
        </Tabs>
        {tab !== "inbox" ? (
          <Input
            type="month"
            aria-label="Bulan"
            className="h-9 w-44"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        ) : null}
      </div>

      {tab === "summary" ? (
        <SummaryView query={summary} />
      ) : list.isPending ? (
        <Skeleton className="h-60" />
      ) : list.isError ? (
        <EmptyState icon={Inbox} title="Gagal memuat" description={errorMessage(list.error)} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          icon={Timer}
          title={tab === "inbox" ? "Tidak ada lembur yang perlu diputuskan" : "Belum ada lembur"}
          description="Usulan muncul setelah Clock Out bila kelebihan jam efektif minimal 60 menit."
        />
      ) : (
        <OvertimeTable rows={list.data ?? []} showSteps={tab !== "me"} onOpen={setOpen} />
      )}
      {open ? <OvertimeDialog row={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function DayTypeBadge({ row }: { row: Overtime }) {
  const variant =
    row.dayType === "HOLIDAY" ? "destructive" : row.dayType === "OFF_DAY" ? "warning" : "muted";
  return <Badge variant={variant}>{OVERTIME_DAY_TYPE_LABELS[row.dayType]}</Badge>;
}

function FlagBadges({ row }: { row: Overtime }) {
  if (row.flags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {row.flags.map((f) => (
        <Badge key={f} variant="destructive">
          {OVERTIME_FLAG_TEXT[f]}
        </Badge>
      ))}
    </div>
  );
}

function OvertimeTable({
  rows,
  showSteps,
  onOpen,
}: {
  rows: Overtime[];
  showSteps: boolean;
  onOpen: (row: Overtime) => void;
}) {
  const tz = useTimezone();
  const decide = useDecideApproval();
  const showPay = rows.some((r) => r.pay !== null);
  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground border-b text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Karyawan</th>
            <th className="px-3 py-2 text-left font-medium">Tanggal</th>
            <th className="px-3 py-2 text-left font-medium">Absen</th>
            <th className="px-3 py-2 text-right font-medium">Kelebihan</th>
            <th className="px-3 py-2 text-right font-medium">Utang menit</th>
            <th className="px-3 py-2 text-right font-medium">Diusulkan</th>
            <th className="px-3 py-2 text-right font-medium">Jam setara</th>
            {showPay ? <th className="px-3 py-2 text-right font-medium">Rupiah</th> : null}
            {showSteps ? (
              <>
                <th className="px-3 py-2 text-center font-medium">Atasan</th>
                <th className="px-3 py-2 text-center font-medium">HRD</th>
              </>
            ) : (
              <th className="px-3 py-2 text-left font-medium">Status</th>
            )}
            <th className="px-3 py-2 text-right font-medium">Kontrol</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const a = r.approval;
            const quick = a?.status === "PENDING" && a.canDecide && r.flags.length === 0;
            return (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-3 py-2">
                  <p className="font-medium whitespace-nowrap">{r.employee.fullName}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {r.employee.employeeNumber ?? "—"}
                  </p>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <p>{workDateLabel(r.workDate)}</p>
                  <DayTypeBadge row={r} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {timeIn(r.checkIn, tz)}–{timeIn(r.checkOut, tz)}
                  {r.shiftCode ? (
                    <span className="text-muted-foreground block text-xs">shift {r.shiftCode}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {formatMinutes(r.rawMin)}
                  {r.earlyMin ? (
                    <span className="text-muted-foreground block text-xs">
                      datang awal {formatMinutes(r.earlyMin)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {r.debtMin ? formatMinutes(r.debtMin) : "—"}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  <span className="font-semibold">{formatMinutes(r.proposedMin)}</span>
                  {r.regularMin ? (
                    <span className="text-muted-foreground block text-xs">
                      + rutin {formatMinutes(r.regularMin)}
                    </span>
                  ) : null}
                  <FlagBadges row={r} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.equivalentHours}</td>
                {showPay ? (
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {r.pay === null ? "—" : formatRupiah(r.pay)}
                  </td>
                ) : null}
                {showSteps ? (
                  <>
                    <td className="px-3 py-2 text-center">
                      <StepBadge approval={a} kind="MANAGER" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StepBadge approval={a} kind="HR" />
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        r.status === "APPROVED"
                          ? "success"
                          : r.status === "REJECTED"
                            ? "destructive"
                            : "muted"
                      }
                    >
                      {OVERTIME_STATUS_LABELS[r.status]}
                    </Badge>
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {quick ? (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="text-success"
                        aria-label="Setujui"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate(
                            { requestId: a.id, decision: "APPROVED" },
                            {
                              onSuccess: () => toast.success(`${r.employee.fullName}: disetujui.`),
                              onError: (e) => toast.error(errorMessage(e)),
                            },
                          )
                        }
                      >
                        <Check />
                      </Button>
                    ) : null}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Detail"
                      onClick={() => onOpen(r)}
                    >
                      <Eye />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OvertimeDialog({ row, onClose }: { row: Overtime; onClose: () => void }) {
  const tz = useTimezone();
  const decide = useDecideApproval();
  const [note, setNote] = useState("");
  const a = row.approval;
  const canAct = a?.status === "PENDING" && (a.canDecide || a.canOverride);
  const overrideOnly = Boolean(a && !a.canDecide && a.canOverride);
  const needNote = row.flags.length > 0 || overrideOnly;
  const run = (decision: "APPROVED" | "REJECTED") => {
    if (!a) return;
    if ((decision === "REJECTED" || needNote) && !note.trim()) {
      toast.error(
        decision === "REJECTED"
          ? "Tulis alasan penolakan."
          : row.flags.length > 0
            ? "Lembur melewati batas PP 35/2021 — tulis alasan persetujuan."
            : "Tulis alasan pengambilalihan.",
      );
      return;
    }
    decide.mutate(
      { requestId: a.id, decision, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(decision === "APPROVED" ? "Lembur disetujui." : "Lembur ditolak.");
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  const line = (label: string, value: string) => (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Lembur {row.employee.fullName} · {workDateLabel(row.workDate)}
          </DialogTitle>
          <DialogDescription>
            {OVERTIME_DAY_TYPE_LABELS[row.dayType]} · {OVERTIME_FORMULA_LABELS[row.formula]} · absen{" "}
            {timeIn(row.checkIn, tz)}–{timeIn(row.checkOut, tz)}
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y text-sm">
          {line("Kelebihan jam di luar jadwal", formatMinutes(row.rawMin))}
          {row.earlyMin ? line("  termasuk datang awal", formatMinutes(row.earlyMin)) : null}
          {line(
            "Utang menit (telat + istirahat lebih)",
            row.debtMin ? `− ${formatMinutes(row.debtMin)}` : "—",
          )}
          {row.regularMin
            ? line("Lembur rutin (ikut approval absen)", formatMinutes(row.regularMin))
            : null}
          {line("Lembur tambahan diusulkan", formatMinutes(row.proposedMin))}
          {line("Jam setara", `${row.equivalentHours} jam`)}
          {row.pay !== null ? line("Rupiah", formatRupiah(row.pay)) : null}
        </dl>
        <FlagBadges row={row} />
        {canAct ? (
          <div className="space-y-2">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={needNote ? "Alasan (wajib)" : "Catatan (wajib bila ditolak)"}
              aria-label="Catatan keputusan"
            />
            <DialogFooter>
              <Button variant="outline" disabled={decide.isPending} onClick={() => run("REJECTED")}>
                <X /> Tolak
              </Button>
              <Button variant="brand" disabled={decide.isPending} onClick={() => run("APPROVED")}>
                <Check /> Setujui
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Status: {OVERTIME_STATUS_LABELS[row.status]}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryView({ query }: { query: ReturnType<typeof useOvertimeSummary> }) {
  if (query.isPending) return <Skeleton className="h-60" />;
  if (query.isError || !query.data) {
    return <EmptyState icon={Inbox} title="Gagal memuat" description={errorMessage(query.error)} />;
  }
  const s = query.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Lembur rutin (hari disetujui)" value={formatMinutes(s.totals.regularMin)} />
        <Stat label="Lembur tambahan disetujui" value={formatMinutes(s.totals.approvedMin)} />
        <Stat label="Menunggu keputusan" value={formatMinutes(s.totals.pendingMin)} />
        <Stat
          label={s.showPay ? "Total rupiah" : "Total rupiah tim"}
          value={
            s.totals.pay === null
              ? `${s.totals.totalEquivalentHours} jam setara`
              : formatRupiah(s.totals.pay)
          }
          hint={s.totals.pay === null ? undefined : `${s.totals.totalEquivalentHours} jam setara`}
        />
      </div>
      {s.rows.length === 0 ? (
        <EmptyState icon={Timer} title="Belum ada lembur bulan ini" />
      ) : (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Karyawan</th>
                <th className="px-3 py-2 text-right font-medium">Lembur rutin</th>
                <th className="px-3 py-2 text-right font-medium">Tambahan disetujui</th>
                <th className="px-3 py-2 text-right font-medium">Menunggu</th>
                <th className="px-3 py-2 text-right font-medium">Jam setara</th>
                {s.showPay ? <th className="px-3 py-2 text-right font-medium">Rupiah</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {s.rows.map((r) => (
                <tr key={r.employee.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.employee.fullName}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {r.employee.employeeNumber ?? "—"}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMinutes(r.regularMin)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMinutes(r.approvedMin)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.pendingMin ? formatMinutes(r.pendingMin) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totalEquivalentHours}</td>
                  {s.showPay ? (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.pay === null ? (
                        <span
                          className="text-muted-foreground text-xs"
                          title="Grade karyawan belum punya upah grade"
                        >
                          upah grade belum diisi
                        </span>
                      ) : (
                        formatRupiah(r.pay)
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

// ── Upah grade (TM-D6) ─────────────────────────────────────────────────────────

export function GradeWagesPage() {
  const me = useMe().data as Me;
  const manage = tmAccess.manageGradeWages(me);
  const wages = useGradeWages();
  const [editing, setEditing] = useState<GradeWage | null>(null);
  return (
    <div>
      <PageHeader
        title="Upah Grade"
        description="Upah pokok + tunjangan tetap per grade untuk estimasi rupiah lembur (÷ 173 per jam), kompensasi, dan labor cost. Bukan gaji per orang. Diubah SA; dilihat SA & HR ber-izin Biaya."
      />
      {wages.isPending ? (
        <Skeleton className="h-60" />
      ) : wages.isError ? (
        <EmptyState icon={Wallet} title="Gagal memuat" description={errorMessage(wages.error)} />
      ) : (wages.data ?? []).length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Belum ada grade"
          description="Tambahkan grade di Master Data."
        />
      ) : (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Grade</th>
                <th className="px-3 py-2 text-right font-medium">Upah pokok</th>
                <th className="px-3 py-2 text-right font-medium">Tunjangan tetap</th>
                <th className="px-3 py-2 text-right font-medium">Upah sejam</th>
                {manage ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(wages.data ?? []).map((g) => (
                <tr key={g.gradeId}>
                  <td className="px-3 py-2 font-medium">{g.gradeName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.basePay === null ? "—" : formatRupiah(g.basePay)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.fixedAllowance === null ? "—" : formatRupiah(g.fixedAllowance)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.hourly === null ? "—" : formatRupiah(g.hourly)}
                  </td>
                  {manage ? (
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Ubah ${g.gradeName}`}
                        onClick={() => setEditing(g)}
                      >
                        <Pencil />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? <GradeWageDialog grade={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function GradeWageDialog({ grade, onClose }: { grade: GradeWage; onClose: () => void }) {
  const save = useSetGradeWage();
  const [basePay, setBasePay] = useState(String(grade.basePay ?? ""));
  const [allowance, setAllowance] = useState(String(grade.fixedAllowance ?? 0));
  const base = Number(basePay) || 0;
  const fixed = Number(allowance) || 0;
  const submit = () =>
    save.mutate(
      { gradeId: grade.gradeId, basePay: base, fixedAllowance: fixed },
      {
        onSuccess: () => {
          toast.success(`Upah grade ${grade.gradeName} disimpan.`);
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Upah grade {grade.gradeName}</DialogTitle>
          <DialogDescription>Upah sejam = (pokok + tunjangan tetap) ÷ 173.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="wage-base">Upah pokok / bulan</Label>
            <Input
              id="wage-base"
              type="number"
              min={0}
              value={basePay}
              onChange={(e) => setBasePay(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wage-allowance">Tunjangan tetap / bulan</Label>
            <Input
              id="wage-allowance"
              type="number"
              min={0}
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            Upah sejam:{" "}
            <span className="font-medium">{formatRupiah(Math.round((base + fixed) / 173))}</span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant="brand" disabled={save.isPending || base <= 0} onClick={submit}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Lokasi wajib absen istirahat (TM-D7) ───────────────────────────────────────

export function BreakLocationsCard() {
  const query = useBreakLocations();
  const save = useSetBreakLocations();
  const [editing, setEditing] = useState<Set<string> | null>(null);
  const locations = query.data?.locations ?? [];
  const required = locations.filter((l) => l.required);
  return (
    <section className="bg-card mb-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <Coffee className="size-4" /> Wajib absen istirahat
          </p>
          <p className="text-muted-foreground text-xs">
            Karyawan yang absen di lokasi ini wajib Mulai & Selesai istirahat (selfie + GPS).
            Istirahat lebih dari jatah shift diberi peringatan & mengurangi lembur hari itu.
          </p>
          <p className="mt-1 text-sm">
            {query.isPending
              ? "Memuat…"
              : required.length === 0
                ? "Belum ada lokasi."
                : required.map((l) => l.name).join(", ")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!query.data}
          onClick={() => setEditing(new Set(required.map((l) => l.id)))}
        >
          <Pencil /> Ubah
        </Button>
      </div>
      {editing ? (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Lokasi wajib absen istirahat</DialogTitle>
              <DialogDescription>
                Centang lokasi kerja yang karyawannya wajib absen istirahat.
              </DialogDescription>
            </DialogHeader>
            <ul className="divide-y rounded-lg border">
              {locations.map((l) => (
                <li key={l.id}>
                  <label className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={editing.has(l.id)}
                      onChange={(e) => {
                        const next = new Set(editing);
                        if (e.target.checked) next.add(l.id);
                        else next.delete(l.id);
                        setEditing(next);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      {l.name}
                      {l.city ? <span className="text-muted-foreground"> · {l.city}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button
                variant="brand"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(
                    { workLocationIds: [...editing] },
                    {
                      onSuccess: () => {
                        toast.success("Lokasi wajib absen istirahat disimpan.");
                        setEditing(null);
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
      ) : null}
    </section>
  );
}
