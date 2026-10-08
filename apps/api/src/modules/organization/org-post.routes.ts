import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { orgPostInputSchema, orgPostUpdateSchema } from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import {
  orgPostAdminSchema,
  orgPostListQuerySchema,
  syncManagersResultSchema,
} from "./org-post.schema.ts";
import * as service from "./org-post.service.ts";
import { idParamSchema, mutationResultSchema } from "./organization-admin.schema.ts";
import type { RequestContext } from "./organization-support.ts";

// D-051: /api/v1/org-posts — pos jabatan untuk bagan organisasi. Baca: SA & HR; tulis: SA.

const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Organization"];
const base = `${API_BASE_PATH}/org-posts`;
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const write = errors(400, 401, 403, 404, 409, 422, 500);

const routes = {
  list: createRoute({
    method: "get",
    path: base,
    tags: TAGS,
    summary: "Pos jabatan: daftar (atasan, atasan fungsional, slot, jumlah pemegang) — SA & HR",
    security,
    request: { query: orgPostListQuerySchema },
    responses: {
      200: json("Pos jabatan", dataEnvelope(z.array(orgPostAdminSchema))),
      ...errors(400, 401, 403, 500),
    },
  }),
  create: createRoute({
    method: "post",
    path: base,
    tags: TAGS,
    summary: "Pos jabatan: tambah (SUPER_ADMIN)",
    security,
    request: body(orgPostInputSchema),
    responses: { 201: json("Dibuat", dataEnvelope(mutationResultSchema)), ...write },
  }),
  update: createRoute({
    method: "patch",
    path: `${base}/{id}`,
    tags: TAGS,
    summary: "Pos jabatan: ubah sebagian — atasan otomatis pemegang ikut disesuaikan (SUPER_ADMIN)",
    security,
    request: { params: idParamSchema, ...body(orgPostUpdateSchema) },
    responses: { 200: json("Diubah", dataEnvelope(mutationResultSchema)), ...write },
  }),
  archive: createRoute({
    method: "post",
    path: `${base}/{id}/archive`,
    tags: TAGS,
    summary: "Pos jabatan: arsipkan — hanya bila kosong & tanpa bawahan (SUPER_ADMIN)",
    security,
    request: { params: idParamSchema },
    responses: { 200: json("Diarsipkan", dataEnvelope(mutationResultSchema)), ...write },
  }),
  restore: createRoute({
    method: "post",
    path: `${base}/{id}/restore`,
    tags: TAGS,
    summary: "Pos jabatan: pulihkan dari arsip (SUPER_ADMIN)",
    security,
    request: { params: idParamSchema },
    responses: { 200: json("Dipulihkan", dataEnvelope(mutationResultSchema)), ...write },
  }),
  remove: createRoute({
    method: "delete",
    path: `${base}/{id}`,
    tags: TAGS,
    summary: "Pos jabatan: hapus permanen — hanya bila tidak pernah dirujuk (SUPER_ADMIN)",
    security,
    request: { params: idParamSchema },
    responses: { 200: json("Dihapus", dataEnvelope(mutationResultSchema)), ...write },
  }),
  sync: createRoute({
    method: "post",
    path: `${base}/sync-managers`,
    tags: TAGS,
    summary:
      "Hitung ulang atasan langsung otomatis dari pos (D-053), mis. setelah role Manager berubah (SUPER_ADMIN)",
    security,
    responses: {
      200: json("Jumlah karyawan yang atasannya berubah", dataEnvelope(syncManagersResultSchema)),
      ...errors(401, 403, 500),
    },
  }),
};

function ctxOf(c: Context): RequestContext {
  return {
    actor: c.get("actor"),
    requestId: c.get("requestId"),
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
  };
}

export function registerOrgPostRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: protect });
  // Rute statis didaftarkan sebelum rute ber-{id}.
  app.openapi(guard(routes.sync), async (c) =>
    c.json(ok(await service.syncManagers(ctxOf(c))), 200),
  );
  app.openapi(guard(routes.list), async (c) =>
    c.json(ok(await service.listPostsAdmin(ctxOf(c), c.req.valid("query"))), 200),
  );
  app.openapi(guard(routes.create), async (c) =>
    c.json(ok(await service.createPost(ctxOf(c), c.req.valid("json"))), 201),
  );
  app.openapi(guard(routes.update), async (c) =>
    c.json(
      ok(await service.updatePost(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(routes.archive), async (c) =>
    c.json(ok(await service.archivePost(ctxOf(c), c.req.valid("param").id, true)), 200),
  );
  app.openapi(guard(routes.restore), async (c) =>
    c.json(ok(await service.archivePost(ctxOf(c), c.req.valid("param").id, false)), 200),
  );
  app.openapi(guard(routes.remove), async (c) =>
    c.json(ok(await service.deletePost(ctxOf(c), c.req.valid("param").id)), 200),
  );
}
