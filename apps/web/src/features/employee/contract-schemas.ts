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
export const employeeContractsSchema = z.object({
  contracts: z.array(employmentContractSchema),
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
