import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(RUN);
const fake = createFakeAuthAdmin();
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: fake.admin,
  appUrl: "http://localhost:5173",
});
const email = (s: string) => `auth-${RUN}-${s}@example.test`;

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

let sa: Awaited<ReturnType<typeof auth.loginAs>>;
let hr: Awaited<ReturnType<typeof auth.loginAs>>;
let mgr: Awaited<ReturnType<typeof auth.loginAs>>;
let emp: Awaited<ReturnType<typeof auth.loginAs>>;

beforeAll(async () => {
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN");
  mgr = await auth.loginAs("MANAGER");
  emp = await auth.loginAs("EMPLOYEE");
});

afterAll(async () => {
  await auth.cleanup();
  await disconnectPrisma();
});

describe("GET /accounts & /accounts/:id", () => {
  test("SA & HR melihat daftar berpaginasi; MANAGER/EMPLOYEE 403; tanpa token 401", async () => {
    const res = await call("GET", `/accounts?q=auth-${RUN}&pageSize=50`, sa.headers);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; meta: { total: number } };
    expect(body.meta.total).toBeGreaterThanOrEqual(4);
    expect((await call("GET", "/accounts", hr.headers)).status).toBe(200);
    expect(await code(await call("GET", "/accounts", mgr.headers))).toBe("FORBIDDEN");
    expect((await call("GET", "/accounts", emp.headers)).status).toBe(403);
    expect((await call("GET", "/accounts", {})).status).toBe(401);
  });

  test("filter tidak valid → 400", async () => {
    expect(await code(await call("GET", "/accounts?role=RAJA", sa.headers))).toBe(
      "VALIDATION_ERROR",
    );
  });

  test("akun sendiri boleh dilihat; akun lain tidak (EMPLOYEE); id tak dikenal 404", async () => {
    expect((await call("GET", `/accounts/${emp.account.id}`, emp.headers)).status).toBe(200);
    expect((await call("GET", `/accounts/${mgr.account.id}`, emp.headers)).status).toBe(403);
    expect((await call("GET", `/accounts/${crypto.randomUUID()}`, sa.headers)).status).toBe(404);
  });
});

