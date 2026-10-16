import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import * as service from "./report.service.ts";

// ARS-D16/D17 (Arsip gelombang 3, Laporan batch 1): 4 laporan + ekspor Excel. Query divalidasi skema
// @hris/shared di service; respons ditulis longgar di OpenAPI (bentuk lengkap: report.service.ts).

export interface ReportRouteDeps {
  protect: MiddlewareHandler[];
}

const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Report"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const read = errors(400, 401, 403, 422, 500);
const filterQuery = z.object({
  companyId: z.uuid().optional(),
  unitId: z.uuid().optional(),
  workLocationId: z.uuid().optional(),
});
const yearQuery = filterQuery.extend({ year: z.coerce.number().int().min(2000).max(2100) });
const loose = (name: string) => z.record(z.string(), z.unknown()).openapi(name);
const fileSchema = z
  .object({ fileName: z.string(), rows: z.number(), contentBase64: z.string() })
  .openapi("ReportFile");
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});

const ctxOf = (c: Context): service.RequestContext => ({
  actor: c.get("actor"),
  requestId: c.get("requestId"),
  ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
});

const REPORTS = [
  {
    kind: "headcount",
    query: yearQuery,
    run: service.headcountReport,
    summary: "Headcount & turnover per bulan (tahun)",
  },
  {
    kind: "document-expiry",
    query: filterQuery,
    run: service.documentExpiryReport,
    summary: "Dokumen kedaluwarsa & ≤ 30/60/90 hari",
  },
  {
    kind: "completeness",
    query: filterQuery,
    run: service.completenessReport,
    summary: "Kelengkapan data inti & dokumen wajib",
  },
  {
    kind: "warning-letters",
    query: yearQuery,
    run: service.warningLettersReport,
    summary: "SP aktif, tren terbit per bulan",
  },
] as const;

export function registerReportRoutes(app: OpenAPIHono, deps: ReportRouteDeps): void {
  const route = <R extends Parameters<typeof createRoute>[0]>(r: R) => ({
    ...createRoute({ tags: TAGS, security, ...r }),
    middleware: deps.protect,
  });
  for (const r of REPORTS) {
    app.openapi(
      route({
        method: "get",
        path: `${P}/reports/${r.kind}`,
        summary: `${r.summary} (SA / HR PT ditugaskan; ARS-D16)`,
        request: { query: r.query },
        responses: { 200: json("Laporan", dataEnvelope(loose(`Report_${r.kind}`))), ...read },
      }),
      async (c) => c.json(ok(await r.run(ctxOf(c), c.req.query())), 200),
    );
    app.openapi(
      route({
        method: "get",
        path: `${P}/reports/${r.kind}/export`,
        summary: `Ekspor Excel: ${r.summary} (diaudit, maks 10.000 baris)`,
        request: { query: r.query },
        responses: { 200: json("File", dataEnvelope(fileSchema)), ...read },
      }),
      async (c) => c.json(ok(await service.exportReport(ctxOf(c), r.kind, c.req.query())), 200),
    );
  }
}
