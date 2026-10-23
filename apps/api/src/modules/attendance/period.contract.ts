import { z } from "@hono/zod-openapi";
import { ALPHA_VERIFICATION_STATES, ATTENDANCE_RECORD_OUTCOMES } from "@hris/shared";
import { assertExact, nullableRef } from "../../core/contract.ts";
import { approvalViewSchema } from "../approval/index.ts";
import type {
  AlphaVerificationItem,
  AttendanceRecord,
  AttendanceRecordItem,
} from "./alpha.service.ts";
import type * as service from "./period.service.ts";
import type { CorrectionDto, RecapRow, StatementRow } from "./period.service.ts";

// MOB-D7 #1: skema respons OpenAPI rekap/tutup periode, surat pernyataan, koreksi, rekam jejak (D-071, TM-D3).
// Setiap skema dikunci ke tipe service dengan assertExact → typecheck gagal bila tidak sama.

const employeeRef = z.object({
  id: z.uuid(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});
const periodStatus = z.enum(["OPEN", "CLOSED"]);

export const recapRowSchema = z
  .object({
    employee: employeeRef,
    workDays: z.number().int(),
    offDays: z.number().int(),
    present: z.number().int(),
    pending: z.number().int(),
    rejected: z.number().int(),
    alpha: z.number().int(),
    leave: z.number().int(),
    noRecord: z.number().int(),
    late: z.number().int(),
    earlyLeave: z.number().int(),
    outsideRoster: z.number().int(),
    statements: z.number().int(),
    corrected: z.number().int(),
    expired: z.number().int(),
  })
  .openapi("AttendanceRecapRow");
assertExact<z.infer<typeof recapRowSchema>, RecapRow>(true);

export const monthlyRecapSchema = z
  .object({
    month: z.string(),
    companyId: z.uuid(),
    period: z.object({ status: periodStatus, closedAt: z.iso.datetime().nullable() }),
    canClose: z.boolean(),
    rows: z.array(recapRowSchema),
  })
  .openapi("AttendancePeriodRecap");
assertExact<z.infer<typeof monthlyRecapSchema>, Awaited<ReturnType<typeof service.monthlyRecap>>>(
  true,
);

export const periodPreviewSchema = z
  .object({
    status: periodStatus,
    alpha: z.number().int(),
    unverifiedAlpha: z.number().int().openapi({
      description: "TM-D13: Alpha belum diverifikasi atasan (periode belum bisa ditutup)",
    }),
    noAttendance: z.number().int(),
    pending: z.number().int(),
    rejected: z.number().int(),
    sample: z.array(
      z.object({ employee: employeeRef, date: z.iso.date(), status: z.string().nullable() }),
    ),
  })
  .openapi("AttendancePeriodPreview");
assertExact<z.infer<typeof periodPreviewSchema>, Awaited<ReturnType<typeof service.previewClose>>>(
  true,
);

export const periodCloseResultSchema = z
  .object({ month: z.string(), alpha: z.number().int() })
  .openapi("AttendancePeriodCloseResult");
assertExact<
  z.infer<typeof periodCloseResultSchema>,
  Awaited<ReturnType<typeof service.closePeriod>>
>(true);

export const statementRowSchema = z
  .object({
    dayId: z.uuid(),
    employee: employeeRef,
    workDate: z.iso.date(),
    statement: z
      .object({
        id: z.uuid(),
        reason: z.string(),
        createdAt: z.iso.datetime(),
        attachmentUrl: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("AttendanceStatement");
assertExact<z.infer<typeof statementRowSchema>, StatementRow>(true);

export const statementUploadResultSchema = z
  .object({
    bucket: z.string(),
    path: z.string(),
    token: z.string(),
    signedUrl: z.string(),
    maxBytes: z.number().int(),
  })
  .openapi("AttendanceStatementUpload");
assertExact<
  z.infer<typeof statementUploadResultSchema>,
  Awaited<ReturnType<typeof service.createStatementUpload>>
>(true);

export const correctionSchema = z
  .object({
    id: z.uuid(),
    employee: employeeRef,
    workDate: z.iso.date(),
    checkInAt: z.iso.datetime().nullable(),
    checkOutAt: z.iso.datetime().nullable(),
    reason: z.string(),
    status: z.string(),
    createdAt: z.iso.datetime(),
    approval: nullableRef(approvalViewSchema),
    canCancel: z.boolean(),
  })
  .openapi("AttendanceCorrection");
assertExact<z.infer<typeof correctionSchema>, CorrectionDto>(true);
assertExact<
  z.infer<typeof correctionSchema>[],
  Awaited<ReturnType<typeof service.listCorrections>>
>(true);

const recordItemSchema = z
  .object({
    workDate: z.iso.date(),
    shiftCode: z.string().nullable(),
    outcome: z.enum(ATTENDANCE_RECORD_OUTCOMES),
    deadline: z.iso.date(),
    correction: z
      .object({ status: z.string(), reason: z.string(), createdAt: z.iso.datetime() })
      .nullable(),
  })
  .openapi("AttendanceRecordItem");
assertExact<z.infer<typeof recordItemSchema>, AttendanceRecordItem>(true);

export const attendanceRecordSchema = z
  .object({
    employee: employeeRef,
    today: z.iso.date(),
    summary: z.record(z.enum(ATTENDANCE_RECORD_OUTCOMES), z.number().int()),
    items: z.array(recordItemSchema),
  })
  .openapi("AttendanceRecord");
assertExact<z.infer<typeof attendanceRecordSchema>, AttendanceRecord>(true);

// TM-D13 Fase B: verifikasi atasan atas Alpha.
export const alphaVerificationSchema = z
  .object({
    dayId: z.uuid(),
    employee: employeeRef,
    workDate: z.iso.date(),
    shiftCode: z.string().nullable(),
    scheduledStart: z.iso.datetime().nullable(),
    verification: z.enum(ALPHA_VERIFICATION_STATES),
    note: z.string().nullable(),
    verifiedAt: z.iso.datetime().nullable(),
    deadline: z.iso.date(),
    canVerify: z.boolean(),
  })
  .openapi("AlphaVerification");
assertExact<z.infer<typeof alphaVerificationSchema>, AlphaVerificationItem>(true);
