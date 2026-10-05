import { createRoute, type OpenAPIHono, type z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok, paginatedEnvelope } from "../../core/response.ts";
import {
  bankRowSchema,
  dataChangeBodySchema,
  dataChangeDecisionBodySchema,
  dataChangeDetailSchema,
  dataChangeIdParamSchema,
  dataChangeQueueQuerySchema,
  dataChangeQueueRowSchema,
  dataChangeResultSchema,
  dataChangeSummarySchema,
  familyRowSchema,
  myDataSchema,
  myUploadUrlBodySchema,
  sensitiveArchiveQuerySchema,
} from "./data-change.schema.ts";
import * as service from "./data-change.service.ts";
import { documentUploadUrlSchema } from "./document.schema.ts";
import type { RequestContext } from "./employee.service.ts";

// D-054 / OD-6 (Arsip gelombang 1c): /self/* (data & pengajuan milik sendiri), /data-changes (antrean,
// detail, batal, keputusan), /archive/families & /archive/bank-accounts (Arsip sensitif ber-grant).

const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Employee Data Changes"];
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
const P = API_BASE_PATH;

export function registerDataChangeRoutes(
  app: OpenAPIHono,
  deps: { protect: MiddlewareHandler[]; ctx: (c: Context) => RequestContext },
): void {
  const guard = <R extends object>(r: R) => ({ ...r, middleware: deps.protect });
  const ctx = deps.ctx;

  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${P}/self/employee-data`,
        tags: TAGS,
        summary:
          "Data diri (ESS): pribadi, kontak darurat, keluarga, rekening tersamar + bagian menunggu",
        security,
        responses: { 200: json("Data diri", dataEnvelope(myDataSchema)), ...errors(401, 404, 500) },
      }),
    ),
    async (c) => c.json(ok(await service.getMyData(ctx(c))), 200),
  );
  app.openapi(
    guard(
      createRoute({
        method: "post",
        path: `${P}/self/documents/upload-url`,
        tags: TAGS,
        summary:
          "URL unggah lampiran pengajuan (buku tabungan / dokumen yang boleh diunggah karyawan)",
        security,
        request: body(myUploadUrlBodySchema),
        responses: { 200: json("URL unggah", dataEnvelope(documentUploadUrlSchema)), ...write },
      }),
    ),
    async (c) => c.json(ok(await service.createMyUploadUrl(ctx(c), c.req.valid("json"))), 200),
  );
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${P}/self/data-changes`,
        tags: TAGS,
        summary: "Riwayat pengajuan perubahan data milik sendiri",
        security,
        responses: {
          200: json("Pengajuan", dataEnvelope(dataChangeSummarySchema.array())),
          ...errors(401, 404, 500),
        },
      }),
    ),
    async (c) => c.json(ok(await service.listMyDataChanges(ctx(c))), 200),
  );
  app.openapi(
    guard(
      createRoute({
        method: "post",
        path: `${P}/data-changes`,
        tags: TAGS,
        summary: "Ajukan perubahan data diri (berlaku setelah disetujui SA / HR ber-grant)",
        security,
        request: body(dataChangeBodySchema),
        responses: { 201: json("Diajukan", dataEnvelope(dataChangeResultSchema)), ...write },
      }),
    ),
    async (c) => c.json(ok(await service.submitDataChange(ctx(c), c.req.valid("json"))), 201),
  );
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${P}/data-changes`,
        tags: TAGS,
        summary: "Antrean pengajuan (SA semua PT; HR ber-grant `employee.changes.review` PT-nya)",
        security,
        request: { query: dataChangeQueueQuerySchema },
        responses: {
          200: json("Antrean", paginatedEnvelope(dataChangeQueueRowSchema)),
          ...errors(400, 401, 403, 500),
        },
      }),
    ),
    async (c) => c.json(await service.listDataChangeQueue(ctx(c), c.req.valid("query")), 200),
  );
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${P}/data-changes/{id}`,
        tags: TAGS,
        summary:
          "Detail pengajuan: data sekarang vs usulan (pemilik atau pemeriksa berhak; diaudit)",
        security,
        request: { params: dataChangeIdParamSchema },
        responses: {
          200: json("Detail", dataEnvelope(dataChangeDetailSchema)),
          ...errors(401, 404, 500),
        },
      }),
    ),
    async (c) => c.json(ok(await service.getDataChange(ctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(
    guard(
      createRoute({
        method: "post",
        path: `${P}/data-changes/{id}/cancel`,
        tags: TAGS,
        summary: "Batalkan pengajuan sendiri yang masih menunggu",
        security,
        request: { params: dataChangeIdParamSchema },
        responses: { 200: json("Dibatalkan", dataEnvelope(dataChangeResultSchema)), ...write },
      }),
    ),
    async (c) => c.json(ok(await service.cancelDataChange(ctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(
    guard(
      createRoute({
        method: "post",
        path: `${P}/data-changes/{id}/decision`,
        tags: TAGS,
        summary: "Setujui (data langsung berlaku) atau tolak dengan alasan",
        security,
        request: { params: dataChangeIdParamSchema, ...body(dataChangeDecisionBodySchema) },
        responses: { 200: json("Diputuskan", dataEnvelope(dataChangeResultSchema)), ...write },
      }),
    ),
    async (c) =>
      c.json(
        ok(await service.decideDataChange(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${P}/archive/families`,
        tags: TAGS,
        summary: "Data Keluarga lintas karyawan (SA / grant `employee.personal.read`; diaudit)",
        security,
        request: { query: sensitiveArchiveQuerySchema },
        responses: {
          200: json("Data Keluarga", paginatedEnvelope(familyRowSchema)),
          ...errors(400, 401, 403, 500),
        },
      }),
    ),
    async (c) => c.json(await service.listFamilyArchive(ctx(c), c.req.valid("query")), 200),
  );
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${P}/archive/bank-accounts`,
        tags: TAGS,
        summary: "Data Bank lintas karyawan (SA / grant `employee.bank.read`; diaudit)",
        security,
        request: { query: sensitiveArchiveQuerySchema },
        responses: {
          200: json("Data Bank", paginatedEnvelope(bankRowSchema)),
          ...errors(400, 401, 403, 500),
        },
      }),
    ),
    async (c) => c.json(await service.listBankArchive(ctx(c), c.req.valid("query")), 200),
  );
}
