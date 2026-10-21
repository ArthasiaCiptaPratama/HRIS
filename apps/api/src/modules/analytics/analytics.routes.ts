import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { dashboardAnalyticsQuerySchema } from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { ValidationError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import * as service from "./analytics.service.ts";

// DSB-D1: dashboard analitik SDM & biaya (SA, HR PT, MANAGER tim; rupiah ber-grant labor.cost.read).
const analyticsRoute = createRoute({
  method: "get",
  path: `${API_BASE_PATH}/dashboard/analytics`,
  tags: ["Dashboard"],
  summary:
    "Analitik SDM & biaya: headcount per bulan, gender, masa kerja vs cuti, efisiensi, proyeksi, labor cost",
  security: [{ [BEARER_SCHEME]: [] }],
  request: {
    query: z.object({
      month: z.string(),
      companyId: z.uuid().optional(),
      scenario: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Analitik dashboard",
      content: { "application/json": { schema: dataEnvelope(z.unknown()) } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

export interface AnalyticsRouteDeps {
  protect: MiddlewareHandler[];
}

export function registerAnalyticsRoutes(app: OpenAPIHono, deps: AnalyticsRouteDeps): void {
  app.openapi({ ...analyticsRoute, middleware: deps.protect }, (async (c: Context) => {
    const parsed = dashboardAnalyticsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    const ctx = { actor: c.get("actor"), requestId: c.get("requestId") };
    return c.json(ok(await service.dashboardAnalytics(ctx, parsed.data)), 200);
  }) as never);
}
