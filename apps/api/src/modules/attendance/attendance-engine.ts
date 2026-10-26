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
  /** TM-D13: shift mulai setelah tengah malam tanggal roster (mis. shift 3 roster 27 = 28 00:00–08:00). */
  startsNextDay?: boolean;
}

/** TM-D13: menit dari 00:00 tanggal roster ke jam mulai shift (shift "hari berikutnya" + 24 jam). */
const startOffset = (shift: { startMinute: number; startsNextDay?: boolean }) =>
  (shift.startsNextDay ? 1440 : 0) + shift.startMinute;

export interface ShiftWindow {
  start: Date;
  end: Date;
  checkInOpen: Date;
  checkOutDeadline: Date;
}

/**
 * Instan mulai/selesai shift untuk tanggal kerja (= tanggal roster). Shift lintas tengah malam selesai keesokan
 * harinya; TM-D13: shift "mulai hari berikutnya" digeser 24 jam (tetap tercatat di tanggal roster).
 */
export function shiftWindow(workDate: string, shift: ShiftTimes, timezone: string): ShiftWindow {
  const midnightUtc = Date.parse(`${workDate}T00:00:00.000Z`) - offsetMinutes(timezone) * MINUTE;
  const startMin = startOffset(shift);
  const length = (shift.endMinute - shift.startMinute + 1440) % 1440 || 1440;
  const start = midnightUtc + startMin * MINUTE;
  const end = start + length * MINUTE;
  return {
    start: new Date(start),
    end: new Date(end),
    checkInOpen: new Date(start - shift.checkInOpenMin * MINUTE),
    checkOutDeadline: new Date(end + shift.checkOutCloseMin * MINUTE),
  };
}

/**
 * TM-D12: jendela Mulai istirahat pada tanggal kerja. Jam istirahat sebelum jam mulai shift berarti
 * keesokan harinya (shift malam). null = shift tanpa jam istirahat (bebas).
 */
export function breakWindow(
  workDate: string,
  shift: {
    startMinute: number;
    startsNextDay?: boolean;
    breakStartMinute: number | null;
    breakEndMinute: number | null;
  },
  timezone: string,
): { opens: Date; closes: Date } | null {
  if (shift.breakStartMinute === null || shift.breakEndMinute === null) return null;
  const midnightUtc = Date.parse(`${workDate}T00:00:00.000Z`) - offsetMinutes(timezone) * MINUTE;
  const base = shift.startsNextDay ? 1440 : 0;
  const at = (minute: number) =>
    new Date(midnightUtc + (base + (minute < shift.startMinute ? minute + 1440 : minute)) * MINUTE);
  const opens = at(shift.breakStartMinute);
  let closes = at(shift.breakEndMinute);
  if (closes.getTime() <= opens.getTime()) closes = new Date(closes.getTime() + 1440 * MINUTE);
  return { opens, closes };
}

/** TM-D12: Clock Out normal dibuka `earlyMin` menit sebelum jam pulang (tanpa lembur rutin). */
export const checkOutOpensAt = (normalEnd: Date, earlyMin: number) =>
  new Date(normalEnd.getTime() - earlyMin * MINUTE);

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
  /** TM-D12: tanggal kerja = OFF di roster (Clock In hanya lewat "Lembur hari libur"). */
  offDay: boolean;
}

/**
 * TM-D13: absen masuk dicocokkan ke SHIFT, bukan tanggal kalender — dari hari roster di sekitar `now`
 * (kemarin, hari ini, besok), pilih shift yang jendela masuknya [buka absen, selesai shift] memuat `now`,
 * belum di-Clock In (`taken`), dan jam mulainya paling dekat. Tidak ketemu → tanggal lokal hari ini + label.
 */
