import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DEFAULT_DASHBOARD_LAYOUT } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";

// D-065: susunan widget Dashboard per akun (GET/PUT/DELETE /me/dashboard-layout).
const RUN = crypto.randomUUID().slice(0, 6).toLowerCase();
const auth = createAuthFixture(RUN);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
const PATH = "/api/v1/me/dashboard-layout";
const call = (method: string, headers: Record<string, string>, body?: unknown) =>
  app.request(PATH, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const read = async (res: Response) =>
  ((await res.json()) as { data: { layout: unknown; updatedAt: string | null } }).data;

const custom = {
  version: 1,
  widgets: [
    { id: "stat-active", kind: "stat", size: "md", metric: "active" },
    {
      id: "edu-gender",
      kind: "pivot",
      size: "lg",
      title: "Pendidikan × Gender",
      rows: "education",
      cols: "gender",
      chart: "heatmap",
      status: "active",
      filters: { category: ["PERMANENT"] },
      sort: "natural",
      limit: 10,
      horizontal: true,
    },
  ],
};

let sa: { headers: Record<string, string>; account: { id: string } };
let hr: Record<string, string>;
let manager: Record<string, string>;

beforeAll(async () => {
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = (await auth.loginAs("HR_ADMIN")).headers;
  manager = (await auth.loginAs("MANAGER")).headers;
});

afterAll(async () => {
  await auth.cleanup();
  await disconnectPrisma();
});

describe("/me/dashboard-layout", () => {
  test("akses: SA & HR 200; MANAGER 403; tanpa token 401", async () => {
    expect((await call("GET", sa.headers)).status).toBe(200);
    expect((await call("GET", hr)).status).toBe(200);
    expect((await call("GET", manager)).status).toBe(403);
    expect((await call("PUT", manager, { layout: custom })).status).toBe(403);
    expect((await call("GET", {})).status).toBe(401);
  });

  test("belum pernah simpan → null; simpan → terbaca kembali; per akun (HR tidak ikut)", async () => {
    expect(await read(await call("GET", sa.headers))).toEqual({ layout: null, updatedAt: null });
    const saved = await call("PUT", sa.headers, { layout: custom });
    expect(saved.status).toBe(200);
    expect((await read(saved)).layout).toEqual(custom);
    const again = await read(await call("GET", sa.headers));
    expect(again.layout).toEqual(custom);
    expect(again.updatedAt).not.toBeNull();
    expect((await read(await call("GET", hr))).layout).toBeNull();
    // Simpan ulang = timpa (satu baris per akun).
    await call("PUT", sa.headers, { layout: DEFAULT_DASHBOARD_LAYOUT });
    expect(await prisma.dashboardLayout.count({ where: { accountId: sa.account.id } })).toBe(1);
  });

  test("400: versi salah, jenis widget asing, id ganda, dimensi asing", async () => {
    const bad = [
      { version: 9, widgets: [] },
      { version: 1, widgets: [{ id: "x", kind: "iframe", size: "sm" }] },
      { version: 1, widgets: [custom.widgets[0], custom.widgets[0]] },
      { version: 1, widgets: [{ ...custom.widgets[1], rows: "salary" }] },
    ];
    for (const layout of bad) expect((await call("PUT", hr, { layout })).status).toBe(400);
  });

  test("isi tersimpan yang tak lagi valid dibaca sebagai null (susunan bawaan)", async () => {
    await prisma.dashboardLayout.update({
      where: { accountId: sa.account.id },
      data: { layout: { version: 0, widgets: "lama" } },
    });
    expect((await read(await call("GET", sa.headers))).layout).toBeNull();
  });

  test("DELETE → kembali ke bawaan", async () => {
    await call("PUT", hr, { layout: custom });
    expect(await read(await call("DELETE", hr))).toEqual({ layout: null, updatedAt: null });
    expect((await read(await call("GET", hr))).layout).toBeNull();
  });
});
