import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok, paginatedEnvelope } from "../../core/response.ts";
import * as s from "./asset.schema.ts";
import * as service from "./asset.service.ts";

// ARS-D1–D6 (Arsip gelombang 2a): kategori aset, jenis APD, aset per unit + serah-terima, pembagian APD,
// BAST, pegangan per karyawan, Layanan Mandiri, dan daftar belum kembali dari karyawan keluar.

export interface AssetRouteDeps {
  protect: MiddlewareHandler[];
}

const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Asset"];
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const read = errors(400, 401, 403, 404, 500);
const write = errors(400, 401, 403, 404, 409, 422, 500);

const ctxOf = (c: Context): service.RequestContext => ({
  actor: c.get("actor"),
  requestId: c.get("requestId"),
  ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
});

export function registerAssetRoutes(app: OpenAPIHono, deps: AssetRouteDeps): void {
  const guard = <R extends object>(r: R) => ({ ...r, middleware: deps.protect });
  const route = <R extends Parameters<typeof createRoute>[0]>(r: R) =>
    guard(createRoute({ tags: TAGS, security, ...r }));

  // --- Master ---
  app.openapi(
    route({
      method: "get",
      path: `${P}/asset-categories`,
      summary: "Kategori aset (SA/HR/MANAGER)",
      responses: { 200: json("Kategori", dataEnvelope(z.array(s.categorySchema))), ...read },
    }),
    async (c) => c.json(ok(await service.listCategories(ctxOf(c))), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/asset-categories`,
      summary: "Tambah kategori aset (SA / asset.manage)",
      request: body(s.categoryBodySchema),
      responses: { 201: json("Dibuat", dataEnvelope(s.categorySchema)), ...write },
    }),
    async (c) => c.json(ok(await service.saveCategory(ctxOf(c), null, c.req.valid("json"))), 201),
  );
  app.openapi(
    route({
      method: "put",
      path: `${P}/asset-categories/{id}`,
      summary: "Ubah / arsipkan kategori aset",
      request: { params: s.idParamSchema, ...body(s.categoryBodySchema) },
      responses: { 200: json("Diubah", dataEnvelope(s.categorySchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.saveCategory(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/ppe-types`,
      summary: "Jenis APD/seragam (SA/HR/MANAGER)",
      responses: { 200: json("Jenis APD", dataEnvelope(z.array(s.ppeTypeSchema))), ...read },
    }),
    async (c) => c.json(ok(await service.listPpeTypes(ctxOf(c))), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/ppe-types`,
      summary: "Tambah jenis APD (SA / asset.manage)",
      request: body(s.ppeTypeBodySchema),
      responses: { 201: json("Dibuat", dataEnvelope(s.ppeTypeSchema)), ...write },
    }),
    async (c) => c.json(ok(await service.savePpeType(ctxOf(c), null, c.req.valid("json"))), 201),
  );
  app.openapi(
    route({
      method: "put",
      path: `${P}/ppe-types/{id}`,
      summary: "Ubah / arsipkan jenis APD",
      request: { params: s.idParamSchema, ...body(s.ppeTypeBodySchema) },
      responses: { 200: json("Diubah", dataEnvelope(s.ppeTypeSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.savePpeType(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );

  // --- Aset ---
  app.openapi(
    route({
      method: "get",
      path: `${P}/assets`,
      summary:
        "Daftar aset (SA semua, HR PT ditugaskan, MANAGER aset yang dipegang tim; harga hanya pengelola)",
      request: { query: s.assetListQuerySchema },
      responses: { 200: json("Aset", paginatedEnvelope(s.assetSchema)), ...read },
    }),
    async (c) => c.json(await service.listAssets(ctxOf(c), c.req.valid("query")), 200),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/assets/next-code`,
      summary: "Usulan kode aset <PT>-<KATEGORI>-<NNNN> (ARS-D4)",
      request: { query: s.nextCodeQuerySchema },
      responses: { 200: json("Usulan", dataEnvelope(s.codeSchema)), ...read },
    }),
    async (c) => {
      const q = c.req.valid("query");
      return c.json(ok(await service.suggestCode(ctxOf(c), q.companyId, q.categoryId)), 200);
    },
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/assets`,
      summary: "Tambah aset (SA / asset.manage di PT aset; kode kosong = otomatis)",
      request: body(s.assetBodySchema),
      responses: { 201: json("Dibuat", dataEnvelope(s.assetSchema)), ...write },
    }),
    async (c) => c.json(ok(await service.createAsset(ctxOf(c), c.req.valid("json"))), 201),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/assets/{id}`,
      summary: "Detail aset + riwayat pemegang",
      request: { params: s.idParamSchema },
      responses: { 200: json("Detail", dataEnvelope(s.assetDetailSchema)), ...read },
    }),
    async (c) => c.json(ok(await service.getAsset(ctxOf(c), c.req.valid("param").id)), 200),
  );
  app.openapi(
    route({
      method: "put",
      path: `${P}/assets/{id}`,
      summary: "Ubah data aset",
      request: { params: s.idParamSchema, ...body(s.assetBodySchema) },
      responses: { 200: json("Diubah", dataEnvelope(s.assetSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.updateAsset(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/assets/{id}/status`,
      summary: "Ubah status aset tidak dipegang (Tersedia / Perbaikan / Tidak dipakai)",
      request: { params: s.idParamSchema, ...body(s.assetStatusBodySchema) },
      responses: { 200: json("Diubah", dataEnvelope(s.assetSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.setAssetStatus(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/assets/{id}/assign`,
      summary: "Serahkan aset ke karyawan PT pemilik aset (satu pemegang aktif)",
      request: { params: s.idParamSchema, ...body(s.assignBodySchema) },
      responses: { 201: json("Diserahkan", dataEnvelope(s.assignmentSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.assignAsset(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        201,
      ),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/asset-assignments/{id}/return`,
      summary: "Terima pengembalian aset",
      request: { params: s.idParamSchema, ...body(s.returnBodySchema) },
      responses: { 200: json("Dikembalikan", dataEnvelope(s.assignmentSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.returnAsset(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/asset-assignments/{id}/lost`,
      summary: "Tandai aset hilang (keterangan wajib)",
      request: { params: s.idParamSchema, ...body(s.lostBodySchema) },
      responses: { 200: json("Ditandai hilang", dataEnvelope(s.assignmentSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.markAssetLost(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/asset-assignments/{id}/bast`,
      summary: "Lampirkan scan BAST (dokumen karyawan pemegang berjenis BAST_ASSET)",
      request: { params: s.idParamSchema, ...body(s.bastBodySchema) },
      responses: { 200: json("Dilampirkan", dataEnvelope(s.assignmentSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(
          await service.attachAssignmentBast(
            ctxOf(c),
            c.req.valid("param").id,
            c.req.valid("json"),
          ),
        ),
        200,
      ),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/asset-assignments/{id}/bast-pdf`,
      summary: "PDF BAST serah-terima / pengembalian (dibuat saat diminta, tidak disimpan)",
      request: { params: s.idParamSchema, query: s.bastQuerySchema },
      responses: {
        200: json("PDF", dataEnvelope(s.fileSchema)),
        ...errors(400, 401, 403, 404, 422, 500),
      },
    }),
    async (c) =>
      c.json(
        ok(
          await service.assignmentBast(
            ctxOf(c),
            c.req.valid("param").id,
            c.req.valid("query").kind,
          ),
        ),
        200,
      ),
  );

  // --- Pegangan & belum kembali ---
  app.openapi(
    route({
      method: "get",
      path: `${P}/asset-holdings/{employeeId}`,
      summary:
        "Aset & APD yang dipegang karyawan (detail karyawan / dialog nonaktifkan; openOnly = belum kembali)",
      request: { params: s.employeeParamSchema, query: s.holdingsQuerySchema },
      responses: { 200: json("Pegangan", dataEnvelope(s.holdingsSchema)), ...read },
    }),
    async (c) =>
      c.json(
        ok(
          await service.employeeHoldings(
            ctxOf(c),
            c.req.valid("param").employeeId,
            c.req.valid("query").openOnly,
          ),
        ),
        200,
      ),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/asset-returns/pending`,
      summary: "Belum kembali dari karyawan keluar (SA / HR PT ditugaskan; ARS-D6)",
      responses: {
        200: json("Belum kembali", dataEnvelope(z.array(s.pendingReturnSchema))),
        ...read,
      },
    }),
    async (c) => c.json(ok(await service.pendingReturns(ctxOf(c))), 200),
  );

  // --- APD ---
  app.openapi(
    route({
      method: "get",
      path: `${P}/ppe-issues`,
      summary:
        "Pembagian APD (cakupan sama dengan daftar aset; replacement=DUE = jatuh tempo ganti)",
      request: { query: s.ppeListQuerySchema },
      responses: { 200: json("Pembagian APD", paginatedEnvelope(s.ppeIssueRowSchema)), ...read },
    }),
    async (c) => c.json(await service.listPpeIssues(ctxOf(c), c.req.valid("query")), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/ppe-issues`,
      summary: "Catat pembagian APD ke karyawan (SA / asset.manage PT karyawan)",
      request: body(s.ppeIssueBodySchema),
      responses: { 201: json("Dicatat", dataEnvelope(s.ppeIssueSchema)), ...write },
    }),
    async (c) => c.json(ok(await service.createPpeIssue(ctxOf(c), c.req.valid("json"))), 201),
  );
  app.openapi(
    route({
      method: "delete",
      path: `${P}/ppe-issues/{id}`,
      summary: "Hapus pembagian salah input (belum dikonfirmasi & tanpa BAST)",
      request: { params: s.idParamSchema },
      responses: { 204: { description: "Dihapus" }, ...write },
    }),
    async (c) => {
      await service.deletePpeIssue(ctxOf(c), c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/ppe-issues/{id}/return`,
      summary: "Terima pengembalian APD wajib kembali",
      request: { params: s.idParamSchema, ...body(s.ppeReturnBodySchema) },
      responses: { 200: json("Dikembalikan", dataEnvelope(s.ppeIssueSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.returnPpe(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/ppe-issues/{id}/bast`,
      summary: "Lampirkan scan BAST pembagian APD",
      request: { params: s.idParamSchema, ...body(s.ppeBastBodySchema) },
      responses: { 200: json("Dilampirkan", dataEnvelope(s.ppeIssueSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.attachPpeBast(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/ppe-issues/{id}/bast-pdf`,
      summary: "PDF BAST pembagian APD",
      request: { params: s.idParamSchema },
      responses: { 200: json("PDF", dataEnvelope(s.fileSchema)), ...read },
    }),
    async (c) => c.json(ok(await service.ppeBast(ctxOf(c), c.req.valid("param").id)), 200),
  );

  // --- Layanan Mandiri (ARS-D2) ---
  app.openapi(
    route({
      method: "get",
      path: `${P}/self/assets`,
      summary: "Aset & APD milik sendiri (tanpa harga)",
      responses: {
        200: json("Milik sendiri", dataEnvelope(s.holdingsSchema)),
        ...errors(401, 500),
      },
    }),
    async (c) => c.json(ok(await service.selfHoldings(ctxOf(c))), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/self/asset-assignments/{id}/acknowledge`,
      summary: 'Konfirmasi "Sudah saya terima" aset (pemegang sendiri)',
      request: { params: s.idParamSchema },
      responses: {
        200: json("Dikonfirmasi", dataEnvelope(s.assignmentSchema)),
        ...errors(401, 404, 422, 500),
      },
    }),
    async (c) =>
      c.json(ok(await service.acknowledgeAssignment(ctxOf(c), c.req.valid("param").id)), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/self/ppe-issues/{id}/acknowledge`,
      summary: 'Konfirmasi "Sudah saya terima" APD (penerima sendiri)',
      request: { params: s.idParamSchema },
      responses: {
        200: json("Dikonfirmasi", dataEnvelope(s.ppeIssueSchema)),
        ...errors(401, 404, 500),
      },
    }),
    async (c) => c.json(ok(await service.acknowledgePpe(ctxOf(c), c.req.valid("param").id)), 200),
  );
}
