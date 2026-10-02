import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok, paginatedEnvelope } from "../../core/response.ts";
import type { StorageAdmin } from "../../core/storage.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import {
  changeStatusBodySchema,
  createEmployeeBodySchema,
  dashboardSchema,
  deactivateBodySchema,
  detailQuerySchema,
  employeeDetailSchema,
  employeeListItemSchema,
  employeeSummarySchema,
  idParamSchema,
  listEmployeesQuerySchema,
  managerOptionSchema,
  orgStructureSchema,
  photoConfirmBodySchema,
  photoResultSchema,
  photoUploadUrlBodySchema,
  photoUploadUrlSchema,
  reactivateBodySchema,
  summaryQuerySchema,
  updateEmployeeBodySchema,
} from "./employee.schema.ts";
import * as service from "./employee.service.ts";
import { registerEmployeeImportRoutes } from "./employee-import.routes.ts";
import { registerOnboardingRoutes } from "./onboarding.routes.ts";
import type { InvitationDeps as OnboardingInvitationDeps } from "./onboarding.service.ts";

export interface EmployeeRouteDeps {
  /** authenticate + loadActor, dirakit di app.ts. */
  protect: MiddlewareHandler[];
  authAdmin: AuthAdmin;
  /** D-037: foto profil di Supabase Storage. */
  storage: StorageAdmin;
  /** PLAN §3.3: prefix path objek Storage (lokal `dev/<nama>/`). */
  storagePathPrefix?: string;
  /** D-045: undangan aktivasi (tautan kembali ke web, batas per jam). */
  invitations?: OnboardingInvitationDeps;
  /** D-048: domain alamat login NIK lingkungan ini (kosong = nonaktif). */
  loginEmailDomain?: string | undefined;
}

const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Employee"];
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

