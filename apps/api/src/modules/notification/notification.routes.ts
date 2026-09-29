import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { ForbiddenError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { canUseOwnNotifications } from "./notification.policy.ts";
import {
  idParamSchema,
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
} from "./notification.schema.ts";
import * as service from "./notification.service.ts";

const security = [{ [BEARER_SCHEME]: [] }];
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});

const routes = {
  list: createRoute({
    method: "get",
    path: `${API_BASE_PATH}/notifications`,
    tags: ["Notification"],
    summary: "Notifikasi milik akun yang login (terbaru dulu) + jumlah belum dibaca",
    security,
    request: { query: listNotificationsQuerySchema },
    responses: {
      200: json("Daftar notifikasi", listNotificationsResponseSchema),
      400: ERROR_RESPONSES[400],
      401: ERROR_RESPONSES[401],
      500: ERROR_RESPONSES[500],
    },
  }),
  markRead: createRoute({
    method: "post",
    path: `${API_BASE_PATH}/notifications/{id}/read`,
    tags: ["Notification"],
    summary: "Tandai satu notifikasi milik sendiri sudah dibaca",
    security,
    request: { params: idParamSchema },
    responses: {
      200: json("Ditandai", dataEnvelope(z.object({ id: z.uuid() }))),
      400: ERROR_RESPONSES[400],
      401: ERROR_RESPONSES[401],
      404: ERROR_RESPONSES[404],
      500: ERROR_RESPONSES[500],
    },
  }),
  markAllRead: createRoute({
    method: "post",
    path: `${API_BASE_PATH}/notifications/read-all`,
    tags: ["Notification"],
    summary: "Tandai semua notifikasi milik sendiri sudah dibaca",
    security,
    responses: {
      200: json("Jumlah yang ditandai", dataEnvelope(z.object({ updated: z.number().int() }))),
      401: ERROR_RESPONSES[401],
      500: ERROR_RESPONSES[500],
    },
  }),
};

export function registerNotificationRoutes(
  app: OpenAPIHono,
  deps: { protect: MiddlewareHandler[] },
): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: deps.protect });
  const actorOf = (actor: Parameters<typeof canUseOwnNotifications>[0]) => {
    if (!canUseOwnNotifications(actor)) throw new ForbiddenError();
    return actor;
  };

  app.openapi(guard(routes.list), async (c) =>
    c.json(await service.listMine(actorOf(c.get("actor")), c.req.valid("query")), 200),
  );
  app.openapi(guard(routes.markRead), async (c) => {
    const { id } = c.req.valid("param");
    await service.markMineRead(actorOf(c.get("actor")), id);
    return c.json(ok({ id }), 200);
  });
  app.openapi(guard(routes.markAllRead), async (c) =>
    c.json(ok(await service.markAllMineRead(actorOf(c.get("actor")))), 200),
  );
}
