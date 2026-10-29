import {
  type AttendanceLabel,
  type AttendanceLocationSource,
  canStillCorrect,
  correctionDeadline,
  LABELS_WITHOUT_REASON,
  type ManualPunchInput,
  PUNCH_CANCEL_WINDOW_MIN,
  PUNCH_KIND_LABELS,
  type PunchChannel,
  type PunchInput,
  type PunchKind,
  type PunchPrecheckInput,
  type PunchSuspicion,
  SELFIE_CONTENT_TYPES,
  SELFIE_MAX_BYTES,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import type { StorageAdmin } from "../../core/storage.ts";
import type { Shift } from "../../generated/prisma/client.ts";
import {
  type ApprovalView,
  cancelApprovalRequest,
  createApprovalRequest,
  decideApproval,
  getApprovalViews,
  listActionable,
  registerApprovalHandler,
} from "../approval/index.ts";
import { markNoAttendanceAlpha } from "./alpha.service.ts";
import * as policy from "./attendance.policy.ts";
import * as repository from "./attendance.repository.ts";
import {
  breakWindow,
  candidateDates,
  checkGeofence,
  checkOutLabels,
  checkOutOpensAt,
  type GeofenceSite,
  localDate,
  offsetMinutes,
  planCheckIn,
  restShortfall,
  type ShiftTimes,
  shiftWindow,
} from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import { resolveAttendanceLocation } from "./location-setting.service.ts";
import { isBreakRequired, syncOvertime } from "./overtime.service.ts";
import {
  deadlineWithOrder,
  OFF_DAY_CLOSE_MIN,
  type OrderRow,
  ordersOfEmployee,
} from "./overtime-order.service.ts";
import { closedMonths, correctionInstant, isDateClosed } from "./period.service.ts";
import * as rosterRepo from "./roster.repository.ts";
import { configureRosterLocks, dayKey, shiftDto } from "./roster.service.ts";
import { isoAddDays } from "./roster-engine.ts";
import { dateLabel, type EmployeeNotice, notifyEmployees } from "./time-notify.service.ts";

// Tahap C/D — absen PWA (D-067, D-070) & approval hari absen (D-068).

export const ATTENDANCE_SELFIE_BUCKET = "attendance-selfies";
const SELFIE_URL_TTL_SECONDS = 10 * 60;

export interface AttendanceDeps {
  storage: StorageAdmin;
  storagePathPrefix: string;
}
let deps: AttendanceDeps | undefined;
let bucketReady: Promise<unknown> | undefined;

export function configureAttendance(next: AttendanceDeps) {
  deps = next;
}
function storage(): AttendanceDeps {
  if (!deps) throw new Error("attendance: storage belum dikonfigurasi");
  return deps;
}
/** Bucket private dibuat saat pertama dipakai (tanpa mengubah script storage:setup bersama). */
function ensureBucket() {
  bucketReady ??= storage()
    .storage.ensurePrivateBucket({
      id: ATTENDANCE_SELFIE_BUCKET,
      fileSizeLimit: SELFIE_MAX_BYTES,
      allowedMimeTypes: SELFIE_CONTENT_TYPES,
    })
    .catch((error) => {
      bucketReady = undefined;
      throw error;
    });
  return bucketReady;
}

const shiftTimes = (shift: {
  startMinute: number;
  endMinute: number;
  checkInOpenMin: number;
  lateToleranceMin: number;
  earlyLeaveToleranceMin: number;
  checkOutCloseMin: number;
  startsNextDay: boolean;
}): ShiftTimes => ({
  startMinute: shift.startMinute,
  endMinute: shift.endMinute,
  checkInOpenMin: shift.checkInOpenMin,
  lateToleranceMin: shift.lateToleranceMin,
  earlyLeaveToleranceMin: shift.earlyLeaveToleranceMin,
  checkOutCloseMin: shift.checkOutCloseMin,
  startsNextDay: shift.startsNextDay,
});

function selfEmployee(ctx: RequestContext) {
  if (!ctx.actor.employeeId) {
    throw new ForbiddenError("Absen hanya untuk akun yang terhubung ke data karyawan.");
  }
  return ctx.actor.employeeId;
}

const toSite = (l: directory.DirectoryLocation): GeofenceSite | null =>
  l.latitude !== null && l.longitude !== null && l.radiusM !== null
    ? { id: l.id, latitude: l.latitude, longitude: l.longitude, radiusM: l.radiusM }
    : null;

/**
 * Lokasi acuan pada tanggal kerja (TM-D1): bebas lokasi → tanpa acuan; lokasi absen khusus; lokasi crew;
 * lokasi kerja karyawan.
 */
async function expectedLocation(employee: directory.DirectoryEmployee, workDate: string) {
  const resolved = await resolveAttendanceLocation(employee, workDate);
  const location = resolved.locationId
    ? ((await directory.locationsByIds([resolved.locationId])).get(resolved.locationId) ?? null)
    : null;
  return { location, anywhere: resolved.anywhere, source: resolved.source };
}

interface Evaluation {
  kind: PunchKind;
  workDate: string;
  shift: Shift | null;
  window: ReturnType<typeof shiftWindow> | null;
  labels: AttendanceLabel[];
  geofence: ReturnType<typeof checkGeofence>;
  openDay: repository.DayRow | null;
  location: directory.DirectoryLocation | null;
  /** D-073: kemungkinan salah memilih Clock In / Clock Out. */
  suspicion: PunchSuspicion | null;
  /** Hari yang masih terbuka (belum Clock Out) saat memilih Clock In. */
  stillOpen: repository.DayRow | null;
  /** TM-D12: tanggal kerja Clock In = OFF di roster. */
  offDay: boolean;
  /** TM-D12: Clock Out normal dibuka / jendela Mulai istirahat (hari terbuka). */
  checkOutOpensAt: Date | null;
  breakWindow: { opens: Date; closes: Date } | null;
  /** TM-D17: perintah lembur untuk tanggal kerja Clock In (null = tidak ada). */
  overtimeOrder: OrderRow | null;
}

/** TM-D17: kandidat planCheckIn; SPL "mulai lebih awal" membuka absen masuk lebih awal. */
const candidatesOf = (
  dates: string[],
  byDate: Map<string, { shift: Shift | null }>,
  orders: Map<string, OrderRow>,
) =>
  dates.map((date) => {
    const d = byDate.get(date);
    return {
      workDate: date,
      shift: d === undefined ? undefined : d.shift ? shiftTimes(d.shift) : null,
      openFrom: orders.get(date)?.startsAt ?? null,
    };
  });

/**
 * TM-D17: jadwal Clock In dengan SPL. Hari kerja: batas absen pulang mundur ke akhir SPL + batas shift.
 * Hari OFF ber-SPL: jadwal = rentang SPL (bukan "di luar roster"), batas = akhir SPL + bawaan.
 */
function applyOrder(
  plan: ReturnType<typeof planCheckIn>,
  order: OrderRow | null,
): Pick<ReturnType<typeof planCheckIn>, "window" | "labels"> {
  if (!order) return plan;
  if (plan.window) {
    const closeMin = plan.shift?.checkOutCloseMin ?? 0;
    return {
      labels: plan.labels,
      window: {
        ...plan.window,
        checkOutDeadline:
          deadlineWithOrder(plan.window.checkOutDeadline, order, closeMin) ??
          plan.window.checkOutDeadline,
      },
    };
  }
  if (plan.offDay && order.startsAt && order.endsAt) {
    return {
      labels: plan.labels.filter((l) => l !== "OUTSIDE_ROSTER"),
      window: {
        start: order.startsAt,
        end: order.endsAt,
        checkInOpen: order.startsAt,
        checkOutDeadline: new Date(order.endsAt.getTime() + OFF_DAY_CLOSE_MIN * MINUTE),
      },
    };
  }
  return plan;
}

/** TM-D13 Fase C: hari roster yang diubah (bukan hasil pola) dalam 7 hari terakhir → penanda di HP. */
const recentlyChanged = (d: { source: string; createdAt: Date; updatedAt: Date }, now: Date) =>
  d.source !== "PATTERN" &&
  now.getTime() - d.updatedAt.getTime() <= 7 * 24 * 60 * MINUTE &&
  (d.source === "CHANGE" || d.updatedAt.getTime() - d.createdAt.getTime() > 1000);

/** TM-D13: tanggal roster yang sudah punya hari absen (sekali Clock In per shift, bukan per tanggal kalender). */
const takenDates = (days: { workDate: Date }[]) => new Set(days.map((d) => toIso(d.workDate)));

/** Jam lokal HH:MM untuk pesan ke karyawan. */
const clockOf = (at: Date, timezone: string) =>
  new Date(at.getTime() + offsetMinutes(timezone) * MINUTE).toISOString().slice(11, 16);

/**
 * TM-D12: batas waktu Clock Out & istirahat dari shift hari terbuka. TM-D13: jadwal DIKUNCI saat tap-in
 * (`scheduledStart/End/checkOutDeadline` di hari absen) — tidak dihitung ulang dari tanggal / master shift.
 */
export function openDayTimes(
  workDate: string,
  shift: Shift | null,
  settings: { timezone: string; checkOutEarlyMin: number },
  locked?: {
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    checkOutDeadline: Date | null;
  } | null,
) {
  if (!shift) return { window: null, normalEnd: null, checkOutOpensAt: null, breakWindow: null };
  const planned = shiftWindow(workDate, shiftTimes(shift), settings.timezone);
  const window =
    locked?.scheduledStart && locked.scheduledEnd
      ? {
          start: locked.scheduledStart,
          end: locked.scheduledEnd,
          checkInOpen: planned.checkInOpen,
          checkOutDeadline: locked.checkOutDeadline ?? planned.checkOutDeadline,
        }
      : planned;
  // TM-D6: jam lembur rutin di akhir shift bukan bagian "pulang cepat" (dijalani kurang = label sendiri).
  const normalEnd = shift.regularOvertimeMin
    ? { ...window, end: new Date(window.end.getTime() - shift.regularOvertimeMin * MINUTE) }
    : window;
  return {
    window,
    normalEnd,
    checkOutOpensAt: checkOutOpensAt(normalEnd.end, settings.checkOutEarlyMin),
    breakWindow: breakWindow(workDate, shift, settings.timezone),
  };
}

const MINUTE = 60_000;
/** Clock In dalam 60 menit terakhir sebelum jadwal pulang (atau sesudahnya) dianggap mencurigakan. */
const IN_NEAR_END_MIN = 60;

export function suspicionFor(
  kind: "IN" | "OUT",
  now: Date,
  window: { end: Date } | null,
  earlyLeaveToleranceMin: number | null,
  stillOpen: boolean,
): PunchSuspicion | null {
  if (kind === "IN") {
    if (stillOpen) return "IN_WHILE_OPEN";
    if (window && now.getTime() >= window.end.getTime() - IN_NEAR_END_MIN * MINUTE) {
      return "IN_AFTER_END";
    }
    return null;
  }
  if (
    window &&
    earlyLeaveToleranceMin !== null &&
    now.getTime() < window.end.getTime() - earlyLeaveToleranceMin * MINUTE
  ) {
    return "OUT_BEFORE_END";
  }
  return null;
}

/** Hitung tanggal kerja, jadwal, & label untuk absen masuk/pulang pada `now` (dipakai pra-cek & simpan). */
async function evaluate(
  employee: directory.DirectoryEmployee,
  input: PunchPrecheckInput,
  now: Date,
): Promise<Evaluation> {
  const settings = await readTimeSettings();
  // Hari menggantung lewat batas absen pulang ditutup dulu (sama dengan cron; tak bergantung jadwal cron).
  await closeOverdueDays(now, [employee.id]);
  const [allSites] = await Promise.all([directory.geofencedLocations()]);
  const sites = allSites.map(toSite).filter((s): s is GeofenceSite => s !== null);

  if (input.kind !== "IN") {
    const open = await repository.findOpenDay(employee.id);
    if (!open) throw new BusinessRuleError("Belum ada absen masuk yang menunggu absen pulang.");
    assertBreakSequence(input.kind, open);
    const shift = open.shiftId ? await rosterRepo.findShift(open.shiftId) : null;
    const times = openDayTimes(toIso(open.workDate), shift, settings, open);
    const window = times.window;
    // TM-D12: Mulai istirahat hanya di jendela istirahat shift (Selesai istirahat bebas).
    if (input.kind === "BREAK_START" && times.breakWindow) {
      const t = now.getTime();
      if (t < times.breakWindow.opens.getTime() || t > times.breakWindow.closes.getTime()) {
        const opens = clockOf(times.breakWindow.opens, settings.timezone);
        const closes = clockOf(times.breakWindow.closes, settings.timezone);
        throw new BusinessRuleError(`Mulai istirahat hanya bisa pukul ${opens}–${closes}.`, [
          {
            breakOpensAt: times.breakWindow.opens.toISOString(),
            breakClosesAt: times.breakWindow.closes.toISOString(),
          },
        ]);
      }
    }
    // Pulang mengikuti lokasi tercatat saat masuk; bebas lokasi (TM-D1) tetap tidak dicek geofence.
    const resolved = await expectedLocation(employee, toIso(open.workDate));
    const expected =
      !resolved.anywhere && open.workLocationId
        ? ((await directory.locationsByIds([open.workLocationId])).get(open.workLocationId) ?? null)
        : resolved.location;
    const geofence = checkGeofence(
      input,
      expected ? toSite(expected) : null,
      sites,
      settings.gpsAccuracyMaxM,
      resolved.anywhere,
    );
    const isOut = input.kind === "OUT";
    const normalEnd = times.normalEnd;
    return {
      kind: input.kind,
      workDate: toIso(open.workDate),
      shift,
      window,
      labels: [
        ...(isOut ? checkOutLabels(now, normalEnd, settings.checkOutEarlyMin) : []),
        ...geofence.labels,
      ],
      geofence,
      openDay: open,
      location: expected,
      suspicion: isOut
        ? suspicionFor("OUT", now, normalEnd, settings.checkOutEarlyMin, false)
        : null,
      stillOpen: null,
      offDay: false,
      checkOutOpensAt: times.checkOutOpensAt,
      breakWindow: times.breakWindow,
      overtimeOrder: null,
    };
  }

  const dates = candidateDates(now, settings.timezone);
  const [rosterDays, nearby] = await Promise.all([
    rosterRepo.rosterDaysBetween(
      [employee.id],
      toDate(dates[0] as string),
      toDate(dates[2] as string),
    ),
    repository.daysOfEmployee(
      employee.id,
      toDate(isoAddDays(dates[0] as string, -1)),
      toDate(dates[2] as string),
    ),
  ]);
  const byDate = new Map(rosterDays.map((d) => [toIso(d.workDate), d]));
  const orders = await ordersOfEmployee(employee.id, dates);
  const plan = planCheckIn(
    now,
    settings.timezone,
    candidatesOf(dates, byDate, orders),
    takenDates(nearby),
  );
  const overtimeOrder = orders.get(plan.workDate) ?? null;
  const scheduled = applyOrder(plan, overtimeOrder);
  const shortRest = restShortfall(nearby, now, settings.minRestHours);
  const rosterDay = byDate.get(plan.workDate);
  const resolved = await expectedLocation(employee, plan.workDate);
  const expected = resolved.location;
  const geofence = checkGeofence(
    input,
    expected ? toSite(expected) : null,
    sites,
    settings.gpsAccuracyMaxM,
    resolved.anywhere,
  );
  const stillOpen = await repository.findOpenDay(employee.id);
  return {
    kind: "IN",
    workDate: plan.workDate,
    shift: rosterDay?.shift ?? null,
    window: scheduled.window,
    labels: [
      ...scheduled.labels,
      ...(shortRest ? (["SHORT_REST"] as const) : []),
      ...geofence.labels,
    ],
    geofence,
    openDay: null,
    location: expected,
    suspicion: suspicionFor("IN", now, scheduled.window, null, stillOpen !== null),
    stillOpen,
    offDay: plan.offDay,
    checkOutOpensAt: null,
    breakWindow: null,
    overtimeOrder,
  };
}

/** TM-D7: istirahat sekali per hari — mulai sebelum selesai; Clock Out tidak boleh saat masih istirahat. */
function assertBreakSequence(kind: Exclude<PunchKind, "IN">, open: repository.DayRow) {
  const has = (k: PunchKind) => open.punches.some((p) => p.kind === k);
  if (kind === "BREAK_START" && has("BREAK_START")) {
    throw new ConflictError("Istirahat hari ini sudah dimulai (sekali per hari).");
  }
  if (kind === "BREAK_END") {
    if (!has("BREAK_START")) throw new BusinessRuleError("Mulai istirahat terlebih dahulu.");
    if (has("BREAK_END")) throw new ConflictError("Istirahat hari ini sudah selesai.");
  }
  if (kind === "OUT" && has("BREAK_START") && !has("BREAK_END")) {
    throw new BusinessRuleError(
      "Anda masih istirahat. Lakukan Selesai istirahat sebelum Clock Out.",
    );
  }
}

/** Status istirahat hari terbuka untuk tombol di HP. */
export type BreakState = "NOT_REQUIRED" | "NONE" | "ON_BREAK" | "DONE";
async function breakStateOf(open: repository.DayRow | null): Promise<BreakState> {
  if (!open || !(await isBreakRequired(open.workLocationId))) return "NOT_REQUIRED";
  const has = (k: PunchKind) => open.punches.some((p) => p.kind === k);
  if (has("BREAK_END")) return "DONE";
  return has("BREAK_START") ? "ON_BREAK" : "NONE";
}

// ── Karyawan (PWA) ─────────────────────────────────────────────────────────────

export interface PunchView {
  id: string;
  kind: PunchKind;
  at: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  altitudeM: number | null;
  distanceM: number | null;
  insideGeofence: boolean;
  /** Lokasi tercatat (GPS: site terdekat/diharapkan; manual: dipilih HR). */
  location: { id: string; name: string } | null;
  labels: string[];
  reason: string | null;
  selfieUrl: string | null;
  selfiePurged: boolean;
  /** D-073: persetujuan per absen. */
  status: "PENDING" | "APPROVED" | "REJECTED";
  source: "DEVICE" | "MANUAL";
  /** MOB-D3: kanal absen + versi app (approver tahu punch PWA tidak dicek lokasi palsu). */
  channel: PunchChannel;
  appVersion: string | null;
  approval: ApprovalView | null;
  /** Pemilik boleh membatalkan (salah pencet) selama <= 15 menit & belum diputuskan. */
  canCancel: boolean;
}

export interface DayView {
  id: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  workDate: string;
  shiftCode: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  workLocation: { id: string; name: string } | null;
  status: string;
  labels: string[];
  punches: PunchView[];
  approval: ApprovalView | null;
}

function canCancelPunch(
  ctx: RequestContext,
  employeeId: string,
  p: { source: string; status: string; createdAt: Date },
  approval: ApprovalView | null,
  nowMs: number,
) {
  return (
    ctx.actor.employeeId === employeeId &&
    p.source === "DEVICE" &&
    p.status === "PENDING" &&
    nowMs - p.createdAt.getTime() <= PUNCH_CANCEL_WINDOW_MIN * MINUTE &&
    (approval?.steps.every((step) => step.decision === "PENDING") ?? true)
  );
}

async function toDayViews(
  ctx: RequestContext,
  rows: repository.DayRow[],
  withSelfies: boolean,
): Promise<DayView[]> {
  const people = await directory.employeesByIds(rows.map((r) => r.employeeId));
  const locations = await directory.locationsByIds(
    rows
      .flatMap((r) => [r.workLocationId, ...r.punches.map((p) => p.workLocationId)])
      .filter((id): id is string => id !== null),
  );
  const approvals = await getApprovalViews(
    ctx.actor,
    "ATTENDANCE_DAY",
    rows.map((r) => r.id),
  );
  const paths = withSelfies
    ? rows.flatMap((r) =>
        r.punches
          .filter((p) => !p.selfiePurgedAt && p.selfiePath)
          .map((p) => p.selfiePath as string),
      )
    : [];
  const punchApprovals = await getApprovalViews(
    ctx.actor,
    "ATTENDANCE_PUNCH",
    rows.flatMap((r) => r.punches.map((p) => p.id)),
  );
  const nowMs = Date.now();
  const urls =
    paths.length > 0 && deps
      ? await deps.storage
          .createSignedUrls(ATTENDANCE_SELFIE_BUCKET, paths, SELFIE_URL_TTL_SECONDS)
          .catch(() => new Map<string, string>())
      : new Map<string, string>();
  return rows.map((row) => {
    const person = people.get(row.employeeId);
    const location = row.workLocationId ? locations.get(row.workLocationId) : undefined;
    return {
      id: row.id,
      employee: {
        id: row.employeeId,
        fullName: person?.fullName ?? "—",
        employeeNumber: person?.employeeNumber ?? null,
      },
      workDate: toIso(row.workDate),
      shiftCode: row.shiftCode,
      scheduledStart: row.scheduledStart?.toISOString() ?? null,
      scheduledEnd: row.scheduledEnd?.toISOString() ?? null,
      workLocation: location ? { id: location.id, name: location.name } : null,
      status: row.status,
      labels: row.labels,
      punches: row.punches.map((p) => ({
        id: p.id,
        kind: p.kind,
        at: p.at.toISOString(),
        latitude: p.latitude === null ? null : Number(p.latitude),
        longitude: p.longitude === null ? null : Number(p.longitude),
        accuracyM: p.accuracyM,
        altitudeM: p.altitudeM,
        distanceM: p.distanceM,
        insideGeofence: p.insideGeofence,
        location: (() => {
          const loc = p.workLocationId ? locations.get(p.workLocationId) : undefined;
          return loc ? { id: loc.id, name: loc.name } : null;
        })(),
        labels: p.labels,
        reason: p.reason,
        selfieUrl: p.selfiePath ? (urls.get(p.selfiePath) ?? null) : null,
        selfiePurged: p.selfiePurgedAt !== null,
        channel: p.channel,
        appVersion: p.appVersion,
        status: p.status,
        source: p.source,
        approval: punchApprovals.get(p.id) ?? null,
        canCancel: canCancelPunch(ctx, row.employeeId, p, punchApprovals.get(p.id) ?? null, nowMs),
      })),
      approval: approvals.get(row.id) ?? null,
    };
  });
}

export interface TodayView {
  serverTime: string;
  timezone: string;
  gpsAccuracyMaxM: number;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  /** TM-D13 Fase C: `changed` = diubah (tukar shift / edit HR / import) dalam 7 hari terakhir. */
  roster: {
    date: string;
    code: string;
    shift: ReturnType<typeof shiftDto> | null;
    changed: boolean;
  }[];
  location: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    radiusM: number | null;
  } | null;
  /** TM-D1: bebas lokasi (tanpa cek geofence) & asal site absen. */
  anywhere: boolean;
  locationSource: AttendanceLocationSource;
  openDay: DayView | null;
  recent: DayView[];
  /** DONE = hari ini sudah Clock In (dan tidak ada yang terbuka): tidak boleh absen masuk lagi. */
  next: "IN" | "OUT" | "DONE";
  /** TM-D7: lokasi wajib absen istirahat → tombol Mulai/Selesai istirahat. */
  breakState: BreakState;
  /** TM-D12: hari ini OFF di roster → tombol "Lembur hari libur" menggantikan Clock In. */
  offDay: boolean;
  /** TM-D12: hari terbuka — Clock Out normal dibuka; jendela Mulai istirahat (null = bebas). */
  checkOutOpensAt: string | null;
  breakOpensAt: string | null;
  breakClosesAt: string | null;
  /**
   * TM-D17: perintah lembur untuk hari terbuka / shift berikutnya. App memakai `endsAt` (bila ada) sebagai
   * jam pulang untuk alarm lupa Clock Out (TM-D16).
   */
  overtimeOrder: {
    workDate: string;
    startsAt: string | null;
    endsAt: string | null;
    reason: string;
  } | null;
}

