import { EXPIRY_BUCKETS, WARNING_LEVELS } from "@hris/shared";
import { z } from "zod";

// ARS-D16/D17: subset respons API laporan yang dipakai web (PROMPT §7).

const person = {
  employeeId: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  company: z.string(),
  unit: z.string().nullable(),
  position: z.string().nullable(),
};
const breakdown = z.object({
  key: z.string(),
  label: z.string(),
  active: z.number(),
  joined: z.number(),
  left: z.number(),
});
const month = z.object({
  month: z.number(),
  startActive: z.number(),
  endActive: z.number(),
  joined: z.number(),
  left: z.number(),
  turnover: z.number(),
});

export const headcountSchema = z.object({
  year: z.number(),
  asOf: z.string(),
  months: z.array(month),
  summary: z.object({
    startActive: z.number(),
    endActive: z.number(),
    joined: z.number(),
    left: z.number(),
    turnover: z.number(),
  }),
  byCompany: z.array(breakdown),
  byUnit: z.array(breakdown),
  byStatus: z.array(breakdown),
  exitReasons: z.array(z.object({ key: z.string(), label: z.string(), count: z.number() })),
  leavers: z.array(z.object({ ...person, endDate: z.string(), exitReason: z.string().nullable() })),
  joiners: z.array(z.object({ ...person, joinDate: z.string() })),
});
export type HeadcountReport = z.infer<typeof headcountSchema>;

const bucket = z.enum(EXPIRY_BUCKETS);
export const documentExpirySchema = z.object({
  asOf: z.string(),
  counts: z.record(bucket, z.number()),
  byType: z.array(
    z.object({
      documentType: z.string(),
      EXPIRED: z.number(),
      D30: z.number(),
      D60: z.number(),
      D90: z.number(),
      total: z.number(),
    }),
  ),
  hiddenSensitive: z.number(),
  rows: z.array(z.object({ ...person, documentType: z.string(), expiresAt: z.string(), bucket })),
});
export type DocumentExpiryReport = z.infer<typeof documentExpirySchema>;

export const completenessSchema = z.object({
  total: z.number(),
  complete: z.number(),
  percent: z.number(),
  siteTypesSkipped: z.array(z.string()),
  byItem: z.array(z.object({ key: z.string(), label: z.string(), missing: z.number() })),
  byCompany: z.array(
    z.object({ label: z.string(), total: z.number(), complete: z.number(), percent: z.number() }),
  ),
  rows: z.array(
    z.object({ ...person, missing: z.array(z.string()), missingKeys: z.array(z.string()) }),
  ),
});
export type CompletenessReport = z.infer<typeof completenessSchema>;

const level = z.enum(WARNING_LEVELS);
const perLevel = { SP1: z.number(), SP2: z.number(), SP3: z.number() };
export const warningLettersSchema = z.object({
  year: z.number(),
  asOf: z.string(),
  activeTotal: z.number(),
  activeByLevel: z.object(perLevel),
  unconfirmed: z.number(),
  byViolation: z.array(z.object({ label: z.string(), count: z.number() })),
  byCompany: z.array(z.object({ label: z.string(), ...perLevel, total: z.number() })),
  issuedByMonth: z.array(z.object({ month: z.number(), ...perLevel })),
  canList: z.boolean(),
  rows: z.array(
    z.object({
      ...person,
      letterId: z.string(),
      level,
      number: z.string().nullable(),
      violation: z.string(),
      issuedAt: z.string(),
      effectiveUntil: z.string(),
      confirmed: z.boolean(),
    }),
  ),
});
export type WarningLettersReport = z.infer<typeof warningLettersSchema>;
