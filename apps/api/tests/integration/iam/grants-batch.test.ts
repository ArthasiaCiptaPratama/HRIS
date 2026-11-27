import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";

// IAM-D2 (2026-11-26): grant banyak akun × banyak izin + cabut terpilih.
const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(`gb-${RUN}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});

type Headers = Record<string, string>;
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const call = (method: string, path: string, headers: Headers, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => ((await res.json()) as { data: any }).data;
const grantsOf = (accountId: string) =>
  prisma.permissionGrant.count({ where: { accountId, revokedAt: null } });

let sa: Login, hrA: Login, hrB: Login, hrC: Login, mgr: Login, inactiveHr: Login;

beforeAll(async () => {
  sa = await auth.loginAs("SUPER_ADMIN");
  hrA = await auth.loginAs("HR_ADMIN");
  hrB = await auth.loginAs("HR_ADMIN");
  hrC = await auth.loginAs("HR_ADMIN");
  mgr = await auth.loginAs("MANAGER");
  inactiveHr = await auth.loginAs("HR_ADMIN", { isActive: false });
});

afterAll(async () => {
  const ids = [hrA, hrB, hrC, mgr, inactiveHr].map((l) => l.account.id);
  await prisma.notification.deleteMany({ where: { recipientAccountId: { in: ids } } });
  await auth.cleanup();
  await disconnectPrisma();
});

describe("POST /grants/batch", () => {
  test("campuran: dibuat / sudah aktif / tidak sesuai role / nonaktif; pratinjau tidak menulis; audit + notifikasi digabung", async () => {
    // hrA sudah punya "Lihat data pribadi" → dilewati, bukan error.
    expect(
      (
        await call("POST", "/grants", sa.headers, {
          accountId: hrA.account.id,
          permission: "employee.personal.read",
        })
      ).status,
    ).toBe(201);
    const body = {
      accountIds: [hrA.account.id, hrB.account.id, mgr.account.id, inactiveHr.account.id],
      permissions: ["employee.personal.read", "contract.manage"],
      reason: "audit Q4",
    };
    const status = (items: { accountId: string; permission: string; status: string }[]) =>
      Object.fromEntries(items.map((i) => [`${i.accountId}:${i.permission}`, i.status]));
    const expected = {
      [`${hrA.account.id}:employee.personal.read`]: "skipped_active",
      [`${hrA.account.id}:contract.manage`]: "created",
      [`${hrB.account.id}:employee.personal.read`]: "created",
      [`${hrB.account.id}:contract.manage`]: "created",
      [`${mgr.account.id}:employee.personal.read`]: "created",
      // contract.manage hanya untuk HR_ADMIN.
      [`${mgr.account.id}:contract.manage`]: "skipped_not_grantable",
      [`${inactiveHr.account.id}:employee.personal.read`]: "skipped_inactive",
      [`${inactiveHr.account.id}:contract.manage`]: "skipped_inactive",
    };

    const preview = await call("POST", "/grants/batch", sa.headers, { ...body, dryRun: true });
    expect(preview.status).toBe(200);
    const previewData = await data(preview);
    expect(previewData).toMatchObject({ batchId: null, created: 4, skipped: 4 });
    expect(status(previewData.items)).toEqual(expected);
    expect(await grantsOf(hrB.account.id)).toBe(0);

    const res = await call("POST", "/grants/batch", sa.headers, body);
    expect(res.status).toBe(200);
    const result = await data(res);
    expect(result).toMatchObject({ created: 4, skipped: 4 });
    expect(status(result.items)).toEqual(expected);
    expect(await grantsOf(hrB.account.id)).toBe(2);
    expect(await grantsOf(mgr.account.id)).toBe(1);
    expect(await grantsOf(inactiveHr.account.id)).toBe(0);
    const audits = await prisma.auditLog.findMany({
      where: { action: "iam.grant.create", after: { path: ["batchId"], equals: result.batchId } },
    });
    expect(audits).toHaveLength(4);
    expect(audits.every((a) => a.reason === "audit Q4")).toBe(true);
    // Satu notifikasi per penerima, berisi semua izin barunya.
    const notes = await prisma.notification.findMany({
      where: { recipientAccountId: hrB.account.id, type: "iam.grant_created" },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toContain("2 izin diberikan");
  });

  test("global: 401/403/400/422/404; gagal di tengah daftar → tidak ada yang dibuat", async () => {
    const body = { accountIds: [hrC.account.id], permissions: ["employee.bank.read"] };
    expect((await call("POST", "/grants/batch", {}, body)).status).toBe(401);
    expect((await call("POST", "/grants/batch", hrA.headers, body)).status).toBe(403);
    for (const bad of [
      { ...body, accountIds: [] },
      { ...body, permissions: [] },
      { ...body, permissions: ["payroll.salary.read"] },
    ])
      expect(await code(await call("POST", "/grants/batch", sa.headers, bad))).toBe(
        "VALIDATION_ERROR",
      );
    expect(
      await code(
        await call("POST", "/grants/batch", sa.headers, {
          ...body,
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    // Akun valid lalu akun tak dikenal: seluruh batch ditolak, tidak ada grant tertulis.
    const res = await call("POST", "/grants/batch", sa.headers, {
      ...body,
      accountIds: [hrC.account.id, crypto.randomUUID()],
    });
    expect(res.status).toBe(404);
    expect(await grantsOf(hrC.account.id)).toBe(0);
  });

  test("batas 50 akun × semua izin (15)", async () => {
    const tooMany = Array.from({ length: 51 }, () => crypto.randomUUID());
    expect(
      await code(
        await call("POST", "/grants/batch", sa.headers, {
          accountIds: tooMany,
          permissions: ["employee.bank.read"],
        }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      await code(
        await call("POST", "/grants/batch", sa.headers, {
          accountIds: [hrC.account.id],
          permissions: Array.from({ length: 16 }, () => "employee.bank.read"),
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("POST /grants/revoke-batch + filter daftar", () => {
  test("cabut terpilih: yang sudah tidak aktif dilewati; id tak dikenal → 404 tanpa mencabut apa pun", async () => {
    const created = await data(
      await call("POST", "/grants/batch", sa.headers, {
        accountIds: [hrC.account.id],
        permissions: ["employee.bank.read", "employee.documents.read", "asset.manage"],
      }),
    );
    const [g1, g2, g3] = created.items.map((i: { grantId: string }) => i.grantId) as [
      string,
      string,
      string,
    ];
    expect((await call("POST", `/grants/${g2}/revoke`, sa.headers, {})).status).toBe(200);

    // Daftar bisa difilter banyak akun & banyak izin (dipisah koma).
    const list = await (
      await call(
        "GET",
        `/grants?accountIds=${hrC.account.id},${hrB.account.id}&permissions=employee.bank.read,asset.manage&active=true`,
        sa.headers,
      )
    ).json();
    expect((list as { data: { id: string }[] }).data.map((g) => g.id).sort()).toEqual(
      [g1, g3].sort(),
    );

    expect(
      (
        await call("POST", "/grants/revoke-batch", sa.headers, {
          ids: [g1, crypto.randomUUID()],
        })
      ).status,
    ).toBe(404);
    expect(await grantsOf(hrC.account.id)).toBe(2);
    expect((await call("POST", "/grants/revoke-batch", hrA.headers, { ids: [g1] })).status).toBe(
      403,
    );

    const res = await call("POST", "/grants/revoke-batch", sa.headers, {
      ids: [g1, g2, g3],
      reason: "selesai audit",
    });
    expect(res.status).toBe(200);
    const result = await data(res);
    expect(result).toMatchObject({ revoked: 2, skipped: 1 });
    expect(
      Object.fromEntries(result.items.map((i: { id: string; status: string }) => [i.id, i.status])),
    ).toEqual({
      [g1 as string]: "revoked",
      [g2 as string]: "skipped_inactive",
      [g3 as string]: "revoked",
    });
    expect(await grantsOf(hrC.account.id)).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: "iam.grant.revoke", after: { path: ["batchId"], equals: result.batchId } },
      }),
    ).toBe(2);
  });
});
