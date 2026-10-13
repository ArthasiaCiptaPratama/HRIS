import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { approvalDecisionBodySchema, bulkApprovalDecisionBodySchema } from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { ValidationError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import {
  approvalViewSchema,
  bulkResultSchema,
  decisionResultSchema,
  idParamSchema,
} from "./approval.schema.ts";
import * as service from "./approval.service.ts";

export interface ApprovalRouteDeps {
  protect: MiddlewareHandler[];
}

const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Approval"];
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));

const ctxOf = (c: Context): service.RequestContext => ({
  actor: c.get("actor"),
  requestId: c.get("requestId"),
  ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
});

// Body keputusan memakai skema @hris/shared yang dibungkus z milik zod-openapi (urutan import, lihat D-065).
const decisionBody = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(500).optional(),
});
const bulkBody = decisionBody.extend({ requestIds: z.array(z.uuid()).min(1).max(200) });

const routes = {
  get: createRoute({
    method: "get",
    path: `${P}/approvals/{id}`,
    tags: TAGS,
    summary: "Status & langkah satu pengajuan (pengaju, atasan, HR PT-nya, SA)",
    security,
    request: { params: idParamSchema },
    responses: {
      200: json("Pengajuan", dataEnvelope(approvalViewSchema)),
      ...errors(400, 401, 404, 500),
    },
  }),
  decide: createRoute({
    method: "post",
    path: `${P}/approvals/{id}/decision`,
    tags: TAGS,
    summary:
      "Setujui/tolak langkah milik aktor (atasan/HR); override HR/SA wajib alasan (PLAN §5.2)",
    security,
    request: { params: idParamSchema, ...body(decisionBody) },
    responses: {
      200: json("Hasil", dataEnvelope(decisionResultSchema)),
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  }),
  decideBulk: createRoute({
    method: "post",
    path: `${P}/approvals/decisions`,
    tags: TAGS,
    summary:
      "Persetujuan massal (D-068): hasil per pengajuan, gagal satu tidak membatalkan lainnya",
    security,
    request: body(bulkBody),
    responses: {
      200: json("Hasil per pengajuan", dataEnvelope(bulkResultSchema)),
      ...errors(400, 401, 500),
    },
  }),
};

/** Aturan lintas field dari @hris/shared (tolak wajib alasan) → 400 VALIDATION_ERROR, bukan 500. */
function strict<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

export function registerApprovalRoutes(app: OpenAPIHono, deps: ApprovalRouteDeps): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: deps.protect });
  app.openapi(guard(routes.get), async (c) =>
    c.json(ok(await service.getApproval(ctxOf(c), c.req.valid("param").id)), 200),
  );
  app.openapi(guard(routes.decide), async (c) => {
    const input = strict(approvalDecisionBodySchema, c.req.valid("json"));
    return c.json(ok(await service.decide(ctxOf(c), c.req.valid("param").id, input)), 200);
  });
  app.openapi(guard(routes.decideBulk), async (c) => {
    const input = strict(bulkApprovalDecisionBodySchema, c.req.valid("json"));
    return c.json(ok(await service.decideBulk(ctxOf(c), input)), 200);
  });
}
