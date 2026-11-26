import { CONTRACT_KINDS, CONTRACT_STATUSES, employmentCategorySchema } from "@hris/shared";
import { z } from "zod";

// Subset respons OpenAPI contract.contract.ts; metadata audit tidak digunakan di web.
export const employmentContractSchema = z.object({
  id: z.string(),
  kind: z.enum(CONTRACT_KINDS),
  sequence: z.number().int().nullable(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  previousContractId: z.string().nullable(),
  pkwtFirstStartDate: z.iso.date().nullable(),
  status: z.enum(CONTRACT_STATUSES),
  note: z.string().nullable(),
});
const tenureSchema = z.object({ years: z.number(), months: z.number(), days: z.number() });
const thlMonthSchema = z.object({
  month: z.string(),
  presentDays: z.number(),
  pendingDays: z.number(),
});
export const thlSchema = z.object({
  evaluation: z.object({
    status: z.enum(["NONE", "APPROACHING", "REQUIRED"]),
    label: z.string(),
    months: z.array(thlMonthSchema.extend({ qualifies: z.boolean() })),
    currentMonth: thlMonthSchema,
  }),
  dailyWage: z.object({ amount: z.number(), effectiveFrom: z.iso.date() }).nullable(),
  wageHistory: z
    .array(
      z.object({
        id: z.string(),
        amount: z.number(),
        effectiveFrom: z.iso.date(),
        note: z.string(),
      }),
    )
    .optional(),
  access: z.object({ wage: z.boolean() }),
});
export type ThlDetails = z.infer<typeof thlSchema>;
export const employeeContractsSchema = z.object({
  contracts: z.array(employmentContractSchema),
  thl: thlSchema.nullable().optional(),
  tier: z.enum(["PKWT", "PKWTT", "THL"]).nullable(),
  category: employmentCategorySchema.nullable(),
  joinDate: z.iso.date(),
  pkwttStartDate: z.iso.date().nullable(),
  companyTenure: tenureSchema,
  pkwttTenure: tenureSchema.nullable(),
  access: z.object({ manage: z.boolean(), missingGrant: z.boolean() }),
});
export const contractActionResultSchema = z.object({
  contract: employmentContractSchema.nullable(),
  warnings: z.array(z.string()),
});
export type EmploymentContract = z.infer<typeof employmentContractSchema>;
export type EmployeeContracts = z.infer<typeof employeeContractsSchema>;