const mutation = <T extends z.ZodType>(path: string, summary: string, schema: T) =>
  createRoute({
    method: "post",
    path,
    tags: TAGS,
    summary,
    security,
    request: { params: idParamSchema, ...body(schema) },
    responses: {
      200: json("Data kerja karyawan setelah perubahan", dataEnvelope(employeeListItemSchema)),
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  });

const routes = {
  list: createRoute({
    method: "get",
    path: `${P}/employees`,
    tags: TAGS,
    summary: "Daftar karyawan berpaginasi (SA/HR semua, MANAGER tim) + filter kategori/departemen",
    security,
    request: { query: listEmployeesQuerySchema },
    responses: {
      200: json("Daftar karyawan", paginatedEnvelope(employeeListItemSchema)),
      ...errors(400, 401, 403, 500),
    },
  }),
  summary: createRoute({
    method: "get",
    path: `${P}/employees/summary`,
    tags: TAGS,
    summary:
      "Jumlah karyawan aktif per kategori & nonaktif (cakupan sama dengan daftar; ?companyId=)",
    security,
    request: { query: summaryQuerySchema },
    responses: {
      200: json("Ringkasan", dataEnvelope(employeeSummarySchema)),
      ...errors(401, 403, 500),
    },
  }),
  dashboard: createRoute({
    method: "get",
    path: `${P}/dashboard`,
    tags: TAGS,
    summary: "Agregat kepegawaian untuk Dashboard (SA/HR; hanya jumlah, tanpa data per orang)",
    security,
    responses: {
      200: json("Dashboard", dataEnvelope(dashboardSchema)),
      ...errors(401, 403, 500),
    },
  }),
  managerOptions: createRoute({
    method: "get",
    path: `${P}/employees/manager-options`,
    tags: TAGS,
    summary: "Pilihan atasan: karyawan aktif ber-akun MANAGER/SUPER_ADMIN (SA/HR)",
    security,
    responses: {
      200: json("Pilihan atasan", dataEnvelope(z.array(managerOptionSchema))),
      ...errors(401, 403, 500),
    },
  }),
  orgStructure: createRoute({
    method: "get",
    path: `${P}/org-structure`,
    tags: TAGS,
    summary: "Struktur organisasi: departemen → jabatan → karyawan aktif (direktori, semua role)",
    security,
    responses: {
      200: json("Struktur organisasi", dataEnvelope(orgStructureSchema)),
      ...errors(401, 403, 500),
    },
  }),
  get: createRoute({
    method: "get",
    path: `${P}/employees/{id}`,
    tags: TAGS,
    summary:
      "Detail karyawan; bagian sensitif hanya bila berhak (grant) & view=full, dicatat di audit. view=print (SA/HR) = bahan formulir .xlsx, dicatat di audit",
    security,
    request: { params: idParamSchema, query: detailQuerySchema },
    responses: {
      200: json("Detail karyawan", dataEnvelope(employeeDetailSchema)),
      ...errors(400, 401, 403, 404, 500),
    },
  }),
  create: createRoute({
    method: "post",
    path: `${P}/employees`,
    tags: TAGS,
    summary: "Tambah karyawan (SA/HR); riwayat 'mulai bekerja' dibuat otomatis",
    security,
    request: body(createEmployeeBodySchema),
    responses: {
      201: json("Karyawan dibuat", dataEnvelope(employeeListItemSchema)),
      ...errors(400, 401, 403, 409, 422, 500),
    },
  }),
  update: createRoute({
    method: "patch",
    path: `${P}/employees/{id}`,
    tags: TAGS,
    summary: "Ubah data kerja karyawan aktif (SA/HR); status lewat /status-change",
    security,
    request: { params: idParamSchema, ...body(updateEmployeeBodySchema) },
    responses: {
      200: json("Karyawan diubah", dataEnvelope(employeeListItemSchema)),
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  }),
  changeStatus: mutation(
    `${P}/employees/{id}/status-change`,
    "Ubah status kepegawaian (mis. PKWT → Tetap) dengan tanggal efektif (SA/HR)",
    changeStatusBodySchema,
  ),
  deactivate: mutation(
    `${P}/employees/{id}/deactivate`,
    "Nonaktifkan karyawan (resign/PHK/kontrak habis/...); akun login ikut dinonaktifkan (SA/HR)",
    deactivateBodySchema,
  ),
  reactivate: mutation(
    `${P}/employees/{id}/reactivate`,
    "Aktifkan kembali karyawan nonaktif (SA/HR); akun login tidak otomatis aktif",
    reactivateBodySchema,
  ),
  photoUploadUrl: createRoute({
    method: "post",
    path: `${P}/employees/{id}/photo/upload-url`,
    tags: TAGS,
    summary:
      "Minta URL unggah foto profil (SA/HR, atau karyawan untuk dirinya sendiri); unggah langsung ke Storage lalu konfirmasi",
    security,
    request: { params: idParamSchema, ...body(photoUploadUrlBodySchema) },
    responses: {
      200: json("Path & token unggah sekali pakai", dataEnvelope(photoUploadUrlSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
  photoConfirm: createRoute({
    method: "post",
    path: `${P}/employees/{id}/photo`,
    tags: TAGS,
    summary:
      "Pasang foto yang sudah diunggah (diperiksa: ada, JPG/PNG/WebP, ≤ 2 MB); foto lama dihapus; dicatat di audit",
    security,
    request: { params: idParamSchema, ...body(photoConfirmBodySchema) },
    responses: {
      200: json("URL baca foto (berlaku singkat)", dataEnvelope(photoResultSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
  photoDelete: createRoute({
    method: "delete",
    path: `${P}/employees/{id}/photo`,
    tags: TAGS,
    summary: "Hapus foto profil; dicatat di audit",
    security,
    request: { params: idParamSchema },
    responses: {
      200: json("Foto dihapus", dataEnvelope(photoResultSchema)),
      ...errors(400, 401, 403, 404, 422, 500),
    },
  }),
};

export function registerEmployeeRoutes(app: OpenAPIHono, deps: EmployeeRouteDeps): void {
  const guard = <R extends object>(route: R) => ({ ...route, middleware: deps.protect });
  const ctx = (c: Context): service.RequestContext => ({
    ...ctxOf(c),
    storage: deps.storage,
    storagePathPrefix: deps.storagePathPrefix,
    nikLogin: { authAdmin: deps.authAdmin, domain: deps.loginEmailDomain },
  });

  // D-042: import karyawan (/employee-imports/*).
  registerEmployeeImportRoutes(app, { protect: deps.protect, ctx });
  registerOnboardingRoutes(app, {
    protect: deps.protect,
    storage: deps.storage,
    storagePathPrefix: deps.storagePathPrefix,
    loginEmailDomain: deps.loginEmailDomain,
    invitations: deps.invitations ?? {
      authAdmin: deps.authAdmin,
      redirectTo: "http://localhost:5173/auth/callback",
      perHour: 25,
    },
  });

  // Route statis didaftarkan sebelum /employees/{id} (validasi UUID juga menolak "summary").
  app.openapi(guard(routes.list), async (c) =>
    c.json(await service.listEmployees(ctx(c), c.req.valid("query")), 200),
  );
  app.openapi(guard(routes.summary), async (c) =>
    c.json(ok(await service.getSummary(ctx(c), c.req.valid("query"))), 200),
  );
  app.openapi(guard(routes.dashboard), async (c) =>
    c.json(ok(await service.getDashboard(ctx(c))), 200),
  );
  app.openapi(guard(routes.managerOptions), async (c) =>
    c.json(ok(await service.listManagerOptions(ctx(c))), 200),
  );
  app.openapi(guard(routes.orgStructure), async (c) =>
    c.json(ok(await service.getOrgStructure(ctx(c))), 200),
  );
  app.openapi(guard(routes.get), async (c) =>
    c.json(
      ok(await service.getEmployee(ctx(c), c.req.valid("param").id, c.req.valid("query").view)),
      200,
    ),
  );
  app.openapi(guard(routes.create), async (c) =>
    c.json(ok(await service.createEmployee(ctx(c), c.req.valid("json"))), 201),
  );
  app.openapi(guard(routes.update), async (c) =>
    c.json(
      ok(await service.updateEmployee(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(routes.changeStatus), async (c) =>
    c.json(
      ok(await service.changeStatus(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(routes.deactivate), async (c) =>
    c.json(
      ok(
        await service.deactivateEmployee(
          ctx(c),
          c.req.valid("param").id,
          c.req.valid("json"),
          deps,
        ),
      ),
      200,
    ),
  );
  app.openapi(guard(routes.reactivate), async (c) =>
    c.json(
      ok(await service.reactivateEmployee(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(routes.photoUploadUrl), async (c) =>
    c.json(
      ok(await service.createPhotoUploadUrl(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(routes.photoConfirm), async (c) =>
    c.json(
      ok(await service.confirmPhoto(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(guard(routes.photoDelete), async (c) =>
    c.json(ok(await service.deletePhoto(ctx(c), c.req.valid("param").id)), 200),
  );
}
