import {
  ATTENDANCE_DAY_STATUS_LABELS,
  ATTENDANCE_DAY_STATUSES,
  DEFAULT_TIME_SETTINGS,
  MAX_BULK_DECISIONS,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import {
  Check,
  ClipboardCheck,
  ExternalLink,
  Eye,
  ImageOff,
  PenLine,
  SearchX,
  X,
} from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
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
import { useCompanyScope, useEmployees } from "@/features/employee/api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import {
  useAttendanceDay,
  useAttendanceDays,
  useDecideApproval,
  useDecideBulk,
  useManualPunch,
  useTimeSettings,
} from "../api";
import {
  ApprovalSteps,
  addDays,
  CoordLink,
  DayStatusBadge,
  LabelChips,
  StepBadge,
  timeIn,
  todayIn,
  workDateLabel,
} from "../components/display";
import { SelfieThumb } from "../components/selfie-thumb";
import type { Approval, AttendanceDay } from "../schemas";

// D-068 / D-073: Data Absen Harian. Setiap absen (masuk & pulang) disetujui sendiri-sendiri oleh Atasan
// (tim) DAN HR (PT ditugaskan); hari disetujui bila keduanya disetujui. SA dapat mengambil alih dengan
// alasan. HR/SA dapat memasukkan / memperbaiki jam absen secara manual (autentikasi manual).

const column = createColumnHelper<typeof tableFeaturesNone, AttendanceDay>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<AttendanceDay>;

const KINDS = ["IN", "OUT"] as const;
const KIND_TEXT = { IN: "Clock In", OUT: "Clock Out" } as const;

const isDecidable = (a: Approval | null | undefined): a is Approval =>
  a?.status === "PENDING" && (a.canDecide || a.canOverride);
/** Approval yang bisa diputuskan aktor pada satu hari: tiap absen + approval hari model lama. */
const decidableApprovals = (day: AttendanceDay): Approval[] => [
  ...day.punches.map((p) => p.approval).filter(isDecidable),
  ...(isDecidable(day.approval) ? [day.approval] : []),
];
const punchOf = (day: AttendanceDay, kind: "IN" | "OUT") =>
  day.punches.find((p) => p.kind === kind);

