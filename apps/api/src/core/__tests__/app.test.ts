import { describe, expect, test } from "bun:test";
import { createRoute, z } from "@hono/zod-openapi";
import type { ErrorBody } from "@hris/shared";
import { createApp, selectEmailSender } from "../../app.ts";
import { parseEnv } from "../../env.ts";
import { BusinessRuleError } from "../errors.ts";
import { createLogger } from "../logger.ts";

async function readError(res: Response): Promise<ErrorBody["error"]> {
  return ((await res.json()) as ErrorBody).error;
}

function buildApp(databaseOk = true) {
  const lines: string[] = [];
  const app = createApp({
    logger: createLogger("debug", (line) => lines.push(line)),
    corsOrigins: ["http://localhost:5173"],
    checkDatabase: async () => databaseOk,
  });
  return { app, lines };
}

describe("app core", () => {
  // Bug 2026-09-30: PUT (mis. /employee-imports/mappings/:signature) ditolak browser karena preflight CORS
  // tidak mengizinkan PUT. Semua metode yang dipakai route API wajib ada di allowMethods.
  test("preflight CORS mengizinkan setiap metode route API (termasuk PUT)", async () => {
    const { app } = buildApp();
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const res = await app.request("/api/v1/employee-imports/mappings/x", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": method,
        },
      });
      expect(res.headers.get("Access-Control-Allow-Methods") ?? "").toContain(method);
    }
  });

  test("health 200 saat database sehat", async () => {
    const { app } = buildApp(true);
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { status: "ok", checks: { database: "ok" } } });
  });

  test("health 503 saat database tidak bisa dihubungi", async () => {
    const { app } = buildApp(false);
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ data: { status: "degraded" } });
  });

  test("X-Request-Id dibuat server bila tidak dikirim, dan dipakai ulang bila dikirim", async () => {
    const { app } = buildApp();
    const generated = await app.request("/api/v1/health");
    expect(generated.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await app.request("/api/v1/health", { headers: { "X-Request-Id": "req-42" } });
    expect(echoed.headers.get("X-Request-Id")).toBe("req-42");
  });

  test("route tidak dikenal → 404 envelope error", async () => {
    const { app } = buildApp();
    const res = await app.request("/api/v1/tidak-ada", { headers: { "X-Request-Id": "r-404" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan.", requestId: "r-404" },
    });
  });

  test("validasi Zod gagal → 400 VALIDATION_ERROR tanpa memantulkan nilai input", async () => {
    const { app } = buildApp();
    app.openapi(
      createRoute({
        method: "post",
        path: "/api/v1/_test/echo",
        request: {
          body: { content: { "application/json": { schema: z.object({ age: z.number() }) } } },
        },
        responses: { 200: { description: "ok" } },
      }),
      (c) => c.json({ data: null }, 200),
    );
    const res = await app.request("/api/v1/_test/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ age: "3201010101010001" }),
    });
    expect(res.status).toBe(400);
    const error = await readError(res);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details?.[0]).toMatchObject({ path: "age" });
    expect(JSON.stringify(error)).not.toContain("3201010101010001");
  });

  test("AppError dipetakan ke status & kode yang sesuai", async () => {
    const { app } = buildApp();
    app.get("/api/v1/_test/rule", () => {
      throw new BusinessRuleError("Saldo cuti tidak cukup.");
    });
    const res = await app.request("/api/v1/_test/rule");
    expect(res.status).toBe(422);
    expect(await readError(res)).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      message: "Saldo cuti tidak cukup.",
    });
  });

  test("error tak terduga → 500 generik; detail hanya di log server", async () => {
    const { app, lines } = buildApp();
    app.get("/api/v1/_test/boom", () => {
      throw new Error("connection string leaked postgres://x");
    });
    const res = await app.request("/api/v1/_test/boom");
    expect(res.status).toBe(500);
    const error = await readError(res);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(error)).not.toContain("postgres://");
    expect(lines.some((line) => line.includes("unhandled error"))).toBe(true);
  });

  test("dokumen OpenAPI memuat /api/v1/health dan skema Bearer", async () => {
    const { app } = buildApp();
    const doc = (await (await app.request("/api/v1/openapi.json")).json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/api/v1/health"]).toBeDefined();
    expect(doc.components.securitySchemes.Bearer).toMatchObject({ scheme: "bearer" });
  });
});

// Backlog 2026-09-29: test tidak boleh mengirim email sungguhan walau `.env` developer berisi SMTP_*.
describe("selectEmailSender", () => {
  const SMTP = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hris",
    SUPABASE_URL: "https://project.supabase.co",
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_USER: "sender@example.com",
    SMTP_PASS: "app-password",
    EMAIL_FROM: "HRIS <sender@example.com>",
  };
  const logger = createLogger("error", () => {});

  test("NODE_ENV=test selalu log, walau SMTP lengkap", () => {
    expect(selectEmailSender(parseEnv({ ...SMTP, NODE_ENV: "test" }), logger).kind).toBe("log");
  });

  test("di luar test: SMTP lengkap → smtp; tidak lengkap → log", () => {
    expect(selectEmailSender(parseEnv({ ...SMTP, NODE_ENV: "development" }), logger).kind).toBe(
      "smtp",
    );
    expect(selectEmailSender(parseEnv({ ...SMTP, NODE_ENV: "production" }), logger).kind).toBe(
      "smtp",
    );
    expect(
      selectEmailSender(parseEnv({ ...SMTP, SMTP_PASS: "", NODE_ENV: "development" }), logger).kind,
    ).toBe("log");
  });
});