export async function getToday(ctx: RequestContext, now = new Date()): Promise<TodayView> {
  const employeeId = selfEmployee(ctx);
  const employee = await directory.employeeById(employeeId);
  if (!employee) throw new NotFoundError();
  const settings = await readTimeSettings();
  const dates = candidateDates(now, settings.timezone);
  // Hari menggantung lewat batas absen pulang → NO_CHECKOUT (sama dengan cron), supaya tombol kembali
  // ke Clock In dan hari lama tidak tampil sebagai absen yang sedang berjalan.
  await closeOverdueDays(now, [employeeId]);
  // TM-D3: hari kerja tanpa absen yang sudah lewat → Alpha (riwayat & HP langsung akurat tanpa cron).
  await markNoAttendanceAlpha(now, [employeeId]);
  const [rosterDays, open, recentRows] = await Promise.all([
    rosterRepo.rosterDaysBetween(
      [employeeId],
      toDate(dates[0] as string),
      toDate(isoAddDays(dates[1] as string, 6)),
    ),
    repository.findOpenDay(employeeId),
    repository.daysOfEmployee(
      employeeId,
      toDate(isoAddDays(dates[1] as string, -7)),
      toDate(dates[2] as string),
    ),
  ]);
  const resolved = await expectedLocation(employee, dates[1] as string);
  const location = resolved.location;
  const recent = await toDayViews(ctx, recentRows, false);
  const byDate = new Map(rosterDays.map((d) => [toIso(d.workDate), d]));
  const orders = await ordersOfEmployee(employeeId, [
    ...dates,
    ...(open ? [toIso(open.workDate)] : []),
  ]);
  const plan = planCheckIn(
    now,
    settings.timezone,
    candidatesOf(dates, byDate, orders),
    takenDates(recentRows),
  );
  const order = orders.get(open ? toIso(open.workDate) : plan.workDate) ?? null;
  const openShift = open?.shiftId ? await rosterRepo.findShift(open.shiftId) : null;
  const times = open
    ? openDayTimes(toIso(open.workDate), openShift, settings, open)
    : { checkOutOpensAt: null, breakWindow: null };
  return {
    serverTime: now.toISOString(),
    timezone: settings.timezone,
    gpsAccuracyMaxM: settings.gpsAccuracyMaxM,
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      employeeNumber: employee.employeeNumber,
    },
    roster: rosterDays
      .map((d) => ({
        date: toIso(d.workDate),
        code: d.shift?.code ?? "OFF",
        shift: d.shift ? shiftDto(d.shift) : null,
        changed: recentlyChanged(d, now),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    location: location
      ? {
          id: location.id,
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          radiusM: location.radiusM,
        }
      : null,
    anywhere: resolved.anywhere,
    locationSource: resolved.source,
    openDay: open
      ? (recent.find((d) => d.id === open.id) ?? (await toDayViews(ctx, [open], false))[0] ?? null)
      : null,
    recent,
    breakState: await breakStateOf(open),
    offDay: !open && plan.offDay,
    checkOutOpensAt: times.checkOutOpensAt?.toISOString() ?? null,
    breakOpensAt: times.breakWindow?.opens.toISOString() ?? null,
    breakClosesAt: times.breakWindow?.closes.toISOString() ?? null,
    overtimeOrder: order
      ? {
          workDate: toIso(order.workDate),
          startsAt: order.startsAt?.toISOString() ?? null,
          endsAt: order.endsAt?.toISOString() ?? null,
          reason: order.reason,
        }
      : null,
    // TM-D13: ada shift terbuka yang belum di-Clock In → IN; tidak ada & tanggal hari ini sudah absen → DONE.
    next: open
      ? "OUT"
      : plan.window && !plan.labels.includes("OUTSIDE_ROSTER") && !plan.labels.includes("NO_ROSTER")
        ? "IN"
        : recentRows.some(
              (d) => toIso(d.workDate) === plan.workDate && d.punches.some((p) => p.kind === "IN"),
            )
          ? "DONE"
          : "IN",
  };
}

export interface PrecheckResult {
  kind: PunchKind;
  workDate: string;
  shiftCode: string | null;
  labels: AttendanceLabel[];
  distanceM: number | null;
  insideGeofence: boolean;
  location: { id: string; name: string } | null;
  reasonRequired: boolean;
  alreadyCheckedIn: boolean;
  /** D-073: peringatan salah pencet + konteks jadwal untuk pesan di HP. */
  suspicion: PunchSuspicion | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  /** Menit sekarang terhadap jadwal pulang (negatif = sebelum jam pulang). */
  minutesFromEnd: number | null;
  openDay: { workDate: string; checkInAt: string | null } | null;
  /** TM-D12: Clock In di hari OFF → hanya lewat "Lembur hari libur" (`offDayOvertime`). */
  offDay: boolean;
  checkOutOpensAt: string | null;
  breakOpensAt: string | null;
  breakClosesAt: string | null;
}

const openDayInfo = (open: repository.DayRow | null) =>
  open
    ? {
        workDate: toIso(open.workDate),
        checkInAt: open.punches.find((x) => x.kind === "IN")?.at.toISOString() ?? null,
      }
    : null;

/**
 * TM-D13: satu absen masuk per SHIFT (tanggal roster), bukan per tanggal kalender — karyawan shift bisa
 * pulang shift 3 pukul 08.00 lalu masuk shift 2 pukul 16.00 di tanggal kalender yang sama.
 */
async function checkedInAlready(employeeId: string, workDate: string) {
  const day = await repository.findDay(employeeId, toDate(workDate));
  return day?.punches.some((p) => p.kind === "IN") ?? false;
}

/** MOB-D3: lokasi palsu dari app → label penanda (tidak memblokir, tidak wajib alasan). */
function withMockLabel<T extends { labels: AttendanceLabel[] }>(
  e: T,
  input: PunchPrecheckInput,
): T {
  return input.isMock && !e.labels.includes("MOCK_LOCATION")
    ? { ...e, labels: [...e.labels, "MOCK_LOCATION"] }
    : e;
}

const needsReason = (labels: AttendanceLabel[]) =>
  labels.some((label) => !LABELS_WITHOUT_REASON.includes(label));

export async function precheck(
  ctx: RequestContext,
  input: PunchPrecheckInput,
  now = new Date(),
): Promise<PrecheckResult> {
  const employee = await directory.employeeById(selfEmployee(ctx));
  if (!employee) throw new NotFoundError();
  const e = withMockLabel(await evaluate(employee, input, now), input);
  const existing =
    e.kind === "IN" ? await repository.findDay(employee.id, toDate(e.workDate)) : null;
  const done = e.kind === "IN" && (await checkedInAlready(employee.id, e.workDate));
  return {
    kind: e.kind,
    workDate: e.workDate,
    shiftCode: e.shift?.code ?? null,
    labels: e.labels,
    distanceM: e.geofence.distanceM,
    insideGeofence: e.geofence.inside,
    location: e.location ? { id: e.location.id, name: e.location.name } : null,
    reasonRequired: needsReason(e.labels),
    alreadyCheckedIn: existing !== null || done,
    suspicion: e.suspicion,
    scheduledStart: e.window?.start.toISOString() ?? null,
    scheduledEnd: e.window?.end.toISOString() ?? null,
    minutesFromEnd: e.window ? Math.round((now.getTime() - e.window.end.getTime()) / MINUTE) : null,
    openDay: openDayInfo(e.stillOpen ?? e.openDay),
    offDay: e.offDay,
    checkOutOpensAt: e.checkOutOpensAt?.toISOString() ?? null,
    breakOpensAt: e.breakWindow?.opens.toISOString() ?? null,
    breakClosesAt: e.breakWindow?.closes.toISOString() ?? null,
  };
}

export async function createSelfieUpload(
  ctx: RequestContext,
  contentType: (typeof SELFIE_CONTENT_TYPES)[number],
) {
  const employeeId = selfEmployee(ctx);
  await ensureBucket();
  const ext = contentType === "image/webp" ? "webp" : "jpg";
  const path = `${storage().storagePathPrefix}attendance/${employeeId}/${crypto.randomUUID()}.${ext}`;
  const upload = await storage().storage.createSignedUploadUrl(ATTENDANCE_SELFIE_BUCKET, path);
  return {
    bucket: ATTENDANCE_SELFIE_BUCKET,
    path,
    token: upload.token,
    signedUrl: upload.signedUrl,
    maxBytes: SELFIE_MAX_BYTES,
  };
}

const SUSPICION_TEXT: Record<PunchSuspicion, string> = {
  OUT_BEFORE_END: "Belum waktunya pulang. Pastikan Anda memang ingin Clock Out.",
  IN_WHILE_OPEN: "Anda masih tercatat Clock In. Pastikan Anda tidak bermaksud Clock Out.",
  IN_AFTER_END: "Sudah mendekati/lewat jam pulang. Pastikan Anda memang ingin Clock In.",
};

export interface PunchClient {
  userAgent?: string | undefined;
  /** MOB-D3: diisi dari header `X-App-Version` (app Android); kosong = PWA. */
  appVersion?: string | undefined;
  /** MOB-D7: header `Idempotency-Key`. */
  idempotencyKey?: string | undefined;
}

/** MOB-D7: retry dengan kunci yang sama → hari dari punch yang sudah tercatat (bukan 409). */
async function replayPunch(ctx: RequestContext, employeeId: string, key: string) {
  const existing = await repository.findPunchByIdempotencyKey(key);
  if (!existing) return null;
  if (existing.day.employeeId !== employeeId) {
    throw new ConflictError("Kunci permintaan sudah dipakai. Ulangi absen.");
  }
  const day = (await repository.findDayById(existing.day.id)) as repository.DayRow;
  return (await toDayViews(ctx, [day], true))[0] as DayView;
}

function isIdempotencyConflict(error: unknown) {
  const e = error as { code?: string; meta?: { target?: unknown } };
  return e?.code === "P2002" && JSON.stringify(e.meta?.target ?? "").includes("idempotency");
}

export async function punch(
  ctx: RequestContext & PunchClient,
  input: PunchInput,
  now = new Date(),
): Promise<DayView> {
  const employeeId = selfEmployee(ctx);
  if (ctx.idempotencyKey) {
    const replay = await replayPunch(ctx, employeeId, ctx.idempotencyKey);
    if (replay) return replay;
  }
  try {
    return await recordPunch(ctx, employeeId, input, now);
  } catch (error) {
    // Dua permintaan dengan kunci sama bersamaan: yang kalah mengembalikan hasil yang menang.
    if (ctx.idempotencyKey && isIdempotencyConflict(error)) {
      const replay = await replayPunch(ctx, employeeId, ctx.idempotencyKey);
      if (replay) return replay;
    }
    throw error;
  }
}

async function recordPunch(
  ctx: RequestContext & PunchClient,
  employeeId: string,
  input: PunchInput,
  now: Date,
): Promise<DayView> {
  const employee = await directory.employeeById(employeeId);
  if (!employee?.isActive) throw new ForbiddenError("Karyawan tidak aktif.");
  // Selfie wajib milik karyawan ini dan sudah terunggah sebagai gambar yang sah.
  if (!input.selfiePath.startsWith(`${storage().storagePathPrefix}attendance/${employeeId}/`)) {
    throw new BusinessRuleError("Foto tidak valid. Ambil ulang selfie.");
  }
  const info = await storage().storage.getObjectInfo(ATTENDANCE_SELFIE_BUCKET, input.selfiePath);
  if (
    !info ||
    info.size <= 0 ||
    info.size > SELFIE_MAX_BYTES ||
    !(SELFIE_CONTENT_TYPES as readonly string[]).includes(info.contentType ?? "")
  ) {
    throw new BusinessRuleError(
      "Foto belum terunggah atau formatnya tidak sesuai. Ambil ulang selfie.",
    );
  }

  const e = withMockLabel(await evaluate(employee, input, now), input);
  // Absen masuk ganda pada tanggal kerja yang sama → bentrok (bukan sekadar peringatan).
  if (e.kind === "IN" && (await repository.findDay(employeeId, toDate(e.workDate)))) {
    throw new ConflictError("Sudah absen masuk untuk tanggal kerja ini.");
  }
  if (e.kind === "IN" && (await checkedInAlready(employeeId, e.workDate))) {
    throw new ConflictError("Shift ini sudah di-Clock In; absen berikutnya sesuai jadwal shift.");
  }
  if (e.kind === "IN" && e.offDay && !input.offDayOvertime) {
    throw new BusinessRuleError(
      "Hari ini jadwal Anda libur (OFF). Silakan beristirahat. Bila memang lembur, pilih Lembur hari libur.",
      [{ offDay: true }],
    );
  }
  if (e.kind === "IN" && e.offDay && !e.overtimeOrder) {
    throw new BusinessRuleError(
      "Belum ada perintah lembur (SPL) dari atasan atau HR untuk hari libur ini.",
      [{ offDay: true }],
    );
  }
  if (e.suspicion && !input.confirmed) {
    throw new BusinessRuleError(SUSPICION_TEXT[e.suspicion], [{ suspicion: e.suspicion }]);
  }
  if (needsReason(e.labels) && !input.reason) {
    throw new BusinessRuleError(
      "Alasan wajib diisi karena absen ini di luar ketentuan.",
      e.labels
        .filter((label) => !LABELS_WITHOUT_REASON.includes(label))
        .map((label) => ({ label })),
    );
  }
  const isBreak = e.kind === "BREAK_START" || e.kind === "BREAK_END";
  const punchData = {
    kind: e.kind,
    at: now,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyM: Math.round(input.accuracyM),
    altitudeM:
      input.altitudeM === undefined || input.altitudeM === null
        ? null
        : Math.round(input.altitudeM),
    distanceM: e.geofence.distanceM,
    workLocationId: e.geofence.workLocationId,
    insideGeofence: e.geofence.inside,
    labels: e.labels,
    // Alasan wajib bila berlabel (mis. LATE); tanpa label tetap disimpan bila diisi (opsional).
    reason: input.reason?.trim() ? input.reason.trim() : null,
    selfiePath: input.selfiePath,
    userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    channel: ctx.appVersion ? ("APP" as const) : ("PWA" as const),
    appVersion: ctx.appVersion?.slice(0, 40) ?? null,
    idempotencyKey: ctx.idempotencyKey ?? null,
    // TM-D7: absen istirahat hanya bukti (tanpa approval sendiri); dinilai lewat label & lembur.
    ...(isBreak ? { status: "APPROVED" as const } : {}),
  };

  if (isBreak) {
    const open = e.openDay as repository.DayRow;
    await repository.withTransactionDay(async (tx) => {
      await repository.addPunch(tx, { ...punchData, dayId: open.id });
      if (e.labels.length > 0) {
        await repository.updateDay(tx, open.id, {
          labels: [...new Set([...open.labels, ...e.labels])],
        });
      }
    });
    await writeAudit({
      actorAccountId: ctx.actor.accountId,
      action: e.kind === "BREAK_START" ? "attendance.break_start" : "attendance.break_end",
      entityType: "attendance.day",
      entityId: open.id,
      before: null,
      after: { workDate: e.workDate, labels: e.labels, distanceM: e.geofence.distanceM },
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
    });
    const day = (await repository.findDayById(open.id)) as repository.DayRow;
    return (await toDayViews(ctx, [day], true))[0] as DayView;
  }

  const row = await repository.withTransactionDay(async (tx) => {
    let dayId: string;
    let punchId: string;
    let companyId: string;
    let managerEmployeeId: string | null;
    if (e.kind === "IN") {
      const existing = await repository.findDay(employeeId, toDate(e.workDate), tx);
      if (existing) throw new ConflictError("Sudah absen masuk untuk tanggal kerja ini.");
      const day = await repository.createDayWithPunch(
        tx,
        {
          employeeId,
          companyId: employee.companyId,
          managerEmployeeId: employee.managerId,
          workDate: toDate(e.workDate),
          shiftId: e.shift?.id ?? null,
          shiftCode: e.shift?.code ?? null,
          scheduledStart: e.window?.start ?? null,
          scheduledEnd: e.window?.end ?? null,
          checkOutDeadline: e.window?.checkOutDeadline ?? null,
          workLocationId: e.location?.id ?? e.geofence.workLocationId,
          status: "OPEN",
          labels: e.labels,
        },
        punchData,
      );
      dayId = day.id;
      punchId = day.punches[0]?.id as string;
      companyId = day.companyId;
      managerEmployeeId = day.managerEmployeeId;
    } else {
      const open = e.openDay as repository.DayRow;
      const added = await repository.addPunch(tx, { ...punchData, dayId: open.id });
      await repository.updateDay(tx, open.id, {
        status: "PENDING",
        labels: [...new Set([...open.labels, ...e.labels])],
      });
      // TM-D6/TM-D7: usulan lembur & label istirahat/lembur rutin.
      await syncOvertime(tx, open.id);
      dayId = open.id;
      punchId = added.id;
      companyId = open.companyId;
      managerEmployeeId = open.managerEmployeeId;
    }
    // D-073: setiap absen (masuk & pulang) disetujui sendiri-sendiri oleh Atasan + HR.
    await createApprovalRequest(tx, {
      subjectType: "ATTENDANCE_PUNCH",
      subjectId: punchId,
      requesterEmployeeId: employeeId,
      companyId,
      managerEmployeeId,
    });
    return (await repository.findDayById(dayId, tx)) as repository.DayRow;
  });

  if (e.kind === "OUT") await warnBreak(row);
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: e.kind === "IN" ? "attendance.check_in" : "attendance.check_out",
    entityType: "attendance.day",
    entityId: row.id,
    before: null,
    after: { workDate: e.workDate, labels: e.labels, distanceM: e.geofence.distanceM },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return (await toDayViews(ctx, [row], true))[0] as DayView;
}

/** TM-D7: peringatan ke karyawan bila istirahat lebih dari jatah / tidak absen istirahat. */
async function warnBreak(day: repository.DayRow) {
  const date = toIso(day.workDate);
  const notices: EmployeeNotice[] = [];
  if (day.labels.includes("BREAK_OVER")) {
    notices.push({
      employeeId: day.employeeId,
      type: "attendance.break_warning",
      title: `Istirahat ${dateLabel(date)} melebihi jatah`,
      body: "Kelebihan waktu istirahat mengurangi lembur hari itu. Patuhi jatah istirahat shift.",
      link: "/absen/riwayat",
      dedupeKey: `tm-break-over:${day.id}`,
      target: { type: "ATTENDANCE_DAY", id: day.id },
    });
  }
  if (day.labels.includes("NO_BREAK_PUNCH")) {
    notices.push({
      employeeId: day.employeeId,
      type: "attendance.break_warning",
      title: `Tidak absen istirahat ${dateLabel(date)}`,
      body: "Lokasi Anda wajib absen istirahat. Istirahat dianggap sesuai jatah; lain kali lakukan Mulai & Selesai istirahat.",
      link: "/absen/riwayat",
      dedupeKey: `tm-break-none:${day.id}`,
      target: { type: "ATTENDANCE_DAY", id: day.id },
    });
  }
  await notifyEmployees(notices);
}

export async function myHistory(ctx: RequestContext, from: string, to: string): Promise<DayView[]> {
  const employeeId = selfEmployee(ctx);
  return toDayViews(
    ctx,
    await repository.daysOfEmployee(employeeId, toDate(from), toDate(to)),
    true,
  );
}

// ── Atasan / HR (Tahap D) ──────────────────────────────────────────────────────

export interface DayListQuery {
  scope: "inbox" | "all";
  companyId?: string | undefined;
  from: string;
  to: string;
  labeledOnly?: boolean | undefined;
  status?: string | undefined;
  /** Rekap per karyawan: hanya hari milik karyawan ini (tetap dalam cakupan aktor). */
  employeeId?: string | undefined;
  /** Cari nama / NIK karyawan (2026-10-26, permintaan Mat). */
  q?: string | undefined;
}

/** Data Absen Harian: inbox = menunggu keputusan aktor; all = semua hari dalam cakupan aktor. */
export async function listDays(ctx: RequestContext, query: DayListQuery): Promise<DayView[]> {
  // TM-D3: Data Absen Harian ikut menampilkan Alpha karena tidak absen tanpa menunggu cron.
  await markNoAttendanceAlpha();
  const actor = ctx.actor;
  const q = query.q?.trim();
  const matching = q ? new Set(await directory.employeeIdsMatching(q)) : null;
  if (matching?.size === 0) return [];
  let rows: repository.DayRow[];
  if (query.scope === "inbox") {
    // D-073: hari yang punya absen menunggu keputusan aktor (+ approval hari model lama).
    const [punches, legacy] = await Promise.all([
      listActionable(actor, "ATTENDANCE_PUNCH", { includeOverride: true }),
      listActionable(actor, "ATTENDANCE_DAY", { includeOverride: true }),
    ]);
    const dayIds = await repository.dayIdsOfPunches(punches.map((a) => a.subjectId));
    rows = await repository.daysByIds([...new Set([...dayIds, ...legacy.map((a) => a.subjectId)])]);
  } else {
    const where: Record<string, unknown> = {
      workDate: { gte: toDate(query.from), lte: toDate(query.to) },
    };
    if (actor.role === "SUPER_ADMIN") {
      if (query.companyId) where.companyId = query.companyId;
    } else if (actor.role === "HR_ADMIN") {
      const scope = [...(actor.companyIds ?? [])];
      if (query.companyId && !scope.includes(query.companyId)) throw new ForbiddenError();
      where.companyId = query.companyId ? query.companyId : { in: scope };
    } else if (actor.role === "MANAGER" && actor.employeeId) {
      where.employeeId = { in: await directory.teamIds(actor.employeeId) };
    } else {
      throw new ForbiddenError();
    }
    if (query.status) where.status = query.status;
    const and: Record<string, unknown>[] = [];
    if (query.employeeId) and.push({ employeeId: query.employeeId });
    // Disaring di query (sebelum batas 500 baris) agar karyawan di luar 500 hari terbaru tetap ketemu.
    if (matching) and.push({ employeeId: { in: [...matching] } });
    if (and.length > 0) where.AND = and;
    rows = await repository.listDays(where, query.employeeId ? 1000 : 500);
  }
  rows = rows.filter((r) => toIso(r.workDate) >= query.from && toIso(r.workDate) <= query.to);
  if (query.companyId) rows = rows.filter((r) => r.companyId === query.companyId);
  if (matching) rows = rows.filter((r) => matching.has(r.employeeId));
  if (query.labeledOnly) rows = rows.filter((r) => r.labels.length > 0);
  // Permintaan pemilik projek 2026-10-21: Data Absen Harian hanya hari yang punya absen (sudah absen, telat,
  // diperbaiki). Alpha tanpa absen ada di Rekap › Alpha & pernyataan dan bukti SP, kecuali diminta per karyawan.
  if (!query.employeeId) rows = rows.filter((r) => r.status !== "ALPHA" || r.punches.length > 0);
  // Urutan tetap di kedua tab (antrean diambil per approval → acak): tanggal terbaru dulu.
  rows.sort(
    (a, b) =>
      b.workDate.getTime() - a.workDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return toDayViews(ctx, rows, true);
}

export async function getDay(ctx: RequestContext, id: string): Promise<DayView> {
  const row = await repository.findDayById(id);
  if (!row) throw new NotFoundError();
  const target = {
    employeeId: row.employeeId,
    companyId: row.companyId,
    managerId: row.managerEmployeeId,
  };
  if (!policy.canViewEmployeeRoster(ctx.actor, target)) throw new NotFoundError();
  return (await toDayViews(ctx, [row], true))[0] as DayView;
}

// ── Cron & integrasi ───────────────────────────────────────────────────────────

/** Cron `attendance-no-checkout`: hari OPEN lewat batas → label NO_CHECKOUT + masuk approval. */
/** `employeeIds` membatasi cakupan (dipakai test supaya data lokal lain tidak ikut berubah). */
export async function closeOverdueDays(
  now = new Date(),
  employeeIds?: string[],
): Promise<{ closed: number }> {
  const overdue = await repository.overdueOpenDays(now, employeeIds);
  for (const day of overdue) {
    await repository.withTransactionDay(async (tx) => {
      // D-073: absen masuk sudah punya approval sendiri; hari menunggu koreksi / input manual pulang.
      await repository.updateDay(tx, day.id, {
        status: "PENDING",
        labels: [...new Set([...day.labels, "NO_CHECKOUT"])],
      });
    });
  }
  return { closed: overdue.length };
}

/** Cron `purge-selfies`: hapus file selfie melewati masa simpan (data absen tetap). */
/** `employeeIds` membatasi cakupan (dipakai test supaya foto lokal lain tidak ikut terhapus). */
export async function purgeSelfies(
  now = new Date(),
  employeeIds?: string[],
): Promise<{ purged: number }> {
  const settings = await readTimeSettings();
  const before = new Date(now);
  before.setUTCMonth(before.getUTCMonth() - settings.selfieRetentionMonths);
  const rows = await repository.expiredSelfies(before, employeeIds);
  if (rows.length === 0) return { purged: 0 };
  await storage().storage.removeObjects(
    ATTENDANCE_SELFIE_BUCKET,
    rows.map((r) => r.selfiePath).filter((path): path is string => path !== null),
  );
  await repository.markSelfiesPurged(
    rows.map((r) => r.id),
    now,
  );
  return { purged: rows.length };
}

/** Wiring: approval hari absen & kunci roster untuk hari yang sudah disetujui. */
/** Status hari dari status absennya (D-073): ditolak salah satu -> REJECTED; masuk+pulang disetujui -> APPROVED. */
export async function recomputeDay(tx: repository.AttendanceTx, dayId: string) {
  const day = await repository.findDayById(dayId, tx);
  if (!day || day.status === "ALPHA" || day.status === "LEAVE") return;
  const inP = day.punches.find((p) => p.kind === "IN");
  const outP = day.punches.find((p) => p.kind === "OUT");
  let status: "OPEN" | "PENDING" | "APPROVED" | "REJECTED";
  if (day.punches.some((p) => p.status === "REJECTED")) status = "REJECTED";
  else if (inP?.status === "APPROVED" && outP?.status === "APPROVED") status = "APPROVED";
  else if (outP || day.labels.includes("NO_CHECKOUT")) status = "PENDING";
  else status = "OPEN";
  const labels = [
    ...new Set([
      ...day.punches.flatMap((p) => p.labels),
      ...day.labels.filter((l) => l === "NO_CHECKOUT" || l === "CORRECTED"),
    ]),
  ];
  await repository.updateDay(tx, dayId, { status, labels });
  // TM-D6: usulan lembur mengikuti data absen terbaru (label istirahat/lembur rutin ikut dihitung ulang).
  await syncOvertime(tx, dayId);
}

export function registerAttendanceIntegrations() {
  registerApprovalHandler("ATTENDANCE_PUNCH", async (tx, event) => {
    const punch = await tx.attendancePunch.findUnique({ where: { id: event.subjectId } });
    if (punch?.status !== "PENDING" || event.status === "CANCELLED") return;
    await tx.attendancePunch.update({
      where: { id: punch.id },
      data: { status: event.status, decidedAt: event.decidedAt },
    });
    await recomputeDay(tx, punch.dayId);
    if (event.status === "REJECTED") {
      const day = await tx.attendanceDay.findUnique({
        where: { id: punch.dayId },
        select: { employeeId: true, workDate: true },
      });
      if (day) {
        const date = toIso(day.workDate);
        event.afterCommit(() =>
          notifyEmployees([
            {
              employeeId: day.employeeId,
              type: "attendance.punch_rejected",
              title: `${PUNCH_KIND_LABELS[punch.kind]} ${dateLabel(date)} ditolak`,
              body: `Ajukan koreksi paling lambat ${dateLabel(correctionDeadline(date))} agar hari itu tidak menjadi Alpha.`,
              link: "/time/pernyataan",
              dedupeKey: `tm-punch-rejected:${punch.id}`,
              target: { type: "ATTENDANCE_DAY", id: punch.dayId },
            },
          ]),
        );
      }
    }
  });
  registerApprovalHandler("ATTENDANCE_DAY", async (tx, event) => {
    if (event.status !== "APPROVED" && event.status !== "REJECTED") return;
    // Hari yang sudah menjadi ALPHA (periode ditutup) / cuti tidak diubah lagi oleh keputusan lama.
    const day = await repository.findDayById(event.subjectId, tx);
    if (day?.status !== "PENDING") return;
    await repository.updateDay(tx, event.subjectId, { status: event.status });
  });
  configureRosterLocks(async (employeeIds, from, to, tx) => {
    const rows = await repository.lockingDays(employeeIds, toDate(from), toDate(to), tx);
    const locked = new Set(rows.map((r) => dayKey(r.employeeId, toIso(r.workDate))));
    // Periode tertutup (D-071) mengunci seluruh tanggal bulan itu untuk karyawan PT tersebut.
    const people = await directory.employeesByIds(employeeIds);
    const closed = await closedMonths(
      [...people.values()].map((p) => p.companyId),
      from,
      to,
      tx,
    );
    if (closed.size > 0) {
      for (const person of people.values()) {
        for (let d = from; d <= to; d = isoAddDays(d, 1)) {
          if (closed.has(`${person.companyId}|${d.slice(0, 7)}`)) locked.add(dayKey(person.id, d));
        }
      }
    }
    return locked;
  });
}

// ── D-073: batal salah pencet & autentikasi manual ─────────────────────────────

/** Karyawan membatalkan absennya sendiri (salah pencet) <= 15 menit & belum diputuskan siapa pun. */
export async function cancelOwnPunch(ctx: RequestContext, punchId: string) {
  const punch = await repository.findPunch(punchId);
  if (!punch || punch.day.employeeId !== ctx.actor.employeeId) throw new NotFoundError();
  const approval =
    (await getApprovalViews(ctx.actor, "ATTENDANCE_PUNCH", [punch.id])).get(punch.id) ?? null;
  if (!canCancelPunch(ctx, punch.day.employeeId, punch, approval, Date.now())) {
    throw new BusinessRuleError(
      `Absen ini tidak bisa dibatalkan lagi (lewat ${PUNCH_CANCEL_WINDOW_MIN} menit atau sudah diputuskan). Ajukan koreksi absensi.`,
    );
  }
  await repository.withTransactionDay(async (tx) => {
    if (punch.kind === "IN") {
      const out = await tx.attendancePunch.count({ where: { dayId: punch.dayId, kind: "OUT" } });
      if (out > 0) throw new BusinessRuleError("Batalkan absen pulang terlebih dahulu.");
      await cancelApprovalRequest(tx, "ATTENDANCE_PUNCH", punch.id);
      await tx.attendanceDay.delete({ where: { id: punch.dayId } });
    } else {
      await cancelApprovalRequest(tx, "ATTENDANCE_PUNCH", punch.id);
      await tx.attendancePunch.delete({ where: { id: punch.id } });
      await recomputeDay(tx, punch.dayId);
    }
  });
  if (punch.selfiePath) {
    await storage()
      .storage.removeObjects(ATTENDANCE_SELFIE_BUCKET, [punch.selfiePath])
      .catch(() => undefined);
  }
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "attendance.punch.cancel",
    entityType: "attendance.punch",
    entityId: punch.id,
    before: {
      kind: punch.kind,
      at: punch.at.toISOString(),
      workDate: toIso(punch.day.workDate),
      labels: punch.labels,
    },
    after: null,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return { cancelled: true, kind: punch.kind };
}

/**
 * Autentikasi manual (HR PT / SA): masukkan atau ganti jam absen masuk/pulang seorang karyawan bila
 * data salah (salah pencet, HP rusak, GPS error). Berlabel MANUAL, tercatat di audit log, dan tetap
 * melalui approval; bila dimasukkan HR, langkah HR langsung disetujui atas nama HR tersebut.
 */
export async function manualPunch(ctx: RequestContext, input: ManualPunchInput) {
  const employee = await directory.employeeById(input.employeeId);
  if (!employee) throw new NotFoundError();
  if (!policy.canManageRoster(ctx.actor, employee.companyId)) throw new ForbiddenError();
  if (ctx.actor.employeeId === employee.id) {
    throw new ForbiddenError("Input manual untuk absen sendiri tidak diperbolehkan.");
  }
  const settings = await readTimeSettings();
  if (input.workDate > localDate(new Date(), settings.timezone)) {
    throw new BusinessRuleError("Tanggal kerja belum terjadi.");
  }
  if (await isDateClosed(employee.companyId, input.workDate)) {
    throw new BusinessRuleError("Periode tanggal ini sudah ditutup.");
  }
  // TM-D3: input manual HR termasuk koreksi → hanya s.d. tanggal kerja + 3 hari.
  if (!canStillCorrect(input.workDate, localDate(new Date(), settings.timezone))) {
    throw new BusinessRuleError(
      `Batas koreksi untuk tanggal ini sudah lewat (paling lambat ${correctionDeadline(input.workDate)}).`,
    );
  }
  const workDate = toDate(input.workDate);
  // Lokasi dipilih HR: titik site disimpan sebagai lokasi absen (sumber MANUAL, bukan GPS perangkat).
  const manualLocation = input.workLocationId
    ? ((await directory.locationsByIds([input.workLocationId])).get(input.workLocationId) ?? null)
    : null;
  if (input.workLocationId && !manualLocation) throw new NotFoundError("Lokasi tidak ditemukan.");
  const result = await repository.withTransactionDay(async (tx) => {
    let day = await repository.findDay(employee.id, workDate, tx);
    // TM-D3: Alpha karena tidak absen boleh diisi manual (dalam batas waktu); penanda NO_ATTENDANCE tetap.
    if (day?.status === "ALPHA" && day.labels.includes("NO_ATTENDANCE")) {
      await repository.updateDay(tx, day.id, { status: "OPEN" });
      day = (await repository.findDay(employee.id, workDate, tx)) as repository.DayRow;
    }
    if (day && (day.status === "ALPHA" || day.status === "LEAVE")) {
      throw new BusinessRuleError("Hari ini berstatus Alpha atau cuti; tidak bisa diisi manual.");
    }
    if (!day) {
      const rosterDay = await rosterRepo.rosterDay(employee.id, workDate, tx);
      const window = rosterDay?.shift
        ? shiftWindow(input.workDate, shiftTimes(rosterDay.shift), settings.timezone)
        : null;
      await tx.attendanceDay.create({
        data: {
          employeeId: employee.id,
          companyId: employee.companyId,
          managerEmployeeId: employee.managerId,
          workDate,
          shiftId: rosterDay?.shift?.id ?? null,
          shiftCode: rosterDay?.shift?.code ?? null,
          scheduledStart: window?.start ?? null,
          scheduledEnd: window?.end ?? null,
          checkOutDeadline: window?.checkOutDeadline ?? null,
          workLocationId: employee.workLocationId,
          status: "OPEN",
          labels: [],
        },
      });
      day = (await repository.findDay(employee.id, workDate, tx)) as repository.DayRow;
    }
    const inPunch = day.punches.find((p) => p.kind === "IN");
    const outPunch = day.punches.find((p) => p.kind === "OUT");
    if (input.kind === "OUT" && !inPunch) {
      throw new BusinessRuleError("Masukkan jam masuk terlebih dahulu.");
    }
    const at = correctionInstant(
      input.workDate,
      input.time,
      settings.timezone,
      input.kind === "OUT" ? inPunch?.at : null,
    );
    if (input.kind === "IN" && outPunch && at >= outPunch.at) {
      throw new BusinessRuleError("Jam masuk harus sebelum jam pulang.");
    }
    const replaced = input.kind === "IN" ? inPunch : outPunch;
    if (replaced) {
      await cancelApprovalRequest(tx, "ATTENDANCE_PUNCH", replaced.id);
      await tx.attendancePunch.delete({ where: { id: replaced.id } });
    }
    const created = await tx.attendancePunch.create({
      data: {
        dayId: day.id,
        kind: input.kind,
        at,
        ...(manualLocation
          ? {
              workLocationId: manualLocation.id,
              latitude: manualLocation.latitude,
              longitude: manualLocation.longitude,
              distanceM: manualLocation.latitude === null ? null : 0,
              insideGeofence: manualLocation.latitude !== null,
            }
          : { insideGeofence: false }),
        labels: ["MANUAL"],
        reason: input.reason,
        source: "MANUAL",
        manualByAccountId: ctx.actor.accountId,
      },
    });
    const request = await createApprovalRequest(tx, {
      subjectType: "ATTENDANCE_PUNCH",
      subjectId: created.id,
      requesterEmployeeId: employee.id,
      companyId: day.companyId,
      managerEmployeeId: day.managerEmployeeId,
    });
    await recomputeDay(tx, day.id);
    return { dayId: day.id, punchId: created.id, requestId: request.id, replaced };
  });
  if (result.replaced?.selfiePath) {
    await storage()
      .storage.removeObjects(ATTENDANCE_SELFIE_BUCKET, [result.replaced.selfiePath])
      .catch(() => undefined);
  }
  // HR yang memasukkan sudah memverifikasi data → langkah HR disetujui atas namanya.
  if (ctx.actor.role === "HR_ADMIN") {
    await decideApproval(ctx, result.requestId, {
      decision: "APPROVED",
      note: `Input manual: ${input.reason}`,
    }).catch(() => undefined);
  }
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "attendance.punch.manual",
    entityType: "attendance.punch",
    entityId: result.punchId,
    before: result.replaced
      ? {
          kind: result.replaced.kind,
          at: result.replaced.at.toISOString(),
          source: result.replaced.source,
        }
      : null,
    after: { ...input },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return getDay(ctx, result.dayId);
}
