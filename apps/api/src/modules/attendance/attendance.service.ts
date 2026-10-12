import {
  type AttendanceLabel,
  type ManualPunchInput,
  PUNCH_CANCEL_WINDOW_MIN,
  type PunchInput,
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
import * as policy from "./attendance.policy.ts";
import * as repository from "./attendance.repository.ts";
import {
  candidateDates,
  checkGeofence,
  checkOutLabels,
  type GeofenceSite,
  localDate,
  planCheckIn,
  type ShiftTimes,
  shiftWindow,
} from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import { closedMonths, correctionInstant, isDateClosed } from "./period.service.ts";
import * as rosterRepo from "./roster.repository.ts";
import { configureRosterLocks, dayKey, shiftDto } from "./roster.service.ts";
import { isoAddDays } from "./roster-engine.ts";

// Tahap C/D — absen PWA (D-066, D-069) & approval hari absen (D-067).

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
}): ShiftTimes => ({
  startMinute: shift.startMinute,
  endMinute: shift.endMinute,
  checkInOpenMin: shift.checkInOpenMin,
  lateToleranceMin: shift.lateToleranceMin,
  earlyLeaveToleranceMin: shift.earlyLeaveToleranceMin,
  checkOutCloseMin: shift.checkOutCloseMin,
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

/** Lokasi acuan pada tanggal kerja: lokasi crew, kalau tidak ada lokasi kerja karyawan. */
async function expectedLocationId(employee: directory.DirectoryEmployee, workDate: string) {
  const membership = await rosterRepo.crewOfEmployeeOn(employee.id, toDate(workDate));
  return membership?.crew.workLocationId ?? employee.workLocationId;
}

interface Evaluation {
  kind: "IN" | "OUT";
  workDate: string;
  shift: Shift | null;
  window: ReturnType<typeof shiftWindow> | null;
  labels: AttendanceLabel[];
  geofence: ReturnType<typeof checkGeofence>;
  openDay: repository.DayRow | null;
  location: directory.DirectoryLocation | null;
  /** D-072: kemungkinan salah memilih Clock In / Clock Out. */
  suspicion: PunchSuspicion | null;
  /** Hari yang masih terbuka (belum Clock Out) saat memilih Clock In. */
  stillOpen: repository.DayRow | null;
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
  const [allSites] = await Promise.all([directory.geofencedLocations()]);
  const sites = allSites.map(toSite).filter((s): s is GeofenceSite => s !== null);

  if (input.kind === "OUT") {
    const open = await repository.findOpenDay(employee.id);
    if (!open) throw new BusinessRuleError("Belum ada absen masuk yang menunggu absen pulang.");
    const shift = open.shiftId ? await rosterRepo.findShift(open.shiftId) : null;
    const window = shift
      ? shiftWindow(toIso(open.workDate), shiftTimes(shift), settings.timezone)
      : null;
    const expectedId =
      open.workLocationId ?? (await expectedLocationId(employee, toIso(open.workDate)));
    const expected = expectedId
      ? ((await directory.locationsByIds([expectedId])).get(expectedId) ?? null)
      : null;
    const geofence = checkGeofence(
      input,
      expected ? toSite(expected) : null,
      sites,
      settings.gpsAccuracyMaxM,
    );
    return {
      kind: "OUT",
      workDate: toIso(open.workDate),
      shift,
      window,
      labels: [
        ...checkOutLabels(now, shift ? shiftTimes(shift) : null, window),
        ...geofence.labels,
      ],
      geofence,
      openDay: open,
      location: expected,
      suspicion: suspicionFor("OUT", now, window, shift?.earlyLeaveToleranceMin ?? null, false),
      stillOpen: null,
    };
  }

  const dates = candidateDates(now, settings.timezone);
  const rosterDays = await rosterRepo.rosterDaysBetween(
    [employee.id],
    toDate(dates[0] as string),
    toDate(dates[2] as string),
  );
  const byDate = new Map(rosterDays.map((d) => [toIso(d.workDate), d]));
  const plan = planCheckIn(
    now,
    settings.timezone,
    dates.map((date) => {
      const d = byDate.get(date);
      return {
        workDate: date,
        shift: d === undefined ? undefined : d.shift ? shiftTimes(d.shift) : null,
      };
    }),
  );
  const rosterDay = byDate.get(plan.workDate);
  const expectedId = await expectedLocationId(employee, plan.workDate);
  const expected = expectedId
    ? ((await directory.locationsByIds([expectedId])).get(expectedId) ?? null)
    : null;
  const geofence = checkGeofence(
    input,
    expected ? toSite(expected) : null,
    sites,
    settings.gpsAccuracyMaxM,
  );
  const stillOpen = await repository.findOpenDay(employee.id);
  return {
    kind: "IN",
    workDate: plan.workDate,
    shift: rosterDay?.shift ?? null,
    window: plan.window,
    labels: [...plan.labels, ...geofence.labels],
    geofence,
    openDay: null,
    location: expected,
    suspicion: suspicionFor("IN", now, plan.window, null, stillOpen !== null),
    stillOpen,
  };
}

// ── Karyawan (PWA) ─────────────────────────────────────────────────────────────

export interface PunchView {
  id: string;
  kind: "IN" | "OUT";
  at: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  altitudeM: number | null;
  distanceM: number | null;
  insideGeofence: boolean;
  labels: string[];
  reason: string | null;
  selfieUrl: string | null;
  selfiePurged: boolean;
  /** D-072: persetujuan per absen. */
  status: "PENDING" | "APPROVED" | "REJECTED";
  source: "DEVICE" | "MANUAL";
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
    rows.map((r) => r.workLocationId).filter((id): id is string => id !== null),
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
        labels: p.labels,
        reason: p.reason,
        selfieUrl: p.selfiePath ? (urls.get(p.selfiePath) ?? null) : null,
        selfiePurged: p.selfiePurgedAt !== null,
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
  roster: { date: string; code: string; shift: ReturnType<typeof shiftDto> | null }[];
  location: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    radiusM: number | null;
  } | null;
  openDay: DayView | null;
  recent: DayView[];
  next: "IN" | "OUT";
}

export async function getToday(ctx: RequestContext, now = new Date()): Promise<TodayView> {
  const employeeId = selfEmployee(ctx);
  const employee = await directory.employeeById(employeeId);
  if (!employee) throw new NotFoundError();
  const settings = await readTimeSettings();
  const dates = candidateDates(now, settings.timezone);
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
  const locationId = await expectedLocationId(employee, dates[1] as string);
  const location = locationId
    ? ((await directory.locationsByIds([locationId])).get(locationId) ?? null)
    : null;
  const recent = await toDayViews(ctx, recentRows, false);
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
    openDay: open
      ? (recent.find((d) => d.id === open.id) ?? (await toDayViews(ctx, [open], false))[0] ?? null)
      : null,
    recent,
    next: open ? "OUT" : "IN",
  };
}

