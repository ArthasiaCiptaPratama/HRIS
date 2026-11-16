import { AlarmClock, CalendarX2, ChevronRight, ClipboardList, ListTodo, Plane } from "lucide-react";
import { Link } from "react-router";
import type { Me } from "@/features/auth/schemas";
import { cn } from "@/lib/utils";
import { useMyLeave } from "../leave-api";
import { ABSEN_TASK_LINKS, usePersonalTasks } from "../personal-tasks";
import { useMyAttendanceRecord } from "../record-api";
import type { Today } from "../schemas";
import { addDays, DayStatusBadge, hhmm, todayIn, workDateLabel } from "./display";

// Beranda HP (paket UX 2026-10-20): pengingat absen langsung (TM-D2), Alpha yang masih bisa dikoreksi,
// saldo cuti, & status absen kemarin. Semua dihitung dari data yang sudah ada (tanpa menunggu cron).

const MINUTE = 60_000;

/** Banner merah selama ada absen yang belum dilakukan (dihitung langsung dari jadwal & jam server). */
export function PunchReminder({ data, clock }: { data: Today; clock: Date | null }) {
  const now = clock ?? new Date();
  const date = todayIn(data.timezone, now);
  const shift = data.roster.find((r) => r.date === date)?.shift;
  if (data.next === "OUT" && data.openDay?.scheduledEnd) {
    const end = Date.parse(data.openDay.scheduledEnd);
    if (now.getTime() < end) return null;
    return (
      <Banner tone="amber" icon={AlarmClock} title="Waktunya Clock Out">
        Jam pulang ({hhmmOf(end, data.timezone)}) sudah lewat. Lakukan Clock Out agar hari ini bisa
        disetujui.
      </Banner>
    );
  }
  if (data.next !== "IN" || !shift) return null;
  const start =
    Date.parse(`${date}T00:00:00Z`) - offsetMs(data.timezone, now) + shift.startMinute * MINUTE;
  const lateAt = start + shift.lateToleranceMin * MINUTE;
  if (now.getTime() < lateAt) return null;
  const late = Math.round((now.getTime() - start) / MINUTE);
  return (
    <Banner tone="red" icon={AlarmClock} title={`Belum Clock In — shift ${shift.code}`}>
      Shift mulai {hhmm(shift.startMinute)} (lewat{" "}
      {late >= 60 ? `${Math.floor(late / 60)} jam ` : ""}
      {late % 60} menit). Tanpa absen sama sekali, hari ini dihitung Alpha dan gaji hari itu tidak
      dihitung.
    </Banner>
  );
}

/** D-045 poin 9 di beranda absen (#102): HR meminta karyawan melengkapi data — sama dengan banner web. */
export function CompleteDataBanner({ me }: { me: Me }) {
  if (!me.onboarding?.completionRequired || me.onboarding.submitted) return null;
  return (
    <Link to="/onboarding" className="block">
      <Banner tone="amber" icon={ClipboardList} title="Lengkapi data Anda" link>
        HR meminta Anda melengkapi data karyawan (data pribadi, rekening, dokumen).
      </Banner>
    </Link>
  );
}

// Clock In/Out sudah ditangani kartu hari ini & pengingat absen di beranda absen.
const PUNCH_TASKS = new Set(["clock-in", "clock-out"]);

/** #102: "Perlu ditindaklanjuti" di beranda absen — isi sama dengan dashboard pribadi web. */
export function PersonalTasksCard({ me }: { me: Me }) {
  const { tasks, loading } = usePersonalTasks(me, ABSEN_TASK_LINKS);
  const items = tasks.filter((t) => !PUNCH_TASKS.has(t.id));
  if (loading || items.length === 0) return null;
  return (
    <section aria-labelledby="perlu-tindakan" className="bg-card rounded-2xl border p-3 shadow-xs">
      <h2 id="perlu-tindakan" className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
        <ListTodo className="size-4" /> Perlu ditindaklanjuti
      </h2>
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id}>
            <Link
              to={t.to}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 transition active:scale-[0.99]",
                t.tone === "danger"
                  ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
                  : t.tone === "warning"
                    ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                    : "bg-muted/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.detail ? (
                  <p className="text-muted-foreground truncate text-xs">{t.detail}</p>
                ) : null}
              </div>
              <span className="flex shrink-0 items-center text-xs font-medium">
                {t.cta} <ChevronRight className="size-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Alpha yang masih bisa dikoreksi (TM-D3): paling mendesak lebih dulu. */
export function AlphaBanner() {
  const record = useMyAttendanceRecord().data;
  const open = (record?.items ?? [])
    .filter((i) => i.outcome === "ALPHA_CORRECTABLE")
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const first = open[0];
  if (!record || !first) return null;
  const left = Math.round(
    (Date.parse(`${first.deadline}T00:00:00Z`) - Date.parse(`${record.today}T00:00:00Z`)) / 864e5,
  );
  return (
    <Link to="/absen/koreksi" className="block">
      <Banner
        tone="red"
        icon={CalendarX2}
        title={`${open.length} hari Alpha masih bisa dikoreksi`}
        link
      >
        Tercepat berakhir {workDateLabel(first.deadline)} (
        {left <= 0 ? "hari ini terakhir" : `sisa ${left} hari`}). Ketuk untuk mengajukan koreksi.
      </Banner>
    </Link>
  );
}

/** Kartu ringkas: saldo cuti tahun ini & status absen kemarin. */
export function HomeSummary({ data }: { data: Today }) {
  const leave = useMyLeave().data;
  const balance = leave?.balances.find((b) => b.year === leave.year);
  const yesterday = addDays(todayIn(data.timezone), -1);
  const day = data.recent.find((d) => d.workDate === yesterday);
  return (
    <section className="grid grid-cols-2 gap-3">
      <Link to="/absen/cuti" className="bg-card rounded-2xl border p-3 shadow-xs">
        <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
          <Plane className="size-3.5" /> Saldo cuti {leave?.year ?? ""}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {balance ? balance.balance : "—"}
          <span className="text-muted-foreground ml-1 text-xs font-normal">hari</span>
        </p>
        {balance && balance.held > 0 ? (
          <p className="text-muted-foreground text-[11px]">{balance.held} hari ditahan</p>
        ) : null}
      </Link>
      <Link to="/absen/riwayat" className="bg-card rounded-2xl border p-3 shadow-xs">
        <p className="text-muted-foreground text-[11px]">Kemarin · {workDateLabel(yesterday)}</p>
        <div className="mt-1.5">
          {day ? (
            <DayStatusBadge status={day.status} />
          ) : (
            <span className="text-muted-foreground text-sm">Tidak ada data</span>
          )}
        </div>
      </Link>
    </section>
  );
}

function Banner({
  tone,
  icon: Icon,
  title,
  link,
  children,
}: {
  tone: "red" | "amber";
  icon: typeof AlarmClock;
  title: string;
  link?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={
        tone === "red"
          ? "flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
          : "flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
      }
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-90">{children}</p>
      </div>
      {link ? <ChevronRight className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden /> : null}
    </div>
  );
}

/** Selisih zona waktu (ms) pada saat `at` — untuk menghitung jam mulai shift di zona waktu jam shift. */
function offsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return asUtc - Math.floor(at.getTime() / MINUTE) * MINUTE;
}

const hhmmOf = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(ms),
  );
