import { z } from "@hono/zod-openapi";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_LOCATION_SOURCES,
  PUNCH_CHANNELS,
  PUNCH_KINDS,
  PUNCH_SUSPICIONS,
} from "@hris/shared";
import { assertExact, nullableRef } from "../../core/contract.ts";
import { approvalViewSchema } from "../approval/index.ts";
import type { DayView, PrecheckResult, PunchView, TodayView } from "./attendance.service.ts";
import type { ShiftDto } from "./roster.service.ts";

// MOB-D7 #1: skema respons OpenAPI modul attendance (dipakai codegen app mobile, MOB-D9).
// Setiap skema dikunci ke tipe service dengan assertExact → typecheck gagal bila tidak sama.

const idName = z.object({ id: z.uuid(), name: z.string() });

export const shiftSchema = z
  .object({
    id: z.uuid(),
    companyId: z.uuid(),
    code: z.string(),
    name: z.string(),
    startMinute: z.number().int(),
    endMinute: z.number().int(),
    crossesMidnight: z.boolean(),
    checkInOpenMin: z.number().int(),
    lateToleranceMin: z.number().int(),
    earlyLeaveToleranceMin: z.number().int(),
    checkOutCloseMin: z.number().int(),
    breakMin: z.number().int(),
    breakPaid: z.boolean(),
    breakStartMinute: z
      .number()
      .int()
      .nullable()
      .openapi({ description: "TM-D12: Mulai istirahat dibuka (menit dari 00:00); null = bebas" }),
    breakEndMinute: z.number().int().nullable(),
    regularOvertimeMin: z.number().int(),
    color: z.string().nullable(),
    archived: z.boolean(),
  })
  .openapi("Shift");
assertExact<z.infer<typeof shiftSchema>, ShiftDto>(true);

export const punchViewSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(PUNCH_KINDS),
    at: z.iso.datetime(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    accuracyM: z.number().int().nullable(),
    altitudeM: z.number().int().nullable(),
    distanceM: z.number().int().nullable(),
    insideGeofence: z.boolean(),
    location: idName.nullable(),
    labels: z.array(z.string()),
    reason: z.string().nullable(),
    selfieUrl: z.string().nullable(),
    selfiePurged: z.boolean(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    source: z.enum(["DEVICE", "MANUAL"]),
    channel: z.enum(PUNCH_CHANNELS),
    appVersion: z.string().nullable(),
    approval: nullableRef(approvalViewSchema),
    canCancel: z.boolean(),
  })
  .openapi("AttendancePunch");
assertExact<z.infer<typeof punchViewSchema>, PunchView>(true);

const employeeRef = z.object({
  id: z.uuid(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});

export const dayViewSchema = z
  .object({
    id: z.uuid(),
    employee: employeeRef,
    workDate: z.iso.date(),
    shiftCode: z.string().nullable(),
    scheduledStart: z.iso.datetime().nullable(),
    scheduledEnd: z.iso.datetime().nullable(),
    workLocation: idName.nullable(),
    status: z.string(),
    labels: z.array(z.string()),
    punches: z.array(punchViewSchema),
    approval: nullableRef(approvalViewSchema),
  })
  .openapi("AttendanceDay");
assertExact<z.infer<typeof dayViewSchema>, DayView>(true);

export const todayViewSchema = z
  .object({
    serverTime: z.iso.datetime(),
    timezone: z.string(),
    gpsAccuracyMaxM: z.number(),
    employee: employeeRef,
    roster: z.array(
      z.object({ date: z.iso.date(), code: z.string(), shift: nullableRef(shiftSchema) }),
    ),
    location: z
      .object({
        id: z.uuid(),
        name: z.string(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
        radiusM: z.number().int().nullable(),
      })
      .nullable(),
    anywhere: z.boolean(),
    locationSource: z.enum(ATTENDANCE_LOCATION_SOURCES),
    openDay: nullableRef(dayViewSchema),
    recent: z.array(dayViewSchema),
    next: z.enum(["IN", "OUT", "DONE"]),
    breakState: z.enum(["NOT_REQUIRED", "NONE", "ON_BREAK", "DONE"]),
    offDay: z
      .boolean()
      .openapi({ description: "TM-D12: hari OFF → tampilkan Lembur hari libur, bukan Clock In" }),
    checkOutOpensAt: z.iso.datetime().nullable().openapi({
      description: "TM-D12: Clock Out normal dibuka; lebih awal = pulang cepat + alasan",
    }),
    breakOpensAt: z.iso.datetime().nullable(),
    breakClosesAt: z.iso.datetime().nullable(),
  })
  .openapi("AttendanceToday");
assertExact<z.infer<typeof todayViewSchema>, TodayView>(true);

export const precheckResultSchema = z
  .object({
    kind: z.enum(PUNCH_KINDS),
    workDate: z.iso.date(),
    shiftCode: z.string().nullable(),
    labels: z.array(z.enum(ATTENDANCE_LABELS)),
    distanceM: z.number().int().nullable(),
    insideGeofence: z.boolean(),
    location: idName.nullable(),
    reasonRequired: z.boolean(),
    alreadyCheckedIn: z.boolean(),
    suspicion: z.enum(PUNCH_SUSPICIONS).nullable(),
    scheduledStart: z.iso.datetime().nullable(),
    scheduledEnd: z.iso.datetime().nullable(),
    minutesFromEnd: z.number().int().nullable(),
    openDay: z
      .object({ workDate: z.iso.date(), checkInAt: z.iso.datetime().nullable() })
      .nullable(),
    offDay: z.boolean(),
    checkOutOpensAt: z.iso.datetime().nullable(),
    breakOpensAt: z.iso.datetime().nullable(),
    breakClosesAt: z.iso.datetime().nullable(),
  })
  .openapi("AttendancePrecheck");
assertExact<z.infer<typeof precheckResultSchema>, PrecheckResult>(true);

export const selfieUploadSchema = z
  .object({
    bucket: z.string(),
    path: z.string(),
    token: z.string(),
    signedUrl: z.string(),
    maxBytes: z.number().int(),
  })
  .openapi("AttendanceSelfieUpload");

export const punchCancelSchema = z
  .object({ cancelled: z.boolean(), kind: z.enum(PUNCH_KINDS) })
  .openapi("AttendancePunchCancel");
