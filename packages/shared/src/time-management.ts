import { z } from "zod";

// Time Management (docs/features/time-management/design.md, D-067–D-072). File baru supaya enum lama di enums.ts
// (masih dipakai tim) tidak diubah; nama sengaja berbeda agar tidak bentrok di barrel index.ts.

// ── Approval (PLAN §5.2, D-068, D-069) ───────────────────────────────────────────
export const APPROVAL_SUBJECTS = [
  "LEAVE",
  "PERMIT",
  "ATTENDANCE_CORRECTION",
  "OVERTIME",
  "ATTENDANCE_DAY",
  "ROSTER_CHANGE",
  "ATTENDANCE_PUNCH",
] as const;
export const approvalSubjectSchema = z.enum(APPROVAL_SUBJECTS);
export type ApprovalSubject = z.infer<typeof approvalSubjectSchema>;
export const APPROVAL_SUBJECT_LABELS: Record<ApprovalSubject, string> = {
  LEAVE: "Cuti tahunan",
  PERMIT: "Izin / sakit",
  ATTENDANCE_CORRECTION: "Koreksi absensi",
  OVERTIME: "Lembur",
  ATTENDANCE_DAY: "Hari absen",
  ROSTER_CHANGE: "Perubahan roster",
  ATTENDANCE_PUNCH: "Absen masuk/pulang",
};

export const APPROVAL_STEP_DECISIONS = ["PENDING", "APPROVED", "REJECTED"] as const;
export const approvalStepDecisionSchema = z.enum(APPROVAL_STEP_DECISIONS);
export type ApprovalStepDecision = z.infer<typeof approvalStepDecisionSchema>;

export const APPROVAL_REQUEST_STATUS_LABELS = {
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
} as const;
export const APPROVAL_STEP_LABELS = { MANAGER: "Atasan", HR: "HR" } as const;

/** Keputusan dari web: setujui / tolak (tolak wajib alasan; override langkah atasan wajib alasan). */
export const approvalDecisionBodySchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    note: z.string().trim().max(500).optional(),
  })
  .refine((body) => body.decision === "APPROVED" || (body.note?.length ?? 0) > 0, {
    message: "Alasan wajib diisi saat menolak.",
    path: ["note"],
  });
export type ApprovalDecisionBody = z.infer<typeof approvalDecisionBodySchema>;

export const MAX_BULK_DECISIONS = 200;
export const bulkApprovalDecisionBodySchema = z
  .object({
    requestIds: z.array(z.uuid()).min(1).max(MAX_BULK_DECISIONS),
    decision: z.enum(["APPROVED", "REJECTED"]),
    note: z.string().trim().max(500).optional(),
  })
  .refine((body) => body.decision === "APPROVED" || (body.note?.length ?? 0) > 0, {
    message: "Alasan wajib diisi saat menolak.",
    path: ["note"],
  });
export type BulkApprovalDecisionBody = z.infer<typeof bulkApprovalDecisionBodySchema>;

// ── Kalender libur (D-072) ───────────────────────────────────────────────────────
export const HOLIDAY_KINDS = ["NATIONAL", "COLLECTIVE_LEAVE"] as const;
export const holidayKindSchema = z.enum(HOLIDAY_KINDS);
export type HolidayKind = z.infer<typeof holidayKindSchema>;
export const HOLIDAY_KIND_LABELS: Record<HolidayKind, string> = {
  NATIONAL: "Tanggal merah",
  COLLECTIVE_LEAVE: "Cuti bersama",
};

const isoDate = z.iso.date();
export const holidayInputSchema = z.object({
  date: isoDate,
  name: z.string().trim().min(2).max(120),
  kind: holidayKindSchema,
});
export type HolidayInput = z.infer<typeof holidayInputSchema>;

