import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { LEAVE_EXIT_STATUSES, OVERTIME_FORMULAS } from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import { ValidationError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import type { RequestContext } from "../attendance/index.ts";
import * as exits from "./leave-exit.service.ts";

// TM-D9 hak cuti karyawan keluar — rute bertipe (MOB-D10). Dipisah dari leave.routes.ts supaya
// pengetikan rute cuti lama di branch HRIS/mobile-app tidak bentrok.

export const exitSettlementSchema = z
  .object({
    id: z.uuid(),
    employee: z.object({
      id: z.uuid(),
      fullName: z.string(),
      employeeNumber: z.string().nullable(),
    }),
    companyId: z.uuid(),
    exitDate: z.string(),
    exitReason: z.string().nullable(),
    year: z.number().int(),
    remainingDays: z.number().int(),
    debtDays: z.number().int(),
    pendingDays: z.number().int(),
    formula: z.enum(OVERTIME_FORMULAS),
    divisor: z
      .number()
      .int()
      .openapi({ description: "Pembagi upah harian: 25 (pola 6 hari) / 21" }),
    status: z.enum(LEAVE_EXIT_STATUSES),
    note: z.string().nullable(),
    decidedAt: z.string().nullable(),
    dailyWage: z
      .number()
      .nullable()
      .openapi({ description: "Rupiah; null tanpa grant labor.cost.read" }),
    payAmount: z.number().nullable(),
    debtAmount: z.number().nullable(),
    wageMissing: z.boolean(),
  })
  .openapi("LeaveExitSettlement");

export const markExitPaidBodySchema = z.object({ note: z.string().trim().max(300).optional() });

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: Same<z.infer<typeof exitSettlementSchema>, exits.ExitSettlementView> = true;
void contract;

const security = [{ [BEARER_SCHEME]: [] }];
const TAGS = ["Time Management"];
const idParam = z.object({ id: z.uuid() });
const responses = (description: string, schema: z.ZodType) => ({
  200: { description, content: { "application/json": { schema: dataEnvelope(schema) } } },
  400: ERROR_RESPONSES[400],
  401: ERROR_RESPONSES[401],
  403: ERROR_RESPONSES[403],
  404: ERROR_RESPONSES[404],
  422: ERROR_RESPONSES[422],
  500: ERROR_RESPONSES[500],
});

const routes = {
  list: createRoute({
    method: "get",
    path: `${API_BASE_PATH}/leave-exit-settlements`,
    tags: TAGS,
    summary: "Hak cuti karyawan keluar (TM-D9) (SA, HR PT)",
    security,
    request: { query: z.object({ companyId: z.uuid().optional() }) },
    responses: responses("Daftar hak cuti karyawan keluar", z.array(exitSettlementSchema)),
  }),
  recalculate: createRoute({
    method: "post",
    path: `${API_BASE_PATH}/leave-exit-settlements/{id}/recalculate`,
    tags: TAGS,
    summary: "Hitung ulang hak cuti keluar",
    security,
    request: { params: idParam },
    responses: responses("Hasil hitung ulang", exitSettlementSchema),
  }),
  paid: createRoute({
    method: "post",
    path: `${API_BASE_PATH}/leave-exit-settlements/{id}/paid`,
    tags: TAGS,
    summary: "Tandai hak cuti keluar sudah diproses",
    security,
    request: {
      params: idParam,
      body: { content: { "application/json": { schema: markExitPaidBodySchema } } },
    },
    responses: responses("Sudah diproses", exitSettlementSchema),
  }),
};

const ctxOf = (c: Context): RequestContext => ({
  actor: c.get("actor"),
  requestId: c.get("requestId"),
  ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
});

export function registerLeaveExitRoutes(app: OpenAPIHono, protect: MiddlewareHandler[]): void {
  app.openapi({ ...routes.list, middleware: protect }, (async (c: Context) =>
    c.json(
      ok(await exits.listExitSettlements(ctxOf(c), c.req.query("companyId") || undefined)),
      200,
    )) as never);
  app.openapi({ ...routes.recalculate, middleware: protect }, (async (c: Context) =>
    c.json(
      ok(await exits.recalculateExitSettlement(ctxOf(c), c.req.param("id") as string)),
      200,
    )) as never);
  app.openapi({ ...routes.paid, middleware: protect }, (async (c: Context) => {
    const parsed = markExitPaidBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    const input = parsed.data;
    return c.json(
      ok(await exits.markExitSettlementPaid(ctxOf(c), c.req.param("id") as string, input.note)),
      200,
    );
  }) as never);
}