export function AttendanceDaysPage() {
  const me = useMe().data as Me;
  const scope = useCompanyScope();
  const settings = useTimeSettings();
  const tz = settings.data?.timezone ?? DEFAULT_TIME_SETTINGS.timezone;
  const [params, setParams] = useSearchParams();
  const openId = params.get("id");
  const tab = params.get("tab") === "all" ? "all" : "inbox";
  const today = todayIn(tz);
  const [from, setFrom] = useState(addDays(today, -14));
  const [to, setTo] = useState(today);
  const [labeledOnly, setLabeledOnly] = useState(false);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const canManual = tmAccess.manageRoster(me);

  const list = useAttendanceDays({
    scope: tab,
    from,
    to,
    companyId: scope.selectedId,
    labeledOnly,
    status: tab === "all" ? status || undefined : undefined,
  });
  const rows = list.data ?? [];
  const selectable = rows.filter((d) => decidableApprovals(d).length > 0);
  const selectedRows = selectable.filter((d) => selected.has(d.id));

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      }),
    [setParams],
  );
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allChecked = selectable.length > 0 && selectedRows.length === selectable.length;
  const columns = useMemo<DataColumn<AttendanceDay>[]>(
    () => [
      col({
        id: "select",
        header: () =>
          tab === "inbox" ? (
            <input
              type="checkbox"
              aria-label="Pilih semua"
              className="accent-brand size-4"
              checked={allChecked}
              onChange={() =>
                setSelected(allChecked ? new Set() : new Set(selectable.map((d) => d.id)))
              }
            />
          ) : null,
        cell: ({ row }) =>
          tab === "inbox" && decidableApprovals(row.original).length > 0 ? (
            <input
              type="checkbox"
              aria-label={`Pilih ${row.original.employee.fullName}`}
              className="accent-brand size-4"
              checked={selected.has(row.original.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggle(row.original.id)}
            />
          ) : null,
        meta: { className: "w-10" },
      }),
      col({
        id: "employee",
        header: "Karyawan",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.employee.fullName}</p>
            <p className="text-muted-foreground font-mono text-xs">
              {row.original.employee.employeeNumber ?? "—"}
            </p>
          </div>
        ),
      }),
      col({
        id: "date",
        header: "Tanggal",
        cell: ({ row }) => (
          <div className="text-sm whitespace-nowrap">
            <p className="font-medium">{workDateLabel(row.original.workDate)}</p>
            <p className="text-muted-foreground text-xs">
              {row.original.shiftCode ?? "Tanpa jadwal"}
            </p>
          </div>
        ),
      }),
      col({
        id: "sched-in",
        header: "Jadwal Masuk",
        cell: ({ row }) => <TimeText iso={row.original.scheduledStart} tz={tz} muted />,
      }),
      col({
        id: "sched-out",
        header: "Jadwal Pulang",
        cell: ({ row }) => <TimeText iso={row.original.scheduledEnd} tz={tz} muted />,
      }),
      ...KINDS.map((kind) =>
        col({
          id: `time-${kind}`,
          header: KIND_TEXT[kind],
          cell: ({ row }) => {
            const punch = punchOf(row.original, kind);
            return (
              <div className="space-y-0.5">
                <TimeText iso={punch?.at ?? null} tz={tz} />
                {punch?.source === "MANUAL" ? (
                  <Badge variant="muted" className="text-[10px]">
                    Manual
                  </Badge>
                ) : null}
              </div>
            );
          },
        }),
      ),
      ...KINDS.map((kind) =>
        col({
          id: `photo-${kind}`,
          header: `Foto ${KIND_TEXT[kind]}`,
          cell: ({ row }) => {
            const punch = punchOf(row.original, kind);
            return punch ? <SelfieThumb punch={punch} /> : <Dash />;
          },
        }),
      ),
      ...KINDS.map((kind) =>
        col({
          id: `coord-${kind}`,
          header: `Lokasi ${KIND_TEXT[kind]}`,
          cell: ({ row }) => {
            const punch = punchOf(row.original, kind);
            if (!punch || punch.latitude === null || punch.longitude === null) return <Dash />;
            return (
              <div className="space-y-0.5">
                <CoordLink
                  latitude={punch.latitude}
                  longitude={punch.longitude}
                  altitudeM={punch.altitudeM}
                />
                <p
                  className={cn(
                    "text-[10px]",
                    punch.insideGeofence ? "text-success" : "text-destructive",
                  )}
                >
                  {punch.insideGeofence ? "dalam" : "luar"} radius
                  {punch.distanceM !== null ? ` · ${punch.distanceM} m` : ""}
                </p>
              </div>
            );
          },
        }),
      ),
      ...KINDS.map((kind) =>
        col({
          id: `approval-${kind}`,
          header: `Persetujuan ${kind === "IN" ? "In" : "Out"}`,
          cell: ({ row }) => (
            <PunchDecision
              day={row.original}
              kind={kind}
              onOpen={() => setParam("id", row.original.id)}
            />
          ),
        }),
      ),
      col({
        id: "labels",
        header: "Label",
        cell: ({ row }) =>
          row.original.labels.length ? (
            <LabelChips labels={row.original.labels} />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      }),
      col({
        id: "status",
        header: "Status hari",
        cell: ({ row }) => <DayStatusBadge status={row.original.status} />,
      }),
      col({
        id: "action",
        header: () => <span className="sr-only">Detail</span>,
        cell: ({ row }) => (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Detail"
            onClick={(e) => {
              e.stopPropagation();
              setParam("id", row.original.id);
            }}
          >
            <Eye />
          </Button>
        ),
      }),
    ],
    [tab, allChecked, selectable, selected, toggle, tz, setParam],
  );

  return (
    <div>
      <PageHeader
        title="Data Absen Harian"
        description="Clock In dan Clock Out disetujui satu per satu oleh Atasan dan HR. Label tidak memblokir absen — periksa foto, lokasi, dan alasan sebelum memutuskan."
        actions={
          canManual ? (
            <Button variant="outline" onClick={() => setManualOpen(true)}>
              <PenLine /> Input manual
            </Button>
          ) : null
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setSelected(new Set());
          setParam("tab", value === "all" ? "all" : null);
        }}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="inbox">Perlu keputusan</TabsTrigger>
          <TabsTrigger value="all">Semua</TabsTrigger>
        </TabsList>
      </Tabs>
      <ListPanel
        toolbar={
          <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="Dari tanggal"
                className="h-9 w-40"
                value={from}
                max={to}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
              />
              <span className="text-muted-foreground text-xs">s/d</span>
              <Input
                type="date"
                aria-label="Sampai tanggal"
                className="h-9 w-40"
                value={to}
                min={from}
                onChange={(e) => e.target.value && setTo(e.target.value)}
              />
            </div>
            {tab === "all" ? (
              <FormSelect
                aria-label="Status"
                className="h-9 lg:w-56"
                value={status}
                onChange={setStatus}
                placeholder="Semua status"
                noneLabel="Semua status"
                options={ATTENDANCE_DAY_STATUSES.map((s) => ({
                  value: s,
                  label: ATTENDANCE_DAY_STATUS_LABELS[s],
                }))}
              />
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-brand size-4"
                checked={labeledOnly}
                onChange={(e) => setLabeledOnly(e.target.checked)}
              />
              Hanya yang berlabel
            </label>
            {tab === "inbox" && selectedRows.length > 0 ? (
              <div className="flex items-center gap-2 lg:ml-auto">
                <span className="text-muted-foreground text-xs">
                  {selectedRows.length} hari dipilih
                </span>
                <Button size="sm" variant="outline" onClick={() => setBulk("REJECTED")}>
                  <X /> Tolak
                </Button>
                <Button size="sm" variant="brand" onClick={() => setBulk("APPROVED")}>
                  <Check /> Setujui
                </Button>
              </div>
            ) : null}
          </div>
        }
      >
        <DataTable
          label="Daftar hari absen"
          columns={columns}
          data={rows}
          loading={list.isPending}
          fetching={list.isFetching}
          onRowClick={(row) => setParam("id", row.id)}
          empty={
            list.isError
              ? {
                  icon: SearchX,
                  title: "Gagal memuat data absen",
                  description: errorMessage(list.error),
                }
              : {
                  icon: ClipboardCheck,
                  title:
                    tab === "inbox" ? "Tidak ada yang perlu diputuskan" : "Belum ada data absen",
                }
          }
        />
      </ListPanel>
      <BulkDialog
        decision={bulk}
        rows={selectedRows}
        onClose={(done) => {
          setBulk(null);
          if (done) setSelected(new Set());
        }}
      />
      <DayDialog id={openId} tz={tz} canManual={canManual} onClose={() => setParam("id", null)} />
      {manualOpen ? <ManualDialog tz={tz} onClose={() => setManualOpen(false)} /> : null}
    </div>
  );
}

