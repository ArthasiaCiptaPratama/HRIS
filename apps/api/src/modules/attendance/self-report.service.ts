import {
  type AttendanceLabel,
  isCorrectableAlpha,
  SELF_REPORT_ENABLED,
  type SelfReportCrewInput,
  type SelfReportPunchInput,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import { cancelApprovalRequest, createApprovalRequest } from "../approval/index.ts";
import * as policy from "./attendance.policy.ts";
import * as repository from "./attendance.repository.ts";
import { assertUploadedPhoto, getDay, recomputeDay } from "./attendance.service.ts";
import { checkGeofence, localDate, shiftWindow } from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import { correctionInstant, isDateClosed } from "./period.service.ts";
import * as rosterRepo from "./roster.repository.ts";
import * as selfRepo from "./self-report.repository.ts";

// ════════════════════════════════════════════════════════════════════════════════════════════
// TM-D29 — ABSEN MANDIRI (STAGING). Karyawan crew berizin (The Intern's) mengisi sendiri jam masuk/
// pulang untuk tanggal mana pun (lampau/mendatang, tanpa batas), foto dari galeri, koordinat GPS HP;
// lokasi acuan tetap = lokasi kerja crew. Tetap butuh persetujuan atasan & HR. Punch disimpan sebagai
// sumber MANUAL berlabel SELF_REPORT + GALLERY_PHOTO (tanpa nilai enum baru) agar mudah dicabut.
// Hapus file ini saat fitur dicabut — jejak: docs/features/time-management/tm-d29-absen-mandiri.md
// ════════════════════════════════════════════════════════════════════════════════════════════

function assertFeatureOn() {
  if (!SELF_REPORT_ENABLED) throw new ForbiddenError("Absen mandiri tidak tersedia.");
}

function selfEmployeeId(ctx: RequestContext) {
  if (!ctx.actor.employeeId) {
    throw new ForbiddenError("Absen hanya untuk akun yang terhubung ke data karyawan.");
  }
  return ctx.actor.employeeId;
}

/** Crew berizin pada tanggal kerja; bila tanggal itu belum/sudah bukan anggota, pakai keanggotaan hari ini. */
async function eligibleCrew(employeeId: string, workDate: string, today: string) {
  return (
    (await selfRepo.selfReportCrewOf(employeeId, toDate(workDate)))?.crew ??
    (await selfRepo.selfReportCrewOf(employeeId, toDate(today)))?.crew ??
    null
  );
}

export interface SelfReportStatus {
  enabled: boolean;
  crewName: string | null;
  location: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    radiusM: number | null;
  } | null;
}

/** HP: apakah tombol "Absen mandiri" ditampilkan untuk karyawan ini. */
export async function myStatus(ctx: RequestContext): Promise<SelfReportStatus> {
  // Sama dengan absen /me lain: akun tanpa data karyawan → 403.
  const employeeId = selfEmployeeId(ctx);
  const off: SelfReportStatus = { enabled: false, crewName: null, location: null };
  if (!SELF_REPORT_ENABLED) return off;
  const today = localDate(new Date(), (await readTimeSettings()).timezone);
  const crew = (await selfRepo.selfReportCrewOf(employeeId, toDate(today)))?.crew;
  if (!crew) return off;
  const loc = (await directory.locationsByIds([crew.workLocationId])).get(crew.workLocationId);
  return {
    enabled: true,
    crewName: crew.name,
    location: loc
      ? {
          id: loc.id,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          radiusM: loc.radiusM,
        }
      : null,
  };
}

