import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { attendanceLocationInputSchema } from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { ctxOf } from "./calendar.routes.ts";
import {
  locationSettingsUpdateSchema,
  locationSettingsViewSchema,
} from "./location-setting.contract.ts";
import * as service from "./location-setting.service.ts";
import { strict } from "./roster.routes.ts";

// TM-D1 — lokasi absen per karyawan (SA, HR PT). Body divalidasi skema @hris/shared di handler.
const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const responses = (description: string, schema: z.ZodType) => ({
  200: {
    description,
    content: { "application/json": { schema: dataEnvelope(schema) } },
  },
  ...errors(400, 401, 403, 404, 422, 500),
});

const listRoute = createRoute({
  method: "get",
  path: `${P}/attendance-locations`,
  tags: TAGS,
  summary: "Lokasi absen karyawan PT + site yang berlaku hari ini (SA, HR PT)",
  security,
  request: {
    query: z.object({ companyId: z.uuid(), q: z.string().max(100).optional() }),
  },
  responses: responses("Daftar lokasi absen karyawan", locationSettingsViewSchema),
});

const setRoute = createRoute({
  method: "put",
  path: `${P}/attendance-locations`,
  tags: TAGS,
  summary: "Atur lokasi absen banyak karyawan: bawaan / lokasi khusus / bebas lokasi (SA, HR PT)",
  security,
  request: {
    body: {
      content: { "application/json": { schema: attendanceLocationInputSchema } },
      required: true,
    },
  },
  responses: responses("Jumlah karyawan yang berubah", locationSettingsUpdateSchema),
});

export function registerLocationSettingRoutes(
  app: OpenAPIHono,
  protect: MiddlewareHandler[],
): void {
  app.openapi({ ...listRoute, middleware: protect }, (async (c: Context) =>
    c.json(
      ok(
        await service.listLocationSettings(
          ctxOf(c),
          c.req.query("companyId") as string,
          c.req.query("q"),
        ),
      ),
      200,
    )) as never);
  app.openapi({ ...setRoute, middleware: protect }, (async (c: Context) => {
    const input = strict(attendanceLocationInputSchema, await c.req.json().catch(() => ({})));
    return c.json(ok(await service.setLocationSettings(ctxOf(c), input)), 200);
  }) as never);
}
