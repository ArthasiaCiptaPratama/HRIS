import { ATTENDANCE_LABEL_TEXT, type AttendanceLabel } from "@hris/shared";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  Camera,
  CircleAlert,
  ClipboardCheck,
  FilePenLine,
  History as HistoryIcon,
  House,
  LogIn,
  LogOut,
  MapPin,
  Plane,
  RefreshCw,
  Repeat,
  ScanFace,
  UserRound,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-provider";
import type { Me } from "@/features/auth/schemas";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import { useCancelPunch, usePrecheck, usePunch, useTimezone, useToday } from "../api";
import {
  CaptureError,
  cameraErrorMessage,
  compressSelfie,
  compressSelfieFile,
  type GpsFix,
  gpsErrorMessage,
  stampSelfie,
} from "../capture";
import {
  DayStatusBadge,
  hhmm,
  LabelChips,
  StepChips,
  timeIn,
  todayIn,
  workDateLabel,
} from "../components/display";
import { RosterWeek } from "../components/roster-week";
import type { Precheck, Today } from "../schemas";

// D-066: absen lewat PWA (tata letak HP, wajib online). Login sama dengan web. Selfie kamera langsung +
// GPS + waktu server; foto diberi cap waktu, lat/long/alt, & lokasi geofence. Label D-069 tidak
// memblokir tetapi alasan wajib. Setiap hari absen disetujui Atasan + HR (D-067).

/** Pasang manifest & service worker absen supaya bisa "Tambahkan ke layar utama". */
function usePwaInstall() {
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const added = !link;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/absen.webmanifest";
      document.head.appendChild(link);
    }
    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#17766f";
    document.head.appendChild(theme);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/absen-sw.js").catch(() => undefined);
    }
    return () => {
      if (added) link?.remove();
      theme.remove();
    };
  }, []);
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Jam server berjalan (selisih jam HP diabaikan; waktu absen tetap dicatat server). */
function useServerClock(serverTime: string | undefined, fetchedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!serverTime) return null;
  return new Date(Date.parse(serverTime) + (now - fetchedAt));
}

const greeting = (date: Date, timeZone: string) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(date),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
};

export function AbsenPage() {
  usePwaInstall();
  const online = useOnline();
  const me = useMe().data as Me;
  const { signOut } = useAuth();
  const today = useToday();
  const clock = useServerClock(today.data?.serverTime, today.dataUpdatedAt);
  const [flow, setFlow] = useState<"IN" | "OUT" | null>(null);
  const [noOpenWarning, setNoOpenWarning] = useState(false);
  // D-072: Clock Out tanpa Clock In kemungkinan salah pencet → tawarkan Clock In.
  const startPunch = (kind: "IN" | "OUT") => {
    if (kind === "OUT" && data?.next === "IN") setNoOpenWarning(true);
    else setFlow(kind);
  };
  const data = today.data;
  const fallbackTz = useTimezone();
  const tz = data?.timezone ?? fallbackTz;
  const historyRef = useRef<HTMLElement>(null);

  return (
    <div className="bg-muted/50 min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        {/* Kepala: logo, judul aplikasi, kembali ke web & keluar */}
        <header className="bg-card flex items-center gap-3 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <BrandLogo className="h-9" decorative />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-semibold">HRIS</p>
            <p className="text-muted-foreground text-[11px]">Attendance Online System</p>
          </div>
          <Button size="icon-sm" variant="ghost" asChild aria-label="Buka HRIS versi web">
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Keluar" onClick={() => void signOut()}>
            <LogOut />
          </Button>
        </header>

        <main className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-28">
          {!online ? (
            <Alert variant="destructive">
              <WifiOff />
              <AlertDescription>
                Tidak ada koneksi internet. Absen wajib online — sambungkan internet lalu coba lagi.
              </AlertDescription>
            </Alert>
          ) : null}

          {today.isPending ? (
            <Skeleton className="h-56 rounded-2xl" />
          ) : today.isError || !data ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>
                {errorMessage(today.error)}{" "}
                <button type="button" className="underline" onClick={() => void today.refetch()}>
                  Muat ulang
                </button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <TodayCard data={data} clock={clock} online={online} onPunch={startPunch} />
              <MenuGrid
                me={me}
                onHistory={() => historyRef.current?.scrollIntoView({ behavior: "smooth" })}
              />
              <RosterStrip data={data} today={todayIn(tz)} />
              <History data={data} tz={tz} sectionRef={historyRef} />
            </>
          )}
        </main>

        <BottomNav
          canPunch={Boolean(data) && online}
          next={data?.next ?? "IN"}
          onPunch={() => data && setFlow(data.next)}
          onHistory={() => historyRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
      </div>
      {noOpenWarning ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal
        >
          <div className="bg-card w-full max-w-sm space-y-3 rounded-2xl p-5 shadow-lg">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-5 text-amber-500" /> Belum Clock In
            </p>
            <p className="text-muted-foreground text-sm">
              Anda belum tercatat Clock In untuk hari kerja ini, jadi belum bisa Clock Out. Maksud
              Anda Clock In?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setNoOpenWarning(false)}>
                Batal
              </Button>
              <button
                type="button"
                className="h-9 rounded-md bg-emerald-600 text-sm font-semibold text-white"
                onClick={() => {
                  setNoOpenWarning(false);
                  setFlow("IN");
                }}
              >
                Ya, Clock In
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {flow && data ? (
        <PunchFlow kind={flow} data={data} clock={clock} onClose={() => setFlow(null)} />
      ) : null}
    </div>
  );
}

