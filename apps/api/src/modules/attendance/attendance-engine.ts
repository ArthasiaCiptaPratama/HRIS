import type { AttendanceLabel } from "@hris/shared";
import { isoAddDays } from "./roster-engine.ts";

// Logika absen murni (D-067, D-070): waktu, pemilihan tanggal kerja, label, jarak GPS. Tanpa I/O.

/** Indonesia tanpa DST → offset tetap. */
const TZ_OFFSET_HOURS: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const MINUTE = 60_000;

export const offsetMinutes = (timezone: string) => (TZ_OFFSET_HOURS[timezone] ?? 7) * 60;

/** Tanggal lokal (YYYY-MM-DD) dari instan UTC di zona tertentu. */
export const localDate = (now: Date, timezone: string) =>
  new Date(now.getTime() + offsetMinutes(timezone) * MINUTE).toISOString().slice(0, 10);

export interface ShiftTimes {
  startMinute: number;
  endMinute: number;
  checkInOpenMin: number;
  lateToleranceMin: number;
  earlyLeaveToleranceMin: number;
  checkOutCloseMin: number;
}

export interface ShiftWindow {
  start: Date;
  end: Date;
  checkInOpen: Date;
  checkOutDeadline: Date;
}

/** Instan mulai/selesai shift untuk tanggal kerja (shift lintas tengah malam selesai keesokan harinya). */
export function shiftWindow(workDate: string, shift: ShiftTimes, timezone: string): ShiftWindow {
  const midnightUtc = Date.parse(`${workDate}T00:00:00.000Z`) - offsetMinutes(timezone) * MINUTE;
  const start = midnightUtc + shift.startMinute * MINUTE;
  const endDay = shift.endMinute <= shift.startMinute ? 1 : 0;
  const end = midnightUtc + (endDay * 24 * 60 + shift.endMinute) * MINUTE;
  return {
    start: new Date(start),
    end: new Date(end),
    checkInOpen: new Date(start - shift.checkInOpenMin * MINUTE),
    checkOutDeadline: new Date(end + shift.checkOutCloseMin * MINUTE),
  };
}

export interface RosterCandidate {
  workDate: string;
  /** null = OFF; undefined = tidak ada hari roster. */
  shift: ShiftTimes | null | undefined;
}

export interface CheckInPlan {
  workDate: string;
  shift: ShiftTimes | null;
  window: ShiftWindow | null;
  labels: AttendanceLabel[];
}

/**
 * Absen masuk: cari hari roster (kemarin untuk shift malam, hari ini, besok) yang jendela masuknya
 * [buka absen, selesai shift] memuat `now`. Tidak ketemu → tanggal lokal hari ini + label.
 */
export function planCheckIn(
  now: Date,
  timezone: string,
  candidates: RosterCandidate[],
): CheckInPlan {
  const t = now.getTime();
  for (const c of candidates) {
    if (!c.shift) continue;
    const w = shiftWindow(c.workDate, c.shift, timezone);
    if (t >= w.checkInOpen.getTime() && t <= w.end.getTime()) {
      const labels: AttendanceLabel[] = [];
      if (t > w.start.getTime() + c.shift.lateToleranceMin * MINUTE) labels.push("LATE");
      return { workDate: c.workDate, shift: c.shift, window: w, labels };
    }
  }
  const today = localDate(now, timezone);
  const todayRoster = candidates.find((c) => c.workDate === today);
  return {
    workDate: today,
    shift: todayRoster?.shift ?? null,
    window: todayRoster?.shift ? shiftWindow(today, todayRoster.shift, timezone) : null,
    labels: [
      todayRoster === undefined || todayRoster.shift === undefined ? "NO_ROSTER" : "OUTSIDE_ROSTER",
    ],
  };
}

/** Kandidat tanggal kerja di sekitar `now` (kemarin, hari ini, besok). */
export const candidateDates = (now: Date, timezone: string) => {
  const today = localDate(now, timezone);
  return [isoAddDays(today, -1), today, isoAddDays(today, 1)];
};

/** Label absen pulang terhadap jadwal hari itu. */
export function checkOutLabels(
  now: Date,
  shift: ShiftTimes | null,
  window: ShiftWindow | null,
): AttendanceLabel[] {
  if (!shift || !window) return [];
  const t = now.getTime();
  if (t < window.end.getTime() - shift.earlyLeaveToleranceMin * MINUTE) return ["EARLY_LEAVE"];
  if (t > window.checkOutDeadline.getTime()) return ["OUTSIDE_ROSTER"];
  return [];
}

// ── Geofence ───────────────────────────────────────────────────────────────────

export interface Point {
  latitude: number;
  longitude: number;
}

/** Jarak permukaan bumi (meter), rumus haversine. */
export function distanceM(a: Point, b: Point): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export interface GeofenceSite extends Point {
  id: string;
  radiusM: number;
}

export interface GeofenceResult {
  /** Lokasi acuan jarak (yang diharapkan, atau lokasi lain tempat karyawan berada). */
  workLocationId: string | null;
  distanceM: number | null;
  inside: boolean;
  labels: AttendanceLabel[];
}

/**
 * Cek posisi terhadap lokasi yang diharapkan (crew/lokasi kerja). Di luar radius tetapi di dalam lokasi lain →
 * OTHER_LOCATION; di luar semua → OUTSIDE_RADIUS. Akurasi buruk → LOW_ACCURACY (tetap dihitung).
 */
export function checkGeofence(
  position: Point & { accuracyM: number },
  expected: GeofenceSite | null,
  others: GeofenceSite[],
  accuracyMaxM: number,
): GeofenceResult {
  const labels: AttendanceLabel[] = [];
  if (position.accuracyM > accuracyMaxM) labels.push("LOW_ACCURACY");
  const inside = (site: GeofenceSite) => distanceM(position, site) <= site.radiusM;
  if (expected) {
    const d = distanceM(position, expected);
    if (d <= expected.radiusM)
      return { workLocationId: expected.id, distanceM: d, inside: true, labels };
    const other = others.find((site) => site.id !== expected.id && inside(site));
    if (other) {
      return {
        workLocationId: other.id,
        distanceM: distanceM(position, other),
        inside: true,
        labels: [...labels, "OTHER_LOCATION"],
      };
    }
    return {
      workLocationId: expected.id,
      distanceM: d,
      inside: false,
      labels: [...labels, "OUTSIDE_RADIUS"],
    };
  }
  const any = others.find(inside);
  if (any)
    return { workLocationId: any.id, distanceM: distanceM(position, any), inside: true, labels };
  return {
    workLocationId: null,
    distanceM: null,
    inside: false,
    labels: [...labels, "OUTSIDE_RADIUS"],
  };
}
