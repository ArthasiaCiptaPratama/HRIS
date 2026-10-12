import { z } from "zod";

// Subset respons API Time Management (apps/api/src/modules/attendance & approval). Sumber kebenaran
// tetap API; skema di sini hanya memastikan bentuk yang dipakai layar.

const person = z.object({
  id: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});

export const approvalStepSchema = z.object({
  kind: z.enum(["MANAGER", "HR"]),
  decision: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  decidedAt: z.string().nullable(),
  note: z.string().nullable(),
  isOverride: z.boolean(),
  myRight: z.enum(["regular", "override"]).nullable(),
});

export const approvalSchema = z.object({
  id: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  steps: z.array(approvalStepSchema),
  canDecide: z.boolean(),
  canOverride: z.boolean(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const shiftSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  code: z.string(),
  name: z.string(),
  startMinute: z.number(),
  endMinute: z.number(),
  crossesMidnight: z.boolean(),
  checkInOpenMin: z.number(),
  lateToleranceMin: z.number(),
  earlyLeaveToleranceMin: z.number(),
  checkOutCloseMin: z.number(),
  color: z.string().nullable(),
  archived: z.boolean(),
});
export type Shift = z.infer<typeof shiftSchema>;

export const punchSchema = z.object({
  id: z.string(),
  kind: z.enum(["IN", "OUT"]),
  at: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  accuracyM: z.number().nullable(),
  altitudeM: z.number().nullable().optional(),
  distanceM: z.number().nullable(),
  insideGeofence: z.boolean(),
  labels: z.array(z.string()),
  reason: z.string().nullable(),
  selfieUrl: z.string().nullable(),
  selfiePurged: z.boolean(),
  // D-072: persetujuan per absen.
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  source: z.enum(["DEVICE", "MANUAL"]),
  approval: approvalSchema.nullable(),
  canCancel: z.boolean(),
});
export type Punch = z.infer<typeof punchSchema>;

export const daySchema = z.object({
  id: z.string(),
  employee: person,
  workDate: z.string(),
  shiftCode: z.string().nullable(),
  scheduledStart: z.string().nullable(),
  scheduledEnd: z.string().nullable(),
  workLocation: z.object({ id: z.string(), name: z.string() }).nullable(),
  status: z.string(),
  labels: z.array(z.string()),
  punches: z.array(punchSchema),
  approval: approvalSchema.nullable(),
});
export type AttendanceDay = z.infer<typeof daySchema>;

export const todaySchema = z.object({
  serverTime: z.string(),
  timezone: z.string(),
  gpsAccuracyMaxM: z.number(),
  employee: person,
  roster: z.array(z.object({ date: z.string(), code: z.string(), shift: shiftSchema.nullable() })),
  location: z
    .object({
      id: z.string(),
      name: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      radiusM: z.number().nullable(),
    })
    .nullable(),
  openDay: daySchema.nullable(),
  recent: z.array(daySchema),
  next: z.enum(["IN", "OUT"]),
});
export type Today = z.infer<typeof todaySchema>;

export const precheckSchema = z.object({
  kind: z.enum(["IN", "OUT"]),
  workDate: z.string(),
  shiftCode: z.string().nullable(),
  labels: z.array(z.string()),
  distanceM: z.number().nullable(),
  insideGeofence: z.boolean(),
  location: z.object({ id: z.string(), name: z.string() }).nullable(),
  reasonRequired: z.boolean(),
  alreadyCheckedIn: z.boolean(),
  suspicion: z.enum(["OUT_BEFORE_END", "IN_AFTER_END", "IN_WHILE_OPEN"]).nullable(),
  scheduledStart: z.string().nullable(),
  scheduledEnd: z.string().nullable(),
  minutesFromEnd: z.number().nullable(),
  openDay: z.object({ workDate: z.string(), checkInAt: z.string().nullable() }).nullable(),
});
export type Precheck = z.infer<typeof precheckSchema>;

export const selfieUploadSchema = z.object({
  bucket: z.string(),
  path: z.string(),
  token: z.string(),
  signedUrl: z.string(),
  maxBytes: z.number(),
});

export const patternSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  steps: z.array(z.string()),
  cycleLength: z.number(),
  workDays: z.number(),
  crewCount: z.number(),
});
export type Pattern = z.infer<typeof patternSchema>;

export const crewSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  workLocation: z.object({ id: z.string(), name: z.string() }).nullable(),
  name: z.string(),
  pattern: z.object({ id: z.string(), name: z.string(), steps: z.array(z.string()) }),
  cycleStartDate: z.string(),
  members: z.array(
    z.object({
      employeeId: z.string(),
      fullName: z.string(),
      employeeNumber: z.string().nullable(),
      startDate: z.string(),
    }),
  ),
});
export type Crew = z.infer<typeof crewSchema>;

export const rosterGridSchema = z.object({
  month: z.string(),
  companyId: z.string(),
  dates: z.array(z.string()),
  holidays: z.array(z.object({ date: z.string(), name: z.string(), kind: z.string() })),
  shifts: z.array(shiftSchema),
  employees: z.array(person.extend({ crew: z.string().nullable() })),
  days: z.array(
    z.object({ employeeId: z.string(), date: z.string(), code: z.string(), source: z.string() }),
  ),
  canEdit: z.boolean(),
});
export type RosterGrid = z.infer<typeof rosterGridSchema>;

export const cellIssueSchema = z.object({
  index: z.number(),
  employeeId: z.string().optional(),
  employeeNumber: z.string().optional(),
  date: z.string(),
  message: z.string(),
});
export type CellIssue = z.infer<typeof cellIssueSchema>;

export const importPreviewSchema = z.object({
  total: z.number(),
  valid: z.number(),
  issues: z.array(cellIssueSchema),
});

export const rosterChangeSchema = z.object({
  id: z.string(),
  employee: person,
  peer: person.nullable(),
  date: z.string(),
  fromCode: z.string(),
  toCode: z.string(),
  reason: z.string(),
  status: z.string(),
  createdAt: z.string(),
  approval: approvalSchema.nullable(),
  awaitingMyConsent: z.boolean(),
  canCancel: z.boolean(),
});
export type RosterChange = z.infer<typeof rosterChangeSchema>;

export const holidaySchema = z.object({
  id: z.string(),
  date: z.string(),
  name: z.string(),
  kind: z.enum(["NATIONAL", "COLLECTIVE_LEAVE"]),
});
export type Holiday = z.infer<typeof holidaySchema>;

export const bulkResultSchema = z.array(
  z.object({ requestId: z.string(), status: z.string().optional(), error: z.string().optional() }),
);
