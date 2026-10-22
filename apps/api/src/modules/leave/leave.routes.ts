import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  leaveAdjustInputSchema,
  leaveAttachmentUploadSchema,
  leaveBalanceImportSchema,
  leavePreviewInputSchema,
  leaveRequestInputSchema,
  leaveTypeInputSchema,
  leaveYearInputSchema,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { ValidationError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import type { StorageAdmin } from "../../core/storage.ts";
import type { RequestContext } from "../attendance/index.ts";
import {
  leaveAttachmentUploadResultSchema,
  leaveBalanceImportResultSchema,
  leaveBalanceSchema,
  leaveExitSettlementSchema,
  leaveJobResultSchema,
  leaveLedgerSchema,
  leaveMeSchema,
  leavePreviewSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  leaveYearSchema,
} from "./leave.contract.ts";
import * as service from "./leave.service.ts";
import * as exits from "./leave-exit.service.ts";

// Tahap E — cuti, izin, sakit (D-072). Body divalidasi skema @hris/shared di handler (400 VALIDATION_ERROR).
const P = API_BASE_PATH;
const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const errors = (...codes: (keyof typeof ERROR_RESPONSES)[]) =>
  Object.fromEntries(codes.map((code) => [code, ERROR_RESPONSES[code]]));
const idParam = z.object({ id: z.uuid() });

function strict<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

const ctxOf = (c: Context): RequestContext => ({
  actor: c.get("actor"),
  requestId: c.get("requestId"),
  ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
});
const body = (c: Context) => c.req.json().catch(() => ({}));
const param = (c: Context) => c.req.param("id") as string;

/** MOB-D7 #1: body & respons bertipe di OpenAPI (codegen app mobile). Validasi body tetap `strict`. */
const route = (
  method: "get" | "post" | "put",
  path: string,
  summary: string,
  spec: {
    response: z.ZodType;
    body?: z.ZodType;
    params?: z.ZodObject;
    query?: z.ZodObject;
  },
) =>
  createRoute({
    method,
    path: `${P}${path}`,
    tags: TAGS,
    summary,
    security,
    request: {
      ...(spec.params ? { params: spec.params } : {}),
      ...(spec.query ? { query: spec.query } : {}),
      ...(spec.body
        ? { body: { content: { "application/json": { schema: spec.body } }, required: true } }
        : {}),
    },
    responses: {
      200: {
        description: summary,
        content: { "application/json": { schema: dataEnvelope(spec.response) } },
      },
      ...errors(400, 401, 403, 404, 409, 422, 500),
    },
  });

type Handler = (c: Context) => Promise<unknown>;
const yearQuery = z.object({ year: z.coerce.number().int().min(2020).max(2100) });
const exitPaidInput = z.object({ note: z.string().trim().max(300).optional() });
const leaveJobInput = z.object({
  job: z.enum(["grant", "settle", "expire", "collective", "daily"]),
  value: z.string().max(10).default(""),
});

const ROUTES: [ReturnType<typeof route>, Handler][] = [
  [
    route("get", "/leave-types", "Jenis cuti, izin, sakit", {
      response: z.array(leaveTypeSchema),
    }),
    (c) => service.listTypes(ctxOf(c)),
  ],
  [
    route("post", "/leave-types", "Tambah jenis cuti/izin/sakit (SA)", {
      body: leaveTypeInputSchema,
      response: leaveTypeSchema,
    }),
    async (c) => service.saveType(ctxOf(c), null, strict(leaveTypeInputSchema, await body(c))),
  ],
  [
    route("put", "/leave-types/{id}", "Ubah jenis cuti/izin/sakit (SA)", {
      params: idParam,
      body: leaveTypeInputSchema,
      response: leaveTypeSchema,
    }),
    async (c) => service.saveType(ctxOf(c), param(c), strict(leaveTypeInputSchema, await body(c))),
  ],
  [
    route("get", "/leave-years", "Master Cuti per tahun", { response: z.array(leaveYearSchema) }),
    (c) => service.listYears(ctxOf(c)),
  ],
  [
    route("put", "/leave-years", "Simpan Master Cuti satu tahun (SA)", {
      body: leaveYearInputSchema,
      response: leaveYearSchema,
    }),
    async (c) => service.saveYear(ctxOf(c), strict(leaveYearInputSchema, await body(c))),
  ],
  [
    route("get", "/leave/me", "Saldo, buku besar, & pengajuan saya", { response: leaveMeSchema }),
    (c) => service.myLeave(ctxOf(c)),
  ],
  [
    route("post", "/leave/preview", "Pratinjau hari terhitung & pembebanan saldo", {
      body: leavePreviewInputSchema,
      response: leavePreviewSchema,
    }),
    async (c) => service.previewLeave(ctxOf(c), strict(leavePreviewInputSchema, await body(c))),
  ],
  [
    route("post", "/leave/attachment-upload", "URL unggah lampiran (surat dokter, dll.)", {
      body: leaveAttachmentUploadSchema,
      response: leaveAttachmentUploadResultSchema,
    }),
    async (c) =>
      service.createAttachmentUpload(
        ctxOf(c),
        strict(leaveAttachmentUploadSchema, await body(c)).contentType,
      ),
  ],
  [
    route(
      "get",
      "/leave-requests",
      "Pengajuan cuti/izin/sakit: inbox keputusan / semua dalam cakupan",
      {
        query: z.object({
          scope: z.enum(["inbox", "all"]).optional(),
          companyId: z.uuid().optional(),
          status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
        }),
        response: z.array(leaveRequestSchema),
      },
    ),
    (c) =>
      service.listLeaveRequests(ctxOf(c), {
        scope: c.req.query("scope") === "all" ? "all" : "inbox",
        companyId: c.req.query("companyId"),
        status: c.req.query("status"),
      }),
  ],
  [
    route("post", "/leave-requests", "Ajukan cuti/izin/sakit (paralel Atasan + HR)", {
      body: leaveRequestInputSchema,
      response: leaveRequestSchema,
    }),
    async (c) =>
      service.createLeaveRequest(ctxOf(c), strict(leaveRequestInputSchema, await body(c))),
  ],
  [
    route("get", "/leave-requests/{id}", "Detail pengajuan (lampiran, approval)", {
      params: idParam,
      response: leaveRequestSchema,
    }),
    (c) => service.getLeaveRequest(ctxOf(c), param(c)),
  ],
  [
    route("post", "/leave-requests/{id}/cancel", "Batalkan pengajuan sendiri yang masih menunggu", {
      params: idParam,
      response: leaveRequestSchema,
    }),
    (c) => service.cancelLeaveRequest(ctxOf(c), param(c)),
  ],
  [
    route("get", "/leave-balances", "Saldo cuti per PT (SA, HR PT)", {
      query: yearQuery.extend({ companyId: z.uuid(), q: z.string().max(100).optional() }),
      response: z.array(leaveBalanceSchema),
    }),
    (c) =>
      service.balanceTable(
        ctxOf(c),
        c.req.query("companyId") as string,
        Number(c.req.query("year")),
        c.req.query("q") || undefined,
      ),
  ],
  [
    route("get", "/leave-balances/employees/{id}", "Buku besar saldo cuti seorang karyawan", {
      params: idParam,
      query: yearQuery,
      response: leaveLedgerSchema,
    }),
    (c) => service.employeeLedger(ctxOf(c), param(c), Number(c.req.query("year"))),
  ],
  [
    route("post", "/leave-balances/adjust", "Penyesuaian saldo cuti (alasan wajib)", {
      body: leaveAdjustInputSchema,
      response: leaveLedgerSchema,
    }),
    async (c) => service.adjustBalance(ctxOf(c), strict(leaveAdjustInputSchema, await body(c))),
  ],
  [
    route("post", "/leave-balances/import/preview", "Pratinjau import saldo awal", {
      body: leaveBalanceImportSchema,
      response: leaveBalanceImportResultSchema,
    }),
    async (c) =>
      service.importBalances(ctxOf(c), strict(leaveBalanceImportSchema, await body(c)), false),
  ],
  [
    route("post", "/leave-balances/import/commit", "Simpan import saldo awal (semua atau tidak)", {
      body: leaveBalanceImportSchema,
      response: leaveBalanceImportResultSchema,
    }),
    async (c) =>
      service.importBalances(ctxOf(c), strict(leaveBalanceImportSchema, await body(c)), true),
  ],
  [
    route("get", "/leave-exit-settlements", "Hak cuti karyawan keluar (TM-D9) (SA, HR PT)", {
      query: z.object({ companyId: z.uuid().optional() }),
      response: z.array(leaveExitSettlementSchema),
    }),
    (c) => exits.listExitSettlements(ctxOf(c), c.req.query("companyId") || undefined),
  ],
  [
    route("post", "/leave-exit-settlements/{id}/recalculate", "Hitung ulang hak cuti keluar", {
      params: idParam,
      response: leaveExitSettlementSchema,
    }),
    (c) => exits.recalculateExitSettlement(ctxOf(c), param(c)),
  ],
  [
    route("post", "/leave-exit-settlements/{id}/paid", "Tandai hak cuti keluar sudah diproses", {
      params: idParam,
      body: exitPaidInput,
      response: leaveExitSettlementSchema,
    }),
    async (c) => {
      const input = strict(exitPaidInput, await body(c));
      return exits.markExitSettlementPaid(ctxOf(c), param(c), input.note);
    },
  ],
  [
    route(
      "post",
      "/leave-jobs",
      "Jalankan pekerjaan cuti manual (SA): jatah/pelunasan/hangus/cuti bersama",
      { body: leaveJobInput, response: leaveJobResultSchema },
    ),
    async (c) => {
      const input = strict(leaveJobInput, await body(c));
      return service.runLeaveJob(ctxOf(c), input.job, input.value);
    },
  ],
];

export interface LeaveRouteDeps {
  protect: MiddlewareHandler[];
  /** Lampiran pengajuan (surat dokter, dll.) di bucket private leave-attachments. */
  storage: StorageAdmin;
  storagePathPrefix?: string | undefined;
}

export function registerLeaveRoutes(app: OpenAPIHono, deps: LeaveRouteDeps): void {
  service.configureLeave({
    storage: deps.storage,
    storagePathPrefix: deps.storagePathPrefix ?? "",
  });
  service.registerLeaveIntegrations();
  for (const [definition, handler] of ROUTES) {
    app.openapi({ ...definition, middleware: deps.protect }, (async (c: Context) =>
      c.json(ok(await handler(c)), 200)) as never);
  }
}
