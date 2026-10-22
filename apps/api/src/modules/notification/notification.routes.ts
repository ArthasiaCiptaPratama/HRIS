import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { ForbiddenError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { canUseOwnNotifications } from "./notification.policy.ts";
import {
  deviceTokenParamSchema,
  idParamSchema,
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
  registerDeviceBodySchema,
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
  registerDevice: createRoute({
    method: "post",
    path: `${API_BASE_PATH}/me/devices`,
    tags: ["Notification"],
    summary: "Daftarkan token push (FCM) perangkat app mobile milik akun yang login (MOB-D6)",
    security,
    request: {
      body: {
        content: { "application/json": { schema: registerDeviceBodySchema } },
        required: true,
      },
    },
    responses: {
      200: json("Terdaftar (token yang sama diperbarui)", dataEnvelope(z.object({ id: z.uuid() }))),
      400: ERROR_RESPONSES[400],
      401: ERROR_RESPONSES[401],
      500: ERROR_RESPONSES[500],
    },
  }),
  unregisterDevice: createRoute({
    method: "delete",
    path: `${API_BASE_PATH}/me/devices/{token}`,
    tags: ["Notification"],
    summary: "Hapus token push perangkat milik sendiri (saat logout); idempoten",
    security,
    request: { params: deviceTokenParamSchema },
    responses: {
      200: json("Dihapus bila ada", dataEnvelope(z.object({ removed: z.boolean() }))),
      400: ERROR_RESPONSES[400],
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
  app.openapi(guard(routes.registerDevice), async (c) =>
    c.json(ok(await service.registerMyDevice(actorOf(c.get("actor")), c.req.valid("json"))), 200),
  );
  app.openapi(guard(routes.unregisterDevice), async (c) => {
    const { token } = c.req.valid("param");
    return c.json(ok(await service.unregisterMyDevice(actorOf(c.get("actor")), token)), 200);
  });
}
