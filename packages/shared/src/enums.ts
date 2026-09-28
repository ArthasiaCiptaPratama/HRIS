import { z } from "zod";

// PLAN §5.2 & CODEMAP §6.5
export const approvalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalModeSchema = z.enum(["PARALLEL", "SINGLE"]);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;

export const approvalSubjectTypeSchema = z.enum([
  "LEAVE",
  "PERMIT",
  "ATTENDANCE_CORRECTION",
  "OVERTIME",
]);
export type ApprovalSubjectType = z.infer<typeof approvalSubjectTypeSchema>;

export const approvalStepKindSchema = z.enum(["MANAGER", "HR"]);
export type ApprovalStepKind = z.infer<typeof approvalStepKindSchema>;

// CODEMAP §6.7
export const leaveKindSchema = z.enum(["ANNUAL", "PERMIT"]);
export type LeaveKind = z.infer<typeof leaveKindSchema>;

// CODEMAP §6.6
export const attendancePeriodStatusSchema = z.enum(["OPEN", "CLOSED"]);
export type AttendancePeriodStatus = z.infer<typeof attendancePeriodStatusSchema>;

// CODEMAP §6.9
export const payrollPeriodStatusSchema = z.enum(["DRAFT", "CALCULATED", "LOCKED", "PUBLISHED"]);
export type PayrollPeriodStatus = z.infer<typeof payrollPeriodStatusSchema>;
