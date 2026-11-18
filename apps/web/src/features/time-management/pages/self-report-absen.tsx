import { CLOCK_KINDS, type ClockKind, PUNCH_KIND_LABELS } from "@hris/shared";
import { ChevronRight, CircleAlert, ImagePlus, LocateFixed, NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useTimezone, useToday } from "../api";
import {
  CaptureError,
  compressSelfieFile,
  type GpsFix,
  gpsErrorMessage,
  stampSelfie,
} from "../capture";
import { todayIn } from "../components/display";
import { type SelfReportStatus, useSelfReportPunch, useSelfReportStatus } from "../self-report-api";

// ════════════════════════════════════════════════════════════════════════════════════════════
// TM-D29 — ABSEN MANDIRI (STAGING) di /absen (PWA). Hanya anggota crew yang diizinkan HR (The Intern's):
// isi jam masuk/pulang sendiri untuk tanggal mana pun, foto dari galeri (diberi cap "ABSEN MANDIRI -
// FOTO GALERI" + waktu unggah sebenarnya), GPS HP; tetap menunggu persetujuan atasan & HR.
// Hapus file ini + kartu di absen-page.tsx + route /absen/mandiri saat fitur dicabut
// (docs/features/time-management/tm-d29-absen-mandiri.md).
// ════════════════════════════════════════════════════════════════════════════════════════════

export const SELF_REPORT_STAMP = "ABSEN MANDIRI - FOTO GALERI";

/** Jarak meter (haversine) — hanya tampilan; server menghitung ulang. */
export function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

function siteDistance(status: SelfReportStatus | undefined, gps: GpsFix | null) {
  const loc = status?.location;
  if (!loc || !gps || loc.latitude === null || loc.longitude === null) return null;
  return distanceM(gps, { latitude: loc.latitude, longitude: loc.longitude });
}

/** Kartu di beranda /absen — tampil hanya bila akun ini anggota crew berizin. */
export function SelfReportCard() {
  const status = useSelfReportStatus();
  if (!status.data?.enabled) return null;
  return (
    <Link
      to="/absen/mandiri"
      className="bg-card hover:border-brand flex items-center gap-3 rounded-2xl border p-3 shadow-xs transition"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700">
        <NotebookPen className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Absen mandiri</span>
        <span className="text-muted-foreground block truncate text-[11px]">
          Crew {status.data.crewName} · isi jam sendiri, perlu persetujuan
        </span>
      </span>
      <ChevronRight className="text-muted-foreground size-4" />
    </Link>
  );
}

