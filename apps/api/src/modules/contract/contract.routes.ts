import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type {
  CorrectContractInput,
  CreateContractInput,
  DailyWageInput,
  EndContractInput,
  ExtendContractInput,
  PromoteEmployeeInput,
} from "@hris/shared";
import type { Context, MiddlewareHandler } from "hono";
import type { Actor } from "../../core/access/index.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import {
  contractActionResultSchema,
  correctContractBodySchema,
  createContractBodySchema,
  dailyWageBodySchema,
  dailyWageResultSchema,
  employeeContractsSchema,
  endContractBodySchema,
  extendContractBodySchema,
  promoteEmployeeBodySchema,
} from "./contract.contract.ts";
import type { ContractActionResult, readEmployeeContracts } from "./contract.service.ts";

export interface ContractContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}
export interface ContractHandlers {
  setWage(
    ctx: ContractContext,
    id: string,
    input: DailyWageInput,
  ): Promise<{ thl: Awaited<ReturnType<typeof import("./thl.service.ts").readThl>> }>;
  read(ctx: ContractContext, id: string): ReturnType<typeof readEmployeeContracts>;
  create(
    ctx: ContractContext,
    id: string,
    input: CreateContractInput,
  ): Promise<ContractActionResult>;
  extend(
    ctx: ContractContext,
    id: string,
    contractId: string,
    input: ExtendContractInput,
  ): Promise<ContractActionResult>;
  correct(
    ctx: ContractContext,
    id: string,
    contractId: string,
    input: CorrectContractInput,
  ): Promise<ContractActionResult>;
  promote(
    ctx: ContractContext,
    id: string,
    input: PromoteEmployeeInput,
  ): Promise<ContractActionResult>;
  fail(ctx: ContractContext, id: string, input: EndContractInput): Promise<ContractActionResult>;
  end(
    ctx: ContractContext,
    id: string,
    contractId: string,
    input: EndContractInput,
  ): Promise<ContractActionResult>;
}
const employeeParam = z.object({ id: z.uuid() });
const contractParam = employeeParam.extend({ contractId: z.uuid() });
const ctx = (c: Context): ContractContext => ({
  actor: c.get("actor"),
  requestId: c.get("requestId"),
  ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
});
const json = <T extends z.ZodType>(schema: T) => ({
  description: "Berhasil",
  content: { "application/json": { schema: dataEnvelope(schema) } },
});
export function registerContractRoutes(
  app: OpenAPIHono,
  deps: { protect: MiddlewareHandler[]; handlers: ContractHandlers },
) {
  const base = {
    tags: ["Contract"],
    security: [{ [BEARER_SCHEME]: [] }],
    middleware: deps.protect,
  };
  app.openapi(
    createRoute({
      ...base,
      method: "get",
      path: `${API_BASE_PATH}/employees/{id}/contracts`,
      request: { params: employeeParam },
      responses: { 200: json(employeeContractsSchema), ...ERROR_RESPONSES },
    }),
    async (c) => c.json(ok(await deps.handlers.read(ctx(c), c.req.valid("param").id)), 200),
  );
  app.openapi(
    createRoute({
      ...base,
      method: "put",
      path: `${API_BASE_PATH}/employees/{id}/daily-wage`,
      request: {
        params: employeeParam,
        body: { required: true, content: { "application/json": { schema: dailyWageBodySchema } } },
      },
      responses: { 200: json(dailyWageResultSchema), ...ERROR_RESPONSES },
    }),
    async (c) =>
      c.json(
        ok(await deps.handlers.setWage(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
        200,
      ),
  );
  const action = <T extends z.ZodType>(path: string, schema: T, params = employeeParam) =>
    createRoute({
      ...base,
      method: "post",
      path: `${API_BASE_PATH}/employees/{id}${path}`,
      request: { params, body: { required: true, content: { "application/json": { schema } } } },
      responses: { 200: json(contractActionResultSchema), ...ERROR_RESPONSES },
    });
  app.openapi(action("/contracts", createContractBodySchema), async (c) =>
    c.json(
      ok(await deps.handlers.create(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(
    action("/contracts/{contractId}/extend", extendContractBodySchema, contractParam),
    async (c) => {
      const params = contractParam.parse(c.req.valid("param"));
      return c.json(
        ok(await deps.handlers.extend(ctx(c), params.id, params.contractId, c.req.valid("json"))),
        200,
      );
    },
  );
  // KTR-D12: koreksi tanggal kontrak aktif tanpa pindah tahap.
  app.openapi(
    action("/contracts/{contractId}/correct", correctContractBodySchema, contractParam),
    async (c) => {
      const params = contractParam.parse(c.req.valid("param"));
      return c.json(
        ok(await deps.handlers.correct(ctx(c), params.id, params.contractId, c.req.valid("json"))),
        200,
      );
    },
  );
  app.openapi(action("/promote", promoteEmployeeBodySchema), async (c) =>
    c.json(
      ok(await deps.handlers.promote(ctx(c), c.req.valid("param").id, c.req.valid("json"))),
      200,
    ),
  );
  app.openapi(action("/probation/fail", endContractBodySchema), async (c) =>
    c.json(ok(await deps.handlers.fail(ctx(c), c.req.valid("param").id, c.req.valid("json"))), 200),
  );
  app.openapi(
    action("/contracts/{contractId}/end", endContractBodySchema, contractParam),
    async (c) => {
      const params = contractParam.parse(c.req.valid("param"));
      return c.json(
        ok(await deps.handlers.end(ctx(c), params.id, params.contractId, c.req.valid("json"))),
        200,
      );
    },
  );
}
