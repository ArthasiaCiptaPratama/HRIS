import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePenLine,
  Inbox,
  KeyRound,
  LogOut,
  Monitor,
  Paperclip,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-provider";
import { useMarkAllRead, useMarkRead, useNotifications } from "@/features/notification/api";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import {
  useAttendanceDays,
  useDecideApproval,
  useEmployeeRoster,
  useHolidays,
  useMyHistory,
} from "../api";
import {
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
import { RosterWeek } from "../components/roster-week";
import { SelfieThumb } from "../components/selfie-thumb";
import { type LeaveRequest, useLeaveRequests } from "../leave-api";
import type { Approval, AttendanceDay, Punch } from "../schemas";
import { PunchRow, useMobileApp } from "./absen-page";

// Halaman di dalam shell aplikasi HP (/absen/*): tata letak satu kolom, kartu, tombol besar.

const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

function monthBounds(month: string) {
  const from = `${month}-01`;
  const to = addDays(`${addDays(from, 31).slice(0, 7)}-01`, -1);
  return { from, to };
}

function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const shift = (n: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    onChange(d.toISOString().slice(0, 7));
  };
  return (
    <div className="bg-card flex items-center justify-between rounded-xl border p-1.5">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Bulan sebelumnya"
        onClick={() => shift(-1)}
      >
        <ChevronLeft />
      </Button>
      <span className="text-sm font-semibold capitalize">
        {MONTH.format(new Date(`${month}-01T00:00:00Z`))}
      </span>
      <Button size="icon-sm" variant="ghost" aria-label="Bulan berikutnya" onClick={() => shift(1)}>
        <ChevronRight />
      </Button>
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("bg-card rounded-2xl border p-3 shadow-xs", className)}>
      {children}
    </section>
  );
}

// ── Riwayat absen per bulan ────────────────────────────────────────────────────

