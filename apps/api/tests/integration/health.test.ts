import { afterAll, describe, expect, test } from "bun:test";
import { createApp } from "../../src/app.ts";
import { disconnectPrisma } from "../../src/core/db.ts";
import { createLogger } from "../../src/core/logger.ts";

// Integration: memakai PostgreSQL lokal sungguhan (bun run db:up) sesuai DATABASE_URL.
const app = createApp({ logger: createLogger("error", () => {}) });

afterAll(async () => {
  await disconnectPrisma();
});

describe("GET /api/v1/health (PostgreSQL lokal)", () => {
  test("terhubung ke database", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { checks: { database: "ok" } } });
  });
});
