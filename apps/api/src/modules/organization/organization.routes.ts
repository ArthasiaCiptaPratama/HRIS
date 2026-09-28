import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import {
  departmentSchema,
  employmentStatusSchema,
  gradeSchema,
  positionSchema,
  workLocationSchema,
} from "./organization.schema.ts";
import * as service from "./organization.service.ts";

export interface OrganizationRouteDeps {
  protect: MiddlewareHandler[];
}

const masterDataSchema = z
  .object({
    departments: z.array(departmentSchema),
    positions: z.array(positionSchema),
    employmentStatuses: z.array(employmentStatusSchema),
    grades: z.array(gradeSchema),
    workLocations: z.array(workLocationSchema),
  })
  .openapi("MasterData");

// Satu request untuk semua pilihan form & filter (tabel kecil) supaya web cukup satu cache.
const masterDataRoute = createRoute({
  method: "get",
  path: `${API_BASE_PATH}/master-data`,
  tags: ["Organization"],
  summary:
    "Master data organisasi yang aktif: departemen, jabatan, status, grade, lokasi (semua role)",
  security: [{ [BEARER_SCHEME]: [] }],
  responses: {
    200: {
      description: "Master data",
      content: { "application/json": { schema: dataEnvelope(masterDataSchema) } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

export function registerOrganizationRoutes(app: OpenAPIHono, deps: OrganizationRouteDeps): void {
  app.openapi({ ...masterDataRoute, middleware: deps.protect }, async (c) =>
    c.json(ok(await service.listMasterData(c.get("actor"))), 200),
  );
}
