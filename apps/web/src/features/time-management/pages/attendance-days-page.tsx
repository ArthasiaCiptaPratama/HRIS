import {
  ATTENDANCE_DAY_STATUS_LABELS,
  ATTENDANCE_DAY_STATUSES,
  DEFAULT_TIME_SETTINGS,
  MAX_BULK_DECISIONS,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import {
  Ban,
  Check,
  ClipboardCheck,
  Clock,
  Eye,
  FileSpreadsheet,
  MapPin,
  PenLine,
  SearchX,
  X,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useCallback, useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useCompanyScope } from "@/features/employee/api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import {
  useAttendanceDay,
  useAttendanceDays,
  useDecideApproval,
  useDecideBulk,
  useTimeSettings,
} from "../api";
import {
  BreakLine,
  DayDetailBody,
  isDecidable,
  KIND_TEXT,
  KINDS,
  ManualDialog,
  punchOf,
} from "../components/attendance-day-detail";
import type { AttendanceExportKind } from "../components/attendance-export-dialog";
import {
  AbsenViewSwitch,
  AttendancePeopleView,
  useAbsenView,
} from "../components/attendance-people-view";
import {
  addDays,
  DayStatusBadge,
  LabelChips,
  scheduleLabel,
  timeIn,
  todayIn,
  workDateLabel,
} from "../components/display";
import { RefreshButton } from "../components/refresh-button";
import { SelfieThumb } from "../components/selfie-thumb";
import type { Approval, AttendanceDay } from "../schemas";

// Dialog export memuat react-day-picker + locale: dimuat hanya saat dibuka (halaman tetap ringan).
const AttendanceExportDialog = lazy(() =>
  import("../components/attendance-export-dialog").then((m) => ({
    default: m.AttendanceExportDialog,
  })),
);

// D-068 / D-073: Data Absen Harian. Setiap absen (masuk & pulang) disetujui sendiri-sendiri oleh Atasan
// (tim) DAN HR (PT ditugaskan); hari disetujui bila keduanya disetujui. SA dapat mengambil alih dengan
// alasan. HR/SA dapat memasukkan / memperbaiki jam absen secara manual (autentikasi manual).

const column = createColumnHelper<typeof tableFeaturesNone, AttendanceDay>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<AttendanceDay>;