// ── Pengaturan Time Management ───────────────────────────────────────────────────
/** Satu kunci `attendance` di tabel time_settings; nilai bawaan dipakai bila belum diatur. */
/** Zona waktu jam shift (site Kalimantan Selatan = WITA). Logika harian lain tetap Asia/Jakarta (PROMPT §4). */
export const SHIFT_TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;
export const SHIFT_TIMEZONE_LABELS: Record<(typeof SHIFT_TIMEZONES)[number], string> = {
  "Asia/Jakarta": "WIB (UTC+7)",
  "Asia/Makassar": "WITA (UTC+8)",
  "Asia/Jayapura": "WIT (UTC+9)",
};

export const timeSettingsSchema = z.object({
  /** Zona waktu tempat jam shift berlaku. */
  timezone: z.enum(SHIFT_TIMEZONES),
  /** Akurasi GPS di atas ini (meter) → label LOW_ACCURACY (D-070). */
  gpsAccuracyMaxM: z.number().int().min(10).max(1000),
  /** Retensi file selfie (bulan) sebelum dihapus cron purge-selfies (D-013, D-067). */
  selfieRetentionMonths: z.number().int().min(1).max(36),
  /** Batas hari keputusan approval hari absen sebelum pengingat (OD-15, usulan H+2). */
  approvalDueDays: z.number().int().min(1).max(14),
  /** Lama roster dibangkitkan ke depan dari pola (hari). */
  rosterHorizonDays: z.number().int().min(14).max(370),
});
export type TimeSettings = z.infer<typeof timeSettingsSchema>;
export const DEFAULT_TIME_SETTINGS: TimeSettings = {
  timezone: "Asia/Makassar",
  gpsAccuracyMaxM: 100,
  selfieRetentionMonths: 12,
  approvalDueDays: 2,
  rosterHorizonDays: 92,
};

// ── Roster tambang (D-069) ───────────────────────────────────────────────────────
export const OFF_CODE = "OFF";
const shiftCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,10}$/, "Kode shift 1–10 huruf/angka")
  .refine((code) => code !== OFF_CODE, "OFF dipakai untuk hari libur roster");
const minuteOfDay = z.number().int().min(0).max(1439);
const minutes = (max: number) => z.number().int().min(0).max(max);

export const shiftInputSchema = z.object({
  companyId: z.uuid(),
  code: shiftCode,
  name: z.string().trim().min(1).max(80),
  startMinute: minuteOfDay,
  endMinute: minuteOfDay,
  checkInOpenMin: minutes(720),
  lateToleranceMin: minutes(240),
  earlyLeaveToleranceMin: minutes(240),
  checkOutCloseMin: minutes(720),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});
export type ShiftInput = z.infer<typeof shiftInputSchema>;

/** Kode langkah pola: kode shift atau OFF. */
export const rosterStepSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,10}$/);
export const rosterPatternInputSchema = z.object({
  companyId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  steps: z.array(rosterStepSchema).min(1).max(120),
});
export type RosterPatternInput = z.infer<typeof rosterPatternInputSchema>;

/** "10/4" → D×10 + OFF×4 (bantuan isi pola di UI). */
export function expandRosterShorthand(work: number, off: number, workCode = "D"): string[] {
  return [...Array(work).fill(workCode), ...Array(off).fill(OFF_CODE)];
}

export const crewInputSchema = z.object({
  companyId: z.uuid(),
  workLocationId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  patternId: z.uuid(),
  cycleStartDate: isoDate,
});
export type CrewInput = z.infer<typeof crewInputSchema>;

export const crewMembersInputSchema = z.object({
  /** Karyawan anggota crew mulai tanggal ini (anggota lain di crew yang tidak ada di daftar diakhiri). */
  employeeIds: z.array(z.uuid()).max(500),
  effectiveDate: isoDate,
});
export type CrewMembersInput = z.infer<typeof crewMembersInputSchema>;

export const ROSTER_SOURCES = ["PATTERN", "MANUAL", "IMPORT", "CHANGE"] as const;
export type RosterSource = (typeof ROSTER_SOURCES)[number];
export const ROSTER_SOURCE_LABELS: Record<RosterSource, string> = {
  PATTERN: "Pola",
  MANUAL: "Diubah manual",
  IMPORT: "Import",
  CHANGE: "Perubahan disetujui",
};