function TodayCard({
  data,
  clock,
  online,
  onPunch,
}: {
  data: Today;
  clock: Date | null;
  online: boolean;
  onPunch: (kind: "IN" | "OUT") => void;
}) {
  const tz = data.timezone;
  const now = clock ?? new Date();
  const date = todayIn(tz, now);
  const roster = data.roster.find((r) => r.date === date);
  // Hari kerja yang sedang berjalan: yang masih terbuka, atau absen tanggal hari ini.
  const current = data.openDay ?? data.recent.find((d) => d.workDate === date) ?? null;
  const inAt = current?.punches.find((p) => p.kind === "IN")?.at ?? null;
  const outAt = current?.punches.find((p) => p.kind === "OUT")?.at ?? null;
  const dateText = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: tz,
  }).format(now);
  return (
    <section className="bg-card rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{greeting(now, tz)}</p>
          <p className="truncate text-sm">{data.employee.fullName}</p>
          <p className="text-muted-foreground truncate text-[11px]">
            <span className="font-mono">{data.employee.employeeNumber ?? "—"}</span>
            {roster?.shift
              ? ` · ${roster.shift.code} ${hhmm(roster.shift.startMinute)}–${hhmm(roster.shift.endMinute)}`
              : roster
                ? " · OFF"
                : " · Tanpa roster"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-muted-foreground text-[11px]">{dateText}</p>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {clock
              ? new Intl.DateTimeFormat("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZone: tz,
                }).format(clock)
              : "--:--:--"}
          </p>
          <p className="text-muted-foreground mt-0.5 flex max-w-36 items-center justify-end gap-1 truncate text-[11px]">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{data.location?.name ?? "Lokasi belum diatur"}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!online}
          onClick={() => onPunch("IN")}
          className={cn(
            "flex h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl bg-emerald-600 text-white shadow-sm transition active:scale-[0.98] disabled:opacity-40",
            data.next !== "IN" && "opacity-70",
          )}
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <LogIn className="size-5" /> Datang
          </span>
          <span className="font-mono text-sm tabular-nums">
            {inAt ? timeIn(inAt, tz) : "--:--"}
          </span>
          <span className="text-[10px] opacity-80">Clock In</span>
        </button>
        <button
          type="button"
          disabled={!online}
          onClick={() => onPunch("OUT")}
          className={cn(
            "flex h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl bg-blue-600 text-white shadow-sm transition active:scale-[0.98] disabled:opacity-40",
            data.next !== "OUT" && "opacity-70",
          )}
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <LogOut className="size-5" /> Pulang
          </span>
          <span className="font-mono text-sm tabular-nums">
            {outAt ? timeIn(outAt, tz) : "--:--"}
          </span>
          <span className="text-[10px] opacity-80">Clock Out</span>
        </button>
      </div>
      <p className="text-muted-foreground mt-2 text-center text-[11px]">
        Jam masuk/pulang mengikuti data kehadiran Anda hari ini.
      </p>
    </section>
  );
}

