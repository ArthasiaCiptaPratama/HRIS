import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  manualPunchInputSchema,
  punchInputSchema,
  punchPrecheckSchema,
  selfieUploadInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { APP_VERSION_HEADER } from "../../core/app-version.ts";
import { assertExact } from "../../core/contract.ts";
import { ValidationError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import {
  dayViewSchema,
  precheckResultSchema,
  punchCancelSchema,
  selfieUploadSchema,
  todayViewSchema,
} from "./attendance.contract.ts";
import * as service from "./attendance.service.ts";
import { ctxOf } from "./calendar.routes.ts";
import { strict } from "./roster.routes.ts";

// Tahap C/D — absen PWA (D-067, D-070) & Data Absen Harian (D-068).
const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const idParam = z.object({ id: z.uuid() });

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
    headers?: z.ZodObject;
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
      ...(spec.headers ? { headers: spec.headers } : {}),
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

assertExact<
  z.infer<typeof selfieUploadSchema>,
  Awaited<ReturnType<typeof service.createSelfieUpload>>
>(true);
assertExact<z.infer<typeof punchCancelSchema>, Awaited<ReturnType<typeof service.cancelOwnPunch>>>(
  true,
);

type Handler = (c: Context) => Promise<unknown>;

// MOB-D7: kunci idempotensi punch dari klien (UUID / string aman, 8–64 karakter).
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;
// Dideklarasikan di OpenAPI supaya klien generate punya parameternya; validasi tetap `idempotencyKeyOf`.
const punchHeaders = z.object({
  "Idempotency-Key": z
    .string()
    .regex(IDEMPOTENCY_KEY)
    .optional()
    .openapi({
      description:
        "Opsional, satu kunci per tindakan absen (MOB-D7 #5). Kunci sama → hari yang sudah tercatat (200); " +
        "kunci milik orang lain → 409.",
    }),
});
function idempotencyKeyOf(c: Context): string | undefined {
  const key = c.req.header("Idempotency-Key");
  if (key === undefined) return undefined;
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new ValidationError([
      { path: "Idempotency-Key", code: "invalid_format", message: "Expected 8-64 [A-Za-z0-9_-]" },
    ]);
  }
  return key;
}
const body = (c: Context) => c.req.json().catch(() => ({}));
const range = z.object({ from: z.iso.date(), to: z.iso.date() });

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route("get", "/attendance/me/today", "Status absen hari ini, roster 7 hari, lokasi acuan", {
      response: todayViewSchema,
    }),
    (c) => service.getToday(ctxOf(c)),
  ],
  [
    route(
      "post",
      "/attendance/precheck",
      "Pra-cek absen: tanggal kerja, label, jarak (alasan wajib bila ada label)",
      { body: punchPrecheckSchema, response: precheckResultSchema },
    ),
    async (c) => service.precheck(ctxOf(c), strict(punchPrecheckSchema, await body(c))),
  ],
  [
    route("post", "/attendance/selfie-upload", "URL unggah selfie (bucket private, ± 200 KB)", {
      body: selfieUploadInputSchema,
      response: selfieUploadSchema,
    }),
    async (c) =>
      service.createSelfieUpload(
        ctxOf(c),
        strict(selfieUploadInputSchema, await body(c)).contentType,
      ),
  ],
  [
    route(
      "post",
      "/attendance/punch",
      "Absen masuk/pulang/istirahat (waktu server, selfie + GPS). Header opsional: Idempotency-Key, X-App-Version",
      { body: punchInputSchema, headers: punchHeaders, response: dayViewSchema },
    ),
    async (c) =>
      service.punch(
        {
          ...ctxOf(c),
          userAgent: c.req.header("user-agent"),
          appVersion: c.req.header(APP_VERSION_HEADER),
          idempotencyKey: idempotencyKeyOf(c),
        },
        strict(punchInputSchema, await body(c)),
      ),
  ],
  [
    route(
      "post",
      "/attendance/punches/{id}/cancel",
      "Batalkan absen sendiri (salah pencet, <= 15 menit, belum diputuskan)",
      { params: idParam, response: punchCancelSchema },
    ),
    (c) => service.cancelOwnPunch(ctxOf(c), c.req.param("id") as string),
  ],
  [
    route(
      "post",
      "/attendance/manual",
      "Autentikasi manual HR/SA: masukkan/ganti jam absen masuk atau pulang (alasan wajib)",
      { body: manualPunchInputSchema, response: dayViewSchema },
    ),
    async (c) => service.manualPunch(ctxOf(c), strict(manualPunchInputSchema, await body(c))),
  ],
  [
    route("get", "/attendance/me/history", "Riwayat absen sendiri", {
      query: range,
      response: z.array(dayViewSchema),
    }),
    (c) => service.myHistory(ctxOf(c), c.req.query("from") as string, c.req.query("to") as string),
  ],
  [
    route("get", "/attendance/days", "Data Absen Harian (inbox keputusan / semua dalam cakupan)", {
      response: z.array(dayViewSchema),
      query: range.extend({
        scope: z.enum(["inbox", "all"]).optional(),
        companyId: z.uuid().optional(),
        labeledOnly: z.enum(["true", "false"]).optional(),
        status: z.enum(["OPEN", "PENDING", "APPROVED", "REJECTED", "ALPHA", "LEAVE"]).optional(),
        employeeId: z.uuid().optional(),
        q: z
          .string()
          .max(100)
          .optional()
          .openapi({ description: "Cari nama atau NIK karyawan (tidak peka huruf besar/kecil)" }),
      }),
    }),
    (c) =>
      service.listDays(ctxOf(c), {
        scope: c.req.query("scope") === "all" ? "all" : "inbox",
        companyId: c.req.query("companyId"),
        from: c.req.query("from") as string,
        to: c.req.query("to") as string,
        labeledOnly: c.req.query("labeledOnly") === "true",
        status: c.req.query("status"),
        employeeId: c.req.query("employeeId"),
        q: c.req.query("q"),
      }),
  ],
  [
    route("get", "/attendance/days/{id}", "Detail hari absen (foto, peta, label, approval)", {
      params: idParam,
      response: dayViewSchema,
    }),
    (c) => service.getDay(ctxOf(c), c.req.param("id") as string),
  ],
];

export function registerAttendanceDayRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  for (const [definition, handler] of ROUTES) {
    app.openapi({ ...definition, middleware: protect }, (async (c: Context) =>
      c.json(ok(await handler(c)), 200)) as never);
  }
}
