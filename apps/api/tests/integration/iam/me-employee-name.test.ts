import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";

// BUG-004: /me menyertakan nama karyawan yang tertaut ke akun (untuk sapaan & kartu akun di web);
// akun tanpa karyawan → null (web memakai email sebagai cadangan).
const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(`me${RUN}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const me = async (headers: Record<string, string>): Promise<any> =>
  ((await (await app.request("/api/v1/me", { headers })).json()) as { data: unknown }).data;

let employeeId = "";
let departmentId = "";
let createdStatusId: string | null = null;

beforeAll(async () => {
  const existing = await prisma.employmentStatus.findFirst({ select: { id: true } });
  const status =
    existing ??
    (await prisma.employmentStatus.create({
      data: { name: `Status Me ${RUN}` },
      select: { id: true },
    }));
  if (!existing) createdStatusId = status.id;
  departmentId = (await prisma.department.create({ data: { name: `Dept Me ${RUN}` } })).id;
  const positionId = (
    await prisma.position.create({ data: { name: `Jab Me ${RUN}`, departmentId } })
  ).id;
  employeeId = (
    await prisma.employee.create({
      data: {
        companyId: await acpCompanyId(),
        employeeNumber: `ME-${RUN}`,
        fullName: `Karyawan Me ${RUN}`,
        joinDate: new Date("2024-01-02T00:00:00.000Z"),
        employmentStatusId: status.id,
        positionId,
      },
    })
  ).id;
});

afterAll(async () => {
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: employeeId } });
  await prisma.position.deleteMany({ where: { departmentId } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
  if (createdStatusId) await prisma.employmentStatus.deleteMany({ where: { id: createdStatusId } });
  await disconnectPrisma();
});

describe("GET /me — nama karyawan (BUG-004)", () => {
  test("akun tertaut karyawan → employeeName = nama lengkap karyawan", async () => {
    const emp = await auth.loginAs("EMPLOYEE", { employeeId });
    expect((await me(emp.headers)).employeeName).toBe(`Karyawan Me ${RUN}`);
  });

  test("akun tanpa karyawan → employeeName null", async () => {
    const sa = await auth.loginAs("SUPER_ADMIN");
    expect((await me(sa.headers)).employeeName).toBeNull();
  });
});
