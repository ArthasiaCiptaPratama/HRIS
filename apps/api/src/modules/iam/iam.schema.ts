import { z } from "@hono/zod-openapi";
import { permissionSchema, roleSchema } from "@hris/shared";

export const meResponseSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: roleSchema,
    isPrimarySuperAdmin: z.boolean(),
    employeeId: z.uuid().nullable(),
    lastLoginAt: z.iso.datetime().nullable(),
    grants: z.array(
      z.object({ permission: permissionSchema, expiresAt: z.iso.datetime().nullable() }),
    ),
  })
  .openapi("Me");

export type MeResponse = z.infer<typeof meResponseSchema>;
