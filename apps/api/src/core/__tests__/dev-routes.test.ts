import { describe, expect, test } from "bun:test";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Env } from "../../env.ts";
import { registerDevRoutes } from "../dev.ts";
import { createLogger } from "../logger.ts";

function setup(nodeEnv: Env["NODE_ENV"] = "development") {
  const app = new OpenAPIHono();
  registerDevRoutes(app, { logger: createLogger("error", () => {}), nodeEnv });
  app.get("/api/v1/dev/probe", (c) => c.text("ok"));
  return app;
}
const peer = (address: string) => ({ requestIP: () => ({ address, family: "IPv4", port: 1234 }) });

describe("dev routes", () => {
  test("menolak peer non-loopback dan metadata koneksi kosong meski header dipalsukan", async () => {
    const app = setup();
    for (const address of ["192.168.1.2", "203.0.113.1", "::ffff:192.168.1.2"]) {
      for (const [url, method] of [
        ["db", "GET"],
        ["db", "POST"],
        ["probe", "GET"],
      ]) {
        const res = await app.request(
          `http://localhost/api/v1/dev/${url}`,
          {
            method,
            headers: { "X-Forwarded-For": "127.0.0.1", "X-Real-IP": "::1" },
          },
          peer(address),
        );
        expect(res.status).toBe(403);
      }
    }
    expect((await app.request("/api/v1/dev/db")).status).toBe(403);
  });
  test("development mengizinkan peer loopback IPv4/IPv6", async () => {
    for (const address of ["127.0.0.1", "127.0.0.2", "::1", "::ffff:127.0.0.1"]) {
      expect((await setup().request("/api/v1/dev/probe", {}, peer(address))).status).toBe(200);
    }
  });
  test("adapter Bun meneruskan alamat socket loopback ke middleware", async () => {
    const app = setup();
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/v1/dev/probe`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("ok");
    } finally {
      await server.stop(true);
    }
  });
  test("production/test menonaktifkan route dev walau peer loopback", async () => {
    for (const mode of ["production", "test"] as const) {
      for (const method of ["GET", "POST"]) {
        expect(
          (await setup(mode).request("/api/v1/dev/db", { method }, peer("127.0.0.1"))).status,
        ).toBe(404);
      }
    }
  });
});
