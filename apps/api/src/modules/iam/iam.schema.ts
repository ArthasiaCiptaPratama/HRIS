import { z } from "@hono/zod-openapi";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, permissionSchema, roleSchema } from "@hris/shared";

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
};
const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");

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

export const accountSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: roleSchema,
    isActive: z.boolean(),
    isPrimarySuperAdmin: z.boolean(),
    employeeId: z.uuid().nullable(),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("Account");
export type AccountDto = z.infer<typeof accountSchema>;

export const idParamSchema = z.object({ id: z.uuid() });

export const listAccountsQuerySchema = z.object({
  ...pagination,
  role: roleSchema.optional(),
  isActive: booleanQuery.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;

export const inviteAccountBodySchema = z
  .object({ email: z.email().max(254), role: roleSchema })
  .openapi("InviteAccount");
export type InviteAccountInput = z.infer<typeof inviteAccountBodySchema>;

export const changeRoleBodySchema = z.object({ role: roleSchema }).openapi("ChangeRole");

export const transferPrimaryBodySchema = z
  .object({ targetAccountId: z.uuid() })
  .openapi("TransferPrimarySuperAdmin");

export const grantSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    permission: permissionSchema,
    expiresAt: z.iso.datetime().nullable(),
    reason: z.string().nullable(),
    grantedBy: z.uuid(),
    revokedAt: z.iso.datetime().nullable(),
    revokedBy: z.uuid().nullable(),
    isActive: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .openapi("PermissionGrant");
export type GrantDto = z.infer<typeof grantSchema>;

export const listGrantsQuerySchema = z.object({
  ...pagination,
  accountId: z.uuid().optional(),
  permission: permissionSchema.optional(),
  active: booleanQuery.optional(),
});
export type ListGrantsQuery = z.infer<typeof listGrantsQuerySchema>;

export const createGrantBodySchema = z
  .object({
    accountId: z.uuid(),
    permission: permissionSchema,
    expiresAt: z.iso.datetime().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .openapi("CreateGrant");
export type CreateGrantInput = z.infer<typeof createGrantBodySchema>;

export const revokeGrantBodySchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .openapi("RevokeGrant");

export const auditLogSchema = z
  .object({
    id: z.uuid(),
    actorAccountId: z.uuid().nullable(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    reason: z.string().nullable(),
    requestId: z.string().nullable(),
    ip: z.string().nullable(),
    occurredAt: z.iso.datetime(),
  })
  .openapi("AuditLog");
export type AuditLogDto = z.infer<typeof auditLogSchema>;

export const listAuditLogsQuerySchema = z.object({
  ...pagination,
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
  actorAccountId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