describe("POST /accounts/invite", () => {
  test("SA mengundang MANAGER → 201, undangan terkirim, audit tercatat", async () => {
    const res = await call("POST", "/accounts/invite", sa.headers, {
      email: email("Inv1").toUpperCase(),
      role: "MANAGER",
    });
    expect(res.status).toBe(201);
    const account = await data(res);
    expect(account).toMatchObject({ email: email("inv1"), role: "MANAGER", isActive: true });
    expect(fake.invited).toContain(email("inv1"));
    const log = await prisma.auditLog.findFirst({
      where: { entityId: account.id, action: "iam.account.invite" },
    });
    expect(log?.actorAccountId).toBe(sa.account.id);
  });

  test("user Auth yang sudah ada dipakai ulang tanpa email undangan baru", async () => {
    const existingId = fake.addExistingUser(email("existing"));
    const res = await call("POST", "/accounts/invite", hr.headers, {
      email: email("existing"),
      role: "EMPLOYEE",
    });
    expect(res.status).toBe(201);
    const stored = await prisma.account.findUniqueOrThrow({ where: { email: email("existing") } });
    expect(stored.authUserId).toBe(existingId);
    expect(fake.invited).not.toContain(email("existing"));
  });

  test("HR hanya boleh mengundang EMPLOYEE; SA non-Utama tidak boleh SUPER_ADMIN; email ganda 409", async () => {
    expect(
      (await call("POST", "/accounts/invite", hr.headers, { email: email("x1"), role: "MANAGER" }))
        .status,
    ).toBe(403);
    expect(
      (
        await call("POST", "/accounts/invite", sa.headers, {
          email: email("x2"),
          role: "SUPER_ADMIN",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("POST", "/accounts/invite", emp.headers, {
          email: email("x3"),
          role: "EMPLOYEE",
        })
      ).status,
    ).toBe(403);
    expect(
      await code(
        await call("POST", "/accounts/invite", sa.headers, {
          email: email("inv1"),
          role: "EMPLOYEE",
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      await code(
        await call("POST", "/accounts/invite", sa.headers, {
          email: "bukan-email",
          role: "EMPLOYEE",
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /accounts/:id/role", () => {
  test("SA mengubah role; grant yang tidak berlaku untuk role baru dicabut otomatis", async () => {
    const target = await auth.loginAs("HR_ADMIN", {
      grants: [{ permission: "CONTRACT_MANAGE" }, { permission: "EMPLOYEE_PERSONAL_READ" }],
    });
    const res = await call("PATCH", `/accounts/${target.account.id}/role`, sa.headers, {
      role: "MANAGER",
    });
    expect(res.status).toBe(200);
    expect((await data(res)).role).toBe("MANAGER");
    const active = await prisma.permissionGrant.findMany({
      where: { accountId: target.account.id, revokedAt: null },
    });
    // contract.manage tidak boleh untuk MANAGER (PLAN §4.2) → dicabut; personal.read tetap.
    expect(active.map((g) => g.permission)).toEqual(["EMPLOYEE_PERSONAL_READ"]);
    const log = await prisma.auditLog.findFirst({
      where: { entityId: target.account.id, action: "iam.account.change_role" },
    });
    expect(log?.after).toMatchObject({ role: "MANAGER", revokedGrants: ["contract.manage"] });
  });

  test("role sama 409; mengubah diri sendiri 403; SA non-Utama tidak boleh menyentuh SUPER_ADMIN; HR 403", async () => {
    const target = await auth.loginAs("EMPLOYEE");
    expect(
      await code(
        await call("PATCH", `/accounts/${target.account.id}/role`, sa.headers, {
          role: "EMPLOYEE",
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      (await call("PATCH", `/accounts/${sa.account.id}/role`, sa.headers, { role: "HR_ADMIN" }))
        .status,
    ).toBe(403);
    expect(
      (
        await call("PATCH", `/accounts/${target.account.id}/role`, sa.headers, {
          role: "SUPER_ADMIN",
        })
      ).status,
    ).toBe(403);
    const otherSa = await auth.loginAs("SUPER_ADMIN");
    expect(
      (
        await call("PATCH", `/accounts/${otherSa.account.id}/role`, sa.headers, {
          role: "EMPLOYEE",
        })
      ).status,
    ).toBe(403);
    expect(
      (await call("PATCH", `/accounts/${target.account.id}/role`, hr.headers, { role: "MANAGER" }))
        .status,
    ).toBe(403);
  });
});

describe("POST /accounts/:id/deactivate & /reactivate", () => {
  test("nonaktif → user Auth di-ban & token-nya ditolak; aktif kembali → unban", async () => {
    const target = await auth.loginAs("EMPLOYEE");
    expect((await call("GET", "/me", target.headers)).status).toBe(200);
    const res = await call("POST", `/accounts/${target.account.id}/deactivate`, hr.headers);
    expect(res.status).toBe(200);
    expect((await data(res)).isActive).toBe(false);
    expect(fake.banned.get(target.account.authUserId)).toBe(true);
    expect((await call("GET", "/me", target.headers)).status).toBe(401);
    expect(
      await code(await call("POST", `/accounts/${target.account.id}/deactivate`, hr.headers)),
    ).toBe("CONFLICT");

    expect(
      (await call("POST", `/accounts/${target.account.id}/reactivate`, hr.headers)).status,
    ).toBe(200);
    expect(fake.banned.get(target.account.authUserId)).toBe(false);
    expect((await call("GET", "/me", target.headers)).status).toBe(200);
  });

  test("HR tidak boleh menonaktifkan HR_ADMIN/SUPER_ADMIN; tidak ada yang menonaktifkan diri sendiri", async () => {
    const otherHr = await auth.loginAs("HR_ADMIN");
    expect(
      (await call("POST", `/accounts/${otherHr.account.id}/deactivate`, hr.headers)).status,
    ).toBe(403);
    expect((await call("POST", `/accounts/${sa.account.id}/deactivate`, hr.headers)).status).toBe(
      403,
    );
    expect((await call("POST", `/accounts/${hr.account.id}/deactivate`, hr.headers)).status).toBe(
      403,
    );
    expect(
      (await call("POST", `/accounts/${otherHr.account.id}/deactivate`, sa.headers)).status,
    ).toBe(200);
  });

  test("ban Supabase gagal → 500 dan perubahan DB & audit dibatalkan", async () => {
    const target = await auth.loginAs("MANAGER");
    fake.setFailBan(true);
    try {
      expect(
        (await call("POST", `/accounts/${target.account.id}/deactivate`, sa.headers)).status,
      ).toBe(500);
    } finally {
      fake.setFailBan(false);
    }
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: target.account.id } })).isActive,
    ).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { entityId: target.account.id, action: "iam.account.deactivate" },
      }),
    ).toBe(0);
  });
});