export interface PrecheckResult {
  kind: "IN" | "OUT";
  workDate: string;
  shiftCode: string | null;
  labels: AttendanceLabel[];
  distanceM: number | null;
  insideGeofence: boolean;
  location: { id: string; name: string } | null;
  reasonRequired: boolean;
  alreadyCheckedIn: boolean;
  /** D-072: peringatan salah pencet + konteks jadwal untuk pesan di HP. */
  suspicion: PunchSuspicion | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  /** Menit sekarang terhadap jadwal pulang (negatif = sebelum jam pulang). */
  minutesFromEnd: number | null;
  openDay: { workDate: string; checkInAt: string | null } | null;
}

const openDayInfo = (open: repository.DayRow | null) =>
  open
    ? {
        workDate: toIso(open.workDate),
        checkInAt: open.punches.find((x) => x.kind === "IN")?.at.toISOString() ?? null,
      }
    : null;

export async function precheck(
  ctx: RequestContext,
  input: PunchPrecheckInput,
  now = new Date(),
): Promise<PrecheckResult> {
  const employee = await directory.employeeById(selfEmployee(ctx));
  if (!employee) throw new NotFoundError();
  const e = await evaluate(employee, input, now);
  const existing =
    e.kind === "IN" ? await repository.findDay(employee.id, toDate(e.workDate)) : null;
  return {
    kind: e.kind,
    workDate: e.workDate,
    shiftCode: e.shift?.code ?? null,
    labels: e.labels,
    distanceM: e.geofence.distanceM,
    insideGeofence: e.geofence.inside,
    location: e.location ? { id: e.location.id, name: e.location.name } : null,
    reasonRequired: e.labels.length > 0,
    alreadyCheckedIn: existing !== null,
    suspicion: e.suspicion,
    scheduledStart: e.window?.start.toISOString() ?? null,
    scheduledEnd: e.window?.end.toISOString() ?? null,
    minutesFromEnd: e.window ? Math.round((now.getTime() - e.window.end.getTime()) / MINUTE) : null,
    openDay: openDayInfo(e.stillOpen ?? e.openDay),
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

export async function punch(
  ctx: RequestContext & { userAgent?: string | undefined },
  input: PunchInput,
  now = new Date(),
): Promise<DayView> {
  const employeeId = selfEmployee(ctx);
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

  const e = await evaluate(employee, input, now);
  // Absen masuk ganda pada tanggal kerja yang sama → bentrok (bukan sekadar peringatan).
  if (e.kind === "IN" && (await repository.findDay(employeeId, toDate(e.workDate)))) {
    throw new ConflictError("Sudah absen masuk untuk tanggal kerja ini.");
  }
  if (e.suspicion && !input.confirmed) {
    throw new BusinessRuleError(SUSPICION_TEXT[e.suspicion], [{ suspicion: e.suspicion }]);
  }
  if (e.labels.length > 0 && !input.reason) {
    throw new BusinessRuleError(
      "Alasan wajib diisi karena absen ini di luar ketentuan.",
      e.labels.map((label) => ({ label })),
    );
  }
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
    reason: e.labels.length > 0 ? (input.reason ?? null) : null,
    selfiePath: input.selfiePath,
    userAgent: ctx.userAgent?.slice(0, 300) ?? null,
  };

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
      dayId = open.id;
      punchId = added.id;
      companyId = open.companyId;
      managerEmployeeId = open.managerEmployeeId;
    }
    // D-072: setiap absen (masuk & pulang) disetujui sendiri-sendiri oleh Atasan + HR.
    await createApprovalRequest(tx, {
      subjectType: "ATTENDANCE_PUNCH",
      subjectId: punchId,
      requesterEmployeeId: employeeId,
      companyId,
      managerEmployeeId,
    });
    return (await repository.findDayById(dayId, tx)) as repository.DayRow;
  });

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
}

