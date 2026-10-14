import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  crewInputSchema,
  crewMembersInputSchema,
  rosterCellsInputSchema,
  rosterChangeInputSchema,
  rosterImportInputSchema,
  rosterPatternInputSchema,
  shiftInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { ValidationError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { ctxOf } from "./calendar.routes.ts";
import * as service from "./roster.service.ts";
import * as change from "./roster-change.service.ts";

// Tahap B — roster tambang (D-069). Body divalidasi skema @hris/shared di handler (aturan lintas field →
// 400 VALIDATION_ERROR); dokumen OpenAPI cukup mencatat path, query, & kode error.
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
const companyQuery = z.object({ companyId: z.uuid() });

export function strict<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

const route = (
  method: "get" | "post" | "put" | "delete",
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
const param = (c: Context) => c.req.param("id") as string;
const query = (c: Context, key: string) => c.req.query(key) as string;

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route("get", "/shifts", "Daftar shift PT", { query: companyQuery }),
    (c) => service.listShifts(ctxOf(c), query(c, "companyId")),
  ],
  [
    route("post", "/shifts", "Tambah shift (SA, HR PT)", anyBody),
    async (c) => service.createShift(ctxOf(c), strict(shiftInputSchema, await body(c))),
  ],
  [
    route("put", "/shifts/{id}", "Ubah shift", { params: idParam, ...anyBody }),
    async (c) => service.updateShift(ctxOf(c), param(c), strict(shiftInputSchema, await body(c))),
  ],
  [
    route("delete", "/shifts/{id}", "Arsipkan shift (ditolak bila masih dipakai)", {
      params: idParam,
    }),
    (c) => service.archiveShift(ctxOf(c), param(c)),
  ],
  [
    route("get", "/roster-patterns", "Daftar pola roster PT", { query: companyQuery }),
    (c) => service.listPatterns(ctxOf(c), query(c, "companyId")),
  ],
  [
    route("post", "/roster-patterns", "Tambah pola roster", anyBody),
    async (c) => service.createPattern(ctxOf(c), strict(rosterPatternInputSchema, await body(c))),
  ],
  [
    route("put", "/roster-patterns/{id}", "Ubah pola (crew dibangkitkan ulang)", {
      params: idParam,
      ...anyBody,
    }),
    async (c) =>
      service.updatePattern(ctxOf(c), param(c), strict(rosterPatternInputSchema, await body(c))),
  ],
  [
    route("delete", "/roster-patterns/{id}", "Arsipkan pola", { params: idParam }),
    (c) => service.archivePattern(ctxOf(c), param(c)),
  ],
  [
    route("get", "/crews", "Daftar crew PT + anggota aktif", { query: companyQuery }),
    (c) => service.listCrews(ctxOf(c), query(c, "companyId")),
  ],
  [
    route("post", "/crews", "Tambah crew", anyBody),
    async (c) => service.createCrew(ctxOf(c), strict(crewInputSchema, await body(c))),
  ],
  [
    route("put", "/crews/{id}", "Ubah crew (dibangkitkan ulang)", { params: idParam, ...anyBody }),
    async (c) => service.updateCrew(ctxOf(c), param(c), strict(crewInputSchema, await body(c))),
  ],
  [
    route("delete", "/crews/{id}", "Arsipkan crew", { params: idParam }),
    (c) => service.archiveCrew(ctxOf(c), param(c)),
  ],
  [
    route("put", "/crews/{id}/members", "Atur anggota crew mulai tanggal efektif", {
      params: idParam,
      ...anyBody,
    }),
    async (c) =>
      service.setCrewMembers(ctxOf(c), param(c), strict(crewMembersInputSchema, await body(c))),
  ],
  [
    route("get", "/roster", "Grid roster bulanan (SA/HR: PT; MANAGER: tim; karyawan: sendiri)", {
      query: z.object({
        companyId: z.uuid(),
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        crewId: z.uuid().optional(),
      }),
    }),
    (c) =>
      service.getRosterGrid(
        ctxOf(c),
        query(c, "companyId"),
        query(c, "month"),
        c.req.query("crewId"),
      ),
  ],
  [
    route("get", "/roster/employees/{id}", "Roster seorang karyawan pada rentang", {
      params: idParam,
      query: z.object({ from: z.iso.date(), to: z.iso.date() }),
    }),
    (c) => service.getEmployeeRoster(ctxOf(c), param(c), query(c, "from"), query(c, "to")),
  ],
  [
    route("put", "/roster/cells", "Ubah sel grid roster (manual)", anyBody),
    async (c) => service.setRosterCells(ctxOf(c), strict(rosterCellsInputSchema, await body(c))),
  ],
  [
    route("post", "/roster/import/preview", "Pratinjau import roster", anyBody),
    async (c) =>
      service.previewRosterImport(ctxOf(c), strict(rosterImportInputSchema, await body(c))),
  ],
  [
    route(
      "post",
      "/roster/import/commit",
      "Simpan import roster (semua atau tidak sama sekali)",
      anyBody,
    ),
    async (c) =>
      service.commitRosterImport(ctxOf(c), strict(rosterImportInputSchema, await body(c))),
  ],
  [
    route("get", "/roster-changes", "Pengajuan perubahan roster: milik saya / inbox keputusan", {
      query: z.object({ scope: z.enum(["mine", "inbox"]).optional() }),
    }),
    (c) => change.listRosterChanges(ctxOf(c), c.req.query("scope") === "inbox" ? "inbox" : "mine"),
  ],
  [
    route("post", "/roster-changes", "Ajukan perubahan / tukar shift", anyBody),
    async (c) =>
      change.createRosterChange(ctxOf(c), strict(rosterChangeInputSchema, await body(c))),
  ],
  [
    route("post", "/roster-changes/{id}/peer-response", "Jawaban rekan atas tukar shift", {
      params: idParam,
      ...anyBody,
    }),
    async (c) =>
      change.respondToSwap(
        ctxOf(c),
        param(c),
        strict(z.object({ accept: z.boolean() }), await body(c)).accept,
      ),
  ],
  [
    route("post", "/roster-changes/{id}/cancel", "Batalkan pengajuan perubahan roster", {
      params: idParam,
    }),
    (c) => change.cancelRosterChange(ctxOf(c), param(c)),
  ],
];

export function registerRosterRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  for (const [definition, handler] of ROUTES) {
    // Validasi path/query bawaan zod-openapi tetap jalan (defaultHook → 400).
    app.openapi({ ...definition, middleware: protect }, (async (c: Context) =>
      c.json(ok(await handler(c)), 200)) as never);
  }
}
