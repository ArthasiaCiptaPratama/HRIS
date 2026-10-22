import { z } from "@hono/zod-openapi";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "@hris/shared";

export const notificationSchema = z
  .object({
    id: z.uuid(),
    type: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    link: z.string().nullable(),
    /** MOB-D6: layar tujuan di app mobile (jenis + id); null = cukup buka daftar notifikasi. */
    target: z.object({ type: z.string(), id: z.string() }).nullable(),
    readAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("Notification");
export type NotificationDto = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  unreadOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const listNotificationsResponseSchema = z.object({
  data: z.array(notificationSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    unreadCount: z.number().int(),
  }),
});

export const idParamSchema = z.object({ id: z.uuid() });

// MOB-D6: token FCM perangkat app mobile.
const pushTokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9_:.-]+$/);

export const registerDeviceBodySchema = z
  .object({
    token: pushTokenSchema,
    platform: z.enum(["ANDROID"]),
    appVersion: z.string().trim().max(40).optional(),
  })
  .openapi("RegisterPushDevice");
export type RegisterDeviceBody = z.infer<typeof registerDeviceBodySchema>;

export const deviceTokenParamSchema = z.object({ token: pushTokenSchema });
