import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { selfReportCrewInputSchema, selfReportPunchInputSchema } from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { dayViewSchema } from "./attendance.contract.ts";
import { ctxOf } from "./calendar.routes.ts";
import { strict } from "./roster.routes.ts";
import {
  selfReportCrewListSchema,
  selfReportCrewSchema,
  selfReportStatusSchema,
} from "./self-report.contract.ts";
import * as service from "./self-report.service.ts";

// ════════════════════════════════════════════════════════════════════════════════════════════
// TM-D29 — ABSEN MANDIRI (STAGING). Hapus file ini + baris registrasinya di attendance.routes.ts
// saat fitur dicabut (docs/features/time-management/tm-d29-absen-mandiri.md).
// ════════════════════════════════════════════════════════════════════════════════════════════
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));

const route = (
  method: "get" | "post" | "put",
  path: string,
  summary: string,
  spec: { response: z.ZodType; body?: z.ZodType; query?: z.ZodObject },
) =>
  createRoute({
    method,
    path: `${API_BASE_PATH}${path}`,
    tags: TAGS,
    summary: `${summary} [TM-D29 staging]`,
    security,
    request: {
      ...(spec.query ? { query: spec.query } : {}),
      ...(spec.body
        ? { body: { content: { "application/json": { schema: spec.body } }, required: true } }
        : {}),
    },
    responses: {
      200: {
        description: summary,
        content: { "application/json": { schema: dataEnvelope(spec.response) } },
      },
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  });

type Handler = (c: Context) => Promise<unknown>;
const body = (c: Context) => c.req.json().catch(() => ({}));

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route("get", "/attendance/self-report/me", "Status absen mandiri saya (tombol di HP)", {
      response: selfReportStatusSchema,
    }),
    (c) => service.myStatus(ctxOf(c)),
  ],
  [
    route(
      "post",
      "/attendance/self-report",
      "Absen mandiri: isi jam masuk/pulang sendiri + foto galeri + GPS (tetap butuh persetujuan)",
      { body: selfReportPunchInputSchema, response: dayViewSchema },
    ),
    async (c) => service.selfPunch(ctxOf(c), strict(selfReportPunchInputSchema, await body(c))),
  ],
  [
    route("get", "/attendance/self-report/crews", "Crew PT & izin absen mandiri (SA, HR PT)", {
      query: z.object({ companyId: z.uuid() }),
      response: selfReportCrewListSchema,
    }),
    (c) => service.listCrews(ctxOf(c), c.req.query("companyId") as string),
  ],
  [
    route(
      "put",
      "/attendance/self-report/crews",
      "Izinkan / cabut absen mandiri crew (SA, HR PT)",
      {
        body: selfReportCrewInputSchema,
        response: selfReportCrewSchema,
      },
    ),
    async (c) => service.setCrew(ctxOf(c), strict(selfReportCrewInputSchema, await body(c))),
  ],
];

export function registerSelfReportRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  for (const [definition, handler] of ROUTES) {
    app.openapi({ ...definition, middleware: protect }, (async (c: Context) =>
      c.json(ok(await handler(c)), 200)) as never);
  }
}
