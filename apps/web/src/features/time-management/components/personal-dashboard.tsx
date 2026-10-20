import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FilePenLine,
  LogIn,
  LogOut,
  type LucideIcon,
  Plane,
  Repeat,
  ScanFace,
  Sheet,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Me } from "@/features/auth/schemas";
import { useNotifications } from "@/features/notification/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import { useAttendanceDays, useMyHistory, useRosterChanges, useTimezone, useToday } from "../api";
import { useLeaveRequests, useMyLeave } from "../leave-api";
import { useCorrections, useMyStatements } from "../period-api";
import { addDays, hhmm, timeIn, todayIn, workDateLabel } from "./display";
import { RosterWeek } from "./roster-week";

// Dashboard karyawan & atasan (bukan SA/HR): widget saja — kehadiran hari ini, hal yang perlu
// ditindaklanjuti, ringkasan bulan ini, saldo cuti, pintasan, roster, dan notifikasi terbaru.

function Widget({
  title,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "bg-card animate-fade-up flex flex-col rounded-2xl border p-4 shadow-xs",
        className,
      )}
    >
      <header className="mb-3 flex items-center gap-2">
        <span className="bg-brand-soft text-brand-soft-foreground grid size-8 place-items-center rounded-lg">
          <Icon className="size-4" />
        </span>
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

type Tone = "danger" | "warning" | "info";
interface Task {
  id: string;
  tone: Tone;
  title: string;
  detail?: string;
  to: string;
  cta: string;
}

const TONE: Record<Tone, string> = {
  danger: "border-destructive/30 bg-destructive/5",
  warning: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
  info: "border-border bg-muted/40",
};

