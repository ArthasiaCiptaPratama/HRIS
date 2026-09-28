import { afterAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { bearer, createAuthFixture, testVerifier } from "../../helpers/auth.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(RUN);
const app = createApp({ logger: createLogger("error", () => {}), tokenVerifier: testVerifier });

interface MeBody {
  data: {
    id: string;
    role: string;
    employeeId: string | null;
    lastLoginAt: string | null;
    grants: { permission: string; expiresAt: string | null }[];
  };
}

const getMe = (headers: Record<string, string> = {}) => app.request("/api/v1/me", { headers });
const errorCode = async (res: Response) => ((await res.json()) as ErrorBody).error.code;

afterAll(async () => {
  await auth.cleanup();
  await disconnectPrisma();
});

describe("GET /api/v1/me", () => {
  test("401 tanpa token", async () => {
    const res = await getMe();
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHENTICATED");
  });

  test("401 token tidak valid", async () => {
    const res = await getMe({ Authorization: "Bearer rusak" });
    expect(res.status).toBe(401);
  });

  test("401 token valid tetapi belum punya akun HRIS", async () => {
    const res = await getMe(bearer(crypto.randomUUID()));
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorBody).error.message).toContain("Akun tidak aktif");
  });

  test("401 akun nonaktif (PLAN §4.5)", async () => {
    const { headers } = await auth.loginAs("EMPLOYEE", { isActive: false });
    expect((await getMe(headers)).status).toBe(401);
  });

  test("200: role tunggal & hanya grant aktif (kedaluwarsa/dicabut tidak tampil)", async () => {
    const { account, headers } = await auth.loginAs("HR_ADMIN", {
      grants: [
        { permission: "EMPLOYEE_PERSONAL_READ" },
        { permission: "EMPLOYEE_BANK_READ", expiresAt: new Date(Date.now() + 86_400_000) },
        { permission: "EMPLOYEE_DOCUMENTS_READ", expiresAt: new Date(Date.now() - 60_000) },
        { permission: "CONTRACT_MANAGE", revoked: true },
      ],
    });
    const res = await getMe(headers);
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeBody;
    expect(body.data).toMatchObject({ id: account.id, role: "HR_ADMIN", employeeId: null });
    expect(body.data.grants.map((g) => g.permission).sort()).toEqual([
      "employee.bank.read",
      "employee.personal.read",
    ]);
  });

  test("mencatat last_login_at", async () => {
    const { account, headers } = await auth.loginAs("MANAGER");
    const before = Date.now();
    const body = (await (await getMe(headers)).json()) as MeBody;
    const stored = await getPrisma().account.findUniqueOrThrow({ where: { id: account.id } });
    expect(stored.lastLoginAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(body.data.lastLoginAt).toBe(stored.lastLoginAt?.toISOString() ?? null);
  });

  test("grant yang dicabut langsung tidak berlaku di request berikutnya (D-008)", async () => {
    const { account, headers } = await auth.loginAs("HR_ADMIN", {
      grants: [{ permission: "EMPLOYEE_PERSONAL_READ" }],
    });
    expect(((await (await getMe(headers)).json()) as MeBody).data.grants).toHaveLength(1);
    const prisma = getPrisma();
    const grant = await prisma.permissionGrant.findFirstOrThrow({
      where: { accountId: account.id },
    });
    await prisma.permissionGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date(), revokedBy: grant.grantedBy },
    });
    expect(((await (await getMe(headers)).json()) as MeBody).data.grants).toHaveLength(0);
  });

  test("terdaftar di OpenAPI dengan skema Bearer", async () => {
    const doc = (await (await app.request("/api/v1/openapi.json")).json()) as {
      paths: Record<string, { get?: { security?: unknown[] } }>;
    };
    expect(doc.paths["/api/v1/me"]?.get?.security).toEqual([{ Bearer: [] }]);
  });
});
