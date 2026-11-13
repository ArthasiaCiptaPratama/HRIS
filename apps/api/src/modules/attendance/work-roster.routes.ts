import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  employeeResidencyInputSchema,
  localHomebasesInputSchema,
  workRosterAssignInputSchema,
  workRosterInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { ctxOf } from "./calendar.routes.ts";
import { strict } from "./roster.routes.ts";
import {
  employeeResidencyListSchema,
  employeeResidencyResultSchema,
  localHomebasesResultSchema,
  localHomebasesViewSchema,
  workRosterArchivedSchema,
  workRosterAssignPreviewSchema,
  workRosterListSchema,
  workRosterSchema,
} from "./work-roster.contract.ts";
import * as service from "./work-roster.service.ts";

// TM-D28 — roster (siklus kerja–libur), Homebase lokal per lokasi kerja, lokal/non-lokal karyawan, & isi
// jadwal dengan roster. Body divalidasi skema @hris/shared di handler lewat `strict` (aturan lintas field).
// Rute statis didaftarkan sebelum `/work-rosters/{id}`.
const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const idParam = z.object({ id: z.uuid() });
const companyBody = z.object({ companyId: z.uuid() });

const route = (
  method: "get" | "post" | "put" | "delete",
  path: string,
  summary: string,
  spec: { response: z.ZodType; body?: z.ZodType; params?: z.ZodObject; query?: z.ZodObject },
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
const param = (c: Context) => c.req.param("id") as string;

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route("get", "/work-rosters", "Daftar pola kerja (siklus kerja–libur) PT", {
      query: z.object({ companyId: z.uuid() }),
      response: workRosterListSchema,
    }),
    (c) => service.listWorkRosters(ctxOf(c), c.req.query("companyId") as string),
  ],
  [
    route("post", "/work-rosters", "Tambah pola kerja (SA, HR PT)", {
      body: workRosterInputSchema,
      response: workRosterSchema,
    }),
    async (c) => service.createWorkRoster(ctxOf(c), strict(workRosterInputSchema, await body(c))),
  ],
  [
    route(
      "post",
      "/work-rosters/defaults",
      "Buat pola kerja bawaan: office 5/2, non-lokal 13/1 + time off, lokal 6/1",
      {
        body: companyBody,
        response: workRosterListSchema,
      },
    ),
    async (c) =>
      service.createDefaultWorkRosters(ctxOf(c), strict(companyBody, await body(c)).companyId),
  ],
  [
    route(
      "get",
      "/work-rosters/local-homebases",
      "Lokasi kantor & Homebase lokal per lokasi kerja (SA, HR)",
      {
        response: localHomebasesViewSchema,
      },
    ),
    (c) => service.getLocalHomebases(ctxOf(c)),
  ],
  [
    route(
      "put",
      "/work-rosters/local-homebases",
      "Atur lokasi kantor & Homebase lokal satu lokasi kerja (SA, HR)",
      {
        body: localHomebasesInputSchema,
        response: localHomebasesResultSchema,
      },
    ),
    async (c) =>
      service.setLocalHomebases(ctxOf(c), strict(localHomebasesInputSchema, await body(c))),
  ],
  [
    route(
      "get",
      "/work-rosters/residencies",
      "Kelompok karyawan aktif PT: office / lapangan lokal / non-lokal",
      {
        query: z.object({ companyId: z.uuid(), q: z.string().max(100).optional() }),
        response: employeeResidencyListSchema,
      },
    ),
    (c) =>
      service.listEmployeeResidencies(
        ctxOf(c),
        c.req.query("companyId") as string,
        c.req.query("q"),
      ),
  ],
  [
    route("put", "/work-rosters/residencies", "Tetapkan kelompok karyawan (null = otomatis)", {
      body: employeeResidencyInputSchema,
      response: employeeResidencyResultSchema,
    }),
    async (c) =>
      service.setEmployeeResidency(ctxOf(c), strict(employeeResidencyInputSchema, await body(c))),
  ],
  [
    route("post", "/work-rosters/assign/preview", "Pratinjau isi jadwal dengan pola kerja", {
      body: workRosterAssignInputSchema,
      response: workRosterAssignPreviewSchema,
    }),
    async (c) =>
      service.previewWorkRosterAssignment(
        ctxOf(c),
        strict(workRosterAssignInputSchema, await body(c)),
      ),
  ],
  [
    route("post", "/work-rosters/assign", "Isi jadwal dengan pola kerja (kelompok otomatis)", {
      body: workRosterAssignInputSchema,
      response: workRosterAssignPreviewSchema,
    }),
    async (c) =>
      service.applyWorkRosterAssignment(
        ctxOf(c),
        strict(workRosterAssignInputSchema, await body(c)),
      ),
  ],
  [
    route("put", "/work-rosters/{id}", "Ubah pola kerja (siklus terkunci bila sudah dipakai)", {
      params: idParam,
      body: workRosterInputSchema,
      response: workRosterSchema,
    }),
    async (c) =>
      service.updateWorkRoster(ctxOf(c), param(c), strict(workRosterInputSchema, await body(c))),
  ],
  [
    route("delete", "/work-rosters/{id}", "Arsipkan pola kerja", {
      params: idParam,
      response: workRosterArchivedSchema,
    }),
    (c) => service.archiveWorkRoster(ctxOf(c), param(c)),
  ],
];

export function registerWorkRosterRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  for (const [definition, handler] of ROUTES) {
    app.openapi({ ...definition, middleware: protect }, (async (c: Context) =>
      c.json(ok(await handler(c)), 200)) as never);
  }
}