/** Approval yang bisa diputuskan aktor pada satu hari: tiap absen + approval hari model lama. */
const decidableApprovals = (day: AttendanceDay): Approval[] => [
  ...day.punches.map((p) => p.approval).filter(isDecidable),
  ...(isDecidable(day.approval) ? [day.approval] : []),
];

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
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [exportKind, setExportKind] = useState<AttendanceExportKind | null>(null);
  const [view, setView] = useAbsenView(me.id);
  const canManual = tmAccess.manageRoster(me);
  const canExport = tmAccess.exportDays(me);

  const list = useAttendanceDays({
    scope: tab,
    from,
    to,
    companyId: scope.selectedId,
    labeledOnly,
    status: tab === "all" ? status || undefined : undefined,
    q: q || undefined,
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
              {row.original.shiftCode ? (
                <>
                  <span className="text-foreground font-medium">{row.original.shiftCode}</span>
                  {row.original.scheduledStart && row.original.scheduledEnd
                    ? ` · ${scheduleLabel(row.original.workDate, row.original.scheduledStart, row.original.scheduledEnd, tz)}`
                    : ""}
                </>
              ) : (
                "Tanpa jadwal"
              )}
            </p>
          </div>
        ),
      }),
      // Satu sel per absen: foto, jam, lokasi, persetujuan Atasan & HR (rapi, tanpa 12 kolom terpisah).
      ...KINDS.map((kind) =>
        col({
          id: `punch-${kind}`,
          header: KIND_TEXT[kind],
          cell: ({ row }) => (
            <PunchCell
              day={row.original}
              kind={kind}
              tz={tz}
              onOpen={() => setParam("id", row.original.id)}
            />
          ),
        }),
      ),
      col({
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="min-w-36 space-y-1.5">
            <DayStatusBadge status={row.original.status} />
            <LabelChips labels={row.original.labels} />
            <BreakLine day={row.original} tz={tz} />
          </div>
        ),
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
        description={
          <>
            Absen normal langsung disetujui. Absen berlabel diperiksa Atasan dan HR, atau HR saja
            bila tidak ada atasan. Hari Alpha (tidak absen) ada di{" "}
            <Link
              to="/time/rekap?tab=alpha"
              className="text-brand underline-offset-2 hover:underline"
            >
              Rekap › Alpha & pernyataan
            </Link>{" "}
            untuk peringatan & SP.
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
            {canExport ? (
              <>
                <Button variant="outline" onClick={() => setExportKind("DETAIL")}>
                  <FileSpreadsheet /> Export Excel
                </Button>
                <Button variant="outline" onClick={() => setExportKind("FLASH")}>
                  <Zap /> Flash
                </Button>
              </>
            ) : null}
            {canManual ? (
              <Button variant="outline" onClick={() => setManualOpen(true)}>
                <PenLine /> Input manual
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="mb-4">
        <AbsenViewSwitch value={view} onChange={setView} />
      </div>
      {view === "people" ? (
        <AttendancePeopleView
          companyId={scope.selectedId ?? undefined}
          tz={tz}
          canManual={canManual}
        />
      ) : (
        <>
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
                <SearchField
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setSelected(new Set());
                  }}
                  placeholder="Cari nama atau NIK…"
                  aria-label="Cari karyawan"
                />
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
                    options={ATTENDANCE_DAY_STATUSES.filter((s) => s !== "ALPHA").map((s) => ({
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
                  : q
                    ? {
                        icon: SearchX,
                        title: `Tidak ada absen untuk "${q}"`,
                        description: "Periksa ejaan nama / NIK, atau perluas rentang tanggal.",
                      }
                    : {
                        icon: ClipboardCheck,
                        title:
                          tab === "inbox"
                            ? "Tidak ada yang perlu diputuskan"
                            : "Belum ada data absen",
                      }
              }
            />
          </ListPanel>
        </>
      )}
      <BulkDialog
        decision={bulk}
        rows={selectedRows}
        onClose={(done) => {
          setBulk(null);
          if (done) setSelected(new Set());
        }}
      />
      <DayDialog id={openId} tz={tz} canManual={canManual} onClose={() => setParam("id", null)} />
      {exportKind ? (
        <Suspense fallback={null}>
          <AttendanceExportDialog
            kind={exportKind}
            from={from}
            to={to}
            companyId={scope.selectedId ?? undefined}
            onClose={() => setExportKind(null)}
          />
        </Suspense>
      ) : null}
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

const STEP_LOOK = {
  PENDING: {
    icon: Clock,
    className: "bg-warning-soft text-warning-soft-foreground",
    text: "menunggu",
  },
  APPROVED: {
    icon: Check,
    className: "bg-success-soft text-success-soft-foreground",
    text: "disetujui",
  },
  REJECTED: { icon: X, className: "bg-destructive/10 text-destructive", text: "ditolak" },
  CANCELLED: { icon: Ban, className: "bg-muted text-muted-foreground", text: "dibatalkan" },
} as const;

/** Langkah Atasan/HR dalam satu pil kecil (ikon = keputusan). */
function StepPill({
  approval,
  kind,
}: {
  approval: AttendanceDay["punches"][number]["approval"];
  kind: "MANAGER" | "HR";
}) {
  const step = approval?.steps.find((s) => s.kind === kind);
  const label = kind === "MANAGER" ? "Atasan" : "HR";
  if (!step) return null;
  const look = STEP_LOOK[step.decision];
  const Icon = look.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        look.className,
      )}
      title={[`${label} ${look.text}`, step.note, step.isOverride ? "Diambil alih" : null]
        .filter(Boolean)
        .join(" · ")}
    >
      <Icon className="size-3" aria-hidden />
      {label}
      <span className="sr-only"> {look.text}</span>
    </span>
  );
}

/** Satu absen dalam satu sel: foto, jam, lokasi (tautan peta), persetujuan + setujui/tolak cepat. */

function PunchCell({
  day,
  kind,
  tz,
  onOpen,
}: {
  day: AttendanceDay;
  kind: "IN" | "OUT";
  tz: string;
  onOpen: () => void;
}) {
  const punch = punchOf(day, kind);
  const decide = useDecideApproval();
  if (!punch) {
    return <span className="text-muted-foreground text-xs">Belum {KIND_TEXT[kind]}</span>;
  }
  const approval = punch.approval;
  const quick = approval?.status === "PENDING" && approval.canDecide;
  const hasCoord = punch.latitude !== null && punch.longitude !== null;
  // Sebut lokasinya: "Dalam radius X" (lokasi seharusnya), "Di lokasi lain: Y" (dalam radius site lain),
  // atau "Luar radius X" — supaya label OTHER_LOCATION & "dalam radius" tidak tampak bertentangan.
  const distance = punch.distanceM !== null ? ` · ${punch.distanceM} m` : "";
  const siteName = punch.location?.name ?? "";
  const place = punch.labels.includes("OTHER_LOCATION")
    ? {
        text: `Di lokasi lain: ${siteName || "site lain"}${distance}`,
        tone: "text-amber-700 dark:text-amber-300",
      }
    : punch.insideGeofence
      ? { text: `Dalam radius${siteName ? ` ${siteName}` : ""}${distance}`, tone: "text-success" }
      : {
          text: `Luar radius${siteName ? ` ${siteName}` : ""}${distance}`,
          tone: "text-destructive",
        };
  return (
    <div className="flex min-w-56 items-start gap-2.5">
      <SelfieThumb punch={punch} />
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <TimeText iso={punch.at} tz={tz} />
          {punch.source === "MANUAL" ? (
            <Badge variant="muted" className="text-[10px]">
              Manual
            </Badge>
          ) : null}
        </div>
        {punch.source === "MANUAL" && punch.location ? (
          <p
            className="text-brand flex items-center gap-1 text-[11px] whitespace-nowrap"
            title="Lokasi dipilih HR saat input manual (bukan GPS HP)"
          >
            <MapPin className="size-3" aria-hidden />
            {punch.location.name} · dipilih HR
          </p>
        ) : hasCoord ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${punch.latitude}&mlon=${punch.longitude}#map=18/${punch.latitude}/${punch.longitude}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={[
              place.text,
              day.workLocation ? `Lokasi absen seharusnya: ${day.workLocation.name}` : null,
              `Lat ${punch.latitude?.toFixed(6)} · Long ${punch.longitude?.toFixed(6)} · Alt ${
                punch.altitudeM === null ? "—" : `${punch.altitudeM} m`
              }`,
              "Klik untuk buka peta",
            ]
              .filter(Boolean)
              .join("\n")}
            className={cn(
              "flex max-w-60 items-center gap-1 text-[11px] hover:underline",
              place.tone,
            )}
          >
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{place.text}</span>
          </a>
        ) : (
          <p className="text-muted-foreground text-[11px]">Tanpa lokasi</p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <StepPill approval={approval} kind="MANAGER" />
          <StepPill approval={approval} kind="HR" />
          {quick ? (
            <>
              <Button
                size="icon-xs"
                variant="outline"
                className="text-success ml-0.5"
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
            </>
          ) : null}
        </div>
      </div>
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
              ? `${d.employee.employeeNumber ?? "—"} · ${d.shiftCode ? `Shift ${d.shiftCode} ${scheduleLabel(d.workDate, d.scheduledStart, d.scheduledEnd, tz)}` : "Tanpa jadwal"}${d.workLocation ? ` · ${d.workLocation.name}` : ""}`
              : "Memuat…"}
          </DialogDescription>
        </DialogHeader>
        {detail.isPending ? (
          <Skeleton className="h-80" />
        ) : detail.isError || !d ? (
          <p className="text-destructive text-sm">{errorMessage(detail.error)}</p>
        ) : (
          <DayDetailBody day={d} tz={tz} canManual={canManual} />
        )}
      </DialogContent>
    </Dialog>
  );
}