export const rosterMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format YYYY-MM");

/** Edit sel grid: code = kode shift atau OFF; null = hapus hari roster. */
export const rosterCellsInputSchema = z.object({
  companyId: z.uuid(),
  cells: z
    .array(z.object({ employeeId: z.uuid(), date: isoDate, code: rosterStepSchema.nullable() }))
    .min(1)
    .max(5000),
});
export type RosterCellsInput = z.infer<typeof rosterCellsInputSchema>;

/** Import roster (OD-13: format menyusul): baris hasil pemetaan di browser — NIP, tanggal, kode. */
export const rosterImportInputSchema = z.object({
  companyId: z.uuid(),
  rows: z
    .array(
      z.object({
        employeeNumber: z.string().trim().min(1).max(30),
        date: isoDate,
        code: rosterStepSchema,
      }),
    )
    .min(1)
    .max(20000),
});
export type RosterImportInput = z.infer<typeof rosterImportInputSchema>;

export const ROSTER_CHANGE_STATUSES = [
  "AWAITING_PEER",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type RosterChangeStatus = (typeof ROSTER_CHANGE_STATUSES)[number];
export const ROSTER_CHANGE_STATUS_LABELS: Record<RosterChangeStatus, string> = {
  AWAITING_PEER: "Menunggu rekan",
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

/** Ubah shift satu tanggal (toCode) ATAU tukar dengan rekan pada tanggal yang sama (peerEmployeeId). */
export const rosterChangeInputSchema = z
  .object({
    employeeId: z.uuid().optional(),
    date: isoDate,
    toCode: rosterStepSchema.optional(),
    peerEmployeeId: z.uuid().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((v) => (v.toCode !== undefined) !== (v.peerEmployeeId !== undefined), {
    message: "Isi salah satu: shift tujuan atau rekan yang ditukar.",
    path: ["toCode"],
  });
export type RosterChangeInput = z.infer<typeof rosterChangeInputSchema>;

// ── Absen PWA (D-067, D-070) ─────────────────────────────────────────────────────
export const ATTENDANCE_LABELS = [
  "OUTSIDE_ROSTER",
  "NO_ROSTER",
  "OUTSIDE_RADIUS",
  "LOW_ACCURACY",
  "OTHER_LOCATION",
  "LATE",
  "EARLY_LEAVE",
  "NO_CHECKOUT",
  "CORRECTED",
  "MANUAL",
] as const;
export type AttendanceLabel = (typeof ATTENDANCE_LABELS)[number];
export const ATTENDANCE_LABEL_TEXT: Record<AttendanceLabel, string> = {
  OUTSIDE_ROSTER: "Di luar jadwal roster",
  NO_ROSTER: "Tanpa roster",
  OUTSIDE_RADIUS: "Di luar radius lokasi",
  LOW_ACCURACY: "Akurasi GPS rendah",
  OTHER_LOCATION: "Di lokasi lain",
  LATE: "Telat",
  EARLY_LEAVE: "Pulang cepat",
  NO_CHECKOUT: "Tidak absen pulang",
  CORRECTED: "Dikoreksi",
  MANUAL: "Input manual HR",
};

export const ATTENDANCE_DAY_STATUSES = [
  "OPEN",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "ALPHA",
  "LEAVE",
] as const;
export type AttendanceDayStatus = (typeof ATTENDANCE_DAY_STATUSES)[number];
export const ATTENDANCE_DAY_STATUS_LABELS: Record<AttendanceDayStatus, string> = {
  OPEN: "Belum absen pulang",
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  ALPHA: "Alpha",
  LEAVE: "Cuti/izin/sakit",
};

export const PUNCH_KINDS = ["IN", "OUT"] as const;
export type PunchKind = (typeof PUNCH_KINDS)[number];

/** Selfie dikompres di browser (± 200 KB); batas server 1 MB. */
export const SELFIE_MAX_BYTES = 1024 * 1024;
export const SELFIE_CONTENT_TYPES = ["image/jpeg", "image/webp"] as const;

const coordinate = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};
export const punchLocationSchema = z.object({
  ...coordinate,
  accuracyM: z.number().min(0).max(100_000),
});
export const punchPrecheckSchema = punchLocationSchema.extend({ kind: z.enum(PUNCH_KINDS) });
export type PunchPrecheckInput = z.infer<typeof punchPrecheckSchema>;
export const selfieUploadInputSchema = z.object({ contentType: z.enum(SELFIE_CONTENT_TYPES) });
export const punchInputSchema = punchPrecheckSchema.extend({
  selfiePath: z.string().min(10).max(300),
  reason: z.string().trim().max(500).optional(),
  /** Ketinggian GPS (m dpl) bila perangkat menyediakan. */
  altitudeM: z.number().min(-500).max(9000).nullable().optional(),
  /** Karyawan sudah melihat peringatan "salah pencet?" (D-073) dan tetap melanjutkan. */
  confirmed: z.boolean().optional(),
});

/** D-073: peringatan kemungkinan salah memilih Clock In / Clock Out (dibandingkan jadwal pulang). */
export const PUNCH_SUSPICIONS = ["OUT_BEFORE_END", "IN_AFTER_END", "IN_WHILE_OPEN"] as const;
export type PunchSuspicion = (typeof PUNCH_SUSPICIONS)[number];

export const PUNCH_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type PunchStatus = (typeof PUNCH_STATUSES)[number];
/** Batas karyawan membatalkan absennya sendiri (salah pencet) selama belum diputuskan. */
export const PUNCH_CANCEL_WINDOW_MIN = 15;

/** D-073: autentikasi manual oleh HR/SA — masukkan/perbaiki jam absen masuk atau pulang. */
export const manualPunchInputSchema = z.object({
  employeeId: z.uuid(),
  workDate: isoDate,
  kind: z.enum(PUNCH_KINDS),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:mm"),
  reason: z.string().trim().min(5, "Tulis alasan minimal 5 karakter").max(500),
});
export type ManualPunchInput = z.infer<typeof manualPunchInputSchema>;
export type PunchInput = z.infer<typeof punchInputSchema>;

// ── Cuti, izin, sakit (D-072) ────────────────────────────────────────────────────
// Nama sengaja `LEAVE_CATEGORIES` (bukan leaveKind di enums.ts yang masih dipakai tim).
export const LEAVE_CATEGORIES = ["ANNUAL", "PERMIT", "SICK"] as const;
export const leaveCategorySchema = z.enum(LEAVE_CATEGORIES);
export type LeaveCategory = z.infer<typeof leaveCategorySchema>;
export const LEAVE_CATEGORY_LABELS: Record<LeaveCategory, string> = {
  ANNUAL: "Cuti tahunan",
  PERMIT: "Izin",
  SICK: "Sakit",
};

export const LEAVE_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];
export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

export const LEAVE_LEDGER_KINDS = [
  "GRANT",
  "HOLD",
  "RELEASE",
  "USE",
  "COLLECTIVE",
  "EXPIRE",
  "SETTLE",
  "ADJUST",
] as const;
export type LeaveLedgerKind = (typeof LEAVE_LEDGER_KINDS)[number];
export const LEAVE_LEDGER_KIND_LABELS: Record<LeaveLedgerKind, string> = {
  GRANT: "Jatah tahunan",
  HOLD: "Ditahan (pengajuan)",
  RELEASE: "Tahanan dilepas",
  USE: "Terpakai",
  COLLECTIVE: "Cuti bersama (tidak masuk)",
  EXPIRE: "Hangus 31 Maret",
  SETTLE: "Pelunasan hutang",
  ADJUST: "Penyesuaian",
};

/** Kuota penuh bawaan Master Cuti (§7.2). */
export const DEFAULT_ANNUAL_QUOTA = 12;
/** Sisa jatah tahun lalu berlaku sampai tanggal ini (MM-DD) tahun berikutnya. */
export const LEAVE_CARRY_UNTIL = "03-31";

export const leaveTypeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,20}$/, "Kode 2–20 huruf/angka/garis bawah"),
  name: z.string().trim().min(2).max(80),
  category: leaveCategorySchema,
  maxDaysPerRequest: z.number().int().min(1).max(365).nullable(),
  documentRequiredAfterDays: z.number().int().min(0).max(365).nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type LeaveTypeInput = z.infer<typeof leaveTypeInputSchema>;

