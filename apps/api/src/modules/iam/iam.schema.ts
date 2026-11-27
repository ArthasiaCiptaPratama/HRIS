import { z } from "@hono/zod-openapi";
import {
  dashboardLayoutSchema,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  PERMISSIONS,
  permissionSchema,
  roleSchema,
} from "@hris/shared";

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
    // BUG-004: nama karyawan tertaut (sapaan & kartu akun); null = akun tanpa karyawan.
    employeeName: z.string().nullable(),
    // Perusahaan karyawan tertaut (filter roster/shift/crew di app mobile); null = akun tanpa karyawan.
    employeeCompanyId: z.uuid().nullable(),
    // ORG-D9: punya bawahan langsung aktif → boleh memutuskan langkah "Atasan" untuk bawahan langsungnya
    // (antrean Approval & SPL di web/app), apa pun role akunnya.
    isSupervisor: z.boolean(),
    lastLoginAt: z.iso.datetime().nullable(),
    grants: z.array(
      z.object({ permission: permissionSchema, expiresAt: z.iso.datetime().nullable() }),
    ),
    // D-045 b: status onboarding akun (null = tidak tertaut karyawan). `locked` = hanya wizard.
    onboarding: z
      .object({
        status: z.string(),
        completionRequired: z.boolean(),
        submitted: z.boolean(),
        locked: z.boolean(),
      })
      .nullable()
      .optional(),
  })
  .openapi("Me");
export type MeResponse = z.infer<typeof meResponseSchema>;

// D-065: susunan widget dashboard akun sendiri. `layout: null` = belum pernah disimpan → web memakai
// DEFAULT_DASHBOARD_LAYOUT.
export const dashboardLayoutResponseSchema = z
  .object({ layout: dashboardLayoutSchema.nullable(), updatedAt: z.iso.datetime().nullable() })
  .openapi("DashboardLayoutState");
export type DashboardLayoutState = z.infer<typeof dashboardLayoutResponseSchema>;
export const saveDashboardLayoutBodySchema = z
  .object({ layout: dashboardLayoutSchema })
  .openapi("SaveDashboardLayoutBody");

export const accountSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: roleSchema,
    isActive: z.boolean(),
    isPrimarySuperAdmin: z.boolean(),
    /** IAM-D3: "Tanpa akses karyawan Head Office" (HR_ADMIN/HR_PERSONNEL). */
    restrictHeadOffice: z.boolean(),
    employeeId: z.uuid().nullable(),
    // D-040: perusahaan yang ditugaskan (dipakai HR_ADMIN; role lain kosong).
    companyIds: z.array(z.uuid()),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    // ONB-D2: role Karyawan/Manager tanpa data karyawan tertaut (perlu "Tautkan ke karyawan").
    needsEmployeeLink: z.boolean(),
  })
  .openapi("Account");
export type AccountDto = z.infer<typeof accountSchema>;

export const idParamSchema = z.object({ id: z.uuid() });

export const listAccountsQuerySchema = z.object({
  ...pagination,
  role: roleSchema.optional(),
  isActive: booleanQuery.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  // ONB-D2: hanya akun Karyawan/Manager yang belum tertaut data karyawan.
  unlinked: booleanQuery.optional(),
});
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;

// ONB-D2: role Karyawan/Manager wajib `employeeId` (422 bila kosong); role lain opsional.
export const inviteAccountBodySchema = z
  .object({ email: z.email().max(254), role: roleSchema, employeeId: z.uuid().optional() })
  .openapi("InviteAccount");
/** ONB-D2 (Q1a): undangan role Karyawan masuk antrean "Undang Karyawan Terdaftar" (202). */
export const accountInviteQueuedSchema = z
  .object({ employeeId: z.uuid(), queued: z.literal(true) })
  .openapi("AccountInviteQueued");

export const linkEmployeeBodySchema = z
  .object({ employeeId: z.uuid() })
  .openapi("LinkAccountEmployee");
export const linkSuggestionSchema = z
  .object({
    employeeId: z.uuid(),
    fullName: z.string(),
    employeeNumber: z.string().nullable(),
    companyId: z.uuid(),
    matchedBy: z.enum(["PERSONAL_EMAIL", "WORK_EMAIL"]).openapi("AccountLinkMatch"),
  })
  .openapi("AccountLinkSuggestion");
