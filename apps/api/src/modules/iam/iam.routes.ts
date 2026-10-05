import { createRoute, type OpenAPIHono, type z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { ForbiddenError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok, paginatedEnvelope } from "../../core/response.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import { canReadOwnAccount } from "./iam.policy.ts";
import {
  accountSchema,
  assignCompaniesBodySchema,
  auditLogSchema,
  changeRoleBodySchema,
  createGrantBodySchema,
  grantSchema,
  idParamSchema,
  inviteAccountBodySchema,
  listAccountsQuerySchema,
  listAuditLogsQuerySchema,
  listGrantsQuerySchema,
  meResponseSchema,
  revokeGrantBodySchema,
  transferPrimaryBodySchema,
} from "./iam.schema.ts";
import * as service from "./iam.service.ts";

export interface IamRouteDeps {
  /** authenticate + loadActor, dirakit di app.ts. */
  protect: MiddlewareHandler[];
  authAdmin: AuthAdmin;
  /** URL web untuk link undangan (callback set password). */
  appUrl: string;
}

const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const json = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));

function ctxOf(c: Context): service.RequestContext {
  return {
    actor: c.get("actor"),
    requestId: c.get("requestId"),
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
  };
}

const routes = {
  me: createRoute({
    method: "get",
    path: `${P}/me`,
    tags: ["IAM"],
    summary: "Profil akun yang sedang login: role, grant aktif, keterhubungan karyawan",
    security,
    responses: {
      200: json("Profil akses akun sendiri", dataEnvelope(meResponseSchema)),
      ...errors(401, 403, 500),
    },
  }),
  listAccounts: createRoute({
    method: "get",
    path: `${P}/accounts`,
    tags: ["IAM"],
    summary: "Daftar akun (SUPER_ADMIN, HR_ADMIN)",
    security,
    request: { query: listAccountsQuerySchema },
    responses: {
      200: json("Daftar akun", paginatedEnvelope(accountSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
  getAccount: createRoute({
    method: "get",
    path: `${P}/accounts/{id}`,
    tags: ["IAM"],
    summary: "Detail akun (SUPER_ADMIN, HR_ADMIN, atau akun sendiri)",
    security,
    request: { params: idParamSchema },
    responses: {
      200: json("Detail akun", dataEnvelope(accountSchema)),
      ...errors(400, 401, 403, 404, 500),
    },
  }),
  inviteAccount: createRoute({
    method: "post",
    path: `${P}/accounts/invite`,
    tags: ["IAM"],
    summary:
      "Undang akun lewat email (SA: semua role kecuali SUPER_ADMIN [Utama saja]; HR: EMPLOYEE)",
    security,
    request: body(inviteAccountBodySchema),
    responses: {
      201: json("Akun dibuat & undangan terkirim", dataEnvelope(accountSchema)),
      ...errors(400, 401, 403, 409, 422, 500),
    },
  }),
  changeRole: createRoute({
    method: "patch",
    path: `${P}/accounts/{id}/role`,
    tags: ["IAM"],
    summary: "Ubah role akun (SUPER_ADMIN; role SUPER_ADMIN hanya oleh Utama)",
    security,
    request: { params: idParamSchema, ...body(changeRoleBodySchema) },
    responses: {
      200: json("Role diubah", dataEnvelope(accountSchema)),
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  }),
  assignCompanies: createRoute({
    method: "put",
    path: `${P}/accounts/{id}/companies`,
    tags: ["IAM"],
    summary: "Set penugasan perusahaan akun HR_ADMIN (SUPER_ADMIN; D-040) — menggantikan yang lama",
    security,
    request: { params: idParamSchema, ...body(assignCompaniesBodySchema) },
    responses: {
      200: json("Penugasan diperbarui", dataEnvelope(accountSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
  deactivate: createRoute({
    method: "post",
    path: `${P}/accounts/{id}/deactivate`,
    tags: ["IAM"],
    summary: "Nonaktifkan akun (SA; HR hanya EMPLOYEE & MANAGER) — user Auth di-ban",
    security,
    request: { params: idParamSchema },
    responses: {
      200: json("Akun dinonaktifkan", dataEnvelope(accountSchema)),
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  }),
  reactivate: createRoute({
    method: "post",
    path: `${P}/accounts/{id}/reactivate`,
    tags: ["IAM"],
    summary: "Aktifkan kembali akun (aturan sama dengan nonaktifkan)",
    security,
    request: { params: idParamSchema },
    responses: {
      200: json("Akun diaktifkan", dataEnvelope(accountSchema)),
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  }),
  transferPrimary: createRoute({
    method: "post",
    path: `${P}/accounts/primary-super-admin/transfer`,
    tags: ["IAM"],
    summary: "Serahkan status Super Admin Utama (hanya Utama; wajib login ulang ≤ 5 menit)",
    security,
    request: body(transferPrimaryBodySchema),
    responses: {
      200: json("Status Utama diserahkan (akun tujuan)", dataEnvelope(accountSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
  listGrants: createRoute({
    method: "get",
    path: `${P}/grants`,
    tags: ["IAM"],
    summary: "Daftar grant izin (SUPER_ADMIN)",
    security,
    request: { query: listGrantsQuerySchema },
    responses: {
      200: json("Daftar grant", paginatedEnvelope(grantSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
  createGrant: createRoute({
    method: "post",
    path: `${P}/grants`,
    tags: ["IAM"],
    summary: "Beri grant izin ke HR_ADMIN/MANAGER (SUPER_ADMIN)",
    security,
    request: body(createGrantBodySchema),
    responses: {
      201: json("Grant dibuat", dataEnvelope(grantSchema)),
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  }),
  revokeGrant: createRoute({
    method: "post",
    path: `${P}/grants/{id}/revoke`,
    tags: ["IAM"],
    summary: "Cabut grant izin (SUPER_ADMIN); berlaku di request berikutnya",
    security,
    request: {
      params: idParamSchema,
      body: { content: { "application/json": { schema: revokeGrantBodySchema } } },
    },
    responses: {
      200: json("Grant dicabut", dataEnvelope(grantSchema)),
      ...errors(400, 401, 403, 404, 409, 500),
    },
  }),
  listAuditLogs: createRoute({
    method: "get",
    path: `${P}/audit-logs`,
    tags: ["Audit"],
    summary: "Audit log (SUPER_ADMIN)",
    security,
    request: { query: listAuditLogsQuerySchema },
    responses: {
      200: json("Audit log", paginatedEnvelope(auditLogSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
};

export function registerIamRoutes(app: OpenAPIHono, deps: IamRouteDeps): void {
  // Setiap route IAM terproteksi: authenticate + loadActor terpasang per route (bukan per prefix path).
  const guard = <R extends object>(route: R) => ({ ...route, middleware: deps.protect });
  const redirectTo = `${deps.appUrl.replace(/\/+$/, "")}/auth/callback`;

  app.openapi(guard(routes.me), async (c) => {
    const actor = c.get("actor");
    if (!canReadOwnAccount(actor)) throw new ForbiddenError();
    return c.json(ok(await service.getMe(actor)), 200);
  });

  app.openapi(guard(routes.listAccounts), async (c) =>
    c.json(await service.listAccounts(ctxOf(c), c.req.valid("query")), 200),
  );
  app.openapi(guard(routes.getAccount), async (c) =>
    c.json(ok(await service.getAccount(ctxOf(c), c.req.valid("param").id)), 200),
  );
  app.openapi(guard(routes.inviteAccount), async (c) =>
    c.json(
      ok(
        await service.inviteAccount(ctxOf(c), c.req.valid("json"), {
          authAdmin: deps.authAdmin,
          redirectTo,
        }),
      ),
      201,
    ),
  );
  app.openapi(guard(routes.assignCompanies), async (c) =>
    c.json(
      ok(await service.assignCompanies(ctxOf(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(routes.changeRole), async (c) =>
    c.json(
      ok(await service.changeRole(ctxOf(c), c.req.valid("param").id, c.req.valid("json").role)),
      200,
    ),
  );
  app.openapi(guard(routes.deactivate), async (c) =>
    c.json(ok(await service.setAccountActive(ctxOf(c), c.req.valid("param").id, false, deps)), 200),
  );
  app.openapi(guard(routes.reactivate), async (c) =>
    c.json(ok(await service.setAccountActive(ctxOf(c), c.req.valid("param").id, true, deps)), 200),
  );
  app.openapi(guard(routes.transferPrimary), async (c) =>
    c.json(
      ok(
        await service.transferPrimary(
          { ...ctxOf(c), passwordAuthAt: c.get("auth").passwordAuthAt },
          c.req.valid("json").targetAccountId,
        ),
      ),
      200,
    ),
  );
  app.openapi(guard(routes.listGrants), async (c) =>
    c.json(await service.listGrants(ctxOf(c), c.req.valid("query")), 200),
  );
  app.openapi(guard(routes.createGrant), async (c) =>
    c.json(ok(await service.createGrant(ctxOf(c), c.req.valid("json"))), 201),
  );
  app.openapi(guard(routes.revokeGrant), async (c) =>
    c.json(
      ok(await service.revokeGrant(ctxOf(c), c.req.valid("param").id, c.req.valid("json")?.reason)),
      200,
    ),
  );
  app.openapi(guard(routes.listAuditLogs), async (c) =>
    c.json(await service.listAuditLogs(ctxOf(c), c.req.valid("query")), 200),
  );
}
