import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok, paginatedEnvelope } from "../../core/response.ts";
import * as s from "./discipline.schema.ts";
import * as service from "./discipline.service.ts";

// ARS-D7–D13 (Arsip gelombang 2b, D-057): jenis pelanggaran, pengaturan masa berlaku, surat peringatan
// (draft → terbit → konfirmasi / cabut), PDF, scan, bukti ALPHA, dan Layanan Mandiri.

export interface DisciplineRouteDeps {
  protect: MiddlewareHandler[];
}

const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Discipline"];
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

export function registerDisciplineRoutes(app: OpenAPIHono, deps: DisciplineRouteDeps): void {
  const guard = <R extends object>(r: R) => ({ ...r, middleware: deps.protect });
  const route = <R extends Parameters<typeof createRoute>[0]>(r: R) =>
    guard(createRoute({ tags: TAGS, security, ...r }));

  // --- Master & pengaturan ---
  app.openapi(
    route({
      method: "get",
      path: `${P}/violation-types`,
      summary: "Jenis pelanggaran (SA / HR ber-grant SP)",
      responses: {
        200: json("Jenis pelanggaran", dataEnvelope(z.array(s.violationTypeSchema))),
        ...read,
      },
    }),
    async (c) => c.json(ok(await service.listViolationTypes(ctxOf(c))), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/violation-types`,
      summary: "Tambah jenis pelanggaran (SA / employee.discipline.write)",
      request: body(s.violationTypeBodySchema),
      responses: { 201: json("Dibuat", dataEnvelope(s.violationTypeSchema)), ...write },
    }),
    async (c) =>
      c.json(ok(await service.saveViolationType(ctxOf(c), null, c.req.valid("json"))), 201),
  );
  app.openapi(
    route({
      method: "put",
      path: `${P}/violation-types/{id}`,
      summary: "Ubah / arsipkan jenis pelanggaran",
      request: { params: s.idParamSchema, ...body(s.violationTypeBodySchema) },
      responses: { 200: json("Diubah", dataEnvelope(s.violationTypeSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.saveViolationType(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/discipline-settings`,
      summary: "Pengaturan SP: masa berlaku bawaan (ARS-D8)",
      responses: { 200: json("Pengaturan", dataEnvelope(s.settingsSchema)), ...read },
    }),
    async (c) => c.json(ok(await service.getSettings(ctxOf(c))), 200),
  );
  app.openapi(
    route({
      method: "put",
      path: `${P}/discipline-settings`,
      summary: "Ubah masa berlaku bawaan SP (SA saja)",
      request: body(s.settingsBodySchema),
      responses: { 200: json("Diubah", dataEnvelope(s.settingsSchema)), ...write },
    }),
    async (c) => c.json(ok(await service.updateSettings(ctxOf(c), c.req.valid("json"))), 200),
  );

  // --- Surat peringatan ---
  app.openapi(
    route({
      method: "get",
      path: `${P}/warning-letters`,
      summary: "Daftar SP (SA semua, HR ber-grant PT ditugaskan, MANAGER tim; draft hanya penulis)",
      request: { query: s.letterListQuerySchema },
      responses: { 200: json("SP", paginatedEnvelope(s.letterSchema)), ...read },
    }),
    async (c) => c.json(await service.listLetters(ctxOf(c), c.req.valid("query")), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/warning-letters`,
      summary: "Buat draft SP (SA / employee.discipline.write di PT karyawan)",
      request: body(s.draftBodySchema),
      responses: { 201: json("Draft dibuat", dataEnvelope(s.letterSchema)), ...write },
    }),
    async (c) => c.json(ok(await service.createDraft(ctxOf(c), c.req.valid("json"))), 201),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/warning-letters/bulk`,
      summary: "Buat draft SP untuk banyak karyawan sekaligus (ARS-D20; satu transaksi)",
      request: body(s.bulkDraftBodySchema),
      responses: {
        201: json("Draft dibuat", dataEnvelope(z.array(s.letterSchema))),
        ...write,
      },
    }),
    async (c) => c.json(ok(await service.createDrafts(ctxOf(c), c.req.valid("json"))), 201),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/warning-letters/suggestion/{employeeId}`,
      summary: "Saran tingkat SP berikut + SP yang masih berlaku (ARS-D10)",
      request: { params: s.employeeParamSchema },
      responses: { 200: json("Saran", dataEnvelope(s.suggestionSchema)), ...read },
    }),
    async (c) =>
      c.json(ok(await service.suggestion(ctxOf(c), c.req.valid("param").employeeId)), 200),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/warning-letters/alpha-days/{employeeId}`,
      summary: "Hari ALPHA karyawan + surat pernyataan, untuk ditautkan ke SP mangkir (ARS-D12)",
      request: { params: s.employeeParamSchema },
      responses: { 200: json("Hari ALPHA", dataEnvelope(s.alphaCandidatesSchema)), ...read },
    }),
    async (c) =>
      c.json(ok(await service.alphaCandidates(ctxOf(c), c.req.valid("param").employeeId)), 200),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/warning-letters/employee/{employeeId}`,
      summary: "SP seorang karyawan (tab SP di detail karyawan)",
      request: { params: s.employeeParamSchema },
      responses: { 200: json("SP karyawan", dataEnvelope(z.array(s.letterSchema))), ...read },
    }),
    async (c) =>
      c.json(ok(await service.employeeLetters(ctxOf(c), c.req.valid("param").employeeId)), 200),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/warning-letters/{id}`,
      summary: "Detail SP (+ bukti ALPHA untuk HR)",
      request: { params: s.idParamSchema },
      responses: { 200: json("Detail", dataEnvelope(s.letterDetailSchema)), ...read },
    }),
    async (c) => c.json(ok(await service.getLetter(ctxOf(c), c.req.valid("param").id)), 200),
  );
  app.openapi(
    route({
      method: "put",
      path: `${P}/warning-letters/{id}`,
      summary: "Ubah draft SP (SP terbit tidak bisa diubah)",
      request: { params: s.idParamSchema, ...body(s.draftBodySchema) },
      responses: { 200: json("Diubah", dataEnvelope(s.letterDetailSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.updateDraft(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "delete",
      path: `${P}/warning-letters/{id}`,
      summary: "Hapus draft SP",
      request: { params: s.idParamSchema },
      responses: { 204: { description: "Dihapus" }, ...write },
    }),
    async (c) => {
      await service.deleteDraft(ctxOf(c), c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/warning-letters/{id}/issue`,
      summary: "Terbitkan SP (nomor otomatis/manual, berlaku s/d dari pengaturan, notifikasi)",
      request: { params: s.idParamSchema, ...body(s.issueBodySchema) },
      responses: { 200: json("Terbit", dataEnvelope(s.letterDetailSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.issueLetter(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/warning-letters/{id}/revoke`,
      summary: "Cabut SP berlaku (alasan wajib, diaudit)",
      request: { params: s.idParamSchema, ...body(s.revokeBodySchema) },
      responses: { 200: json("Dicabut", dataEnvelope(s.letterDetailSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.revokeLetter(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/warning-letters/{id}/deliver`,
      summary: '"Sudah disampaikan" oleh atasan (ARS-D9)',
      request: { params: s.idParamSchema },
      responses: { 200: json("Dikonfirmasi", dataEnvelope(s.letterDetailSchema)), ...write },
    }),
    async (c) => c.json(ok(await service.deliverLetter(ctxOf(c), c.req.valid("param").id)), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/warning-letters/{id}/scan`,
      summary: "Lampirkan scan SP bertanda tangan (dokumen WARNING_LETTER karyawan)",
      request: { params: s.idParamSchema, ...body(s.scanBodySchema) },
      responses: { 200: json("Dilampirkan", dataEnvelope(s.letterDetailSchema)), ...write },
    }),
    async (c) =>
      c.json(
        ok(await service.attachScan(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  app.openapi(
    route({
      method: "get",
      path: `${P}/warning-letters/{id}/pdf`,
      summary: "PDF surat dari template sistem (draft bertanda DRAF; tidak disimpan)",
      request: { params: s.idParamSchema },
      responses: { 200: json("PDF", dataEnvelope(s.fileSchema)), ...read },
    }),
    async (c) => c.json(ok(await service.letterPdf(ctxOf(c), c.req.valid("param").id)), 200),
  );

  // --- Layanan Mandiri ---
  app.openapi(
    route({
      method: "get",
      path: `${P}/self/warning-letters`,
      summary: "SP milik sendiri (aktif + riwayat)",
      responses: {
        200: json("Milik sendiri", dataEnvelope(z.array(s.letterSchema))),
        ...errors(401, 500),
      },
    }),
    async (c) => c.json(ok(await service.selfLetters(ctxOf(c))), 200),
  );
  app.openapi(
    route({
      method: "post",
      path: `${P}/self/warning-letters/{id}/acknowledge`,
      summary: '"Sudah menerima" oleh karyawan penerima (ARS-D9)',
      request: { params: s.idParamSchema },
      responses: {
        200: json("Dikonfirmasi", dataEnvelope(s.letterDetailSchema)),
        ...errors(401, 404, 422, 500),
      },
    }),
    async (c) =>
      c.json(ok(await service.acknowledgeLetter(ctxOf(c), c.req.valid("param").id)), 200),
  );
}
