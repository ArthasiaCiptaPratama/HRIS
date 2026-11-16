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
    // ONB-D2: role Manager wajib tertaut karyawan.
    const hrTemp = await auth.loginAs("HR_ADMIN", {
      companies: [ids.acp, ids.other],
      employeeId: await makeEmployee("T", ids.acp),
    });
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

// ONB-D2: akun Karyawan/Manager wajib tertaut ke data karyawan (kasus akun Seifal di staging).
describe("ONB-D2: akun wajib tertaut karyawan", () => {
  const mail = (n: string) => `auth-${RUN}-onbd2-${n}@example.test`;
  const invite = (headers: Headers, body: Record<string, unknown>) =>
    call("POST", "/accounts/invite", headers, body);

  test("undang Karyawan/Manager tanpa karyawan → 422 (SA & HR)", async () => {
    expect(await code(await invite(sa.headers, { email: mail("a"), role: "EMPLOYEE" }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    expect(await code(await invite(hrA.headers, { email: mail("a"), role: "EMPLOYEE" }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    expect(await code(await invite(sa.headers, { email: mail("a"), role: "MANAGER" }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    expect(await prisma.account.count({ where: { email: mail("a") } })).toBe(0);
  });

  test("undang Karyawan dengan karyawan → 202 antrean Undang Karyawan Terdaftar (lengkapi data)", async () => {
    const employeeId = await makeEmployee("I1", ids.acp);
    const res = await invite(hrA.headers, {
      email: mail("i1").toUpperCase(),
      role: "EMPLOYEE",
      employeeId,
    });
    expect(res.status).toBe(202);
    expect(await data(res)).toEqual({ employeeId, queued: true });
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(employee).toMatchObject({ completionRequired: true, personalEmail: mail("i1") });
    const queued = await prisma.onboardingInvitation.findFirstOrThrow({ where: { employeeId } });
    expect(queued).toMatchObject({ status: "QUEUED", email: mail("i1") });
    // Antrean diproses → akun Karyawan langsung tertaut.
    await call("POST", "/onboarding-invitations/process", sa.headers);
    const account = await prisma.account.findUniqueOrThrow({ where: { employeeId } });
    expect(account).toMatchObject({ role: "EMPLOYEE", email: mail("i1") });
  });

  test("undang Karyawan: karyawan berakun 409, karyawan PT lain (HR) 404, email dipakai 409", async () => {
    expect(
      await code(
        await invite(hrA.headers, { email: mail("i2"), role: "EMPLOYEE", employeeId: ids.empA }),
      ),
    ).toBe("CONFLICT");
    const otherPt = await makeEmployee("I3", ids.other);
    expect(
      (await invite(hrA.headers, { email: mail("i3"), role: "EMPLOYEE", employeeId: otherPt }))
        .status,
    ).toBe(404);
    const free = await makeEmployee("I4", ids.acp);
    expect(
      await code(
        await invite(sa.headers, {
          email: accA.account.email,
          role: "EMPLOYEE",
          employeeId: free,
        }),
      ),
    ).toBe("CONFLICT");
  });

  test("undang Manager dengan karyawan → 201 tertaut dalam satu langkah + audit", async () => {
    const employeeId = await makeEmployee("M1", ids.acp);
    const res = await invite(sa.headers, { email: mail("m1"), role: "MANAGER", employeeId });
    expect(res.status).toBe(201);
    const account = await data(res);
    expect(account).toMatchObject({ role: "MANAGER", employeeId, needsEmployeeLink: false });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: account.id, action: "iam.account.invite" },
    });
    expect(audit.after).toMatchObject({ employeeId, invitationEmailSent: true });
    // Karyawan nonaktif tidak bisa dipakai.
    const inactive = await makeEmployee("M2", ids.acp);
    await prisma.employee.update({ where: { id: inactive }, data: { isActive: false } });
    expect(
      await code(
        await invite(sa.headers, { email: mail("m2"), role: "MANAGER", employeeId: inactive }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
  });

  test("ganti role akun belum tertaut ke Manager/Karyawan → 422", async () => {
    const loose = await auth.loginAs("HR_PERSONNEL");
    for (const role of ["MANAGER", "EMPLOYEE"]) {
      expect(
        await code(await call("PATCH", `/accounts/${loose.account.id}/role`, sa.headers, { role })),
      ).toBe("BUSINESS_RULE_VIOLATION");
    }
  });

  test("daftar: penanda & filter belum tertaut", async () => {
    const res = await call("GET", `/accounts?q=auth-${RUN}&unlinked=true&pageSize=100`, sa.headers);
    const rows = (await data(res)) as { id: string; needsEmployeeLink: boolean; role: string }[];
    expect(rows.map((r) => r.id)).toContain(accUnlinked.account.id);
    expect(rows.map((r) => r.id)).not.toContain(accA.account.id);
    expect(rows.every((r) => r.needsEmployeeLink && ["EMPLOYEE", "MANAGER"].includes(r.role))).toBe(
      true,
    );
    const linked = await data(await call("GET", `/accounts/${accA.account.id}`, sa.headers));
    expect(linked.needsEmployeeLink).toBe(false);
  });

  test("tautkan: saran dari email, sukses + audit, ulang 409, karyawan berakun 409", async () => {
    const loose = await auth.loginAs("EMPLOYEE");
    const employeeId = await makeEmployee("L1", ids.acp);
    await prisma.employee.update({
      where: { id: employeeId },
      data: { personalEmail: loose.account.email.toUpperCase() },
    });
    const suggestions = await data(
      await call("GET", `/accounts/${loose.account.id}/link-suggestions`, hrA.headers),
    );
    expect(suggestions).toEqual([
      expect.objectContaining({ employeeId, matchedBy: "PERSONAL_EMAIL" }),
    ]);
    const res = await call("PUT", `/accounts/${loose.account.id}/employee`, hrA.headers, {
      employeeId,
    });
    expect(res.status).toBe(200);
    expect(await data(res)).toMatchObject({ employeeId, needsEmployeeLink: false });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: loose.account.id, action: "iam.account.link_employee" },
    });
    expect(audit).toMatchObject({
      actorAccountId: hrA.account.id,
      before: { employeeId: null },
      after: { employeeId, role: "EMPLOYEE" },
    });
    // Login tidak diubah (Q2a): email Auth tidak diganti.
    expect(fake.emailChanges.some((c) => c.userId === loose.account.authUserId)).toBe(false);
    // Akun yang sudah tertaut → 409; karyawan yang sudah berakun → 409.
    expect(
      await code(
        await call("PUT", `/accounts/${loose.account.id}/employee`, sa.headers, {
          employeeId: await makeEmployee("L2", ids.acp),
        }),
      ),
    ).toBe("CONFLICT");
    const another = await auth.loginAs("EMPLOYEE");
    expect(
      await code(
        await call("PUT", `/accounts/${another.account.id}/employee`, sa.headers, { employeeId }),
      ),
    ).toBe("CONFLICT");
    expect(
      await data(await call("GET", `/accounts/${loose.account.id}/link-suggestions`, sa.headers)),
    ).toEqual([]);
  });

  test("tautkan: akses HR (PT lain 404, akun HR 403), MANAGER 403, karyawan nonaktif 422", async () => {
    const loose = await auth.loginAs("EMPLOYEE");
    const otherPt = await makeEmployee("L3", ids.other);
    expect(
      (
        await call("PUT", `/accounts/${loose.account.id}/employee`, hrA.headers, {
          employeeId: otherPt,
        })
      ).status,
    ).toBe(404);
    const looseHr = await auth.loginAs("HR_PERSONNEL", { companies: [] });
    const own = await makeEmployee("L4", ids.acp);
    expect(
      (
        await call("PUT", `/accounts/${looseHr.account.id}/employee`, hrA.headers, {
          employeeId: own,
        })
      ).status,
    ).toBe(403);
    const mgr = await auth.loginAs("MANAGER", { employeeId: await makeEmployee("L5", ids.acp) });
    expect(
      (
        await call("PUT", `/accounts/${loose.account.id}/employee`, mgr.headers, {
          employeeId: own,
        })
      ).status,
    ).toBe(403);
    await prisma.employee.update({ where: { id: own }, data: { isActive: false } });
    expect(
      await code(
        await call("PUT", `/accounts/${loose.account.id}/employee`, sa.headers, {
          employeeId: own,
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    // SA boleh menautkan akun HR (opsional untuk role HR).
    const hrEmp = await makeEmployee("L6", ids.acp);
    expect(
      (
        await call("PUT", `/accounts/${looseHr.account.id}/employee`, sa.headers, {
          employeeId: hrEmp,
        })
      ).status,
    ).toBe(200);
  });

  test("ONB-D1: akun dari Akun › Undang akun (invitationEmailSent) ikut di-ban saat undangan dibatalkan", async () => {
    const employeeId = await makeEmployee("C1", ids.acp);
    const account = await data(
      await invite(sa.headers, { email: mail("c1"), role: "MANAGER", employeeId }),
    );
    await call("PATCH", `/accounts/${account.id}/role`, sa.headers, { role: "EMPLOYEE" });
    await prisma.employee.update({ where: { id: employeeId }, data: { completionRequired: true } });
    const { authUserId } = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    const res = await call("DELETE", `/onboarding/${employeeId}/invitation`, sa.headers);
    expect(await data(res)).toMatchObject({ cancelled: true, authUserRetired: true });
    const stored = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: account.id, action: "iam.account.invite" },
    });
    expect(stored.after).toMatchObject({ invitationEmailSent: true });
    expect(fake.banned.get(authUserId)).toBe(true);
  });

  test("kontrak: operationId linkAccountEmployee & listAccountLinkSuggestions", async () => {
    const spec = (await (await app.request("/api/v1/openapi.json")).json()) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
    expect(spec.paths["/api/v1/accounts/{id}/employee"]?.put?.operationId).toBe(
      "linkAccountEmployee",
    );
    expect(spec.paths["/api/v1/accounts/{id}/link-suggestions"]?.get?.operationId).toBe(
      "listAccountLinkSuggestions",
    );
  });
});
