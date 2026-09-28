import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { API_BASE_PATH } from "./openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "./response.ts";

const healthSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    checks: z.object({ database: z.enum(["ok", "error"]) }),
    time: z.iso.datetime(),
  })
  .openapi("Health");

const healthRoute = createRoute({
  method: "get",
  path: `${API_BASE_PATH}/health`,
  tags: ["System"],
  summary: "Cek kesehatan API & koneksi database",
  responses: {
    200: {
      description: "API & database sehat",
      content: { "application/json": { schema: dataEnvelope(healthSchema) } },
    },
    503: {
      description: "API hidup tetapi database tidak bisa dihubungi",
      content: { "application/json": { schema: dataEnvelope(healthSchema) } },
    },
    500: ERROR_RESPONSES[500],
  },
});

export type DatabaseCheck = () => Promise<boolean>;

export function registerHealth(app: OpenAPIHono, checkDatabase: DatabaseCheck): void {
  app.openapi(healthRoute, async (c) => {
    const databaseOk = await checkDatabase();
    const body = ok({
      status: databaseOk ? ("ok" as const) : ("degraded" as const),
      checks: { database: databaseOk ? ("ok" as const) : ("error" as const) },
      time: new Date().toISOString(),
    });
    return databaseOk ? c.json(body, 200) : c.json(body, 503);
  });
}
