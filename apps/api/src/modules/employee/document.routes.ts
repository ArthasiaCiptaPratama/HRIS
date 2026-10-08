import { createRoute, type OpenAPIHono, type z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok, paginatedEnvelope } from "../../core/response.ts";
import { archiveMutationSchema } from "./archive.schema.ts";
import {
  archiveDocumentRowSchema,
  documentBodySchema,
  documentCreateBodySchema,
  documentListQuerySchema,
  documentParamSchema,
  documentTypeInputBodySchema,
  documentTypeListQuerySchema,
  documentTypeSchema,
  documentUploadUrlBodySchema,
  documentUploadUrlSchema,
  documentUrlSchema,
  employeeDocumentsSchema,
  typeIdParamSchema,
} from "./document.schema.ts";
import * as service from "./document.service.ts";
import type { RequestContext } from "./employee.service.ts";

// D-055 (Arsip gelombang 1b): /document-types (master data SA), /archive/documents (Data File),
// /employees/{id}/documents[...] (dokumen per karyawan: unggah berversi, metadata, tautan baca).

const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Employee Documents"];
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
const TYPES = `${API_BASE_PATH}/document-types`;
const DOCS = `${API_BASE_PATH}/employees/{id}/documents`;

export function registerDocumentRoutes(
  app: OpenAPIHono,
  deps: { protect: MiddlewareHandler[]; ctx: (c: Context) => RequestContext },
): void {
  const guard = <R extends object>(r: R) => ({ ...r, middleware: deps.protect });
  const ctx = deps.ctx;
  const typeOut = json("Jenis dokumen", dataEnvelope(documentTypeSchema));

  // ── Jenis dokumen ──
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: TYPES,
        tags: TAGS,
        summary: "Daftar jenis dokumen (semua akun; arsip hanya SA)",
        security,
        request: { query: documentTypeListQuerySchema },
        responses: {
          200: json("Jenis dokumen", dataEnvelope(documentTypeSchema.array())),
          ...errors(401, 500),
        },
      }),
    ),
    async (c) =>
      c.json(
        ok(await service.listDocumentTypes(ctx(c), c.req.valid("query").archived === "include")),
        200,
      ),
  );
  app.openapi(
    guard(
      createRoute({
        method: "post",
        path: TYPES,
        tags: TAGS,
        summary: "Tambah jenis dokumen (SA)",
        security,
        request: body(documentTypeInputBodySchema),
        responses: { 201: typeOut, ...write },
      }),
    ),
    async (c) => c.json(ok(await service.createDocumentType(ctx(c), c.req.valid("json"))), 201),
  );
  app.openapi(
    guard(
      createRoute({
        method: "patch",
        path: `${TYPES}/{id}`,
        tags: TAGS,
        summary: "Ubah jenis dokumen (SA; kode terkunci setelah dipakai)",
        security,
        request: { params: typeIdParamSchema, ...body(documentTypeInputBodySchema) },
        responses: { 200: typeOut, ...write },
      }),
    ),
    async (c) =>
      c.json(
        ok(await service.updateDocumentType(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  for (const [action, archived] of [
    ["archive", true],
    ["restore", false],
  ] as const) {
    app.openapi(
      guard(
        createRoute({
          method: "post",
          path: `${TYPES}/{id}/${action}`,
          tags: TAGS,
          summary: archived ? "Arsipkan jenis dokumen (SA)" : "Pulihkan jenis dokumen (SA)",
          security,
          request: { params: typeIdParamSchema },
          responses: { 200: typeOut, ...write },
        }),
      ),
      async (c) =>
        c.json(
          ok(await service.setDocumentTypeArchived(ctx(c), c.req.valid("param").id, archived)),
          200,
        ),
    );
  }
  app.openapi(
    guard(
      createRoute({
        method: "delete",
        path: `${TYPES}/{id}`,
        tags: TAGS,
        summary: "Hapus permanen jenis dokumen yang belum pernah dipakai (SA)",
        security,
        request: { params: typeIdParamSchema },
        responses: { 200: json("Dihapus", dataEnvelope(archiveMutationSchema)), ...write },
      }),
    ),
    async (c) => c.json(ok(await service.deleteDocumentType(ctx(c), c.req.valid("param").id)), 200),
  );

  // ── Data File (tabel lintas karyawan) ──
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${API_BASE_PATH}/archive/documents`,
        tags: TAGS,
        summary:
          "Data File: dokumen versi aktif lintas karyawan (cakupan Arsip; jenis sensitif butuh grant)",
        security,
        request: { query: documentListQuerySchema },
        responses: {
          200: json("Data File", paginatedEnvelope(archiveDocumentRowSchema)),
          ...errors(400, 401, 403, 500),
        },
      }),
    ),
    async (c) => c.json(await service.listArchiveDocuments(ctx(c), c.req.valid("query")), 200),
  );

  // ── Dokumen per karyawan ──
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: DOCS,
        tags: TAGS,
        summary: "Dokumen karyawan (semua versi; jenis sensitif hanya bila berhak)",
        security,
        request: { params: typeIdParamSchema },
        responses: {
          200: json("Dokumen", dataEnvelope(employeeDocumentsSchema)),
          ...errors(401, 404, 500),
        },
      }),
    ),
    async (c) =>
      c.json(ok(await service.listEmployeeDocuments(ctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(
    guard(
      createRoute({
        method: "post",
        path: `${DOCS}/upload-url`,
        tags: TAGS,
        summary: "URL unggah dokumen (bucket private employee-documents; SA/HR)",
        security,
        request: { params: typeIdParamSchema, ...body(documentUploadUrlBodySchema) },
        responses: { 200: json("URL unggah", dataEnvelope(documentUploadUrlSchema)), ...write },
      }),
    ),
    async (c) =>
      c.json(
        ok(await service.createUploadUrl(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    guard(
      createRoute({
        method: "post",
        path: DOCS,
        tags: TAGS,
        summary:
          "Simpan dokumen setelah diunggah (jenis tunggal: menjadi versi baru; SA/HR, sensitif butuh grant tulis)",
        security,
        request: { params: typeIdParamSchema, ...body(documentCreateBodySchema) },
        responses: { 201: json("Dibuat", dataEnvelope(archiveMutationSchema)), ...write },
      }),
    ),
    async (c) =>
      c.json(
        ok(await service.createDocument(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
        201,
      ),
  );
  app.openapi(
    guard(
      createRoute({
        method: "patch",
        path: `${DOCS}/{documentId}`,
        tags: TAGS,
        summary: "Ubah nomor, tanggal terbit/kedaluwarsa, catatan dokumen (SA/HR)",
        security,
        request: { params: documentParamSchema, ...body(documentBodySchema) },
        responses: { 200: json("Diubah", dataEnvelope(archiveMutationSchema)), ...write },
      }),
    ),
    async (c) => {
      const { id, documentId } = c.req.valid("param");
      return c.json(
        ok(await service.updateDocument(ctx(c), id, documentId, c.req.valid("json"))),
        200,
      );
    },
  );
  app.openapi(
    guard(
      createRoute({
        method: "delete",
        path: `${DOCS}/{documentId}`,
        tags: TAGS,
        summary: "Hapus satu versi dokumen (versi sebelumnya aktif kembali; SA/HR)",
        security,
        request: { params: documentParamSchema },
        responses: { 200: json("Dihapus", dataEnvelope(archiveMutationSchema)), ...write },
      }),
    ),
    async (c) => {
      const { id, documentId } = c.req.valid("param");
      return c.json(ok(await service.deleteDocument(ctx(c), id, documentId)), 200);
    },
  );
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${DOCS}/{documentId}/url`,
        tags: TAGS,
        summary: "Tautan baca dokumen (5 menit; jenis sensitif diaudit)",
        security,
        request: { params: documentParamSchema },
        responses: {
          200: json("Tautan", dataEnvelope(documentUrlSchema)),
          ...errors(401, 404, 500),
        },
      }),
    ),
    async (c) => {
      const { id, documentId } = c.req.valid("param");
      return c.json(ok(await service.documentUrl(ctx(c), id, documentId)), 200);
    },
  );
}