export const leaveYearInputSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  quota: z.number().int().min(0).max(60),
  isActive: z.boolean(),
});
export type LeaveYearInput = z.infer<typeof leaveYearInputSchema>;

export const leaveRequestInputSchema = z
  .object({
    leaveTypeId: z.uuid(),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().trim().min(3).max(500),
    attachmentPath: z.string().min(10).max(300).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    path: ["endDate"],
  });
export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;

/** Pratinjau hari terhitung sebelum mengajukan. */
export const leavePreviewInputSchema = z
  .object({ leaveTypeId: z.uuid(), startDate: isoDate, endDate: isoDate })
  .refine((v) => v.endDate >= v.startDate, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    path: ["endDate"],
  });
export type LeavePreviewInput = z.infer<typeof leavePreviewInputSchema>;

export const LEAVE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAVE_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const leaveAttachmentUploadSchema = z.object({
  contentType: z.enum(LEAVE_ATTACHMENT_TYPES),
});

export const leaveAdjustInputSchema = z.object({
  employeeId: z.uuid(),
  year: z.number().int().min(2020).max(2100),
  days: z
    .number()
    .int()
    .min(-60)
    .max(60)
    .refine((d) => d !== 0, "Jumlah hari tidak boleh 0"),
  note: z.string().trim().min(3).max(300),
});
export type LeaveAdjustInput = z.infer<typeof leaveAdjustInputSchema>;

