import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  breakLocationsInputSchema,
  gradeWageInputSchema,
  rosterMonthSchema,
  rosterTemplateInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { ctxOf } from "./calendar.routes.ts";
import * as service from "./overtime.service.ts";
import { strict } from "./roster.routes.ts";
import { applyRosterTemplate } from "./roster-template.service.ts";

// TM-D6 lembur & upah grade, TM-D7 lokasi wajib istirahat, TM-D8 template roster.
// Keputusan lembur memakai endpoint approval umum (/approvals/{id}/decision).
const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const anyBody = {
  body: {
    content: { "application/json": { schema: z.record(z.string(), z.unknown()) } },
    required: true,
  },
};
const isoDate = z.iso.date();

const route = (
  method: "get" | "put" | "post",
  path: string,
  summary: string,
  request: Record<string, unknown> = {},
) =>
  createRoute({
    method,
    path: `${P}${path}`,
    tags: TAGS,
    summary,
    security,
    request,
    responses: {
      200: {
        description: summary,
        content: { "application/json": { schema: dataEnvelope(z.unknown()) } },
      },
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  });

type Handler = (c: Context) => Promise<unknown>;
const body = (c: Context) => c.req.json().catch(() => ({}));

const listQuery = z.object({
  scope: z.enum(["inbox", "all", "me"]),
  from: isoDate,
  to: isoDate,
  companyId: z.uuid().optional(),
});

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route("get", "/overtime", "Usulan lembur: inbox / cakupan / milik saya (TM-D6)", {
      query: listQuery,
    }),
    (c) => {
      const q = strict(listQuery, c.req.query());
      return service.listOvertime(ctxOf(c), q);
    },
  ],
  [
    route("get", "/overtime/summary", "Rekap lembur bulanan per karyawan (TM-D6)", {
      query: z.object({ month: rosterMonthSchema, companyId: z.uuid().optional() }),
    }),
    (c) =>
      service.overtimeSummary(
        ctxOf(c),
        strict(rosterMonthSchema, c.req.query("month")),
        c.req.query("companyId") || undefined,
      ),
  ],
  [
    route("get", "/grade-wages", "Upah per grade (SA, HR ber-grant labor.cost.read)"),
    (c) => service.listGradeWages(ctxOf(c)),
  ],
  [
    route("put", "/grade-wages/{gradeId}", "Atur upah grade (SA)", {
      params: z.object({ gradeId: z.uuid() }),
      ...anyBody,
    }),
    async (c) =>
      service.setGradeWage(
        ctxOf(c),
        c.req.param("gradeId") as string,
        strict(gradeWageInputSchema, await body(c)),
      ),
  ],
  [
    route("get", "/break-locations", "Lokasi kerja wajib absen istirahat (SA, HR)"),
    (c) => service.getBreakLocations(ctxOf(c)),
  ],
  [
    route("put", "/break-locations", "Atur lokasi wajib absen istirahat (SA, HR)", anyBody),
    async (c) =>
      service.setBreakLocations(ctxOf(c), strict(breakLocationsInputSchema, await body(c))),
  ],
  [
    route("post", "/roster/templates", "Pasang template roster (JT) (SA, HR PT)", anyBody),
    async (c) => applyRosterTemplate(ctxOf(c), strict(rosterTemplateInputSchema, await body(c))),
  ],
];

export function registerOvertimeRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  service.registerOvertimeIntegrations();
  for (const [definition, handler] of ROUTES) {
    app.openapi({ ...definition, middleware: protect }, (async (c: Context) =>
      c.json(ok(await handler(c)), 200)) as never);
  }
}
