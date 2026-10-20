import {
  ASSET_STATUSES,
  DATA_CHANGE_STATUSES,
  EXPIRY_BUCKETS,
  MOVEMENT_KINDS,
  TENURE_BUCKETS,
  WARNING_LEVELS,
} from "@hris/shared";
import { z } from "zod";

// ARS-D16/D17 (batch 1) & ARS-D21 (batch 2): subset respons API laporan yang dipakai web (PROMPT §7).

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

// --- Batch 2 (ARS-D21) ---

const counts = <K extends string>(keys: readonly K[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.number()])) as Record<K, z.ZodNumber>);
const slice = z.object({ key: z.string(), label: z.string(), count: z.number() });

const tenureRow = z
  .object({ label: z.string(), total: z.number() })
  .extend(counts(TENURE_BUCKETS).shape);
export const tenureSchema = z.object({
  asOf: z.string(),
  year: z.number(),
  month: z.number(),
  total: z.number(),
  averageYears: z.number(),
  buckets: z.array(slice),
  byCompany: z.array(tenureRow),
  byUnit: z.array(tenureRow),
  jubilees: z.array(z.object({ ...person, joinDate: z.string(), years: z.number() })),
});
export type TenureReport = z.infer<typeof tenureSchema>;

export const demographicsSchema = z.object({
  asOf: z.string(),
  total: z.number(),
  age: z.array(slice),
  gender: z.array(slice),
  education: z.array(slice),
  originCity: z.array(z.object({ label: z.string(), count: z.number() })),
  cityCount: z.number(),
});
export type DemographicsReport = z.infer<typeof demographicsSchema>;

const movementKind = z.enum(MOVEMENT_KINDS);
export const movementsSchema = z.object({
  year: z.number(),
  asOf: z.string(),
  total: z.number(),
  counts: counts(MOVEMENT_KINDS),
  byMonth: z.array(z.object({ month: z.number() }).extend(counts(MOVEMENT_KINDS).shape)),
  rows: z.array(
    z.object({
      ...person,
      historyId: z.string(),
      effectiveDate: z.string(),
      kind: movementKind,
      fromPosition: z.string().nullable(),
      toPosition: z.string().nullable(),
      fromLevel: z.string().nullable(),
      toLevel: z.string().nullable(),
      fromUnit: z.string().nullable(),
      toUnit: z.string().nullable(),
      fromCompany: z.string().nullable(),
      toCompany: z.string().nullable(),
    }),
  ),
});
export type MovementsReport = z.infer<typeof movementsSchema>;

export const birthdaysSchema = z.object({
  asOf: z.string(),
  year: z.number(),
  month: z.number(),
  total: z.number(),
  rows: z.array(z.object({ ...person, day: z.number() })),
});
export type BirthdaysReport = z.infer<typeof birthdaysSchema>;

const assetRow = z
  .object({ label: z.string(), total: z.number() })
  .extend(counts(ASSET_STATUSES).shape);
export const assetsSchema = z.object({
  asOf: z.string(),
  total: z.number(),
  counts: counts(ASSET_STATUSES),
  overdueLoans: z.number(),
  byCategory: z.array(assetRow),
  byLocation: z.array(assetRow),
  byCompany: z.array(assetRow),
  unreturned: z.array(
    z.object({
      ...person,
      endDate: z.string().nullable(),
      kind: z.enum(["Aset", "APD"]),
      item: z.string(),
      quantity: z.number(),
      since: z.string(),
    }),
  ),
});
export type AssetsReport = z.infer<typeof assetsSchema>;

const changeStatus = z.enum(DATA_CHANGE_STATUSES);
export const dataChangesSchema = z.object({
  year: z.number(),
  asOf: z.string(),
  total: z.number(),
  counts: counts(DATA_CHANGE_STATUSES),
  pendingNow: z.number(),
  oldestPendingDays: z.number().nullable(),
  averageDays: z.number().nullable(),
  bySection: z.array(
    z
      .object({
        key: z.string(),
        label: z.string(),
        total: z.number(),
        averageDays: z.number().nullable(),
      })
      .extend(counts(DATA_CHANGE_STATUSES).shape),
  ),
  byMonth: z.array(z.object({ month: z.number(), submitted: z.number(), decided: z.number() })),
  canList: z.boolean(),
  rows: z.array(
    z.object({
      ...person,
      requestId: z.string(),
      section: z.string(),
      status: changeStatus,
      submittedAt: z.string(),
      reviewedAt: z.string().nullable(),
      days: z.number().nullable(),
    }),
  ),
});
export type DataChangesReport = z.infer<typeof dataChangesSchema>;