export async function selfPunch(ctx: RequestContext, input: SelfReportPunchInput) {
  assertFeatureOn();
  const employeeId = selfEmployeeId(ctx);
  const employee = await directory.employeeById(employeeId);
  if (!employee?.isActive) throw new ForbiddenError("Karyawan tidak aktif.");
  const settings = await readTimeSettings();
  const today = localDate(new Date(), settings.timezone);
  const crew = await eligibleCrew(employeeId, input.workDate, today);
  if (!crew) throw new ForbiddenError("Absen mandiri hanya untuk crew yang diizinkan HR.");
  if (await isDateClosed(employee.companyId, input.workDate)) {
    throw new BusinessRuleError("Periode tanggal ini sudah ditutup.");
  }
  await assertUploadedPhoto(employeeId, input.photoPath, "Pilih ulang foto dari galeri.");

  // Lokasi acuan tetap = lokasi kerja crew; koordinat = GPS HP (jarak & label radius dihitung apa adanya).
  const site =
    (await directory.locationsByIds([crew.workLocationId])).get(crew.workLocationId) ?? null;
  const geo =
    site && site.latitude !== null && site.longitude !== null && site.radiusM !== null
      ? checkGeofence(
          input,
          {
            id: site.id,
            latitude: site.latitude,
            longitude: site.longitude,
            radiusM: site.radiusM,
          },
          [],
          settings.gpsAccuracyMaxM,
        )
      : {
          workLocationId: site?.id ?? null,
          distanceM: null,
          inside: false,
          labels: [] as AttendanceLabel[],
        };
  const labels: AttendanceLabel[] = [
    "SELF_REPORT",
    "GALLERY_PHOTO",
    ...geo.labels,
    ...(input.isMock ? (["MOCK_LOCATION"] as const) : []),
  ];

  const workDate = toDate(input.workDate);
  const result = await repository.withTransactionDay(async (tx) => {
    let day = await repository.findDay(employeeId, workDate, tx);
    // Alpha "tidak absen" / "tidak absen pulang" → dibuka lagi tanpa batas waktu (bukan koreksi).
    if (day && isCorrectableAlpha(day)) {
      await repository.updateDay(tx, day.id, { status: "OPEN" });
      day = (await repository.findDay(employeeId, workDate, tx)) as repository.DayRow;
    }
    if (day && (day.status === "ALPHA" || day.status === "LEAVE")) {
      throw new BusinessRuleError(
        "Tanggal ini berstatus Alpha (tutup periode) atau cuti; hubungi HR.",
      );
    }
    if (!day) {
      const rosterDay = await rosterRepo.rosterDay(employeeId, workDate, tx);
      const window = rosterDay?.shift
        ? shiftWindow(input.workDate, rosterDay.shift, settings.timezone)
        : null;
      await tx.attendanceDay.create({
        data: {
          employeeId,
          companyId: employee.companyId,
          managerEmployeeId: employee.managerId,
          workDate,
          shiftId: rosterDay?.shift?.id ?? null,
          shiftCode: rosterDay?.shift?.code ?? null,
          scheduledStart: window?.start ?? null,
          scheduledEnd: window?.end ?? null,
          checkOutDeadline: window?.checkOutDeadline ?? null,
          workLocationId: crew.workLocationId,
          status: "OPEN",
          labels: [],
        },
      });
      day = (await repository.findDay(employeeId, workDate, tx)) as repository.DayRow;
    }
    const inPunch = day.punches.find((p) => p.kind === "IN");
    const outPunch = day.punches.find((p) => p.kind === "OUT");
    if (input.kind === "OUT" && !inPunch) {
      throw new BusinessRuleError("Isi jam masuk terlebih dahulu.");
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
    // Hanya absen mandiri sendiri yang belum diputuskan yang boleh diganti; selain itu lewat HR.
    const replaced = input.kind === "IN" ? inPunch : outPunch;
    if (replaced) {
      if (!replaced.labels.includes("SELF_REPORT") || replaced.status !== "PENDING") {
        throw new BusinessRuleError(
          `${input.kind === "IN" ? "Jam masuk" : "Jam pulang"} tanggal ini sudah tercatat atau sudah diputuskan; perubahan lewat HR.`,
        );
      }
      await cancelApprovalRequest(tx, "ATTENDANCE_PUNCH", replaced.id);
      await tx.attendancePunch.delete({ where: { id: replaced.id } });
    }
    const created = await tx.attendancePunch.create({
      data: {
        dayId: day.id,
        kind: input.kind,
        at,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyM: Math.round(input.accuracyM),
        altitudeM:
          input.altitudeM === undefined || input.altitudeM === null
            ? null
            : Math.round(input.altitudeM),
        distanceM: geo.distanceM,
        workLocationId: geo.workLocationId,
        insideGeofence: geo.inside,
        labels,
        reason: input.reason?.trim() ? input.reason.trim() : null,
        selfiePath: input.photoPath,
        source: "MANUAL",
        manualByAccountId: ctx.actor.accountId,
      },
    });
    const request = await createApprovalRequest(tx, {
      subjectType: "ATTENDANCE_PUNCH",
      subjectId: created.id,
      requesterEmployeeId: employeeId,
      companyId: day.companyId,
      managerEmployeeId: day.managerEmployeeId,
    });
    await recomputeDay(tx, day.id);
    return { dayId: day.id, punchId: created.id, requestId: request.id, replaced };
  });

  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "attendance.punch.self_report",
    entityType: "attendance.punch",
    entityId: result.punchId,
    before: result.replaced
      ? { kind: result.replaced.kind, at: result.replaced.at.toISOString() }
      : null,
    after: {
      workDate: input.workDate,
      kind: input.kind,
      time: input.time,
      crewId: crew.id,
      distanceM: geo.distanceM,
      labels,
    },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return getDay(ctx, result.dayId);
}

// ── Pengaturan HR/SA: crew mana yang boleh absen mandiri ─────────────────────────────────────

export interface SelfReportCrewView {
  crewId: string;
  crewName: string;
  activeMembers: number;
  enabled: boolean;
  enabledAt: string | null;
}

export async function listCrews(
  ctx: RequestContext,
  companyId: string,
): Promise<SelfReportCrewView[]> {
  assertFeatureOn();
  if (!policy.canManageRoster(ctx.actor, companyId)) throw new ForbiddenError();
  const today = localDate(new Date(), (await readTimeSettings()).timezone);
  const rows = await selfRepo.crewsWithSelfReport(companyId, toDate(today));
  return rows.map((r) => ({
    crewId: r.id,
    crewName: r.name,
    activeMembers: r._count.members,
    enabled: r.selfReport !== null,
    enabledAt: r.selfReport?.createdAt.toISOString() ?? null,
  }));
}

export async function setCrew(ctx: RequestContext, input: SelfReportCrewInput) {
  assertFeatureOn();
  const crew = await selfRepo.findCrew(input.crewId);
  if (!crew) throw new NotFoundError("Crew tidak ditemukan.");
  if (!policy.canManageRoster(ctx.actor, crew.companyId)) throw new ForbiddenError();
  if (input.enabled) await selfRepo.enableCrew(crew.id, ctx.actor.accountId);
  else await selfRepo.disableCrew(crew.id);
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: input.enabled ? "attendance.self_report.enable" : "attendance.self_report.disable",
    entityType: "attendance.crew",
    entityId: crew.id,
    before: null,
    after: { enabled: input.enabled },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return (await listCrews(ctx, crew.companyId)).find(
    (c) => c.crewId === crew.id,
  ) as SelfReportCrewView;
}
