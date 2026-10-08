import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok, paginatedEnvelope } from "../../core/response.ts";
import type { RequestContext } from "./employee.service.ts";
import {
  commitBodySchema,
  importAttachmentsSchema,
  importBodySchema,
  importJobDetailSchema,
  importJobSchema,
  listJobsQuerySchema,
  mappingBodySchema,
  mappingSchema,
  pendingAttachmentJobsSchema,
  previewSchema,
  signatureParamSchema,
} from "./employee-import.schema.ts";
import * as service from "./employee-import.service.ts";
import * as attachments from "./employee-import-attachments.service.ts";

// D-042: import karyawan CSV/Excel (SA & HR; cakupan PT & grant dicek per baris di service).
const P = `${API_BASE_PATH}/employee-imports`;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Employee import"];
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));

const routes = {
  preview: createRoute({
    method: "post",
    path: `${P}/preview`,
    tags: TAGS,
    summary:
      "Pratinjau import: validasi ulang di server, diff (tanpa nilai), master data baru — tidak menulis",
    security,
    request: body(importBodySchema),
    responses: {
      200: json("Pratinjau", dataEnvelope(previewSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
  commit: createRoute({
    method: "post",
    path: P,
    tags: TAGS,
    summary:
      "Simpan import (satu transaksi): baris valid ditulis, baris error dilewati; 409 bila data berubah sejak pratinjau",
    security,
    request: body(commitBodySchema),
    responses: {
      201: json(
        "Import tersimpan",
        dataEnvelope(
          z.object({
            jobId: z.uuid(),
            counts: previewSchema.shape.counts,
          }),
        ),
      ),
      ...errors(400, 401, 403, 409, 500),
    },
  }),
  list: createRoute({
    method: "get",
    path: P,
    tags: TAGS,
    summary: "Riwayat import (SA semua; HR miliknya)",
    security,
    request: { query: listJobsQuerySchema },
    responses: {
      200: json("Riwayat import", paginatedEnvelope(importJobSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
  detail: createRoute({
    method: "get",
    path: `${P}/{id}`,
    tags: TAGS,
    summary: "Detail import + masalah per baris (tanpa nilai)",
    security,
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: json("Detail import", dataEnvelope(importJobDetailSchema)),
      ...errors(400, 401, 403, 404, 500),
    },
  }),
  // ── D-060: lampiran Google Drive ──
  openAttachments: createRoute({
    method: "get",
    path: `${P}/attachments/open`,
    tags: TAGS,
    summary: "Import yang lampirannya belum selesai/gagal (SA semua; HR miliknya)",
    security,
    responses: {
      200: json("Import dengan lampiran terbuka", dataEnvelope(pendingAttachmentJobsSchema)),
      ...errors(401, 403, 500),
    },
  }),
  attachments: createRoute({
    method: "get",
    path: `${P}/{id}/attachments`,
    tags: TAGS,
    summary: "Status lampiran Google Drive satu import (tanpa tautan/isi file)",
    security,
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: json("Lampiran", dataEnvelope(importAttachmentsSchema)),
      ...errors(400, 401, 403, 404, 500),
    },
  }),
  processAttachments: createRoute({
    method: "post",
    path: `${P}/{id}/attachments/process`,
    tags: TAGS,
    summary:
      "Proses beberapa lampiran (±20 dtk per panggilan; panggil ulang sampai pending = 0). 422 bila Google Drive belum dikonfigurasi",
    security,
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: json("Lampiran setelah diproses", dataEnvelope(importAttachmentsSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
  retryAttachments: createRoute({
    method: "post",
    path: `${P}/{id}/attachments/retry`,
    tags: TAGS,
    summary: "Kembalikan lampiran gagal ke antrean",
    security,
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      200: json("Lampiran", dataEnvelope(importAttachmentsSchema)),
      ...errors(400, 401, 403, 404, 500),
    },
  }),
  getMapping: createRoute({
    method: "get",
    path: `${P}/mappings/{signature}`,
    tags: TAGS,
    summary: "Profil pemetaan kolom tersimpan untuk susunan header (SHA-256)",
    security,
    request: { params: signatureParamSchema },
    responses: {
      200: json("Pemetaan", dataEnvelope(mappingSchema)),
      ...errors(400, 401, 403, 404, 500),
    },
  }),
  saveMapping: createRoute({
    method: "put",
    path: `${P}/mappings/{signature}`,
    tags: TAGS,
    summary: "Simpan profil pemetaan kolom (dipakai otomatis untuk file berformat sama)",
    security,
    request: { params: signatureParamSchema, ...body(mappingBodySchema) },
    responses: {
      200: json("Pemetaan tersimpan", dataEnvelope(mappingSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
};

export function registerEmployeeImportRoutes(
  app: OpenAPIHono,
  deps: { protect: MiddlewareHandler[]; ctx: (c: Context) => RequestContext },
): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: deps.protect });
  // Route statis (/preview, /mappings) sebelum /{id}.
  app.openapi(guard(routes.preview), async (c) =>
    c.json(ok(await service.preview(deps.ctx(c), c.req.valid("json"))), 200),
  );
  app.openapi(guard(routes.openAttachments), async (c) =>
    c.json(ok(await attachments.listOpenAttachmentJobs(deps.ctx(c))), 200),
  );
  app.openapi(guard(routes.getMapping), async (c) =>
    c.json(ok(await service.getMapping(deps.ctx(c), c.req.valid("param").signature)), 200),
  );
  app.openapi(guard(routes.saveMapping), async (c) =>
    c.json(
      ok(
        await service.saveMapping(
          deps.ctx(c),
          c.req.valid("param").signature,
          c.req.valid("json").mapping,
        ),
      ),
      200,
    ),
  );
  app.openapi(guard(routes.commit), async (c) =>
    c.json(ok(await service.commit(deps.ctx(c), c.req.valid("json"))), 201),
  );
  app.openapi(guard(routes.list), async (c) =>
    c.json(await service.listJobs(deps.ctx(c), c.req.valid("query")), 200),
  );
  app.openapi(guard(routes.detail), async (c) =>
    c.json(ok(await service.getJob(deps.ctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(guard(routes.attachments), async (c) =>
    c.json(ok(await attachments.listAttachments(deps.ctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(guard(routes.processAttachments), async (c) =>
    c.json(ok(await attachments.processAttachments(deps.ctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(guard(routes.retryAttachments), async (c) =>
    c.json(ok(await attachments.retryAttachments(deps.ctx(c), c.req.valid("param").id)), 200),
  );
}