export type InviteAccountInput = z.infer<typeof inviteAccountBodySchema>;

export const changeRoleBodySchema = z.object({ role: roleSchema }).openapi("ChangeRole");

// D-040: set penugasan PT (menggantikan yang lama; boleh kosong = HR tidak melihat karyawan mana pun).
export const assignCompaniesBodySchema = z
  .object({
    companyIds: z
      .array(z.uuid())
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, "Perusahaan tidak boleh ganda."),
    // IAM-D3: "Tanpa akses karyawan Head Office"; tidak diisi = tidak berubah.
    restrictHeadOffice: z.boolean().optional(),
  })
  .openapi("AssignAccountCompanies");
export type AssignCompaniesInput = z.infer<typeof assignCompaniesBodySchema>;

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

// Nilai ganda dipisah koma (filter daftar grant multi akun/izin, 2026-11-26).
const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(item).max(100));

export const listGrantsQuerySchema = z.object({
  ...pagination,
  accountId: z.uuid().optional(),
  accountIds: csv(z.uuid()).optional(),
  permission: permissionSchema.optional(),
  permissions: csv(permissionSchema).optional(),
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

// IAM-D2 (2026-11-26, kutipan pengguna "Setuju dialog ini"): grant banyak akun × banyak izin sekaligus.
export const GRANT_BATCH_MAX_ACCOUNTS = 50;
export const GRANT_BATCH_MAX_REVOKE = 100;
export const createGrantBatchBodySchema = z
  .object({
    accountIds: z.array(z.uuid()).min(1).max(GRANT_BATCH_MAX_ACCOUNTS),
    permissions: z.array(permissionSchema).min(1).max(PERMISSIONS.length),
    expiresAt: z.iso.datetime().optional(),
    reason: z.string().trim().max(500).optional(),
    // true = pratinjau: hasil per kombinasi dihitung tanpa menulis apa pun.
    dryRun: z.boolean().optional(),
  })
  .openapi("CreateGrantBatch");
export type CreateGrantBatchInput = z.infer<typeof createGrantBatchBodySchema>;

export const grantBatchItemSchema = z
  .object({
    accountId: z.uuid(),
    permission: permissionSchema,
    status: z
      .enum(["created", "skipped_active", "skipped_not_grantable", "skipped_inactive"])
      .openapi("GrantBatchItemStatus"),
    grantId: z.uuid().nullable(),
  })
  .openapi("GrantBatchItem");
export const grantBatchResultSchema = z
  .object({
    // null untuk pratinjau (dryRun).
    batchId: z.uuid().nullable(),
    items: z.array(grantBatchItemSchema),
    created: z.number().int(),
    skipped: z.number().int(),
  })
  .openapi("GrantBatchResult");
export type GrantBatchResult = z.infer<typeof grantBatchResultSchema>;

export const revokeGrantBatchBodySchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(GRANT_BATCH_MAX_REVOKE),
    reason: z.string().trim().max(500).optional(),
  })
  .openapi("RevokeGrantBatch");
export type RevokeGrantBatchInput = z.infer<typeof revokeGrantBatchBodySchema>;
export const revokeGrantBatchResultSchema = z
  .object({
    batchId: z.uuid(),
    items: z.array(
      z
        .object({
          id: z.uuid(),
          accountId: z.uuid(),
          permission: permissionSchema,
          status: z.enum(["revoked", "skipped_inactive"]).openapi("GrantRevokeBatchItemStatus"),
        })
        .openapi("GrantRevokeBatchItem"),
    ),
    revoked: z.number().int(),
    skipped: z.number().int(),
  })
  .openapi("RevokeGrantBatchResult");
export type RevokeGrantBatchResult = z.infer<typeof revokeGrantBatchResultSchema>;

export const revokeGrantBodySchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .openapi("RevokeGrant");

export const auditLogSchema = z
  .object({
    id: z.uuid(),
    actorAccountId: z.uuid().nullable(),
    // Email akun pelaku (null = script/sistem atau akun sudah tidak ada).
    actorEmail: z.string().nullable(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    // Label entitas yang terbaca manusia (email akun / "Nama (nomor induk)" karyawan); null bila tidak diketahui.
    entityLabel: z.string().nullable(),
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
