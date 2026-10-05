import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  companyInputSchema,
  departmentInputSchema,
  employmentStatusInputSchema,
  gradeInputSchema,
  MASTER_DATA_KINDS,
  MASTER_DATA_LABELS,
  type MasterDataKind,
  MERGEABLE_MASTER_DATA,
  mergeMasterDataInputSchema,
  positionInputSchema,
  workLocationBaseSchema,
  workLocationInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import {
  adminListQuerySchema,
  companyAdminSchema,
  departmentAdminSchema,
  employmentStatusAdminSchema,
  gradeAdminSchema,
  idParamSchema,
  mergeResultSchema,
  mutationResultSchema,
  positionAdminSchema,
  workLocationAdminSchema,
} from "./organization-admin.schema.ts";
import * as service from "./organization-admin.service.ts";

// D-049: /api/v1/<jenis> untuk 6 master data. Baca daftar admin: SA & HR; tulis: SA (policy di service).

const ITEM_SCHEMA: Record<MasterDataKind, z.ZodType> = {
  companies: companyAdminSchema,
  departments: departmentAdminSchema,
  positions: positionAdminSchema,
  "employment-statuses": employmentStatusAdminSchema,
  grades: gradeAdminSchema,
  "work-locations": workLocationAdminSchema,
};
const CREATE_SCHEMA: Record<MasterDataKind, z.ZodType> = {
  companies: companyInputSchema,
  departments: departmentInputSchema,
  positions: positionInputSchema,
  "employment-statuses": employmentStatusInputSchema,
  grades: gradeInputSchema,
  "work-locations": workLocationInputSchema,
};
const UPDATE_SCHEMA: Record<MasterDataKind, z.ZodType> = {
  companies: companyInputSchema.partial(),
  departments: departmentInputSchema.partial(),
  positions: positionInputSchema.partial(),
  "employment-statuses": employmentStatusInputSchema.partial(),
  grades: gradeInputSchema.partial(),
  "work-locations": workLocationBaseSchema.partial(),
};

const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Organization"];
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));

function ctxOf(c: Context): service.RequestContext {
  return {
    actor: c.get("actor"),
    requestId: c.get("requestId"),
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
  };
}

function routesFor(kind: MasterDataKind) {
  const base = `${API_BASE_PATH}/${kind}`;
  const label = MASTER_DATA_LABELS[kind];
  const write = errors(400, 401, 403, 404, 409, 422, 500);
  return {
    list: createRoute({
      method: "get",
      path: base,
      tags: TAGS,
      summary: `${label}: daftar admin (aktif/arsip, jumlah karyawan) — SA & HR`,
      security,
      request: { query: adminListQuerySchema },
      responses: {
        200: json(label, dataEnvelope(z.array(ITEM_SCHEMA[kind]))),
        ...errors(400, 401, 403, 500),
      },
    }),
    create: createRoute({
      method: "post",
      path: base,
      tags: TAGS,
      summary: `${label}: tambah (SUPER_ADMIN)`,
      security,
      request: body(CREATE_SCHEMA[kind]),
      responses: { 201: json("Dibuat", dataEnvelope(mutationResultSchema)), ...write },
    }),
    update: createRoute({
      method: "patch",
      path: `${base}/{id}`,
      tags: TAGS,
      summary: `${label}: ubah sebagian (SUPER_ADMIN)`,
      security,
      request: { params: idParamSchema, ...body(UPDATE_SCHEMA[kind]) },
      responses: { 200: json("Diubah", dataEnvelope(mutationResultSchema)), ...write },
    }),
    archive: createRoute({
      method: "post",
      path: `${base}/{id}/archive`,
      tags: TAGS,
      summary: `${label}: arsipkan — hilang dari pilihan baru, data lama tetap (SUPER_ADMIN)`,
      security,
      request: { params: idParamSchema },
      responses: { 200: json("Diarsipkan", dataEnvelope(mutationResultSchema)), ...write },
    }),
    restore: createRoute({
      method: "post",
      path: `${base}/{id}/restore`,
      tags: TAGS,
      summary: `${label}: pulihkan dari arsip (SUPER_ADMIN)`,
      security,
      request: { params: idParamSchema },
      responses: { 200: json("Dipulihkan", dataEnvelope(mutationResultSchema)), ...write },
    }),
    remove: createRoute({
      method: "delete",
      path: `${base}/{id}`,
      tags: TAGS,
      summary: `${label}: hapus permanen — hanya bila belum pernah dipakai (SUPER_ADMIN)`,
      security,
      request: { params: idParamSchema },
      responses: { 200: json("Dihapus", dataEnvelope(mutationResultSchema)), ...write },
    }),
    merge: createRoute({
      method: "post",
      path: `${base}/{id}/merge`,
      tags: TAGS,
      summary: `${label}: gabungkan ke item lain — karyawan & riwayat dipindah, item ini diarsipkan (SUPER_ADMIN)`,
      security,
      request: { params: idParamSchema, ...body(mergeMasterDataInputSchema) },
      responses: { 200: json("Digabungkan", dataEnvelope(mergeResultSchema)), ...write },
    }),
  };
}

export function registerOrganizationAdminRoutes(
  app: OpenAPIHono,
  protect: MiddlewareHandler[],
): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: protect });
  for (const kind of MASTER_DATA_KINDS) {
    const r = routesFor(kind);
    app.openapi(guard(r.list), async (c) =>
      c.json(ok(await service.listAdmin(ctxOf(c), kind, c.req.valid("query"))), 200),
    );
    app.openapi(guard(r.create), async (c) =>
      c.json(ok(await service.createItem(ctxOf(c), kind, c.req.valid("json"))), 201),
    );
    app.openapi(guard(r.update), async (c) =>
      c.json(
        ok(await service.updateItem(ctxOf(c), kind, c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
    );
    app.openapi(guard(r.archive), async (c) =>
      c.json(ok(await service.archiveItem(ctxOf(c), kind, c.req.valid("param").id)), 200),
    );
    app.openapi(guard(r.restore), async (c) =>
      c.json(ok(await service.restoreItem(ctxOf(c), kind, c.req.valid("param").id)), 200),
    );
    app.openapi(guard(r.remove), async (c) =>
      c.json(ok(await service.deleteItem(ctxOf(c), kind, c.req.valid("param").id)), 200),
    );
    if (MERGEABLE_MASTER_DATA.includes(kind)) {
      app.openapi(guard(r.merge), async (c) =>
        c.json(
          ok(
            await service.mergeItem(
              ctxOf(c),
              kind,
              c.req.valid("param").id,
              c.req.valid("json").targetId,
            ),
          ),
          200,
        ),
      );
    }
  }
}