function MenuTile({
  to,
  onClick,
  icon: Icon,
  label,
  tone,
}: {
  to?: string;
  onClick?: () => void;
  icon: typeof House;
  label: string;
  tone: string;
}) {
  const inner = (
    <>
      <span className={cn("grid size-11 place-items-center rounded-xl", tone)}>
        <Icon className="size-5" />
      </span>
      <span className="text-center text-[11px] leading-tight font-medium">{label}</span>
    </>
  );
  const cls =
    "flex flex-col items-center gap-1.5 rounded-xl p-2 transition active:scale-95 hover:bg-muted";
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function MenuGrid({ me, onHistory }: { me: Me; onHistory: () => void }) {
  return (
    <section className="bg-card rounded-2xl border p-3 shadow-xs">
      <h2 className="mb-2 px-1 text-sm font-semibold">Menu</h2>
      <div className="grid grid-cols-4 gap-1">
        <MenuTile
          to="/time/roster"
          icon={CalendarRange}
          label="Roster"
          tone="bg-violet-100 text-violet-700"
        />
        <MenuTile
          to="/time/pernyataan"
          icon={FilePenLine}
          label="Koreksi Absen"
          tone="bg-amber-100 text-amber-700"
        />
        <MenuTile
          onClick={onHistory}
          icon={HistoryIcon}
          label="Riwayat"
          tone="bg-emerald-100 text-emerald-700"
        />
        <MenuTile to="/time/cuti" icon={Plane} label="Cuti & Izin" tone="bg-sky-100 text-sky-700" />
        <MenuTile
          to="/time/perubahan-roster"
          icon={Repeat}
          label="Tukar Shift"
          tone="bg-rose-100 text-rose-700"
        />
        <MenuTile
          to="/time/kalender"
          icon={CalendarDays}
          label="Kalender"
          tone="bg-orange-100 text-orange-700"
        />
        {tmAccess.reviewDays(me) || tmAccess.decideLeave(me) ? (
          <MenuTile
            to={tmAccess.reviewDays(me) ? "/time/absen-harian" : "/time/persetujuan-cuti"}
            icon={ClipboardCheck}
            label="Approval"
            tone="bg-teal-100 text-teal-700"
          />
        ) : null}
        <MenuTile to="/profil" icon={UserRound} label="Profil" tone="bg-slate-100 text-slate-700" />
      </div>
    </section>
  );
}

function RosterStrip({ data, today }: { data: Today; today: string }) {
  if (data.roster.length === 0) return null;
  return (
    <section className="bg-card rounded-2xl border p-3 shadow-xs">
      <h2 className="mb-2 px-1 text-sm font-semibold">Roster 7 hari</h2>
      <RosterWeek roster={data.roster} today={today} />
    </section>
  );
}

function History({
  data,
  tz,
  sectionRef,
}: {
  data: Today;
  tz: string;
  sectionRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <section ref={sectionRef} className="scroll-mt-4">
      <h2 className="mb-2 text-sm font-semibold">Riwayat 7 hari</h2>
      {data.recent.length === 0 ? (
        <p className="text-muted-foreground text-sm">Belum ada absen.</p>
      ) : (
        <ul className="space-y-2">
          {data.recent.map((day) => {
            const inPunch = day.punches.find((p) => p.kind === "IN");
            const outPunch = day.punches.find((p) => p.kind === "OUT");
            return (
              <li key={day.id} className="bg-card space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {workDateLabel(day.workDate)}
                    {day.shiftCode ? (
                      <span className="text-muted-foreground font-normal"> · {day.shiftCode}</span>
                    ) : null}
                  </p>
                  <DayStatusBadge status={day.status} />
                </div>
                {[inPunch, outPunch].map((punch, index) => (
                  <PunchRow
                    key={index === 0 ? "IN" : "OUT"}
                    label={index === 0 ? "Clock In" : "Clock Out"}
                    punch={punch}
                    tz={tz}
                  />
                ))}
                <LabelChips labels={day.labels} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Satu absen di riwayat: jam, status persetujuan Atasan/HR, dan batal (salah pencet) bila masih boleh. */
function PunchRow({
  label,
  punch,
  tz,
}: {
  label: string;
  punch: Today["recent"][number]["punches"][number] | undefined;
  tz: string;
}) {
  const cancel = useCancelPunch();
  if (!punch) {
    return (
      <p className="text-muted-foreground text-xs">
        {label}: <span className="tabular-nums">—</span>
      </p>
    );
  }
  return (
    <div className="bg-muted/50 space-y-1 rounded-lg px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>
          {label} <span className="font-semibold tabular-nums">{timeIn(punch.at, tz)}</span>
          {punch.source === "MANUAL" ? (
            <span className="text-muted-foreground"> · manual HR</span>
          ) : null}
        </span>
        {punch.canCancel ? (
          <button
            type="button"
            className="text-destructive text-[11px] underline"
            disabled={cancel.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `Batalkan ${label} ${timeIn(punch.at, tz)}? Gunakan bila salah pencet.`,
                )
              )
                return;
              cancel.mutate(punch.id, {
                onSuccess: () =>
                  toast.success(
                    `${label} dibatalkan. Silakan absen ulang dengan tombol yang benar.`,
                  ),
                onError: (e) => toast.error(errorMessage(e)),
              });
            }}
          >
            Batalkan (salah pencet)
          </button>
        ) : null}
      </div>
      <StepChips approval={punch.approval} />
    </div>
  );
}

function BottomNav({
  canPunch,
  next,
  onPunch,
  onHistory,
}: {
  canPunch: boolean;
  next: "IN" | "OUT";
  onPunch: () => void;
  onHistory: () => void;
}) {
  const item = (icon: ReactNode, label: string, props: { to?: string; onClick?: () => void }) => {
    const cls = "text-muted-foreground flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]";
    return props.to ? (
      <Link to={props.to} className={cls}>
        {icon}
        {label}
      </Link>
    ) : (
      <button type="button" onClick={props.onClick} className={cls}>
        {icon}
        {label}
      </button>
    );
  };
  return (
    <nav className="bg-card fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]">
      <div className="relative mx-auto flex max-w-md items-end px-2">
        {item(<House className="text-brand size-5" />, "Home", {
          onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
        })}
        {item(<HistoryIcon className="size-5" />, "Riwayat", { onClick: onHistory })}
        <div className="flex flex-1 flex-col items-center">
          {/* Akses cepat: langsung kamera untuk absen berikutnya (Clock In / Clock Out). */}
          <button
            type="button"
            disabled={!canPunch}
            onClick={onPunch}
            aria-label={next === "IN" ? "Absen wajah: Clock In" : "Absen wajah: Clock Out"}
            className="ring-card -mt-7 grid size-16 place-items-center rounded-full bg-violet-600 text-white shadow-lg ring-4 transition active:scale-95 disabled:opacity-50"
          >
            <ScanFace className="size-7" />
          </button>
          <span className="text-muted-foreground pb-1 text-[10px]">
            {next === "IN" ? "Clock In" : "Clock Out"}
          </span>
        </div>
        {item(<Plane className="size-5" />, "Cuti", { to: "/time/cuti" })}
        {item(<FilePenLine className="size-5" />, "Koreksi", { to: "/time/pernyataan" })}
      </div>
    </nav>
  );
}

// ── Alur absen: kamera → GPS → pra-cek → cap foto → alasan → kirim ──────────────

function PunchFlow({
  kind: initialKind,
  data,
  clock,
  onClose,
}: {
  kind: "IN" | "OUT";
  data: Today;
  clock: Date | null;
  onClose: () => void;
}) {
  const accuracyMax = data.gpsAccuracyMaxM;
  const [kind, setKind] = useState<"IN" | "OUT">(initialKind);
  const [confirmed, setConfirmed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [raw, setRaw] = useState<{ blob: Blob; takenAt: Date; url: string } | null>(null);
  const [stamped, setStamped] = useState<{ blob: Blob; url: string } | null>(null);
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [check, setCheck] = useState<Precheck | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const precheck = usePrecheck();
  const punch = usePunch();
  const clockRef = useRef(clock);
  clockRef.current = clock;

  const stopCamera = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Kamera langsung tidak didukung browser ini. Gunakan tombol ambil foto.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraReady(true);
    } catch (error) {
      setCameraError(cameraErrorMessage(error));
    }
  }, []);

  // Kamera menyala saat dialog dibuka (dan saat foto diulang).
  useEffect(() => {
    if (!raw) void startCamera();
    return stopCamera;
  }, [raw, startCamera, stopCamera]);

  // GPS terus dipantau supaya akurasi membaik selama karyawan berfoto.
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Perangkat tidak mendukung lokasi.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (position) => {
        setGpsError("");
        setGps((prev) => {
          const next: GpsFix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: Math.round(position.coords.accuracy),
            altitudeM: position.coords.altitude,
            at: position.timestamp,
          };
          // Pakai titik yang lebih akurat, atau yang lebih baru bila lama sudah > 30 detik.
          return !prev || next.accuracyM <= prev.accuracyM || next.at - prev.at > 30_000
            ? next
            : prev;
        });
      },
      (error) => setGpsError(gpsErrorMessage(error)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Pra-cek ulang saat posisi berubah berarti (label & jarak mengikuti posisi terbaru).
  const lastChecked = useRef<string>("");
  useEffect(() => {
    if (!gps) return;
    const key = `${kind}:${gps.latitude.toFixed(4)},${gps.longitude.toFixed(4)},${Math.round(gps.accuracyM / 10)}`;
    if (key === lastChecked.current) return;
    lastChecked.current = key;
    precheck.mutate(
      { kind, latitude: gps.latitude, longitude: gps.longitude, accuracyM: gps.accuracyM },
      { onSuccess: setCheck, onError: (error) => toast.error(errorMessage(error)) },
    );
  }, [gps, kind, precheck.mutate]);

  // Cap foto: waktu, lat/long/alt, & lokasi geofence (diperbarui bila posisi/pra-cek berubah).
  useEffect(() => {
    if (!raw || !gps || !check) {
      setStamped(null);
      return;
    }
    let cancelled = false;
    const place = check.location
      ? `${check.location.name} · ${check.insideGeofence ? "dalam" : "LUAR"} radius${
          check.distanceM !== null ? ` (${check.distanceM} m)` : ""
        }`
      : "Lokasi acuan belum diatur";
    void stampSelfie(raw.blob, {
      title: kind === "IN" ? "ABSEN DATANG" : "ABSEN PULANG",
      employee: `${data.employee.fullName} (${data.employee.employeeNumber ?? "—"})`,
      at: raw.takenAt,
      timezone: data.timezone,
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracyM: gps.accuracyM,
      altitudeM: gps.altitudeM,
      place,
    })
      .then((blob) => {
        if (cancelled) return;
        setStamped((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { blob, url: URL.createObjectURL(blob) };
        });
      })
      .catch((error) =>
        toast.error(error instanceof CaptureError ? error.message : "Gagal memberi cap foto."),
      );
    return () => {
      cancelled = true;
    };
  }, [raw, gps, check, kind, data.employee, data.timezone]);

  const takenNow = () => clockRef.current ?? new Date();
  useEffect(() => () => (raw ? URL.revokeObjectURL(raw.url) : undefined), [raw]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const blob = await compressSelfie(video, video.videoWidth, video.videoHeight);
      stopCamera();
      setRaw({ blob, takenAt: takenNow(), url: URL.createObjectURL(blob) });
    } catch (error) {
      toast.error(error instanceof CaptureError ? error.message : "Gagal mengambil foto.");
    }
  };

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await compressSelfieFile(file);
      stopCamera();
      setRaw({ blob, takenAt: takenNow(), url: URL.createObjectURL(blob) });
    } catch (error) {
      toast.error(error instanceof CaptureError ? error.message : "Gagal memproses foto.");
    }
  };

  const submit = async () => {
    if (!stamped || !gps || !check) return;
    if (check.suspicion && !confirmed) {
      toast.error("Centang konfirmasi bahwa Anda tidak salah memilih Clock In / Clock Out.");
      return;
    }
    if (check.reasonRequired && reason.trim().length < 3) {
      setReasonError("Tulis alasan (minimal 3 karakter).");
      return;
    }
    try {
      await punch.mutateAsync({
        kind,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracyM: gps.accuracyM,
        altitudeM: gps.altitudeM,
        reason: reason.trim() || undefined,
        confirmed: check.suspicion ? confirmed : undefined,
        selfie: stamped.blob,
        contentType: "image/jpeg",
      });
      toast.success(
        kind === "IN"
          ? "Absen datang tercatat. Persetujuan berjalan setelah absen pulang."
          : "Absen pulang tercatat. Menunggu persetujuan Atasan & HR.",
      );
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const blocked = kind === "IN" && check?.alreadyCheckedIn;
  const ready = Boolean(stamped && gps && check && !blocked && (!check.suspicion || confirmed));
  const switchKind = (next: "IN" | "OUT") => {
    setKind(next);
    setCheck(null);
    setConfirmed(false);
    lastChecked.current = "";
  };

  return (
    <div className="bg-background fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Tutup">
            <ArrowLeft />
          </Button>
          <h1 className="text-lg font-semibold">
            {kind === "IN" ? "Absen Datang" : "Absen Pulang"}
          </h1>
        </div>

        <div className="bg-muted relative aspect-[3/4] overflow-hidden rounded-2xl">
          {raw ? (
            <img
              src={stamped?.url ?? raw.url}
              alt="Selfie absen dengan cap lokasi"
              className="size-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full -scale-x-100 object-cover"
              aria-label="Pratinjau kamera depan"
            />
          )}
          {!raw && !cameraReady ? (
            <div className="text-muted-foreground absolute inset-0 grid place-items-center p-6 text-center text-sm">
              {cameraError || "Membuka kamera…"}
            </div>
          ) : null}
          {raw && !stamped ? (
            <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-center text-xs text-white">
              Menunggu lokasi untuk cap foto…
            </div>
          ) : null}
        </div>

        {raw ? (
          <Button variant="outline" onClick={() => setRaw(null)}>
            <RefreshCw /> Ulangi foto
          </Button>
        ) : cameraReady ? (
          <Button variant="brand" size="lg" onClick={() => void capture()}>
            <Camera /> Ambil foto
          </Button>
        ) : (
          <Label className="border-input hover:bg-accent flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm">
            <Camera className="size-4" /> Ambil foto dengan kamera
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="sr-only"
              onChange={(e) => void fromFile(e.target.files?.[0])}
            />
          </Label>
        )}

        <section className="bg-card space-y-2 rounded-2xl border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <MapPin className="size-4" /> Lokasi
          </p>
          {gpsError ? (
            <p className="text-destructive">{gpsError}</p>
          ) : !gps ? (
            <p className="text-muted-foreground">Mencari lokasi GPS…</p>
          ) : (
            <p className="text-muted-foreground font-mono text-xs tabular-nums">
              {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)} · ±{gps.accuracyM} m
              {gps.altitudeM !== null ? ` · alt ${Math.round(gps.altitudeM)} m` : ""}
              {gps.accuracyM > accuracyMax ? ` (batas ${accuracyMax} m — tunggu sebentar)` : ""}
            </p>
          )}
          {check ? (
            <div className="space-y-2">
              <p>
                {check.location ? (
                  <>
                    {check.insideGeofence ? "Di dalam" : "Di luar"} radius{" "}
                    <span className="font-medium">{check.location.name}</span>
                    {check.distanceM !== null ? ` · ${check.distanceM} m dari titik` : ""}
                  </>
                ) : (
                  "Lokasi acuan belum diatur."
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                Tanggal kerja {workDateLabel(check.workDate)}
                {check.shiftCode ? ` · shift ${check.shiftCode}` : ""}
              </p>
              {check.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {check.labels.map((label) => (
                    <Badge key={label} variant="warning">
                      {ATTENDANCE_LABEL_TEXT[label as AttendanceLabel] ?? label}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Badge variant="success">Sesuai jadwal & lokasi</Badge>
              )}
            </div>
          ) : null}
        </section>

        {check?.suspicion ? (
          <SuspicionCard
            check={check}
            kind={kind}
            tz={data.timezone}
            confirmed={confirmed}
            onConfirm={setConfirmed}
            onSwitch={switchKind}
          />
        ) : null}

        {blocked ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              Sudah ada absen datang untuk tanggal kerja ini. Absen ganda tidak bisa disimpan.
            </AlertDescription>
          </Alert>
        ) : null}

        {check?.reasonRequired ? (
          <div className="space-y-2">
            <Label htmlFor="punch-reason">
              Alasan <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="punch-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError("");
              }}
              placeholder="Contoh: menunggu bus jemputan, sinyal GPS lemah di pit…"
              aria-invalid={Boolean(reasonError)}
            />
            {reasonError ? <p className="text-destructive text-xs">{reasonError}</p> : null}
            <p className="text-muted-foreground text-xs">
              Absen tetap tercatat; Atasan & HR melihat label dan alasan ini saat memutuskan.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          disabled={!ready || punch.isPending}
          onClick={() => void submit()}
          className={cn(
            "mt-auto h-14 rounded-2xl text-base font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-40",
            kind === "IN" ? "bg-emerald-600" : "bg-blue-600",
          )}
        >
          {punch.isPending
            ? "Menyimpan…"
            : kind === "IN"
              ? "Kirim absen datang"
              : "Kirim absen pulang"}
        </button>
      </div>
    </div>
  );
}

function minutesText(minutes: number) {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
}

/**
 * D-072: peringatan kemungkinan salah pencet — membandingkan jam sekarang dengan jadwal pulang.
 * Absen tetap bisa dikirim setelah karyawan mencentang konfirmasi (server juga memeriksa).
 */
function SuspicionCard({
  check,
  kind,
  tz,
  confirmed,
  onConfirm,
  onSwitch,
}: {
  check: Precheck;
  kind: "IN" | "OUT";
  tz: string;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onSwitch: (kind: "IN" | "OUT") => void;
}) {
  const end = check.scheduledEnd ? timeIn(check.scheduledEnd, tz) : null;
  const diff = check.minutesFromEnd;
  let title = "";
  let body = "";
  if (check.suspicion === "OUT_BEFORE_END") {
    title = "Belum waktunya pulang";
    body = `Jadwal pulang ${end ?? "-"}, masih ${diff !== null ? minutesText(diff) : "-"} lagi. Clock Out sekarang akan tercatat pulang cepat.`;
  } else if (check.suspicion === "IN_AFTER_END") {
    title = diff !== null && diff >= 0 ? "Sudah lewat jam pulang" : "Mendekati jam pulang";
    body = `Jadwal pulang ${end ?? "-"} (${diff !== null ? `${minutesText(diff)} ${diff >= 0 ? "lewat" : "lagi"}` : "-"}). Apakah Anda sebenarnya ingin Clock Out?`;
  } else {
    title = "Anda masih tercatat Clock In";
    body = `Clock In sejak ${check.openDay?.checkInAt ? timeIn(check.openDay.checkInAt, tz) : "-"} (${check.openDay ? workDateLabel(check.openDay.workDate) : "-"}) belum Clock Out. Maksud Anda Clock Out?`;
  }
  const canSwitchToOut = check.suspicion === "IN_WHILE_OPEN";
  return (
    <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4" /> {title} — salah pencet?
      </p>
      <p>{body}</p>
      {canSwitchToOut ? (
        <button
          type="button"
          onClick={() => onSwitch("OUT")}
          className="h-9 w-full rounded-md bg-blue-600 text-sm font-semibold text-white"
        >
          Ganti ke Clock Out
        </button>
      ) : null}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-amber-600"
          checked={confirmed}
          onChange={(e) => onConfirm(e.target.checked)}
        />
        <span>
          Saya yakin, ini memang {kind === "IN" ? "Clock In" : "Clock Out"} (bukan salah pencet).
        </span>
      </label>
    </section>
  );
}