export function planCheckIn(
  now: Date,
  timezone: string,
  candidates: RosterCandidate[],
  taken: ReadonlySet<string> = new Set(),
): CheckInPlan {
  const t = now.getTime();
  let best: { c: RosterCandidate & { shift: ShiftTimes }; w: ShiftWindow } | null = null;
  for (const c of candidates) {
    if (!c.shift || taken.has(c.workDate)) continue;
    const w = shiftWindow(c.workDate, c.shift, timezone);
    if (t < w.checkInOpen.getTime() || t > w.end.getTime()) continue;
    if (!best || Math.abs(t - w.start.getTime()) < Math.abs(t - best.w.start.getTime())) {
      best = { c: c as RosterCandidate & { shift: ShiftTimes }, w };
    }
  }
  if (best) {
    const labels: AttendanceLabel[] = [];
    if (t > best.w.start.getTime() + best.c.shift.lateToleranceMin * MINUTE) labels.push("LATE");
    return {
      workDate: best.c.workDate,
      shift: best.c.shift,
      window: best.w,
      labels,
      offDay: false,
    };
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
    offDay: todayRoster?.shift === null,
  };
}

/** Kandidat tanggal kerja di sekitar `now` (kemarin, hari ini, besok). */
export const candidateDates = (now: Date, timezone: string) => {
  const today = localDate(now, timezone);
  return [isoAddDays(today, -1), today, isoAddDays(today, 1)];
};

/** Label absen pulang terhadap jadwal hari itu (`window.end` = jam pulang normal tanpa lembur rutin). */
export function checkOutLabels(
  now: Date,
  window: ShiftWindow | null,
  earlyMin: number,
): AttendanceLabel[] {
  if (!window) return [];
  const t = now.getTime();
  if (t < checkOutOpensAt(window.end, earlyMin).getTime()) return ["EARLY_LEAVE"];
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
 * Cek posisi terhadap lokasi yang diharapkan (lokasi khusus/crew/lokasi kerja). Di luar radius tetapi di dalam
 * lokasi lain → OTHER_LOCATION; di luar semua → OUTSIDE_RADIUS. Akurasi buruk → LOW_ACCURACY (tetap dihitung).
 * `anywhere` (TM-D1, PLAN §5.4 bebas lokasi): tidak pernah OUTSIDE_RADIUS/OTHER_LOCATION; koordinat tetap
 * dicatat dan jarak diukur ke site terdekat sebagai informasi.
 */
export function checkGeofence(
  position: Point & { accuracyM: number },
  expected: GeofenceSite | null,
  others: GeofenceSite[],
  accuracyMaxM: number,
  anywhere = false,
): GeofenceResult {
  const labels: AttendanceLabel[] = [];
  if (position.accuracyM > accuracyMaxM) labels.push("LOW_ACCURACY");
  const inside = (site: GeofenceSite) => distanceM(position, site) <= site.radiusM;
  if (anywhere) {
    const ranked = others
      .map((site) => ({ site, d: distanceM(position, site) }))
      .sort((a, b) => a.d - b.d);
    const hit = ranked.find((r) => r.d <= r.site.radiusM);
    if (hit) return { workLocationId: hit.site.id, distanceM: hit.d, inside: true, labels };
    return { workLocationId: null, distanceM: ranked[0]?.d ?? null, inside: false, labels };
  }
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

/** TM-D13: Clock In kurang dari `minRestHours` sejak Clock Out terakhir (tidak ditolak) → jeda antarshift kurang. */
export function restShortfall(
  days: { punches: { kind: string; at: Date; status: string }[] }[],
  now: Date,
  minRestHours: number,
): boolean {
  if (minRestHours <= 0) return false;
  const t = now.getTime();
  const lastOut = Math.max(
    0,
    ...days.flatMap((d) =>
      d.punches
        .filter((p) => p.kind === "OUT" && p.status !== "REJECTED" && p.at.getTime() <= t)
        .map((p) => p.at.getTime()),
    ),
  );
  return lastOut > 0 && t - lastOut < minRestHours * 60 * MINUTE;
}
