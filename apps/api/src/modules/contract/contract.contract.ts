import { z } from "@hono/zod-openapi";
import {
  CONTRACT_KINDS,
  CONTRACT_STATUSES,
  correctContractInputSchema,
  createContractInputSchema,
  employmentCategorySchema,
  endContractInputSchema,
  extendContractInputSchema,
  promoteEmployeeInputSchema,
} from "@hris/shared";
import { assertExact, nullableRef } from "../../core/contract.ts";
import type * as service from "./contract.service.ts";

// Shared schemas may be initialized before zod-openapi patches Zod (full test suite import order).
// Rebuild the object after extension, as in the existing attendance contracts.
export const createContractBodySchema = createContractInputSchema
  .extend({})
  .openapi("CreateEmploymentContract");
export const correctContractBodySchema = correctContractInputSchema
  .extend({})
  .openapi("CorrectEmploymentContract");
export const extendContractBodySchema = extendContractInputSchema
  .extend({})
  .openapi("ExtendEmploymentContract");
export const promoteEmployeeBodySchema = promoteEmployeeInputSchema
  .extend({})
  .openapi("PromoteEmployee");
export const endContractBodySchema = endContractInputSchema
  .extend({})
  .openapi("EndEmploymentContract");
export const employmentContractSchema = z
  .object({
    id: z.uuid(),
    employeeId: z.uuid(),
    companyId: z.uuid(),
    kind: z.enum(CONTRACT_KINDS),
    sequence: z.number().int().nullable(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    previousContractId: z.uuid().nullable(),
    pkwtFirstStartDate: z.iso.date().nullable(),
    status: z.enum(CONTRACT_STATUSES),
    closedAt: z.iso.datetime().nullable(),
    closeReason: z.string().nullable(),
    note: z.string().nullable(),
    createdBy: z.uuid().nullable(),
    updatedBy: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("EmploymentContract");
assertExact<z.infer<typeof employmentContractSchema>, ReturnType<typeof service.contractDto>>(true);
const tenureSchema = z
  .object({ years: z.number().int(), months: z.number().int(), days: z.number().int() })
  .openapi("EmploymentTenure");
export const contractSummarySchema = z
  .object({
    contractId: z.uuid(),
    stage: z.string(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    remainingDays: z.number().int(),
    color: z.enum(["ok", "warn", "danger", "expired"]),
    stageTenure: tenureSchema,
    totalPkwt: z
      .object({
        firstStartDate: z.iso.date(),
        days: z.number().int(),
        maxDays: z.number().int(),
        percent: z.number(),
      })
      .nullable(),
  })
  .openapi("EmploymentContractSummary");
export const employeeContractsSchema = z
  .object({
    contracts: z.array(employmentContractSchema),
    summary: nullableRef(contractSummarySchema),
    tier: z.enum(["PKWT", "PKWTT", "THL"]).nullable(),
    category: employmentCategorySchema.nullable(),
    joinDate: z.iso.date(),
    pkwttStartDate: z.iso.date().nullable(),
    companyTenure: tenureSchema,
    pkwttTenure: nullableRef(tenureSchema),
    access: z
      .object({ manage: z.boolean(), missingGrant: z.boolean() })
      .openapi("EmploymentContractAccess"),
  })
  .openapi("EmployeeContracts");
assertExact<
  z.infer<typeof employeeContractsSchema>,
  Awaited<ReturnType<typeof service.readEmployeeContracts>>
>(true);
export const contractActionResultSchema = z
  .object({ contract: nullableRef(employmentContractSchema), warnings: z.array(z.string()) })
  .openapi("EmploymentContractActionResult");
assertExact<z.infer<typeof contractActionResultSchema>, service.ContractActionResult>(true);