const Dash = () => <span className="text-muted-foreground text-xs">—</span>;

function TimeText({ iso, tz, muted }: { iso: string | null; tz: string; muted?: boolean }) {
  if (!iso) return <Dash />;
  return (
    <span
      className={cn(
        "text-sm whitespace-nowrap tabular-nums",
        muted ? "text-muted-foreground" : "font-semibold",
      )}
    >
      {timeIn(iso, tz)}
    </span>
  );
}

/** Badge Atasan/HR satu absen + setujui/tolak cepat. */
function PunchDecision({
  day,
  kind,
  onOpen,
}: {
  day: AttendanceDay;
  kind: "IN" | "OUT";
  onOpen: () => void;
}) {
  const punch = punchOf(day, kind);
  const decide = useDecideApproval();
  if (!punch) return <Dash />;
  const approval = punch.approval;
  const quick = approval?.status === "PENDING" && approval.canDecide;
  return (
    <div className="min-w-32 space-y-1">
      <div className="grid grid-cols-[auto_auto] items-center gap-x-1.5 gap-y-1 text-[10px]">
        <span className="text-muted-foreground">Atasan</span>
        <StepBadge approval={approval} kind="MANAGER" />
        <span className="text-muted-foreground">HR</span>
        <StepBadge approval={approval} kind="HR" />
      </div>
      {quick ? (
        <div className="flex gap-1">
          <Button
            size="icon-xs"
            variant="outline"
            className="text-success"
            aria-label={`Setujui ${KIND_TEXT[kind]}`}
            disabled={decide.isPending}
            onClick={(e) => {
              e.stopPropagation();
              decide.mutate(
                { requestId: approval.id, decision: "APPROVED" },
                {
                  onSuccess: () =>
                    toast.success(`${KIND_TEXT[kind]} ${day.employee.fullName} disetujui.`),
                  onError: (err) => toast.error(errorMessage(err)),
                },
              );
            }}
          >
            <Check />
          </Button>
          <Button
            size="icon-xs"
            variant="outline"
            className="text-destructive"
            aria-label={`Tolak ${KIND_TEXT[kind]}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            <X />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BulkDialog({
  decision,
  rows,
  onClose,
}: {
  decision: "APPROVED" | "REJECTED" | null;
  rows: AttendanceDay[];
  onClose: (done: boolean) => void;
}) {
  const decide = useDecideBulk();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const approvals = rows.flatMap(decidableApprovals);
  const overrides = approvals.filter((a) => !a.canDecide).length;
  const noteRequired = decision === "REJECTED" || overrides > 0;
  const run = async () => {
    if (!decision) return;
    if (noteRequired && !note.trim()) {
      setError(
        decision === "REJECTED" ? "Tulis alasan penolakan." : "Tulis alasan pengambilalihan.",
      );
      return;
    }
    const ids = approvals.map((a) => a.id);
    try {
      let failed = 0;
      for (let i = 0; i < ids.length; i += MAX_BULK_DECISIONS) {
        const result = await decide.mutateAsync({
          requestIds: ids.slice(i, i + MAX_BULK_DECISIONS),
          decision,
          note: note.trim() || undefined,
        });
        failed += result.filter((r) => r.error).length;
      }
      const ok = ids.length - failed;
      if (failed > 0)
        toast.warning(`${ok} absen diputuskan, ${failed} gagal (sudah diputuskan / tanpa hak).`);
      else toast.success(`${ok} absen ${decision === "APPROVED" ? "disetujui" : "ditolak"}.`);
      setNote("");
      setError("");
      onClose(true);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === "APPROVED" ? "Setujui" : "Tolak"} {approvals.length} absen ({rows.length}{" "}
            hari)
          </DialogTitle>
          <DialogDescription>
            Setiap Clock In / Clock Out yang menunggu keputusan Anda pada hari terpilih.
            {overrides > 0
              ? ` ${overrides} diputuskan sebagai pengambilalihan (alasan wajib).`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulk-note">
            Catatan{" "}
            {noteRequired ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-muted-foreground font-normal">(opsional)</span>
            )}
          </Label>
          <Textarea
            id="bulk-note"
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError("");
            }}
            aria-invalid={Boolean(error)}
          />
          {error ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Batal
          </Button>
          <Button
            variant={decision === "REJECTED" ? "destructive" : "brand"}
            disabled={decide.isPending}
            onClick={() => void run()}
          >
            {decide.isPending ? "Memproses…" : decision === "APPROVED" ? "Setujui" : "Tolak"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Panel satu absen di detail: foto, lokasi, label, alasan, approval & keputusan per absen. */
function PunchPanel({
  day,
  kind,
  tz,
  canManual,
  onManual,
}: {
  day: AttendanceDay;
  kind: "IN" | "OUT";
  tz: string;
  canManual: boolean;
  onManual: () => void;
}) {
  const punch = punchOf(day, kind);
  const decide = useDecideApproval();
  const [note, setNote] = useState("");
  const approval = punch?.approval ?? null;
  const canAct = isDecidable(approval);
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
        onSuccess: () => {
          toast.success(`${KIND_TEXT[kind]} ${decision === "APPROVED" ? "disetujui" : "ditolak"}.`);
          setNote("");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  if (!punch) {
    return (
      <div className="text-muted-foreground space-y-2 rounded-xl border border-dashed p-4 text-sm">
        <p>{KIND_TEXT[kind]}: belum ada.</p>
        {canManual ? (
          <Button size="sm" variant="outline" onClick={onManual}>
            <PenLine /> Input manual
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {KIND_TEXT[kind]} · <span className="tabular-nums">{timeIn(punch.at, tz)}</span>
        </p>
        {punch.source === "MANUAL" ? <Badge variant="muted">Input manual</Badge> : null}
      </div>
      <div className="bg-muted aspect-[3/4] overflow-hidden rounded-lg">
        {punch.selfieUrl ? (
          <img
            src={punch.selfieUrl}
            alt={`Selfie ${KIND_TEXT[kind]}`}
            className="size-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground grid size-full place-items-center gap-1 p-4 text-center text-xs">
            <ImageOff className="size-5" />
            {punch.source === "MANUAL"
              ? "Dimasukkan manual oleh HR/SA (tanpa foto)."
              : punch.selfiePurged
                ? "Foto sudah dihapus (masa simpan habis)."
                : "Foto tidak tersedia."}
          </div>
        )}
      </div>
      {punch.latitude !== null && punch.longitude !== null ? (
        <>
          <p
            className={cn(
              "text-xs",
              punch.insideGeofence ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {punch.insideGeofence ? "Di dalam radius" : "Di luar radius"}
            {punch.distanceM !== null ? ` · ${punch.distanceM} m` : ""}
            {punch.accuracyM !== null ? ` · akurasi ±${punch.accuracyM} m` : ""}
            {punch.altitudeM !== null && punch.altitudeM !== undefined
              ? ` · alt ${punch.altitudeM} m`
              : ""}
          </p>
          <a
            href={`https://www.openstreetmap.org/?mlat=${punch.latitude}&mlon=${punch.longitude}#map=17/${punch.latitude}/${punch.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="text-brand inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ExternalLink className="size-3" /> Lihat di peta
          </a>
        </>
      ) : null}
      <LabelChips labels={punch.labels} />
      {punch.reason ? (
        <p className="bg-muted rounded-md p-2 text-xs">Alasan: {punch.reason}</p>
      ) : null}
      <ApprovalSteps approval={approval} />
      {canAct ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={`Catatan keputusan ${KIND_TEXT[kind]}`}
            placeholder={
              overrideOnly ? "Alasan pengambilalihan (wajib)" : "Catatan (wajib bila ditolak)"
            }
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
              <Check /> Setujui {KIND_TEXT[kind]}
            </Button>
          </div>
        </div>
      ) : null}
      {canManual ? (
        <Button size="xs" variant="ghost" onClick={onManual}>
          <PenLine /> Perbaiki jam (manual)
        </Button>
      ) : null}
    </div>
  );
}

