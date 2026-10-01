import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(RUN);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});

type Headers = Record<string, string>;
const call = (method: string, path: string, headers: Headers, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => ((await res.json()) as { data: any }).data;
const myGrants = async (headers: Headers) =>
  ((await data(await call("GET", "/me", headers))).grants as { permission: string }[]).map(
    (g) => g.permission,
  );

let sa: Awaited<ReturnType<typeof auth.loginAs>>;
let hr: Awaited<ReturnType<typeof auth.loginAs>>;
let mgr: Awaited<ReturnType<typeof auth.loginAs>>;

beforeAll(async () => {
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN");
  mgr = await auth.loginAs("MANAGER");
});

afterAll(async () => {
  await auth.cleanup();
  await disconnectPrisma();
});

describe("grant izin (PLAN §4.2)", () => {
  test("SA memberi grant → 201, langsung berlaku di /me, audit tercatat; duplikat aktif 409", async () => {
    const res = await call("POST", "/grants", sa.headers, {
      accountId: hr.account.id,
      permission: "employee.personal.read",
      reason: "audit data PTKP",
    });
    expect(res.status).toBe(201);
    const grant = await data(res);
    expect(grant).toMatchObject({
      permission: "employee.personal.read",
      isActive: true,
      grantedBy: sa.account.id,
    });
    expect(await myGrants(hr.headers)).toContain("employee.personal.read");
    expect(
      await prisma.auditLog.count({ where: { entityId: grant.id, action: "iam.grant.create" } }),
    ).toBe(1);
    expect(
      await code(
        await call("POST", "/grants", sa.headers, {
          accountId: hr.account.id,
          permission: "employee.personal.read",
        }),
      ),
    ).toBe("CONFLICT");
  });

  test("izin tidak sesuai role penerima / akun nonaktif / masa berlaku lampau → 422", async () => {
    const emp = await auth.loginAs("EMPLOYEE");
    const inactiveHr = await auth.loginAs("HR_ADMIN", { isActive: false });
    const bad = [
      { accountId: mgr.account.id, permission: "contract.manage" },
      { accountId: emp.account.id, permission: "employee.personal.read" },
      { accountId: inactiveHr.account.id, permission: "employee.bank.read" },
      {
        accountId: hr.account.id,
        permission: "employee.bank.read",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ];
    for (const body of bad)
      expect(await code(await call("POST", "/grants", sa.headers, body))).toBe(
        "BUSINESS_RULE_VIOLATION",
      );
  });

  test("hanya SUPER_ADMIN; akun tak dikenal 404; izin tak dikenal 400", async () => {
    const body = { accountId: mgr.account.id, permission: "employee.bank.read" };
    expect((await call("POST", "/grants", hr.headers, body)).status).toBe(403);
    expect((await call("GET", "/grants", hr.headers)).status).toBe(403);
    expect(
      (await call("POST", "/grants", sa.headers, { ...body, accountId: crypto.randomUUID() }))
        .status,
    ).toBe(404);
    expect(
      await code(
        await call("POST", "/grants", sa.headers, { ...body, permission: "payroll.salary.read" }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  test("cabut → hilang dari /me di request berikutnya; cabut ulang 409; daftar bisa difilter", async () => {
    const created = await data(
      await call("POST", "/grants", sa.headers, {
        accountId: mgr.account.id,
        permission: "employee.bank.read",
      }),
    );
    expect(await myGrants(mgr.headers)).toContain("employee.bank.read");
    const list = (await (
      await call("GET", `/grants?accountId=${mgr.account.id}&active=true`, sa.headers)
    ).json()) as {
      data: { id: string }[];
    };
    expect(list.data.map((g) => g.id)).toContain(created.id);

    const revoked = await call("POST", `/grants/${created.id}/revoke`, sa.headers, {
      reason: "selesai tugas",
    });
    expect(revoked.status).toBe(200);
    expect((await data(revoked)).isActive).toBe(false);
    expect(await myGrants(mgr.headers)).not.toContain("employee.bank.read");
    expect(await code(await call("POST", `/grants/${created.id}/revoke`, sa.headers, {}))).toBe(
      "CONFLICT",
    );
    expect(
      (await call("POST", `/grants/${crypto.randomUUID()}/revoke`, sa.headers, {})).status,
    ).toBe(404);
  });
});

describe("GET /audit-logs (hanya SUPER_ADMIN)", () => {
  test("SA membaca & memfilter; HR/MANAGER 403", async () => {
    const res = await call(
      "GET",
      `/audit-logs?actorAccountId=${sa.account.id}&action=iam.grant`,
      sa.headers,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { action: string; actorAccountId: string; actorEmail: string | null }[];
      meta: { total: number };
    };
    expect(body.meta.total).toBeGreaterThanOrEqual(2);
    expect(
      body.data.every(
        (row) => row.action.startsWith("iam.grant") && row.actorAccountId === sa.account.id,
      ),
    ).toBe(true);
    // Audit 2026-09-30: aktor ditampilkan sebagai email, bukan hanya UUID.
    expect(body.data.every((row) => row.actorEmail === sa.account.email)).toBe(true);
    expect((await call("GET", "/audit-logs", hr.headers)).status).toBe(403);
    expect((await call("GET", "/audit-logs", mgr.headers)).status).toBe(403);
  });
});

describe("serah-terima status Utama (§4.4, D-033)", () => {
  let skip = false;
  beforeAll(async () => {
    // DB lokal developer bisa sudah punya Utama sungguhan (bootstrap); test ini butuh DB tanpa Utama.
    skip = (await prisma.account.count({ where: { isPrimarySuperAdmin: true } })) > 0;
  });

  test("Utama + login ulang ≤ 5 menit → status pindah; token lama ditolak; non-Utama 403; tujuan bukan SA 422", async () => {
    if (skip) return;
    const utama = await auth.loginAs("SUPER_ADMIN", { primary: true });
    const nextSa = await auth.loginAs("SUPER_ADMIN");
    const body = { targetAccountId: nextSa.account.id };

    expect(
      (await call("POST", "/accounts/primary-super-admin/transfer", sa.headers, body)).status,
    ).toBe(403);
    const stale = await call(
      "POST",
      "/accounts/primary-super-admin/transfer",
      utama.staleHeaders,
      body,
    );
    expect(stale.status).toBe(403);
    expect(((await stale.json()) as ErrorBody).error.message).toContain("Konfirmasi password");
    expect(
      await code(
        await call("POST", "/accounts/primary-super-admin/transfer", utama.headers, {
          targetAccountId: hr.account.id,
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");

    const res = await call("POST", "/accounts/primary-super-admin/transfer", utama.headers, body);
    expect(res.status).toBe(200);
    const [oldPrimary, newPrimary] = await Promise.all([
      prisma.account.findUniqueOrThrow({ where: { id: utama.account.id } }),
      prisma.account.findUniqueOrThrow({ where: { id: nextSa.account.id } }),
    ]);
    expect(oldPrimary).toMatchObject({ isPrimarySuperAdmin: false, role: "SUPER_ADMIN" });
    expect(newPrimary.isPrimarySuperAdmin).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { entityId: nextSa.account.id, action: "iam.account.transfer_primary_super_admin" },
      }),
    ).toBe(1);
    await prisma.account.update({
      where: { id: nextSa.account.id },
      data: { isPrimarySuperAdmin: false },
    });
  });
});