/** Data Absen Harian: inbox = menunggu keputusan aktor; all = semua hari dalam cakupan aktor. */
export async function listDays(ctx: RequestContext, query: DayListQuery): Promise<DayView[]> {
  const actor = ctx.actor;
  let rows: repository.DayRow[];
  if (query.scope === "inbox") {
    // D-072: hari yang punya absen menunggu keputusan aktor (+ approval hari model lama).
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
    if (query.employeeId) where.AND = [{ employeeId: query.employeeId }];
    rows = await repository.listDays(where, query.employeeId ? 1000 : 500);
  }
  rows = rows.filter((r) => toIso(r.workDate) >= query.from && toIso(r.workDate) <= query.to);
  if (query.companyId) rows = rows.filter((r) => r.companyId === query.companyId);
  if (query.labeledOnly) rows = rows.filter((r) => r.labels.length > 0);
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
      // D-072: absen masuk sudah punya approval sendiri; hari menunggu koreksi / input manual pulang.
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
/** Status hari dari status absennya (D-072): ditolak salah satu -> REJECTED; masuk+pulang disetujui -> APPROVED. */
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
  });
  registerApprovalHandler("ATTENDANCE_DAY", async (tx, event) => {
    if (event.status !== "APPROVED" && event.status !== "REJECTED") return;
    // Hari yang sudah menjadi ALPHA (periode ditutup) / cuti tidak diubah lagi oleh keputusan lama.
    const day = await repository.findDayById(event.subjectId, tx);
    if (day?.status !== "PENDING") return;
    await repository.updateDay(tx, event.subjectId, { status: event.status });
  });
  configureRosterLocks(async (employeeIds, from, to) => {
    const rows = await repository.lockingDays(employeeIds, toDate(from), toDate(to));
    const locked = new Set(rows.map((r) => dayKey(r.employeeId, toIso(r.workDate))));
    // Periode tertutup (D-070) mengunci seluruh tanggal bulan itu untuk karyawan PT tersebut.
    const people = await directory.employeesByIds(employeeIds);
    const closed = await closedMonths(
      [...people.values()].map((p) => p.companyId),
      from,
      to,
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

// ── D-072: batal salah pencet & autentikasi manual ─────────────────────────────

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
  const workDate = toDate(input.workDate);
  const result = await repository.withTransactionDay(async (tx) => {
    let day = await repository.findDay(employee.id, workDate, tx);
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
        insideGeofence: false,
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
