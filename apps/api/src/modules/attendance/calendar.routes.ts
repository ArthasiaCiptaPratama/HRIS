import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import * as service from "./calendar.service.ts";

// Tahap A: kalender libur & pengaturan Time Management.
const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));

export const ctxOf = (c: Context): service.RequestContext => ({
  actor: c.get("actor"),
  requestId: c.get("requestId"),
  ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
});

// Skema OpenAPI didefinisikan dengan z milik zod-openapi (pola D-065); isi sama dengan @hris/shared.
const holidayKind = z.enum(["NATIONAL", "COLLECTIVE_LEAVE"]);
const holidaySchema = z
  .object({ id: z.uuid(), date: z.iso.date(), name: z.string(), kind: holidayKind })
  .openapi("Holiday");
const holidayInput = z
  .object({ date: z.iso.date(), name: z.string().trim().min(2).max(120), kind: holidayKind })
  .openapi("HolidayInput");
const settingsSchema = z
  .object({
    timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
    gpsAccuracyMaxM: z.number().int().min(10).max(1000),
    selfieRetentionMonths: z.number().int().min(1).max(36),
    approvalDueDays: z.number().int().min(1).max(14),
    rosterHorizonDays: z.number().int().min(14).max(370),
    checkOutEarlyMin: z
      .number()
      .int()
      .min(0)
      .max(240)
      .openapi({ description: "TM-D12: Clock Out normal dibuka sekian menit sebelum jam pulang" }),
  })
  .openapi("TimeSettings");
const idParam = z.object({ id: z.uuid() });
const yearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

const routes = {
  listHolidays: createRoute({
    method: "get",
    path: `${P}/holidays`,
    tags: TAGS,
    summary: "Kalender libur satu tahun (semua akun)",
    security,
    request: { query: yearQuery },
    responses: {
      200: json("Libur", dataEnvelope(z.array(holidaySchema))),
      ...errors(400, 401, 500),
    },
  }),
  importOfficial: createRoute({
    method: "post",
    path: `${P}/holidays/import-official`,
    tags: TAGS,
    summary: "Isi kalender dari libur resmi SKB 3 Menteri (SUPER_ADMIN; tidak menimpa)",
    security,
    request: body(z.object({ year: z.number().int().min(2000).max(2100) })),
    responses: {
      200: json(
        "Hasil",
        dataEnvelope(
          z.object({ year: z.number(), added: z.number(), skipped: z.number(), total: z.number() }),
        ),
      ),
      ...errors(400, 401, 403, 404, 500),
    },
  }),
  officialYears: createRoute({
    method: "get",
    path: `${P}/holidays/official-years`,
    tags: TAGS,
    summary: "Tahun yang tersedia data libur resmi bawaan",
    security,
    responses: {
      200: json("Tahun", dataEnvelope(z.array(z.number()))),
      ...errors(401, 500),
    },
  }),
  createHoliday: createRoute({
    method: "post",
    path: `${P}/holidays`,
    tags: TAGS,
    summary: "Tambah tanggal merah / cuti bersama (SUPER_ADMIN)",
    security,
    request: body(holidayInput),
    responses: {
      201: json("Dibuat", dataEnvelope(holidaySchema)),
      ...errors(400, 401, 403, 409, 500),
    },
  }),
  updateHoliday: createRoute({
    method: "put",
    path: `${P}/holidays/{id}`,
    tags: TAGS,
    summary: "Ubah libur (SUPER_ADMIN)",
    security,
    request: { params: idParam, ...body(holidayInput) },
    responses: {
      200: json("Diubah", dataEnvelope(holidaySchema)),
      ...errors(400, 401, 403, 404, 409, 500),
    },
  }),
  deleteHoliday: createRoute({
    method: "delete",
    path: `${P}/holidays/{id}`,
    tags: TAGS,
    summary: "Hapus libur (SUPER_ADMIN)",
    security,
    request: { params: idParam },
    responses: {
      200: json("Dihapus", dataEnvelope(z.object({ id: z.uuid() }))),
      ...errors(400, 401, 403, 404, 500),
    },
  }),
  getSettings: createRoute({
    method: "get",
    path: `${P}/time-settings`,
    tags: TAGS,
    summary: "Pengaturan Time Management (SA/HR)",
    security,
    responses: { 200: json("Pengaturan", dataEnvelope(settingsSchema)), ...errors(401, 403, 500) },
  }),
  updateSettings: createRoute({
    method: "put",
    path: `${P}/time-settings`,
    tags: TAGS,
    summary: "Ubah pengaturan Time Management (SUPER_ADMIN)",
    security,
    request: body(settingsSchema),
    responses: {
      200: json("Disimpan", dataEnvelope(settingsSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
};

export function registerCalendarRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: protect });
  app.openapi(guard(routes.listHolidays), async (c) =>
    c.json(ok(await service.listHolidays(ctxOf(c), c.req.valid("query").year)), 200),
  );
  app.openapi(guard(routes.importOfficial), async (c) =>
    c.json(ok(await service.importOfficialHolidays(ctxOf(c), c.req.valid("json").year)), 200),
  );
  app.openapi(guard(routes.officialYears), async (c) =>
    c.json(ok(service.officialHolidayYears()), 200),
  );
  app.openapi(guard(routes.createHoliday), async (c) =>
    c.json(ok(await service.createHoliday(ctxOf(c), c.req.valid("json"))), 201),
  );
  app.openapi(guard(routes.updateHoliday), async (c) =>
    c.json(
      ok(await service.updateHoliday(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(routes.deleteHoliday), async (c) =>
    c.json(ok(await service.deleteHoliday(ctxOf(c), c.req.valid("param").id)), 200),
  );
  app.openapi(guard(routes.getSettings), async (c) =>
    c.json(ok(await service.getTimeSettings(ctxOf(c))), 200),
  );
  app.openapi(guard(routes.updateSettings), async (c) =>
    c.json(ok(await service.updateTimeSettings(ctxOf(c), c.req.valid("json"))), 200),
  );
}
