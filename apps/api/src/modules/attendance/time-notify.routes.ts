import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { ctxOf } from "./calendar.routes.ts";
import { timeQueueSchema } from "./location-setting.contract.ts";
import { myQueue } from "./time-notify.service.ts";

// Angka antrean keputusan Time Management untuk badge menu (sama dengan isi inbox masing-masing).
const queueRoute = createRoute({
  method: "get",
  path: `${API_BASE_PATH}/time/queue`,
  tags: ["Time Management"],
  summary: "Jumlah pengajuan yang menunggu keputusan saya (absen, cuti/izin, koreksi, roster)",
  security: [{ [BEARER_SCHEME]: [] }],
  responses: {
    200: {
      description: "Antrean keputusan",
      content: { "application/json": { schema: dataEnvelope(timeQueueSchema) } },
    },
    401: ERROR_RESPONSES[401],
    500: ERROR_RESPONSES[500],
  },
});

export function registerTimeNotifyRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  app.openapi({ ...queueRoute, middleware: protect }, (async (c: Context) =>
    c.json(ok(await myQueue(ctxOf(c))), 200)) as never);
}
