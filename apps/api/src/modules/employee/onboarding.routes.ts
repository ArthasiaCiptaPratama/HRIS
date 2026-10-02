import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { onboardingBatchInputSchema } from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import type { StorageAdmin } from "../../core/storage.ts";
import {
  batchIdParamSchema,
  batchSchema,
  candidateListQuerySchema,
  candidateSchema,
  decisionResultSchema,
  documentConfirmBodySchema,
  documentIdParamSchema,
  documentUploadUrlBodySchema,
  documentUploadUrlSchema,
  employeeIdParamSchema,
  inviteExistingBodySchema,
  inviteExistingResultSchema,
  myOnboardingSchema,
  onboardingReviewSchema,
  previewBodySchema,
  previewResultSchema,
  processResultSchema,
  sectionParamSchema,
  statusCountsSchema,
} from "./onboarding.schema.ts";
import * as service from "./onboarding.service.ts";
import * as review from "./onboarding-review.service.ts";
import * as wizard from "./onboarding-wizard.service.ts";

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
    summary: "Undang karyawan terdaftar tanpa akun (diminta melengkapi data kosong)",
    security,
    request: body(inviteExistingBodySchema),
    responses: {
      200: json("Hasil", dataEnvelope(inviteExistingResultSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
};

const wizardRoutes = {
  me: createRoute({
    method: "get",
    path: `${P}/onboarding/me`,
    tags: TAGS,
    summary: "Wizard: data onboarding milik sendiri + daftar kekurangan",
    security,
    responses: {
      200: json("Onboarding", dataEnvelope(myOnboardingSchema)),
      ...errors(401, 403, 404, 500),
    },
  }),
  save: createRoute({
    method: "put",
    path: `${P}/onboarding/me/{section}`,
    tags: TAGS,
    summary: "Wizard: simpan draf satu bagian (calon: semua; existing: hanya field kosong)",
    security,
    request: {
      params: sectionParamSchema,
      body: {
        content: { "application/json": { schema: z.record(z.string(), z.unknown()) } },
        required: true,
      },
    },
    responses: {
      200: json("Onboarding", dataEnvelope(myOnboardingSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
  uploadUrl: createRoute({
    method: "post",
    path: `${P}/onboarding/me/documents/upload-url`,
    tags: TAGS,
    summary: "Wizard: URL unggah dokumen (bucket private employee-documents)",
    security,
    request: body(documentUploadUrlBodySchema),
    responses: {
      200: json("URL unggah", dataEnvelope(documentUploadUrlSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
  confirm: createRoute({
    method: "post",
    path: `${P}/onboarding/me/documents`,
    tags: TAGS,
    summary: "Wizard: konfirmasi dokumen terunggah (cek tipe & ukuran)",
    security,
    request: body(documentConfirmBodySchema),
    responses: {
      201: json("Dokumen", dataEnvelope(z.object({ id: z.uuid() }))),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
  removeDocument: createRoute({
    method: "delete",
    path: `${P}/onboarding/me/documents/{id}`,
    tags: TAGS,
    summary: "Wizard: hapus dokumen sendiri",
    security,
    request: { params: documentIdParamSchema },
    responses: {
      200: json("Dihapus", dataEnvelope(z.object({ id: z.uuid() }))),
      ...errors(401, 403, 404, 422, 500),
    },
  }),
  submit: createRoute({
    method: "post",
    path: `${P}/onboarding/me/submit`,
    tags: TAGS,
    summary: "Wizard: kirim untuk direview (hanya bila data wajib lengkap)",
    security,
    responses: {
      200: json("Onboarding", dataEnvelope(myOnboardingSchema)),
      ...errors(401, 403, 404, 422, 500),
    },
  }),
};

// D-045 c: review (SA, atau HR_ADMIN ber-grant `employee.onboarding.review` di PT calon).
const reviewRoutes = {
  detail: createRoute({
    method: "get",
    path: `${P}/onboarding/{employeeId}`,
    tags: TAGS,
    summary: "Review: isian lengkap + dokumen calon (akses data sensitif diaudit)",
    security,
    request: { params: employeeIdParamSchema },
    responses: {
      200: json("Review", dataEnvelope(onboardingReviewSchema)),
      ...errors(401, 403, 404, 500),
    },
  }),
  decide: createRoute({
    method: "post",
    path: `${P}/onboarding/{employeeId}/decision`,
    tags: TAGS,
    summary: "Review: setujui (+ PTKP, koreksi data kerja) / minta revisi / batalkan penerimaan",
    security,
    request: {
      params: employeeIdParamSchema,
      body: {
        content: { "application/json": { schema: z.record(z.string(), z.unknown()) } },
        required: true,
      },
    },
    responses: {
      200: json("Keputusan", dataEnvelope(decisionResultSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
};

export function registerOnboardingRoutes(
  app: OpenAPIHono,
  deps: {
    protect: MiddlewareHandler[];
    invitations: service.InvitationDeps;
    storage?: StorageAdmin | undefined;
    storagePathPrefix?: string | undefined;
    loginEmailDomain?: string | undefined;
  },
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

  // D-045 b: wizard milik sendiri.
  const wctx = (c: Context): wizard.WizardContext => ({
    ...ctx(c),
    storage: deps.storage,
    storagePathPrefix: deps.storagePathPrefix,
  });
  app.openapi(guard(wizardRoutes.me), async (c) =>
    c.json(ok(await wizard.getMyOnboarding(wctx(c))), 200),
  );
  app.openapi(guard(wizardRoutes.save), async (c) =>
    c.json(
      ok(await wizard.saveSection(wctx(c), c.req.valid("param").section, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(wizardRoutes.uploadUrl), async (c) =>
    c.json(ok(await wizard.createDocumentUploadUrl(wctx(c), c.req.valid("json"))), 200),
  );
  app.openapi(guard(wizardRoutes.confirm), async (c) =>
    c.json(ok(await wizard.confirmDocument(wctx(c), c.req.valid("json"))), 201),
  );
  app.openapi(guard(wizardRoutes.removeDocument), async (c) =>
    c.json(ok(await wizard.deleteDocument(wctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(guard(wizardRoutes.submit), async (c) =>
    c.json(ok(await wizard.submitMyOnboarding(wctx(c))), 200),
  );

  const reviewDeps = {
    authAdmin: deps.invitations.authAdmin,
    storage: deps.storage,
    loginEmailDomain: deps.loginEmailDomain,
  };
  app.openapi(guard(reviewRoutes.detail), async (c) =>
    c.json(ok(await review.getReview(ctx(c), c.req.valid("param").employeeId, reviewDeps)), 200),
  );
  app.openapi(guard(reviewRoutes.decide), async (c) =>
    c.json(
      ok(
        await review.decide(
          ctx(c),
          c.req.valid("param").employeeId,
          c.req.valid("json"),
          reviewDeps,
        ),
      ),
      200,
    ),
  );
}
