import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  correctionInputSchema,
  periodCloseInputSchema,
  statementInputSchema,
  statementUploadSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import * as alpha from "./alpha.service.ts";
import { ctxOf } from "./calendar.routes.ts";
import {
  attendanceRecordSchema,
  correctionSchema,
  monthlyRecapSchema,
  periodCloseResultSchema,
  periodPreviewSchema,
  statementRowSchema,
  statementUploadResultSchema,
} from "./period.contract.ts";
import * as service from "./period.service.ts";
import { strict } from "./roster.routes.ts";

// Tahap F — rekap bulanan, tutup periode → ALPHA, surat pernyataan, koreksi absensi (D-071).
const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const idParam = z.object({ id: z.uuid() });
const monthQuery = z.object({
  companyId: z.uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
/** MOB-D7 #1: body & respons bertipe di OpenAPI (codegen app mobile). Validasi body tetap `strict`. */
const route = (
  method: "get" | "post",
  path: string,
  summary: string,
  spec: {
    response: z.ZodType;
    body?: z.ZodType;
    params?: z.ZodObject;
    query?: z.ZodObject;
  },
) =>
  createRoute({
    method,
    path: `${P}${path}`,
    tags: TAGS,
    summary,
    security,
    request: {
      ...(spec.params ? { params: spec.params } : {}),
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
const q = (c: Context, key: string) => c.req.query(key) as string;

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route(
      "get",
      "/attendance/recap",
      "Rekap absensi bulanan per karyawan (SA/HR PT, MANAGER tim)",
      { query: monthQuery, response: monthlyRecapSchema },
    ),
    (c) => service.monthlyRecap(ctxOf(c), q(c, "companyId"), q(c, "month")),
  ],
  [
    route(
      "post",
      "/attendance/periods/preview",
      "Pratinjau tutup periode (hari yang menjadi ALPHA)",
      { body: periodCloseInputSchema, response: periodPreviewSchema },
    ),
    async (c) => service.previewClose(ctxOf(c), strict(periodCloseInputSchema, await body(c))),
  ],
  [
    route(
      "post",
      "/attendance/periods/close",
      "Tutup periode: hari belum disetujui/tanpa absen → ALPHA",
      { body: periodCloseInputSchema, response: periodCloseResultSchema },
    ),
    async (c) => service.closePeriod(ctxOf(c), strict(periodCloseInputSchema, await body(c))),
  ],
  [
    route("get", "/attendance/record/me", "Rekam jejak Alpha & koreksi saya (TM-D3)", {
      response: attendanceRecordSchema,
    }),
    (c) => alpha.myAttendanceRecord(ctxOf(c)),
  ],
  [
    route(
      "get",
      "/attendance/record/employees/{id}",
      "Rekam jejak Alpha & koreksi karyawan (TM-D3)",
      { params: idParam, response: attendanceRecordSchema },
    ),
    (c) => alpha.employeeAttendanceRecord(ctxOf(c), c.req.param("id") as string),
  ],
  [
    route("get", "/attendance/statements/me", "Hari ALPHA saya & surat pernyataannya", {
      response: z.array(statementRowSchema),
    }),
    (c) => service.myStatements(ctxOf(c)),
  ],
  [
    route("get", "/attendance/statements", "Daftar ALPHA & surat pernyataan per PT/bulan", {
      query: monthQuery,
      response: z.array(statementRowSchema),
    }),
    (c) => service.listStatements(ctxOf(c), q(c, "companyId"), q(c, "month")),
  ],
  [
    route("post", "/attendance/statements/upload", "URL unggah lampiran surat pernyataan", {
      body: statementUploadSchema,
      response: statementUploadResultSchema,
    }),
    async (c) =>
      service.createStatementUpload(
        ctxOf(c),
        strict(statementUploadSchema, await body(c)).contentType,
      ),
  ],
  [
    route("post", "/attendance/statements", "Buat surat pernyataan absensi untuk hari ALPHA", {
      body: statementInputSchema,
      response: statementRowSchema,
    }),
    async (c) => service.createStatement(ctxOf(c), strict(statementInputSchema, await body(c))),
  ],
  [
    route("get", "/attendance/corrections", "Koreksi absensi: milik saya / inbox keputusan", {
      query: z.object({ scope: z.enum(["mine", "inbox"]).optional() }),
      response: z.array(correctionSchema),
    }),
    (c) => service.listCorrections(ctxOf(c), c.req.query("scope") === "inbox" ? "inbox" : "mine"),
  ],
  [
    route("post", "/attendance/corrections", "Ajukan koreksi absensi (paralel Atasan + HR)", {
      body: correctionInputSchema,
      response: correctionSchema,
    }),
    async (c) => service.createCorrection(ctxOf(c), strict(correctionInputSchema, await body(c))),
  ],
  [
    route("post", "/attendance/corrections/{id}/cancel", "Batalkan koreksi yang menunggu", {
      params: idParam,
      response: correctionSchema,
    }),
    (c) => service.cancelCorrection(ctxOf(c), c.req.param("id") as string),
  ],
];

export function registerPeriodRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  for (const [definition, handler] of ROUTES) {
    app.openapi({ ...definition, middleware: protect }, (async (c: Context) =>
      c.json(ok(await handler(c)), 200)) as never);
  }
}
