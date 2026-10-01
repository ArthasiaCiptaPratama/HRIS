import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// D-040: cakupan perusahaan di iam — HR_ADMIN hanya akun karyawan di PT yang ditugaskan (+ akun yang
// belum tertaut karyawan); penugasan PT hanya oleh SUPER_ADMIN (audit + notifikasi).
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

type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const ids = { acp: "", other: "", department: "", position: "", status: "", empA: "", empB: "" };
let sa: Login;
let hrA: Login;
let hrNone: Login;
let accA: Login;
let accB: Login;
let accUnlinked: Login;

async function makeEmployee(n: string, companyId: string) {
  return (
    await prisma.employee.create({
      data: {
        companyId,
        employeeNumber: `A-${RUN}-${n}`,
        fullName: `Akun ${RUN} ${n}`,
        joinDate: new Date("2024-01-02T00:00:00.000Z"),
        employmentStatusId: ids.status,
        positionId: ids.position,
      },
    })
  ).id;
}

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.other = await createTestCompany(`A${RUN.slice(0, 6)}`, `PT Akun ${RUN}`);
  ids.department = (await prisma.department.create({ data: { name: `Dept Akun ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `Jab ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `St Akun ${RUN}` } })).id;
  ids.empA = await makeEmployee("A", ids.acp);
  ids.empB = await makeEmployee("B", ids.other);

  sa = await auth.loginAs("SUPER_ADMIN");
  hrA = await auth.loginAs("HR_ADMIN"); // default: ACP
  hrNone = await auth.loginAs("HR_ADMIN", { companies: [] });
  accA = await auth.loginAs("EMPLOYEE", { employeeId: ids.empA });
  accB = await auth.loginAs("EMPLOYEE", { employeeId: ids.empB });
  accUnlinked = await auth.loginAs("EMPLOYEE");
});

afterAll(async () => {
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { employeeNumber: { startsWith: `A-${RUN}-` } } });
  await prisma.company.delete({ where: { id: ids.other } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

const listIds = async (headers: Headers) =>
  (await data(await call("GET", `/accounts?q=auth-${RUN}&pageSize=50`, headers))).map(
    (a: { id: string }) => a.id,
  );

describe("D-040: cakupan akun untuk HR_ADMIN", () => {
  test("daftar: HR ACP melihat akun karyawan ACP & akun belum tertaut, bukan akun karyawan PT lain", async () => {
    const hrList = await listIds(hrA.headers);
    expect(hrList).toContain(accA.account.id);
    expect(hrList).toContain(accUnlinked.account.id);
    expect(hrList).not.toContain(accB.account.id);
    const saList = await listIds(sa.headers);
    expect(saList).toEqual(expect.arrayContaining([accA.account.id, accB.account.id]));
  });

  test("detail & nonaktif akun karyawan PT lain → 404; di dalam cakupan boleh", async () => {
    expect((await call("GET", `/accounts/${accB.account.id}`, hrA.headers)).status).toBe(404);
    expect(
      (await call("POST", `/accounts/${accB.account.id}/deactivate`, hrA.headers)).status,
    ).toBe(404);
    expect((await call("GET", `/accounts/${accA.account.id}`, hrA.headers)).status).toBe(200);
    expect(
      (await call("POST", `/accounts/${accA.account.id}/deactivate`, hrA.headers)).status,
    ).toBe(200);
    expect(
      (await call("POST", `/accounts/${accA.account.id}/reactivate`, hrA.headers)).status,
    ).toBe(200);
  });

  test("HR tanpa penugasan: hanya akun yang belum tertaut karyawan", async () => {
    const list = await listIds(hrNone.headers);
    expect(list).toContain(accUnlinked.account.id);
    expect(list).not.toContain(accA.account.id);
    expect(list).not.toContain(accB.account.id);
  });
});

describe("D-040: PUT /accounts/:id/companies", () => {
  test("SA menugaskan PT → cakupan HR langsung berubah; audit & notifikasi tertulis", async () => {
    const res = await call("PUT", `/accounts/${hrNone.account.id}/companies`, sa.headers, {
      companyIds: [ids.other],
    });
    expect(res.status).toBe(200);
    expect((await data(res)).companyIds).toEqual([ids.other]);
    const list = await listIds(hrNone.headers);
    expect(list).toContain(accB.account.id);
    expect(list).not.toContain(accA.account.id);
    expect(
      await prisma.auditLog.count({
        where: { action: "iam.account.assign_companies", entityId: hrNone.account.id },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { recipientAccountId: hrNone.account.id, type: "iam.companies_assigned" },
      }),
    ).toBe(1);
    // Daftar akun (SA) menampilkan penugasan.
    const hrRow = (
      await data(await call("GET", `/accounts?q=auth-${RUN}&pageSize=50`, sa.headers))
    ).find((a: { id: string }) => a.id === hrNone.account.id);
    expect(hrRow.companyIds).toEqual([ids.other]);
  });

  test("hanya SUPER_ADMIN & hanya untuk akun HR_ADMIN; PT tak dikenal 422; ganda 400", async () => {
    const body = { companyIds: [ids.acp] };
    expect(
      await code(await call("PUT", `/accounts/${hrNone.account.id}/companies`, hrA.headers, body)),
    ).toBe("FORBIDDEN");
    expect(
      await code(await call("PUT", `/accounts/${accA.account.id}/companies`, sa.headers, body)),
    ).toBe("FORBIDDEN");
    expect(
      await code(
        await call("PUT", `/accounts/${hrNone.account.id}/companies`, sa.headers, {
          companyIds: [crypto.randomUUID()],
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(
      await code(
        await call("PUT", `/accounts/${hrNone.account.id}/companies`, sa.headers, {
          companyIds: [ids.acp, ids.acp],
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  test("role berubah dari HR_ADMIN → penugasan PT dicabut + tercatat di audit", async () => {
    const hrTemp = await auth.loginAs("HR_ADMIN", { companies: [ids.acp, ids.other] });
    const res = await call("PATCH", `/accounts/${hrTemp.account.id}/role`, sa.headers, {
      role: "MANAGER",
    });
    expect(res.status).toBe(200);
    expect((await data(res)).companyIds).toEqual([]);
    expect(await prisma.accountCompany.count({ where: { accountId: hrTemp.account.id } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "iam.account.change_role", entityId: hrTemp.account.id },
    });
    const after = audit?.after as { removedCompanyIds?: string[] } | undefined;
    expect(after?.removedCompanyIds).toEqual(expect.arrayContaining([ids.acp, ids.other]));
  });
});