export function MobileHistoryPage() {
  const { tz } = useMobileApp();
  const [month, setMonth] = useState(() => todayIn(tz).slice(0, 7));
  const { from, to } = monthBounds(month);
  const history = useMyHistory(from, to);
  const days = history.data ?? [];
  const count = (fn: (d: AttendanceDay) => boolean) => days.filter(fn).length;
  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />
      <div className="grid grid-cols-4 gap-2 text-center">
        {(
          [
            ["Disetujui", count((d) => d.status === "APPROVED"), "text-success"],
            ["Menunggu", count((d) => d.status === "OPEN" || d.status === "PENDING"), ""],
            ["Ditolak", count((d) => d.status === "REJECTED"), "text-destructive"],
            ["Alpha", count((d) => d.status === "ALPHA"), "text-destructive"],
          ] as const
        ).map(([label, value, tone]) => (
          <div key={label} className="bg-card rounded-xl border p-2">
            <p className={cn("text-lg font-semibold tabular-nums", value > 0 && tone)}>{value}</p>
            <p className="text-muted-foreground text-[10px]">{label}</p>
          </div>
        ))}
      </div>
      {history.isPending ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : days.length === 0 ? (
        <EmptyState icon={Inbox} title="Belum ada absen bulan ini" />
      ) : (
        <ul className="space-y-2">
          {days.map((day) => (
            <li key={day.id}>
              <Card className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {workDateLabel(day.workDate)}
                    {day.shiftCode ? (
                      <span className="text-muted-foreground font-normal"> · {day.shiftCode}</span>
                    ) : null}
                  </p>
                  <DayStatusBadge status={day.status} />
                </div>
                {(["IN", "OUT"] as const).map((kind) => {
                  const punch = day.punches.find((p) => p.kind === kind);
                  return (
                    <div key={kind} className="flex gap-2">
                      {punch ? <SelfieThumb punch={punch} /> : null}
                      <div className="min-w-0 flex-1">
                        <PunchRow
                          label={kind === "IN" ? "Clock In" : "Clock Out"}
                          punch={punch}
                          tz={tz}
                        />
                      </div>
                    </div>
                  );
                })}
                <LabelChips labels={day.labels} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Roster saya per bulan ──────────────────────────────────────────────────────

export function MobileRosterPage() {
  const { me, data, tz } = useMobileApp();
  const today = todayIn(tz);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const { from, to } = monthBounds(month);
  const roster = useEmployeeRoster(me.employeeId, from, to);
  const holidays = useHolidays(Number(month.slice(0, 4)));
  const holidayByDate = new Map((holidays.data ?? []).map((h) => [h.date, h]));
  const byDate = new Map((roster.data ?? []).map((r) => [r.date, r]));
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return (
    <>
      {data ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">7 hari ke depan</h2>
          <RosterWeek roster={data.roster} today={today} />
        </Card>
      ) : null}
      <MonthSwitcher month={month} onChange={setMonth} />
      {roster.isPending ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {dates.map((date) => {
              const r = byDate.get(date);
              const h = holidayByDate.get(date);
              return (
                <li
                  key={date}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2",
                    date === today && "bg-brand-soft/60",
                    r && !r.shift && "text-muted-foreground",
                  )}
                >
                  <span className="w-20 shrink-0 text-xs tabular-nums">{workDateLabel(date)}</span>
                  <span
                    className="w-12 shrink-0 rounded px-1 text-center font-mono text-xs font-bold"
                    style={
                      r?.shift?.color
                        ? { color: r.shift.color, backgroundColor: `${r.shift.color}1a` }
                        : undefined
                    }
                  >
                    {r?.code ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {r?.shift
                      ? `${hhmm(r.shift.startMinute)}–${hhmm(r.shift.endMinute)}`
                      : r
                        ? "Libur"
                        : "Tanpa roster"}
                    {h ? (
                      <span
                        className={cn(
                          "ml-1",
                          h.kind === "NATIONAL" ? "text-red-600" : "text-amber-600",
                        )}
                      >
                        · {h.name}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

// ── Approval (atasan / HR) dalam bentuk kartu ──────────────────────────────────

const isDecidable = (a: Approval | null | undefined): a is Approval =>
  a?.status === "PENDING" && (a.canDecide || a.canOverride);

function DecisionButtons({ approval, subject }: { approval: Approval; subject: string }) {
  const decide = useDecideApproval();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const overrideOnly = !approval.canDecide && approval.canOverride;
  const run = (decision: "APPROVED" | "REJECTED") => {
    if ((decision === "REJECTED" || overrideOnly) && !note.trim()) {
      setRejecting(true);
      toast.error(
        decision === "REJECTED" ? "Tulis alasan penolakan." : "Tulis alasan pengambilalihan.",
      );
      return;
    }
    decide.mutate(
      { requestId: approval.id, decision, note: note.trim() || undefined },
      {
        onSuccess: () =>
          toast.success(`${subject} ${decision === "APPROVED" ? "disetujui" : "ditolak"}.`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  return (
    <div className="space-y-2">
      {rejecting || overrideOnly ? (
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Catatan keputusan"
          placeholder={overrideOnly ? "Alasan pengambilalihan (wajib)" : "Alasan penolakan (wajib)"}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="text-destructive"
          disabled={decide.isPending}
          onClick={() => run("REJECTED")}
        >
          <X /> Tolak
        </Button>
        <Button variant="brand" disabled={decide.isPending} onClick={() => run("APPROVED")}>
          <Check /> Setujui
        </Button>
      </div>
    </div>
  );
}

function PunchApprovalCard({ day, punch, tz }: { day: AttendanceDay; punch: Punch; tz: string }) {
  const label = punch.kind === "IN" ? "Clock In" : "Clock Out";
  return (
    <div className="space-y-2 rounded-xl border p-2.5">
      <div className="flex gap-3">
        <SelfieThumb punch={punch} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm">
            {label} <span className="font-semibold tabular-nums">{timeIn(punch.at, tz)}</span>
            {punch.source === "MANUAL" ? (
              <Badge variant="muted" className="ml-1 text-[10px]">
                Manual
              </Badge>
            ) : null}
          </p>
          {punch.latitude !== null && punch.longitude !== null ? (
            <CoordLink
              latitude={punch.latitude}
              longitude={punch.longitude}
              altitudeM={punch.altitudeM}
            />
          ) : null}
          <p
            className={cn(
              "text-[11px]",
              punch.insideGeofence ? "text-success" : "text-destructive",
            )}
          >
            {punch.insideGeofence ? "Dalam radius" : "Luar radius"}
            {punch.distanceM !== null ? ` · ${punch.distanceM} m` : ""}
          </p>
        </div>
      </div>
      <LabelChips labels={punch.labels} />
      {punch.reason ? (
        <p className="bg-muted rounded-md p-2 text-xs">Alasan: {punch.reason}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Atasan</span>
        <StepBadge approval={punch.approval} kind="MANAGER" />
        <span className="text-muted-foreground">HR</span>
        <StepBadge approval={punch.approval} kind="HR" />
      </div>
      {isDecidable(punch.approval) ? (
        <DecisionButtons approval={punch.approval} subject={`${label} ${day.employee.fullName}`} />
      ) : null}
    </div>
  );
}

function LeaveApprovalCard({ request }: { request: LeaveRequest }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{request.employee.fullName}</p>
          <p className="text-muted-foreground text-xs">
            {request.type.name} · {request.days} hari
          </p>
          <p className="text-xs">
            {workDateLabel(request.startDate)}
            {request.endDate !== request.startDate ? ` – ${workDateLabel(request.endDate)}` : ""}
          </p>
        </div>
        {request.attachmentUrl ? (
          <a
            href={request.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-brand"
            aria-label="Bukti"
          >
            <Paperclip className="size-4" />
          </a>
        ) : null}
      </div>
      <p className="bg-muted rounded-md p-2 text-xs">“{request.reason}”</p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Atasan</span>
        <StepBadge approval={request.approval} kind="MANAGER" />
        <span className="text-muted-foreground">HR</span>
        <StepBadge approval={request.approval} kind="HR" />
      </div>
      {isDecidable(request.approval) ? (
        <DecisionButtons
          approval={request.approval}
          subject={`Cuti ${request.employee.fullName}`}
        />
      ) : null}
    </Card>
  );
}

export function MobileApprovalsPage() {
  const { me, tz } = useMobileApp();
  const canDays = tmAccess.reviewDays(me);
  const canLeave = tmAccess.decideLeave(me);
  const [tab, setTab] = useState<"absen" | "cuti">(canDays ? "absen" : "cuti");
  const today = todayIn(tz);
  const days = useAttendanceDays({ scope: "inbox", from: addDays(today, -60), to: today }, canDays);
  const leave = useLeaveRequests({ scope: "inbox" }, canLeave);
  const dayRows = days.data ?? [];
  const leaveRows = leave.data ?? [];
  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "absen" | "cuti")}>
        <TabsList className="w-full">
          {canDays ? (
            <TabsTrigger value="absen" className="flex-1">
              Absen {dayRows.length ? `(${dayRows.length})` : ""}
            </TabsTrigger>
          ) : null}
          {canLeave ? (
            <TabsTrigger value="cuti" className="flex-1">
              Cuti/Izin {leaveRows.length ? `(${leaveRows.length})` : ""}
            </TabsTrigger>
          ) : null}
        </TabsList>
      </Tabs>
      {tab === "absen" ? (
        days.isPending ? (
          <Skeleton className="h-60 rounded-2xl" />
        ) : dayRows.length === 0 ? (
          <EmptyState icon={Inbox} title="Tidak ada absen yang perlu diputuskan" />
        ) : (
          <ul className="space-y-3">
            {dayRows.map((day) => (
              <li key={day.id}>
                <Card className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{day.employee.fullName}</p>
                      <p className="text-muted-foreground text-xs">
                        {workDateLabel(day.workDate)}
                        {day.shiftCode ? ` · ${day.shiftCode}` : ""}
                        {day.scheduledStart
                          ? ` ${timeIn(day.scheduledStart, tz)}–${timeIn(day.scheduledEnd, tz)}`
                          : ""}
                      </p>
                    </div>
                    <DayStatusBadge status={day.status} />
                  </div>
                  {day.punches.map((punch) => (
                    <PunchApprovalCard key={punch.id} day={day} punch={punch} tz={tz} />
                  ))}
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : leave.isPending ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : leaveRows.length === 0 ? (
        <EmptyState icon={Inbox} title="Tidak ada cuti/izin yang perlu diputuskan" />
      ) : (
        <ul className="space-y-3">
          {leaveRows.map((r) => (
            <li key={r.id}>
              <LeaveApprovalCard request={r} />
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/absen/koreksi"
        className="text-brand flex items-center justify-center gap-1 text-xs hover:underline"
      >
        <FilePenLine className="size-3.5" /> Koreksi absensi yang perlu diputuskan
      </Link>
    </>
  );
}

// ── Notifikasi ────────────────────────────────────────────────────────────────

export function MobileNotificationsPage() {
  const list = useNotifications(1, 30);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const rows = list.data?.data ?? [];
  return (
    <>
      {(list.data?.meta.unreadCount ?? 0) > 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="self-end"
          disabled={markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          <Check /> Tandai semua dibaca
        </Button>
      ) : null}
      {list.isPending ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Bell} title="Belum ada notifikasi" />
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id}>
              <Card className={cn("flex gap-2", !n.readAt && "border-brand/40")}>
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.readAt ? "bg-muted" : "bg-brand",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? <p className="text-muted-foreground text-xs">{n.body}</p> : null}
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {formatDateTime(n.createdAt)}
                  </p>
                </div>
                {!n.readAt ? (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Tandai dibaca"
                    onClick={() => markRead.mutate(n.id)}
                  >
                    <Check />
                  </Button>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Profil ────────────────────────────────────────────────────────────────────

export function MobileProfilePage() {
  const { me, data } = useMobileApp();
  const { signOut } = useAuth();
  const roleText: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    HR_ADMIN: "HR Admin",
    MANAGER: "Manager",
    EMPLOYEE: "Karyawan",
  };
  return (
    <>
      <Card className="flex items-center gap-3">
        <span className="bg-brand-soft text-brand-soft-foreground grid size-12 place-items-center rounded-full text-lg font-semibold">
          {(data?.employee.fullName ?? me.email).charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{data?.employee.fullName ?? me.email}</p>
          <p className="text-muted-foreground truncate text-xs">
            <span className="font-mono">{data?.employee.employeeNumber ?? "—"}</span> ·{" "}
            {roleText[me.role] ?? me.role}
          </p>
          <p className="text-muted-foreground truncate text-xs">{me.email}</p>
        </div>
      </Card>
      <Card className="space-y-1 text-sm">
        <p className="flex justify-between">
          <span className="text-muted-foreground">Lokasi kerja</span>
          <span className="truncate font-medium">
            {data?.anywhere ? "Bebas lokasi" : (data?.location?.name ?? "—")}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">Zona waktu</span>
          <span className="font-medium">{data?.timezone ?? "—"}</span>
        </p>
      </Card>
      <Card className="divide-y p-0">
        <Link to="/profil" className="flex items-center gap-3 px-3 py-3 text-sm">
          <KeyRound className="text-muted-foreground size-4" /> Akun & keamanan (versi web)
          <ExternalLink className="text-muted-foreground ml-auto size-3.5" />
        </Link>
        <Link to="/" className="flex items-center gap-3 px-3 py-3 text-sm">
          <Monitor className="text-muted-foreground size-4" /> Buka HRIS versi web
          <ExternalLink className="text-muted-foreground ml-auto size-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-destructive flex w-full items-center gap-3 px-3 py-3 text-sm"
        >
          <LogOut className="size-4" /> Keluar
        </button>
      </Card>
    </>
  );
}
