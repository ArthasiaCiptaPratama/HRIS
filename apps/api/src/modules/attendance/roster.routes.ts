import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  crewInputSchema,
  crewMembersInputSchema,
  rosterCellsInputSchema,
  rosterChangeInputSchema,
  rosterImportInputSchema,
  rosterPatternInputSchema,
  rosterTemplateAssignInputSchema,
  rosterTemplateDefInputSchema,
  rosterTemplateInstallInputSchema,
  shiftInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { ValidationError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { shiftSchema } from "./attendance.contract.ts";
import { ctxOf } from "./calendar.routes.ts";
import {
  crewListSchema,
  crewSchema,
  employeeRosterSchema,
  rosterArchivedSchema,
  rosterCellsResultSchema,
  rosterChangeListSchema,
  rosterChangeSchema,
  rosterCustomTemplateListSchema,
  rosterCustomTemplateSchema,
  rosterGridSchema,
  rosterImportCommitSchema,
  rosterImportPreviewSchema,
  rosterPatternListSchema,
  rosterPatternSchema,
  rosterTemplateAssignPlanSchema,
  rosterTemplateInstallResultSchema,
  shiftListSchema,
} from "./roster.contract.ts";
import * as service from "./roster.service.ts";
import * as change from "./roster-change.service.ts";
import * as templates from "./roster-template.service.ts";

// Tahap B — roster tambang (D-069). Body divalidasi skema @hris/shared di handler lewat `strict` (aturan
// lintas field → 400 VALIDATION_ERROR); skema yang sama dicatat di OpenAPI (MOB-D7 #1).
const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const idParam = z.object({ id: z.uuid() });
const companyQuery = z.object({ companyId: z.uuid() });
const peerResponseSchema = z.object({ accept: z.boolean() });

export function strict<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

/** MOB-D7 #1: body & respons bertipe di OpenAPI (codegen app mobile). Validasi body tetap `strict`. */
const route = (
  method: "get" | "post" | "put" | "delete",
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
const param = (c: Context) => c.req.param("id") as string;
const query = (c: Context, key: string) => c.req.query(key) as string;

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route("get", "/shifts", "Daftar shift PT", { query: companyQuery, response: shiftListSchema }),
    (c) => service.listShifts(ctxOf(c), query(c, "companyId")),
  ],
  [
    route("post", "/shifts", "Tambah shift (SA, HR PT)", {
      body: shiftInputSchema,
      response: shiftSchema,
    }),
    async (c) => service.createShift(ctxOf(c), strict(shiftInputSchema, await body(c))),
  ],
  [
    route("put", "/shifts/{id}", "Ubah shift", {
      params: idParam,
      body: shiftInputSchema,
      response: shiftSchema,
    }),
    async (c) => service.updateShift(ctxOf(c), param(c), strict(shiftInputSchema, await body(c))),
  ],
  [
    route("delete", "/shifts/{id}", "Arsipkan shift (ditolak bila masih dipakai)", {
      params: idParam,
      response: shiftSchema,
    }),
    (c) => service.archiveShift(ctxOf(c), param(c)),
  ],
  [
    route("get", "/roster-patterns", "Daftar pola roster PT", {
      query: companyQuery,
      response: rosterPatternListSchema,
    }),
    (c) => service.listPatterns(ctxOf(c), query(c, "companyId")),
  ],
  [
    route("post", "/roster-patterns", "Tambah pola roster", {
      body: rosterPatternInputSchema,
      response: rosterPatternSchema,
    }),
    async (c) => service.createPattern(ctxOf(c), strict(rosterPatternInputSchema, await body(c))),
  ],
  [
    route("put", "/roster-patterns/{id}", "Ubah pola (crew dibangkitkan ulang)", {
      params: idParam,
      body: rosterPatternInputSchema,
      response: rosterPatternSchema,
    }),
    async (c) =>
      service.updatePattern(ctxOf(c), param(c), strict(rosterPatternInputSchema, await body(c))),
  ],
  [
    route("delete", "/roster-patterns/{id}", "Arsipkan pola", {
      params: idParam,
      response: rosterArchivedSchema,
    }),
    (c) => service.archivePattern(ctxOf(c), param(c)),
  ],
  // TM-D23: template roster buatan HR (pola + jumlah crew + jarak geser), dipasang per lokasi kerja.
  [
    route("get", "/roster-custom-templates", "Daftar template roster buatan HR + pemasangannya", {
      query: companyQuery,
      response: rosterCustomTemplateListSchema,
    }),
    (c) => templates.listCustomTemplates(ctxOf(c), query(c, "companyId")),
  ],
  [
    route("post", "/roster-custom-templates", "Buat template roster (SA, HR PT)", {
      body: rosterTemplateDefInputSchema,
      response: rosterCustomTemplateSchema,
    }),
    async (c) =>
      templates.createCustomTemplate(ctxOf(c), strict(rosterTemplateDefInputSchema, await body(c))),
  ],
  [
    route("put", "/roster-custom-templates/{id}", "Ubah template roster", {
      params: idParam,
      body: rosterTemplateDefInputSchema,
      response: rosterCustomTemplateSchema,
    }),
    async (c) =>
      templates.updateCustomTemplate(
        ctxOf(c),
        param(c),
        strict(rosterTemplateDefInputSchema, await body(c)),
      ),
  ],
  [
    route(
      "delete",
      "/roster-custom-templates/{id}",
      "Arsipkan template (pola & crew tetap berjalan)",
      {
        params: idParam,
        response: rosterArchivedSchema,
      },
    ),
    (c) => templates.archiveCustomTemplate(ctxOf(c), param(c)),
  ],
  [
    route(
      "post",
      "/roster-custom-templates/{id}/install",
      "Pasang template ke lokasi kerja (membuat pola + crew A/B/C…)",
      {
        params: idParam,
        body: rosterTemplateInstallInputSchema,
        response: rosterTemplateInstallResultSchema,
      },
    ),
    async (c) =>
      templates.installCustomTemplate(
        ctxOf(c),
        param(c),
        strict(rosterTemplateInstallInputSchema, await body(c)),
      ),
  ],
  [
    route(
      "post",
      "/roster-custom-templates/{id}/assign/preview",
      "Pratinjau isi roster karyawan dengan template (pembagian ke crew)",
      {
        params: idParam,
        body: rosterTemplateAssignInputSchema,
        response: rosterTemplateAssignPlanSchema,
      },
    ),
    async (c) =>
      templates.previewTemplateAssignment(
        ctxOf(c),
        param(c),
        strict(rosterTemplateAssignInputSchema, await body(c)),
      ),
  ],
  [
    route(
      "post",
      "/roster-custom-templates/{id}/assign",
      "Isi roster karyawan dengan template: dibagi rata ke crew mulai tanggal efektif",
      {
        params: idParam,
        body: rosterTemplateAssignInputSchema,
        response: rosterTemplateAssignPlanSchema,
      },
    ),
    async (c) =>
      templates.applyTemplateAssignment(
        ctxOf(c),
        param(c),
        strict(rosterTemplateAssignInputSchema, await body(c)),
      ),
  ],
  [
    route("get", "/crews", "Daftar crew PT + anggota aktif", {
      query: companyQuery,
      response: crewListSchema,
    }),
    (c) => service.listCrews(ctxOf(c), query(c, "companyId")),
  ],
  [
    route("post", "/crews", "Tambah crew", { body: crewInputSchema, response: crewSchema }),
    async (c) => service.createCrew(ctxOf(c), strict(crewInputSchema, await body(c))),
  ],
  [
    route("put", "/crews/{id}", "Ubah crew (dibangkitkan ulang)", {
      params: idParam,
      body: crewInputSchema,
      response: crewSchema,
    }),
    async (c) => service.updateCrew(ctxOf(c), param(c), strict(crewInputSchema, await body(c))),
  ],
  [
    route("delete", "/crews/{id}", "Arsipkan crew", {
      params: idParam,
      response: rosterArchivedSchema,
    }),
    (c) => service.archiveCrew(ctxOf(c), param(c)),
  ],
  [
    route("put", "/crews/{id}/members", "Atur anggota crew mulai tanggal efektif", {
      params: idParam,
      body: crewMembersInputSchema,
      response: crewSchema,
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
      response: rosterGridSchema,
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
      response: employeeRosterSchema,
    }),
    (c) => service.getEmployeeRoster(ctxOf(c), param(c), query(c, "from"), query(c, "to")),
  ],
  [
    route("put", "/roster/cells", "Ubah sel grid roster (manual)", {
      body: rosterCellsInputSchema,
      response: rosterCellsResultSchema,
    }),
    async (c) => service.setRosterCells(ctxOf(c), strict(rosterCellsInputSchema, await body(c))),
  ],
  [
    route("post", "/roster/import/preview", "Pratinjau import roster", {
      body: rosterImportInputSchema,
      response: rosterImportPreviewSchema,
    }),
    async (c) =>
      service.previewRosterImport(ctxOf(c), strict(rosterImportInputSchema, await body(c))),
  ],
  [
    route("post", "/roster/import/commit", "Simpan import roster (semua atau tidak sama sekali)", {
      body: rosterImportInputSchema,
      response: rosterImportCommitSchema,
    }),
    async (c) =>
      service.commitRosterImport(ctxOf(c), strict(rosterImportInputSchema, await body(c))),
  ],
  [
    route("get", "/roster-changes", "Pengajuan perubahan roster: milik saya / inbox keputusan", {
      query: z.object({ scope: z.enum(["mine", "inbox"]).optional() }),
      response: rosterChangeListSchema,
    }),
    (c) => change.listRosterChanges(ctxOf(c), c.req.query("scope") === "inbox" ? "inbox" : "mine"),
  ],
  [
    route("post", "/roster-changes", "Ajukan perubahan / tukar shift", {
      body: rosterChangeInputSchema,
      response: rosterChangeSchema,
    }),
    async (c) =>
      change.createRosterChange(ctxOf(c), strict(rosterChangeInputSchema, await body(c))),
  ],
  [
    route("post", "/roster-changes/{id}/peer-response", "Jawaban rekan atas tukar shift", {
      params: idParam,
      body: peerResponseSchema,
      response: rosterChangeSchema,
    }),
    async (c) =>
      change.respondToSwap(ctxOf(c), param(c), strict(peerResponseSchema, await body(c)).accept),
  ],
  [
    route("post", "/roster-changes/{id}/cancel", "Batalkan pengajuan perubahan roster", {
      params: idParam,
      response: rosterChangeSchema,
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
