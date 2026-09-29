import { z } from "@hono/zod-openapi";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "@hris/shared";

export const notificationSchema = z
  .object({
    id: z.uuid(),
    type: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    link: z.string().nullable(),
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
