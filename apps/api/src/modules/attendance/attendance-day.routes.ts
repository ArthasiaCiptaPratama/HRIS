import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  manualPunchInputSchema,
  punchInputSchema,
  punchPrecheckSchema,
  selfieUploadInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import * as service from "./attendance.service.ts";
import { ctxOf } from "./calendar.routes.ts";
import { strict } from "./roster.routes.ts";

// Tahap C/D — absen PWA (D-066, D-069) & Data Absen Harian (D-067).
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
const idParam = z.object({ id: z.uuid() });
const route = (
  method: "get" | "post",
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
const range = z.object({ from: z.iso.date(), to: z.iso.date() });

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route("get", "/attendance/me/today", "Status absen hari ini, roster 7 hari, lokasi acuan"),
    (c) => service.getToday(ctxOf(c)),
  ],
  [
    route(
      "post",
      "/attendance/precheck",
      "Pra-cek absen: tanggal kerja, label, jarak (alasan wajib bila ada label)",
      anyBody,
    ),
    async (c) => service.precheck(ctxOf(c), strict(punchPrecheckSchema, await body(c))),
  ],
  [
    route(
      "post",
      "/attendance/selfie-upload",
      "URL unggah selfie (bucket private, ± 200 KB)",
      anyBody,
    ),
    async (c) =>
      service.createSelfieUpload(
        ctxOf(c),
        strict(selfieUploadInputSchema, await body(c)).contentType,
      ),
  ],
  [
    route("post", "/attendance/punch", "Absen masuk/pulang (waktu server, selfie + GPS)", anyBody),
    async (c) =>
      service.punch(
        { ...ctxOf(c), userAgent: c.req.header("user-agent") },
        strict(punchInputSchema, await body(c)),
      ),
  ],
  [
    route(
      "post",
      "/attendance/punches/{id}/cancel",
      "Batalkan absen sendiri (salah pencet, <= 15 menit, belum diputuskan)",
      { params: idParam },
    ),
    (c) => service.cancelOwnPunch(ctxOf(c), c.req.param("id") as string),
  ],
  [
    route(
      "post",
      "/attendance/manual",
      "Autentikasi manual HR/SA: masukkan/ganti jam absen masuk atau pulang (alasan wajib)",
      anyBody,
    ),
    async (c) => service.manualPunch(ctxOf(c), strict(manualPunchInputSchema, await body(c))),
  ],
  [
    route("get", "/attendance/me/history", "Riwayat absen sendiri", { query: range }),
    (c) => service.myHistory(ctxOf(c), c.req.query("from") as string, c.req.query("to") as string),
  ],
  [
    route("get", "/attendance/days", "Data Absen Harian (inbox keputusan / semua dalam cakupan)", {
      query: range.extend({
        scope: z.enum(["inbox", "all"]).optional(),
        companyId: z.uuid().optional(),
        labeledOnly: z.enum(["true", "false"]).optional(),
        status: z.enum(["OPEN", "PENDING", "APPROVED", "REJECTED", "ALPHA", "LEAVE"]).optional(),
        employeeId: z.uuid().optional(),
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
      }),
  ],
  [
    route("get", "/attendance/days/{id}", "Detail hari absen (foto, peta, label, approval)", {
      params: idParam,
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