function DayDialog({
  id,
  tz,
  canManual,
  onClose,
}: {
  id: string | null;
  tz: string;
  canManual: boolean;
  onClose: () => void;
}) {
  const detail = useAttendanceDay(id);
  const [manualKind, setManualKind] = useState<"IN" | "OUT" | null>(null);
  const d = detail.data;
  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {d ? `${d.employee.fullName} · ${workDateLabel(d.workDate)}` : "Hari absen"}
          </DialogTitle>
          <DialogDescription>
            {d
              ? `${d.employee.employeeNumber ?? "—"} · ${d.shiftCode ? `Shift ${d.shiftCode} ${timeIn(d.scheduledStart, tz)}–${timeIn(d.scheduledEnd, tz)}` : "Tanpa jadwal roster"}${d.workLocation ? ` · ${d.workLocation.name}` : ""}`
              : "Memuat…"}
          </DialogDescription>
        </DialogHeader>
        {detail.isPending ? (
          <Skeleton className="h-80" />
        ) : detail.isError || !d ? (
          <p className="text-destructive text-sm">{errorMessage(detail.error)}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <DayStatusBadge status={d.status} />
              <LabelChips labels={d.labels} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {KINDS.map((kind) => (
                <PunchPanel
                  key={kind}
                  day={d}
                  kind={kind}
                  tz={tz}
                  canManual={canManual}
                  onManual={() => setManualKind(kind)}
                />
              ))}
            </div>
            {d.approval ? <ApprovalSteps approval={d.approval} /> : null}
          </div>
        )}
        {manualKind && d ? (
          <ManualDialog
            tz={tz}
            preset={{
              employee: d.employee,
              workDate: d.workDate,
              kind: manualKind,
              time: punchOf(d, manualKind) ? timeIn(punchOf(d, manualKind)?.at, tz) : "",
            }}
            onClose={() => setManualKind(null)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** D-073: autentikasi manual HR/SA — masukkan atau ganti jam Clock In / Clock Out (alasan wajib). */
function ManualDialog({
  tz,
  preset,
  onClose,
}: {
  tz: string;
  preset?: {
    employee: { id: string; fullName: string; employeeNumber: string | null };
    workDate: string;
    kind: "IN" | "OUT";
    time: string;
  };
  onClose: () => void;
}) {
  const manual = useManualPunch();
  const [employee, setEmployee] = useState(preset?.employee ?? null);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const results = useEmployees(
    { page: 1, pageSize: 8, active: true, q: q || undefined, sort: "fullName:asc" },
    !preset && q.length >= 2,
  );
  const [workDate, setWorkDate] = useState(preset?.workDate ?? todayIn(tz));
  const [kind, setKind] = useState<"IN" | "OUT">(preset?.kind ?? "IN");
  const [time, setTime] = useState(
    preset?.time && preset.time !== "—" ? preset.time.replace(".", ":") : "",
  );
  const [reason, setReason] = useState("");
  const submit = () => {
    if (!employee) return;
    manual.mutate(
      { employeeId: employee.id, workDate, kind, time, reason },
      {
        onSuccess: () => {
          toast.success(
            `${KIND_TEXT[kind]} ${employee.fullName} disimpan (manual) — menunggu persetujuan.`,
          );
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Input manual absen</DialogTitle>
          <DialogDescription>
            Untuk data yang salah (salah pencet, HP rusak, GPS error). Tercatat di audit log dengan
            label MANUAL dan tetap disetujui Atasan; bila Anda HR, langkah HR dianggap sudah Anda
            verifikasi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Karyawan</Label>
            {employee ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  {employee.fullName}{" "}
                  <span className="text-muted-foreground font-mono text-xs">
                    {employee.employeeNumber ?? ""}
                  </span>
                </span>
                {!preset ? (
                  <Button size="xs" variant="ghost" onClick={() => setEmployee(null)}>
                    Ganti
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <Input
                  placeholder="Cari nama atau NIP (min. 2 huruf)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {q.length >= 2 ? (
                  <ul className="max-h-40 divide-y overflow-y-auto rounded-md border text-sm">
                    {(results.data?.data ?? []).map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          className="hover:bg-muted w-full px-3 py-2 text-left"
                          onClick={() =>
                            setEmployee({
                              id: e.id,
                              fullName: e.fullName,
                              employeeNumber: e.employeeNumber,
                            })
                          }
                        >
                          {e.fullName}{" "}
                          <span className="text-muted-foreground font-mono text-xs">
                            {e.employeeNumber ?? ""}
                          </span>
                        </button>
                      </li>
                    ))}
                    {results.data?.data.length === 0 ? (
                      <li className="text-muted-foreground px-3 py-2">Tidak ditemukan.</li>
                    ) : null}
                  </ul>
                ) : null}
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 space-y-1.5 sm:col-span-1">
              <Label htmlFor="mn-date">Tanggal kerja</Label>
              <Input
                id="mn-date"
                type="date"
                value={workDate}
                max={todayIn(tz)}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <FormSelect
                value={kind}
                onChange={(v) => setKind(v as "IN" | "OUT")}
                placeholder="Jenis"
                options={KINDS.map((k) => ({ value: k, label: KIND_TEXT[k] }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mn-time">Jam</Label>
              <Input
                id="mn-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn-reason">Alasan</Label>
            <Textarea
              id="mn-reason"
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
            disabled={!employee || !time || reason.trim().length < 5 || manual.isPending}
            onClick={submit}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
