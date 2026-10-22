import { describe, expect, test } from "bun:test";
import { OpenAPIHono } from "@hono/zod-openapi";
import { type DevAccountDeps, registerDevAccountRoutes } from "../dev-accounts.ts";

// DEV-ONLY switcher akun uji: hanya lokal, hanya @arthasia.test, service key tidak keluar.
const KEY = "service-role-rahasia";
const accounts = [
  { email: "karyawan.lokal@arthasia.test", role: "EMPLOYEE", employeeId: "e1" },
  { email: "hr.lokal@arthasia.test", role: "HR_ADMIN", employeeId: null },
];

function setup(overrides: Partial<DevAccountDeps> = {}) {
  const calls: string[] = [];
  const deps: DevAccountDeps = {
    listAccounts: async () => accounts,
    databaseHost: () => "localhost:5432",
    auth: () => ({ url: "http://127.0.0.1:54321", serviceRoleKey: KEY }),
    fetch: (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      const body = url.endsWith("/admin/generate_link")
        ? { properties: { hashed_token: "hash-1" } }
        : {
            access_token: "tok",
            refresh_token: "ref",
            user: { email: "karyawan.lokal@arthasia.test" },
          };
      return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
    ...overrides,
  };
  const app = new OpenAPIHono();
  registerDevAccountRoutes(app, deps);
  const post = (email: unknown) =>
    app.request("/api/v1/dev/test-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  return { app, post, calls };
}

describe("switcher akun uji (dev)", () => {
  test("daftar akun uji lokal", async () => {
    const res = await setup().app.request("/api/v1/dev/test-accounts");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown[] }).data).toHaveLength(2);
  });

  test("sesi akun uji: magic link lokal → token; service key tidak ada di respons", async () => {
    const { post, calls } = setup();
    const res = await post("Karyawan.Lokal@arthasia.test");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text).data.access_token).toBe("tok");
    expect(text).not.toContain(KEY);
    expect(calls).toEqual([
      "http://127.0.0.1:54321/auth/v1/admin/generate_link",
      "http://127.0.0.1:54321/auth/v1/verify",
    ]);
  });

  test("ditolak: akun di luar daftar uji / domain lain", async () => {
    const { post, calls } = setup();
    expect((await post("bos@perusahaan.co.id")).status).toBe(403);
    expect((await post("tidakada@arthasia.test")).status).toBe(403);
    expect((await post("bukan-email")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test("ditolak: DB atau Auth bukan lokal", async () => {
    const remoteDb = setup({ databaseHost: () => "aws-0-ap-southeast-1.pooler.supabase.com:6543" });
    expect((await remoteDb.app.request("/api/v1/dev/test-accounts")).status).toBe(403);
    expect((await remoteDb.post("karyawan.lokal@arthasia.test")).status).toBe(403);
    const remoteAuth = setup({
      auth: () => ({ url: "https://abcd.supabase.co", serviceRoleKey: KEY }),
    });
    expect((await remoteAuth.post("karyawan.lokal@arthasia.test")).status).toBe(403);
    expect(remoteAuth.calls).toHaveLength(0);
  });
});
