import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  type ArchiveCategory,
  educationInputSchema,
  movementTypeSchema,
  trainingInputSchema,
  workExperienceInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok, paginatedEnvelope } from "../../core/response.ts";
import {
  archiveExportParamSchema,
  archiveExportQuerySchema,
  archiveExportSchema,
  archiveListQuerySchema,
  archiveMutationSchema,
  contactRowSchema,
  educationRowSchema,
  employeeIdParamSchema,
  itemParamSchema,
  positionHistoryRowSchema,
  trainingRowSchema,
  workExperienceRowSchema,
} from "./archive.schema.ts";
import * as service from "./archive.service.ts";
import { exportArchive } from "./archive-export.service.ts";
import type { RequestContext } from "./employee.service.ts";

// D-054 (Arsip gelombang 1a): /api/v1/archive/<kategori> (tabel lintas karyawan) dan
// /api/v1/employees/{id}/<kategori>[/{itemId}] (kelola item per karyawan, SA/HR).

const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Employee Archive"];
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const write = errors(400, 401, 403, 404, 422, 500);

const LISTS: { category: ArchiveCategory; label: string; row: z.ZodType }[] = [
  { category: "contacts", label: "Data Kontak", row: contactRowSchema },
  { category: "educations", label: "Data Pendidikan", row: educationRowSchema },
  { category: "trainings", label: "Data Pelatihan", row: trainingRowSchema },
  { category: "work-experiences", label: "Data Riwayat Kerja", row: workExperienceRowSchema },
  { category: "position-histories", label: "Riwayat Jabatan", row: positionHistoryRowSchema },
];

// Riwayat lama: tanggal ≤ hari ini dicek service (zona Asia/Jakarta); SYSTEM hanya menerima
// movementType/decreeNumber/note.
const positionHistoryBodySchema = z
  .object({
    effectiveDate: z.iso.date().optional(),
    movementType: movementTypeSchema.nullable().optional(),
    toPositionId: z.uuid().nullable().optional(),
    toPositionName: z.string().max(100).nullable().optional(),
    toDepartmentName: z.string().max(100).nullable().optional(),
    decreeNumber: z.string().max(60).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .openapi("PositionHistoryInput");

const ITEMS: { category: service.ItemCategory; label: string; body: z.ZodType }[] = [
  { category: "educations", label: "pendidikan", body: educationInputSchema },
  { category: "trainings", label: "pelatihan", body: trainingInputSchema },
  { category: "work-experiences", label: "riwayat kerja", body: workExperienceInputSchema },
  { category: "position-histories", label: "riwayat jabatan", body: positionHistoryBodySchema },
];

function ctxOf(c: Context): RequestContext {
  return {
    actor: c.get("actor"),
    requestId: c.get("requestId"),
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
  };
}

export function registerArchiveRoutes(
  app: OpenAPIHono,
  deps: { protect: MiddlewareHandler[]; ctx?: (c: Context) => RequestContext },
): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: deps.protect });
  const ctx = deps.ctx ?? ctxOf;

  // D-058 (1d): ekspor Excel per kategori (filter tabel yang sama). Didaftarkan sebelum tabel supaya
  // tidak tertangkap route lain.
  app.openapi(
    guard(
      createRoute({
        method: "get",
        path: `${API_BASE_PATH}/archive/{category}/export`,
        tags: TAGS,
        summary:
          "Ekspor Excel tabel Arsip sesuai filter (SA/HR; maks 10.000 baris; isi sebatas hak lihat; diaudit)",
        security,
        request: { params: archiveExportParamSchema, query: archiveExportQuerySchema },
        responses: {
          200: json("File ekspor", dataEnvelope(archiveExportSchema)),
          ...errors(400, 401, 403, 422, 500),
        },
      }),
    ),
    async (c) =>
      c.json(
        ok(await exportArchive(ctx(c), c.req.valid("param").category, c.req.valid("query"))),
        200,
      ),
  );

  for (const { category, label, row } of LISTS) {
    const route = createRoute({
      method: "get",
      path: `${API_BASE_PATH}/archive/${category}`,
      tags: TAGS,
      summary: `${label}: tabel lintas karyawan (SA semua, HR PT ditugaskan, MANAGER tim)`,
      security,
      request: { query: archiveListQuerySchema },
      responses: {
        200: json(label, paginatedEnvelope(row)),
        ...errors(400, 401, 403, 500),
      },
    });
    app.openapi(guard(route), async (c) =>
      c.json(await service.listArchive(ctx(c), category, c.req.valid("query")), 200),
    );
  }

  for (const { category, label, body } of ITEMS) {
    const base = `${API_BASE_PATH}/employees/{id}/${category}`;
    const create = createRoute({
      method: "post",
      path: base,
      tags: TAGS,
      summary: `Tambah ${label} karyawan (SA/HR)`,
      security,
      request: {
        params: employeeIdParamSchema,
        body: { content: { "application/json": { schema: body } }, required: true },
      },
      responses: { 201: json("Dibuat", dataEnvelope(archiveMutationSchema)), ...write },
    });
    const update = createRoute({
      method: "patch",
      path: `${base}/{itemId}`,
      tags: TAGS,
      summary:
        category === "position-histories"
          ? "Ubah riwayat jabatan: riwayat lama (manual) penuh; riwayat otomatis hanya jenis perpindahan, no. SK, catatan (SA/HR)"
          : `Ubah ${label} karyawan (SA/HR)`,
      security,
      request: {
        params: itemParamSchema,
        body: { content: { "application/json": { schema: body } }, required: true },
      },
      responses: { 200: json("Diubah", dataEnvelope(archiveMutationSchema)), ...write },
    });
    const remove = createRoute({
      method: "delete",
      path: `${base}/{itemId}`,
      tags: TAGS,
      summary:
        category === "position-histories"
          ? "Hapus riwayat jabatan lama (manual); riwayat otomatis tidak bisa dihapus (SA/HR)"
          : `Hapus ${label} karyawan (SA/HR)`,
      security,
      request: { params: itemParamSchema },
      responses: { 200: json("Dihapus", dataEnvelope(archiveMutationSchema)), ...write },
    });
    app.openapi(guard(create), async (c) =>
      c.json(
        ok(
          await service.createItem(ctx(c), category, c.req.valid("param").id, c.req.valid("json")),
        ),
        201,
      ),
    );
    app.openapi(guard(update), async (c) => {
      const { id, itemId } = c.req.valid("param");
      return c.json(
        ok(await service.updateItem(ctx(c), category, id, itemId, c.req.valid("json"))),
        200,
      );
    });
    app.openapi(guard(remove), async (c) => {
      const { id, itemId } = c.req.valid("param");
      return c.json(ok(await service.deleteItem(ctx(c), category, id, itemId)), 200);
    });
  }
}
