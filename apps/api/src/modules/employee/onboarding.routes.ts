import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { onboardingBatchInputSchema } from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import {
  batchIdParamSchema,
  batchSchema,
  candidateListQuerySchema,
  candidateSchema,
  employeeIdParamSchema,
  inviteExistingBodySchema,
  inviteExistingResultSchema,
  previewBodySchema,
  previewResultSchema,
  processResultSchema,
  statusCountsSchema,
} from "./onboarding.schema.ts";
import * as service from "./onboarding.service.ts";

// D-045 bagian a: Penerimaan Karyawan Baru (SA semua PT, HR PT ditugaskan — policy di service).

const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Onboarding"];
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
    path: `${P}/onboarding-batches/preview`,
    tags: TAGS,
    summary: "Pratinjau calon lolos: validasi per baris + usulan nomor induk (tanpa menulis)",
    security,
    request: body(previewBodySchema),
    responses: {
      200: json("Pratinjau", dataEnvelope(previewResultSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
  create: createRoute({
    method: "post",
    path: `${P}/onboarding-batches`,
    tags: TAGS,
    summary: "Simpan penerimaan (1 transaksi): calon + antrean undangan",
    security,
    request: body(onboardingBatchInputSchema),
    responses: {
      201: json("Penerimaan", dataEnvelope(batchSchema)),
      ...errors(400, 401, 403, 409, 422, 500),
    },
  }),
  listBatches: createRoute({
    method: "get",
    path: `${P}/onboarding-batches`,
    tags: TAGS,
    summary: "Riwayat penerimaan (100 terbaru, sesuai cakupan PT)",
    security,
    responses: {
      200: json("Penerimaan", dataEnvelope(z.array(batchSchema))),
      ...errors(401, 403, 500),
    },
  }),
  getBatch: createRoute({
    method: "get",
    path: `${P}/onboarding-batches/{id}`,
    tags: TAGS,
    summary: "Detail & progres undangan satu penerimaan",
    security,
    request: { params: batchIdParamSchema },
    responses: {
      200: json("Penerimaan", dataEnvelope(batchSchema)),
      ...errors(401, 403, 404, 500),
    },
  }),
  process: createRoute({
    method: "post",
    path: `${P}/onboarding-invitations/process`,
    tags: TAGS,
    summary: "Kirim ≤ 10 undangan dari antrean (di bawah batas per jam)",
    security,
    responses: {
      200: json("Hasil", dataEnvelope(processResultSchema)),
      ...errors(401, 403, 500),
    },
  }),
  list: createRoute({
    method: "get",
    path: `${P}/onboarding`,
    tags: TAGS,
    summary: "Daftar calon & karyawan yang diundang melengkapi data (per status/batch/PT)",
    security,
    request: { query: candidateListQuerySchema },
    responses: {
      200: json(
        "Calon",
        z.object({
          data: z.array(candidateSchema),
          meta: z.object({
            page: z.number().int(),
            pageSize: z.number().int(),
            total: z.number().int(),
            counts: statusCountsSchema,
          }),
        }),
      ),
      ...errors(400, 401, 403, 500),
    },
  }),
  resend: createRoute({
    method: "post",
    path: `${P}/onboarding/{employeeId}/resend-invitation`,
    tags: TAGS,
    summary: "Undang sekarang / kirim ulang undangan (masuk antrean)",
    security,
    request: { params: employeeIdParamSchema },
    responses: {
      200: json("Antre", dataEnvelope(z.object({ employeeId: z.uuid(), queued: z.boolean() }))),
      ...errors(401, 403, 404, 409, 422, 500),
    },
  }),
  inviteExisting: createRoute({
    method: "post",
    path: `${P}/onboarding/invite-existing`,
    tags: TAGS,
    summary: "Undang karyawan existing tanpa akun (diminta melengkapi data kosong)",
    security,
    request: body(inviteExistingBodySchema),
    responses: {
      200: json("Hasil", dataEnvelope(inviteExistingResultSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
};

export function registerOnboardingRoutes(
  app: OpenAPIHono,
  deps: { protect: MiddlewareHandler[]; invitations: service.InvitationDeps },
): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: deps.protect });
  const ctx = (c: Context): service.OnboardingContext => ({
    actor: c.get("actor"),
    requestId: c.get("requestId"),
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
  });
  app.openapi(guard(routes.preview), async (c) =>
    c.json(ok(await service.previewBatch(ctx(c), c.req.valid("json").candidates)), 200),
  );
  app.openapi(guard(routes.create), async (c) =>
    c.json(ok(await service.createBatch(ctx(c), c.req.valid("json"))), 201),
  );
  app.openapi(guard(routes.listBatches), async (c) =>
    c.json(ok(await service.listBatches(ctx(c))), 200),
  );
  app.openapi(guard(routes.getBatch), async (c) =>
    c.json(ok(await service.getBatch(ctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(guard(routes.process), async (c) =>
    c.json(ok(await service.processInvitations(c.get("actor"), deps.invitations)), 200),
  );
  app.openapi(guard(routes.list), async (c) => {
    const query = c.req.valid("query");
    const result = await service.listCandidates(ctx(c), query);
    return c.json(
      {
        data: result.rows,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          counts: result.counts,
        },
      },
      200,
    );
  });
  app.openapi(guard(routes.resend), async (c) =>
    c.json(ok(await service.resendInvitation(ctx(c), c.req.valid("param").employeeId)), 200),
  );
  app.openapi(guard(routes.inviteExisting), async (c) =>
    c.json(ok(await service.inviteExisting(ctx(c), c.req.valid("json"))), 200),
  );
}