/** Import saldo awal: saldo tahun `year` dijadikan `balance` hari (selisih dicatat sebagai ADJUST). */
export const leaveBalanceImportSchema = z.object({
  companyId: z.uuid(),
  year: z.number().int().min(2020).max(2100),
  rows: z
    .array(
      z.object({
        employeeNumber: z.string().trim().min(1).max(30),
        balance: z.number().int().min(-60).max(120),
      }),
    )
    .min(1)
    .max(5000),
});
export type LeaveBalanceImportInput = z.infer<typeof leaveBalanceImportSchema>;

// ── Tutup periode, surat pernyataan, koreksi (D-071) ─────────────────────────────
export const periodCloseInputSchema = z.object({
  companyId: z.uuid(),
  month: rosterMonthSchema,
});
export type PeriodCloseInput = z.infer<typeof periodCloseInputSchema>;

export const STATEMENT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const STATEMENT_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const statementUploadSchema = z.object({ contentType: z.enum(STATEMENT_ATTACHMENT_TYPES) });
export const statementInputSchema = z.object({
  dayId: z.uuid(),
  reason: z.string().trim().min(10, "Tulis penjelasan minimal 10 karakter").max(1000),
  attachmentPath: z.string().min(10).max(300).optional(),
});
export type StatementInput = z.infer<typeof statementInputSchema>;

const hhmmTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:mm");
/** Koreksi: jam masuk/pulang (zona waktu jam shift) untuk tanggal kerja; pulang < masuk = keesokan hari. */
export const correctionInputSchema = z
  .object({
    workDate: isoDate,
    checkIn: hhmmTime.optional(),
    checkOut: hhmmTime.optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .refine((v) => v.checkIn !== undefined || v.checkOut !== undefined, {
    message: "Isi jam masuk dan/atau jam pulang.",
    path: ["checkIn"],
  });
export type CorrectionInput = z.infer<typeof correctionInputSchema>;

export const CORRECTION_STATUS_LABELS = {
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
} as const;