export function PersonalDashboard({ me }: { me: Me }) {
  const hasEmployee = me.employeeId !== null;
  const isDecider = tmAccess.reviewDays(me);
  const tz = useTimezone();
  const today = todayIn(tz);
  const monthStart = `${today.slice(0, 7)}-01`;

  const todayQ = useToday(hasEmployee);
  const history = useMyHistory(monthStart, today, hasEmployee);
  const leave = useMyLeave(hasEmployee);
  const statements = useMyStatements(hasEmployee);
  const myChanges = useRosterChanges("mine", hasEmployee);
  const dayInbox = useAttendanceDays(
    { scope: "inbox", from: addDays(today, -60), to: today },
    isDecider,
  );
  const leaveInbox = useLeaveRequests({ scope: "inbox" }, tmAccess.decideLeave(me));
  const changeInbox = useRosterChanges("inbox", tmAccess.decideRosterChanges(me));
  const correctionInbox = useCorrections("inbox", isDecider);
  const notifications = useNotifications(1, 5);

  const data = todayQ.data;
  const timezone = data?.timezone ?? tz;
  const current = data?.openDay ?? data?.recent.find((d) => d.workDate === today) ?? null;
  const inAt = current?.punches.find((p) => p.kind === "IN")?.at ?? null;
  const outAt = current?.punches.find((p) => p.kind === "OUT")?.at ?? null;
  const rosterToday = data?.roster.find((r) => r.date === today);
  const days = history.data ?? [];
  const count = (fn: (d: (typeof days)[number]) => boolean) => days.filter(fn).length;

  // ── Hal yang perlu ditindaklanjuti ──────────────────────────────────────────────
  const tasks: Task[] = [];
  if (data) {
    if (data.openDay && !outAt) {
      tasks.push({
        id: "clock-out",
        tone: "warning",
        title: "Belum Clock Out",
        detail: `Clock In ${inAt ? timeIn(inAt, timezone) : "-"} (${workDateLabel(data.openDay.workDate)}).`,
        to: "/absen",
        cta: "Clock Out",
      });
    } else if (rosterToday?.shift && !inAt) {
      tasks.push({
        id: "clock-in",
        tone: "warning",
        title: "Belum Clock In hari ini",
        detail: `Shift ${rosterToday.shift.code} ${hhmm(rosterToday.shift.startMinute)}–${hhmm(rosterToday.shift.endMinute)}.`,
        to: "/absen",
        cta: "Clock In",
      });
    }
  }
  const alphaNoStatement = (statements.data ?? []).filter((s) => !s.statement);
  if (alphaNoStatement.length > 0) {
    tasks.push({
      id: "statements",
      tone: "danger",
      title: `${alphaNoStatement.length} hari Alpha belum ada surat pernyataan`,
      detail: alphaNoStatement
        .slice(0, 3)
        .map((s) => workDateLabel(s.workDate))
        .join(", "),
      to: "/time/pernyataan",
      cta: "Buat pernyataan",
    });
  }
  const rejected = days.filter(
    (d) => d.status === "REJECTED" || d.punches.some((p) => p.status === "REJECTED"),
  );
  if (rejected.length > 0) {
    tasks.push({
      id: "rejected",
      tone: "danger",
      title: `${rejected.length} absen ditolak bulan ini`,
      detail: "Ajukan koreksi sebelum periode ditutup supaya tidak menjadi Alpha.",
      to: "/time/pernyataan",
      cta: "Ajukan koreksi",
    });
  }
  const noCheckout = days.filter((d) => d.labels.includes("NO_CHECKOUT") && d.status === "PENDING");
  if (noCheckout.length > 0) {
    tasks.push({
      id: "no-checkout",
      tone: "warning",
      title: `${noCheckout.length} hari tanpa Clock Out`,
      detail: "Ajukan koreksi jam pulang atau minta HR memasukkannya secara manual.",
      to: "/time/pernyataan",
      cta: "Koreksi",
    });
  }
  const consents = (myChanges.data ?? []).filter((c) => c.awaitingMyConsent);
  if (consents.length > 0) {
    tasks.push({
      id: "swap",
      tone: "warning",
      title: `${consents.length} permintaan tukar shift menunggu jawaban Anda`,
      to: "/time/perubahan-roster",
      cta: "Jawab",
    });
  }
  const inbox: [string, number, string][] = [
    ["absen menunggu persetujuan Anda", dayInbox.data?.length ?? 0, "/time/absen-harian"],
    [
      "pengajuan cuti/izin menunggu persetujuan",
      leaveInbox.data?.length ?? 0,
      "/time/persetujuan-cuti",
    ],
    [
      "perubahan roster menunggu keputusan",
      changeInbox.data?.length ?? 0,
      "/time/perubahan-roster",
    ],
    ["koreksi absensi menunggu keputusan", correctionInbox.data?.length ?? 0, "/time/pernyataan"],
  ];
  for (const [label, n, to] of inbox) {
    if (n > 0) {
      tasks.push({ id: label, tone: "info", title: `${n} ${label}`, to, cta: "Periksa" });
    }
  }
  const myPendingLeave = (leave.data?.requests ?? []).filter((r) => r.status === "PENDING").length;
  const balance = leave.data?.balances.find((b) => b.year === leave.data?.year);
  if (balance && balance.balance < 0) {
    tasks.push({
      id: "debt",
      tone: "info",
      title: `Saldo cuti minus ${Math.abs(balance.balance)} hari`,
      detail: "Hutang cuti dilunasi dari jatah tahun berikutnya.",
      to: "/time/cuti",
      cta: "Lihat",
    });
  }
  const tasksLoading =
    (hasEmployee && (todayQ.isPending || history.isPending || statements.isPending)) ||
    (isDecider && dayInbox.isPending);

  const shortcuts: [string, string, LucideIcon, string, boolean][] = [
    ["Absen", "/absen", ScanFace, "bg-violet-100 text-violet-700", hasEmployee],
    ["Cuti & Izin", "/time/cuti", Plane, "bg-sky-100 text-sky-700", hasEmployee],
    ["Koreksi Absen", "/time/pernyataan", FilePenLine, "bg-amber-100 text-amber-700", true],
    ["Roster", "/time/roster", CalendarRange, "bg-emerald-100 text-emerald-700", true],
    ["Tukar Shift", "/time/perubahan-roster", Repeat, "bg-rose-100 text-rose-700", true],
    ["Kalender Libur", "/time/kalender", CalendarDays, "bg-orange-100 text-orange-700", true],
    [
      "Data Absen Harian",
      "/time/absen-harian",
      ClipboardCheck,
      "bg-teal-100 text-teal-700",
      isDecider,
    ],
    [
      "Persetujuan Cuti",
      "/time/persetujuan-cuti",
      ClipboardCheck,
      "bg-cyan-100 text-cyan-700",
      tmAccess.decideLeave(me),
    ],
    ["Rekap Tim", "/time/rekap", Sheet, "bg-slate-100 text-slate-700", tmAccess.viewRecap(me)],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Kehadiran hari ini */}
      <Widget title="Kehadiran hari ini" icon={Clock} className="lg:col-span-1">
        {!hasEmployee ? (
          <p className="text-muted-foreground text-sm">Akun belum terhubung ke data karyawan.</p>
        ) : todayQ.isPending ? (
          <Skeleton className="h-32" />
        ) : !data ? (
          <p className="text-muted-foreground text-sm">Data absen belum tersedia.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              {workDateLabel(today)} ·{" "}
              {rosterToday?.shift
                ? `Shift ${rosterToday.shift.code} ${hhmm(rosterToday.shift.startMinute)}–${hhmm(rosterToday.shift.endMinute)}`
                : rosterToday
                  ? "Libur (OFF)"
                  : "Tanpa roster"}
              {data.location ? ` · ${data.location.name}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-600/10 p-3 text-center">
                <p className="flex items-center justify-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                  <LogIn className="size-3.5" /> Clock In
                </p>
                <p className="font-mono text-xl font-semibold tabular-nums">
                  {inAt ? timeIn(inAt, timezone) : "--:--"}
                </p>
              </div>
              <div className="rounded-xl bg-blue-600/10 p-3 text-center">
                <p className="flex items-center justify-center gap-1 text-xs text-blue-700 dark:text-blue-300">
                  <LogOut className="size-3.5" /> Clock Out
                </p>
                <p className="font-mono text-xl font-semibold tabular-nums">
                  {outAt ? timeIn(outAt, timezone) : "--:--"}
                </p>
              </div>
            </div>
            <Button variant="brand" className="w-full" asChild>
              <Link to="/absen">
                <ScanFace />{" "}
                {data.next === "DONE"
                  ? "Absen hari ini sudah tercatat"
                  : data.next === "IN"
                    ? "Clock In sekarang"
                    : "Clock Out sekarang"}
              </Link>
            </Button>
          </div>
        )}
      </Widget>

      {/* Perlu tindakan */}
      <Widget
        title="Perlu tindakan"
        icon={AlertTriangle}
        className="lg:col-span-2"
        action={tasks.length > 0 ? <Badge variant="warning">{tasks.length}</Badge> : null}
      >
        {tasksLoading ? (
          <Skeleton className="h-32" />
        ) : tasks.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <CheckCircle2 className="text-success size-5" /> Tidak ada yang perlu Anda selesaikan
            saat ini.
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li
                key={t.id}
                className={cn("flex items-center gap-3 rounded-xl border p-3", TONE[t.tone])}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.detail ? (
                    <p className="text-muted-foreground truncate text-xs">{t.detail}</p>
                  ) : null}
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link to={t.to}>
                    {t.cta} <ChevronRight />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Widget>

      {/* Ringkasan bulan ini */}
      {hasEmployee ? (
        <Widget title="Kehadiran bulan ini" icon={ClipboardCheck}>
          {history.isPending ? (
            <Skeleton className="h-24" />
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["Disetujui", count((d) => d.status === "APPROVED"), "text-success"],
                  ["Menunggu", count((d) => d.status === "OPEN" || d.status === "PENDING"), ""],
                  ["Ditolak", count((d) => d.status === "REJECTED"), "text-destructive"],
                  ["Alpha", count((d) => d.status === "ALPHA"), "text-destructive"],
                  ["Cuti/izin", count((d) => d.status === "LEAVE"), ""],
                  ["Telat", count((d) => d.labels.includes("LATE")), "text-amber-600"],
                ] as const
              ).map(([label, value, tone]) => (
                <div key={label} className="bg-muted/50 rounded-xl p-2">
                  <p className={cn("text-xl font-semibold tabular-nums", value > 0 && tone)}>
                    {value}
                  </p>
                  <p className="text-muted-foreground text-[11px]">{label}</p>
                </div>
              ))}
            </div>
          )}
        </Widget>
      ) : null}

      {/* Saldo cuti */}
      {hasEmployee ? (
        <Widget
          title="Saldo cuti"
          icon={Plane}
          action={
            <Button size="xs" variant="ghost" asChild>
              <Link to="/time/cuti">Ajukan</Link>
            </Button>
          }
        >
          {leave.isPending ? (
            <Skeleton className="h-24" />
          ) : !balance ? (
            <p className="text-muted-foreground text-sm">Belum ada saldo.</p>
          ) : (
            <div className="space-y-2">
              <p
                className={cn(
                  "text-3xl font-semibold tabular-nums",
                  balance.balance < 0 && "text-destructive",
                )}
              >
                {balance.balance}
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  hari ({leave.data?.year})
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                Terpakai {balance.used} · ditahan {balance.held}
                {myPendingLeave > 0 ? ` · ${myPendingLeave} pengajuan menunggu` : ""}
              </p>
            </div>
          )}
        </Widget>
      ) : null}

      {/* Roster 7 hari */}
      {hasEmployee ? (
        <Widget title="Roster 7 hari" icon={CalendarRange}>
          {todayQ.isPending ? (
            <Skeleton className="h-20" />
          ) : (data?.roster.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">Belum ada roster.</p>
          ) : (
            <RosterWeek roster={data?.roster ?? []} today={today} />
          )}
        </Widget>
      ) : null}

      {/* Pintasan */}
      <Widget title="Pintasan" icon={ChevronRight} className="lg:col-span-2">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {shortcuts
            .filter(([, , , , show]) => show)
            .map(([label, to, Icon, tone]) => (
              <Link
                key={label}
                to={to}
                className="hover:bg-muted flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition active:scale-95"
              >
                <span className={cn("grid size-11 place-items-center rounded-xl", tone)}>
                  <Icon className="size-5" />
                </span>
                <span className="text-[11px] leading-tight font-medium">{label}</span>
              </Link>
            ))}
        </div>
      </Widget>

      {/* Berita / notifikasi penting */}
      <Widget
        title="Berita penting"
        icon={Bell}
        action={
          <Button size="xs" variant="ghost" asChild>
            <Link to="/notifikasi">Semua</Link>
          </Button>
        }
      >
        {notifications.isPending ? (
          <Skeleton className="h-24" />
        ) : (notifications.data?.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada pemberitahuan.</p>
        ) : (
          <ul className="space-y-2">
            {notifications.data?.data.map((n) => (
              <li key={n.id} className="flex gap-2 text-sm">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.readAt ? "bg-muted" : "bg-brand",
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  {n.link ? (
                    <Link to={n.link} className="font-medium hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <p className="font-medium">{n.title}</p>
                  )}
                  <p className="text-muted-foreground text-xs">{formatDateTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Widget>
    </div>
  );
}