export function SelfReportAbsenPage() {
  // Tanpa impor absen-page (hindari impor melingkar): data hari ini & zona waktu langsung dari API.
  const data = useToday().data;
  const fallbackTz = useTimezone();
  const tz = data?.timezone ?? fallbackTz;
  const status = useSelfReportStatus();
  const submit = useSelfReportPunch();
  const navigate = useNavigate();
  const [workDate, setWorkDate] = useState(() => todayIn(tz));
  const [kind, setKind] = useState<ClockKind>("IN");
  const [time, setTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState("");

  // GPS HP dipantau terus (lokasi asli tercatat; lokasi acuan tetap lokasi crew).
  useEffect(() => {
    const geo = navigator.geolocation;
    if (!geo) {
      setGpsError("Perangkat tidak mendukung lokasi.");
      return;
    }
    const id = geo.watchPosition(
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
          return !prev || next.accuracyM <= prev.accuracyM || next.at - prev.at > 30_000
            ? next
            : prev;
        });
      },
      (error) => setGpsError(gpsErrorMessage(error)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    return () => geo.clearWatch(id);
  }, []);
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  if (status.isSuccess && !status.data.enabled) {
    return (
      <Alert>
        <CircleAlert />
        <AlertDescription>
          Absen mandiri hanya untuk crew yang diizinkan HR.{" "}
          <Link to="/absen" className="underline">
            Kembali
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await compressSelfieFile(file);
      setPhoto((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch (error) {
      toast.error(error instanceof CaptureError ? error.message : "Gagal memproses foto.");
    }
  };

  const distance = siteDistance(status.data, gps);
  const problem = !workDate
    ? "Pilih tanggal."
    : !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
      ? "Isi jam (HH:mm)."
      : !photo
        ? "Pilih foto dari galeri."
        : !gps
          ? gpsError || "Menunggu lokasi GPS…"
          : null;

  const send = async () => {
    if (problem || !photo || !gps) return;
    try {
      const stamped = await stampSelfie(photo.blob, {
        title: SELF_REPORT_STAMP,
        employee: data
          ? `${data.employee.fullName} (${data.employee.employeeNumber ?? "—"})`
          : "Karyawan",
        // Waktu unggah SEBENARNYA (bukan jam yang diisi) — jam yang diisi ditulis di baris lokasi.
        at: new Date(),
        timezone: tz,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracyM: gps.accuracyM,
        altitudeM: gps.altitudeM,
        place: `Diisi: ${PUNCH_KIND_LABELS[kind]} ${workDate} ${time} · ${
          status.data?.location?.name ?? "lokasi crew"
        }${distance !== null ? ` (${distance} m)` : ""}`,
      });
      await submit.mutateAsync({
        workDate,
        kind,
        time,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracyM: gps.accuracyM,
        altitudeM: gps.altitudeM,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        photo: stamped,
      });
      toast.success(
        `${PUNCH_KIND_LABELS[kind]} ${workDate} ${time} tersimpan — menunggu persetujuan.`,
      );
      navigate("/absen");
    } catch (error) {
      toast.error(error instanceof CaptureError ? error.message : errorMessage(error));
    }
  };

  return (
    <div className="space-y-3">
      <Alert>
        <NotebookPen />
        <AlertDescription>
          Absen mandiri crew {status.data?.crewName ?? "…"}: isi tanggal & jam sendiri, foto dari
          galeri. Tercatat sebagai “Absen mandiri” dan menunggu persetujuan atasan & HR.
        </AlertDescription>
      </Alert>

      <section className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
        <fieldset className="grid grid-cols-2 gap-1 rounded-lg border p-1">
          <legend className="sr-only">Jenis</legend>
          {CLOCK_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium transition",
                kind === k ? "bg-brand text-white" : "text-muted-foreground",
              )}
            >
              {k === "IN" ? "Masuk" : "Pulang"}
            </button>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="sr-date">Tanggal</Label>
            <Input
              id="sr-date"
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sr-time">Jam</Label>
            <Input
              id="sr-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sr-photo">Foto dari galeri</Label>
          <label
            htmlFor="sr-photo"
            className="hover:border-brand flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3"
          >
            {photo ? (
              <img
                src={photo.url}
                alt="Foto terpilih"
                className="size-16 rounded-md object-cover"
              />
            ) : (
              <span className="bg-muted grid size-16 place-items-center rounded-md">
                <ImagePlus className="text-muted-foreground size-6" />
              </span>
            )}
            <span className="text-sm">{photo ? "Ganti foto" : "Pilih foto"}</span>
          </label>
          <input
            id="sr-photo"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
        </div>

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <LocateFixed className="size-3.5" />
          {gps
            ? `GPS ±${gps.accuracyM} m${
                distance !== null ? ` · ${distance} m dari ${status.data?.location?.name}` : ""
              }`
            : gpsError || "Mencari lokasi GPS…"}
        </p>

        <div className="space-y-1">
          <Label htmlFor="sr-reason">Alasan (opsional)</Label>
          <Textarea
            id="sr-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {problem ? <p className="text-muted-foreground text-xs">{problem}</p> : null}
        <Button className="w-full" disabled={Boolean(problem) || submit.isPending} onClick={send}>
          {submit.isPending ? "Menyimpan…" : `Simpan ${kind === "IN" ? "jam masuk" : "jam pulang"}`}
        </Button>
      </section>
    </div>
  );
}
