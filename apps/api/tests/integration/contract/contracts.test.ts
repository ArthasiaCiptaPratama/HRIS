import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { EmploymentCategory } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import {
  contractActionResultSchema,
  employeeContractsSchema,
} from "../../../src/modules/contract/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const prisma = getPrisma();
const auth = createAuthFixture(RUN);
const fake = createFakeAuthAdmin();
const app = createApp({
  tokenVerifier: testVerifier,
  authAdmin: fake.admin,
  logger: createLogger("error", () => {}),
});
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login;
let hr: Login;
let hrNoGrant: Login;
let hrOther: Login;
let manager: Login;
let self: Login;
let other: Login;
let company = "";
let otherCompany = "";
let department = "";
let position = "";
let team = "";
let outsider = "";
const statuses = new Map<EmploymentCategory, string>();
const createdStatuses: string[] = [];
const employees: string[] = [];
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
async function makeEmployee(
  category: EmploymentCategory = "PKWT",
  managerId?: string,
  companyId = company,
) {
  const row = await prisma.employee.create({
    data: {
      fullName: `KTR ${RUN} ${employees.length}`,
      employeeNumber: `KTR-${RUN}-${employees.length}`,
      companyId,
      positionId: position,
      employmentStatusId: statuses.get(category) ?? "",
      joinDate: date("2020-01-01"),
      managerId: managerId ?? null,
      pkwttStartDate: category === "PROBATION" ? date("2025-01-01") : null,
    },
  });
  employees.push(row.id);
  return row.id;
}
const call = (method: string, id: string, path: string, login?: Login, input?: unknown) =>
  app.request(`/api/v1/employees/${id}${path}`, {
    method,
    headers: {
      ...(login?.headers ?? {}),
      ...(input === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
async function action(id: string, path: string, input: unknown, login = sa) {
  const response = await call("POST", id, path, login, input);
  const body: unknown = await response.json();
  expect({ status: response.status, body }).toMatchObject({ status: 200 });
  await assertContractCopy(id);
  return contractActionResultSchema.parse((body as { data: unknown }).data);
}
async function assertContractCopy(id: string) {
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id } });
  const current = await prisma.employmentContract.findFirst({
    where: { employeeId: id, status: "ACTIVE" },
  });
  expect(employee.contractStage).toBe(current?.kind === "PKWT" ? current.sequence : null);
  expect(employee.contractEndDate).toEqual(current?.endDate ?? null);
}
const initial = { kind: "PKWT", sequence: 1, startDate: "2020-01-01", endDate: "2021-12-31" };
async function active(id: string, input: unknown = initial) {
  const result = await action(id, "/contracts", input);
  if (!result.contract) throw new Error("Expected contract");
  return result.contract;
}
beforeAll(async () => {
  company = await acpCompanyId();
  otherCompany = await createTestCompany(`K${RUN.slice(0, 7)}`, `KTR other ${RUN}`);
  department = (await prisma.department.create({ data: { name: `KTR ${RUN}` } })).id;
  position = (
    await prisma.position.create({ data: { departmentId: department, name: `KTR ${RUN}` } })
  ).id;
  for (const category of [
    "PKWT",
    "PROBATION",
    "PERMANENT",
    "DAILY_WORKER",
    "INTERNSHIP",
  ] as const) {
    const existing = await prisma.employmentStatus.findUnique({ where: { category } });
    if (existing) statuses.set(category, existing.id);
    else {
      const status = await prisma.employmentStatus.create({
        data: { name: `KTR ${category} ${RUN}`, category },
      });
      statuses.set(category, status.id);
      createdStatuses.push(status.id);
    }
  }
  const managerId = await makeEmployee("PERMANENT");
  team = await makeEmployee("PKWT", managerId);
  outsider = await makeEmployee("PKWT", undefined, otherCompany);
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", {
    grants: [{ permission: "CONTRACT_MANAGE" }],
    companies: [company],
  });
  hrNoGrant = await auth.loginAs("HR_ADMIN", { companies: [company] });
  hrOther = await auth.loginAs("HR_ADMIN", {
    grants: [{ permission: "CONTRACT_MANAGE" }],
    companies: [otherCompany],
  });
  manager = await auth.loginAs("MANAGER", { employeeId: managerId });
  self = await auth.loginAs("EMPLOYEE", { employeeId: team });
  other = await auth.loginAs("EMPLOYEE", { employeeId: outsider });
});
afterAll(async () => {
  await auth.cleanup();
  const owned = await prisma.employee.findMany({
    where: { fullName: { startsWith: `KTR ${RUN} ` } },
    select: { id: true },
  });
  const ownedIds = owned.map((row) => row.id);
  employees.push(...ownedIds.filter((id) => !employees.includes(id)));
  await prisma.employee.updateMany({ where: { id: { in: employees } }, data: { managerId: null } });
  // Self-referential FK is RESTRICT; remove links before deleting the test fixture.
  await prisma.employmentContract.updateMany({
    where: { employeeId: { in: employees } },
    data: { previousContractId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.employmentStatus.deleteMany({ where: { id: { in: createdStatuses } } });
  await prisma.position.delete({ where: { id: position } });
  await prisma.department.delete({ where: { id: department } });
  await prisma.company.delete({ where: { id: otherCompany } });
  await disconnectPrisma();
});

describe("contract access matrix", () => {
  test("GET: SA, HR scoped, manager team, employee self; outside scope hidden", async () => {
    for (const [login, id, expected] of [
      [sa, team, 200],
      [hr, team, 200],
      [hrNoGrant, team, 200],
      [hrOther, team, 404],
      [manager, team, 200],
      [manager, outsider, 404],
      [self, team, 200],
      [other, team, 404],
    ] as const) {
      expect((await call("GET", id, "/contracts", login)).status).toBe(expected);
    }
    expect((await call("GET", team, "/contracts")).status).toBe(401);
  });
  test("GET access flags drive web action buttons", async () => {
    for (const [login, manage, missingGrant] of [
      [sa, true, false],
      [hr, true, false],
      [hrNoGrant, false, true],
      [manager, false, false],
      [self, false, false],
    ] as const) {
      const res = await call("GET", team, "/contracts", login);
      const body = (await res.json()) as { data: { access: unknown } };
      expect(body.data.access).toEqual({ manage, missingGrant });
    }
  });
  test("every mutation enforces role/grant/scope and authentication", async () => {
    const contractId = crypto.randomUUID();
    const paths = [
      ["/contracts", initial],
      [`/contracts/${contractId}/extend`, { endDate: "2022-12-31" }],
      ["/promote", { effectiveDate: "2024-01-01" }],
      ["/probation/fail", { effectiveDate: "2024-01-01" }],
      [`/contracts/${contractId}/end`, { effectiveDate: "2024-01-01" }],
    ] as const;
    for (const [path, input] of paths) {
      for (const login of [hrNoGrant, manager, self, other])
        expect((await call("POST", team, path, login, input)).status).toBe(403);
      expect((await call("POST", team, path, hrOther, input)).status).toBe(404);
      expect((await call("POST", team, path, undefined, input)).status).toBe(401);
      expect((await call("POST", team, path, sa, { unexpected: true })).status).toBe(400);
      expect((await call("POST", team, path, hr, { unexpected: true })).status).toBe(400);
    }
  });
  test("HR with contract.manage can create and extend in own company", async () => {
    const id = await makeEmployee();
    const row = await active(id);
    const result = await action(id, `/contracts/${row.id}/extend`, { endDate: "2022-12-31" }, hr);
    expect(result.contract?.sequence).toBe(2);
    const newId = await makeEmployee();
    expect((await call("POST", newId, "/contracts", hr, initial)).status).toBe(200);
  });
});

test("PKWT 1 -> 2 -> 3 -> rejected 4 -> permanent, dates/history/audit complete", async () => {
  const id = await makeEmployee();
  const first = await active(id);
  const second = await action(id, `/contracts/${first.id}/extend`, { endDate: "2022-12-31" });
  const third = await action(id, `/contracts/${second.contract?.id}/extend`, {
    endDate: "2023-12-31",
  });
  const rejected = await call("POST", id, `/contracts/${third.contract?.id}/extend`, sa, {
    endDate: "2024-12-31",
  });
  expect(rejected.status).toBe(422);
  await assertContractCopy(id);
  expect(await rejected.text()).toContain("Batas PKWT tercapai");
  await action(id, "/promote", { effectiveDate: "2024-01-01" });
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id } });
  expect(employee.employmentStatusId).toBe(statuses.get("PERMANENT") ?? "");
  expect(employee.pkwttStartDate).toEqual(date("2024-01-01"));
  expect(employee.joinDate).toEqual(date("2020-01-01"));
  const contracts = await prisma.employmentContract.findMany({
    where: { employeeId: id },
    orderBy: { sequence: "asc" },
  });
  expect(contracts.map((c) => c.status)).toEqual(["EXTENDED", "EXTENDED", "CONVERTED"]);
  expect(contracts.map((c) => c.previousContractId)).toEqual([
    null,
    first.id,
    second.contract?.id ?? null,
  ]);
  expect(contracts.every((c) => c.closedAt !== null)).toBe(true);
  const history = await prisma.employmentHistory.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: "asc" },
  });
  expect(history.map((h) => h.changeType)).toEqual([
    "CONTRACT_STAGE_CHANGED",
    "CONTRACT_STAGE_CHANGED",
    "CONTRACT_STAGE_CHANGED",
    "STATUS_CHANGED",
  ]);
  const audits = await prisma.auditLog.findMany({
    where: { entityId: id, action: { startsWith: "contract.contract." } },
  });
  expect(audits.map((a) => a.action).sort()).toEqual([
    "contract.contract.create",
    "contract.contract.extend",
    "contract.contract.extend",
    "contract.contract.promote",
  ]);
  const read = await call("GET", id, "/contracts", sa);
  const view = employeeContractsSchema.parse(((await read.json()) as { data: unknown }).data);
  expect(view.tier).toBe("PKWTT");
  expect(view.pkwttStartDate).toBe("2024-01-01");
  expect(view.summary).toBeNull();
});
test("probation pass preserves PKWTT start; excessive duration blocks", async () => {
  const id = await makeEmployee("PROBATION");
  expect(
    (
      await call("POST", id, "/contracts", sa, {
        kind: "PROBATION",
        startDate: "2025-01-01",
        endDate: "2025-04-01",
      })
    ).status,
  ).toBe(422);
  await active(id, { kind: "PROBATION", startDate: "2025-01-01", endDate: "2025-03-31" });
  await action(id, "/promote", { effectiveDate: "2025-04-01" }, hr);
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id } });
  expect(employee.pkwttStartDate).toEqual(date("2025-01-01"));
  expect(employee.employmentStatusId).toBe(statuses.get("PERMANENT") ?? "");
  expect(
    (await prisma.employmentContract.findFirstOrThrow({ where: { employeeId: id } })).status,
  ).toBe("PASSED");
});
test("fail/end use deactivation path including ban and rollback on ban failure", async () => {
  for (const probation of [true, false]) {
    const id = await makeEmployee(probation ? "PROBATION" : "PKWT");
    const account = await auth.loginAs("EMPLOYEE", { employeeId: id });
    const contract = await active(
      id,
      probation ? { kind: "PROBATION", startDate: "2025-01-01", endDate: "2025-03-31" } : initial,
    );
    const path = probation ? "/probation/fail" : `/contracts/${contract.id}/end`;
    fake.setFailBan(true);
    try {
      expect((await call("POST", id, path, sa, { effectiveDate: "2025-02-01" })).status).toBe(500);
    } finally {
      fake.setFailBan(false);
    }
    expect((await prisma.employee.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
    await assertContractCopy(id);
    expect(
      (await prisma.employmentContract.findUniqueOrThrow({ where: { id: contract.id } })).status,
    ).toBe("ACTIVE");
    await action(id, path, { effectiveDate: "2025-02-01" }, hr);
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id } });
    expect(employee.isActive).toBe(false);
    expect(employee.orgPostId).toBeNull();
    expect(employee.exitReason).toBe(probation ? "PROBATION_FAILED" : "CONTRACT_ENDED");
    expect(fake.banned.get(account.account.authUserId)).toBe(true);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: account.account.id } })).isActive,
    ).toBe(false);
    expect(
      (
        await prisma.employmentHistory.findFirstOrThrow({
          where: { employeeId: id, changeType: "DEACTIVATED" },
        })
      ).exitReason,
    ).toBe(employee.exitReason);
    expect(
      (await prisma.employmentContract.findUniqueOrThrow({ where: { id: contract.id } })).status,
    ).toBe("ENDED");
    expect((await call("POST", id, "/promote", sa, { effectiveDate: "2025-04-01" })).status).toBe(
      422,
    );
  }
});
test("active duplicate 409 and concurrent extensions serialize", async () => {
  const id = await makeEmployee();
  const row = await active(id);
  expect((await call("POST", id, "/contracts", sa, initial)).status).toBe(409);
  const results = await Promise.all([
    call("POST", id, `/contracts/${row.id}/extend`, sa, { endDate: "2022-12-31" }),
    call("POST", id, `/contracts/${row.id}/extend`, sa, { endDate: "2022-12-31" }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
  expect(
    await prisma.employmentContract.count({ where: { employeeId: id, status: "ACTIVE" } }),
  ).toBe(1);
});
test("total 4 years, missing legacy start, overlap, gap warnings, per-employee contract ID", async () => {
  const id = await makeEmployee();
  expect((await call("POST", id, "/contracts", sa, { ...initial, sequence: 3 })).status).toBe(422);
  expect(
    (
      await call("POST", id, "/contracts", sa, {
        ...initial,
        sequence: 3,
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        firstPkwtStartDate: "2020-01-01",
      })
    ).status,
  ).toBe(422);
  const row = await active(id);
  expect(
    (
      await call("POST", id, `/contracts/${row.id}/extend`, sa, {
        startDate: "2021-12-31",
        endDate: "2022-12-30",
      })
    ).status,
  ).toBe(422);
  const result = await action(id, `/contracts/${row.id}/extend`, {
    startDate: "2022-01-02",
    endDate: "2023-01-01",
  });
  expect(result.warnings.length).toBe(1);
  expect(
    (await call("POST", team, `/contracts/${row.id}/end`, sa, { effectiveDate: "2022-01-01" }))
      .status,
  ).toBe(404);
  const legacy = await makeEmployee();
  await active(legacy, {
    ...initial,
    sequence: 3,
    startDate: "2023-01-01",
    endDate: "2023-12-31",
    firstPkwtStartDate: "2020-01-01",
  });
  const view = employeeContractsSchema.parse(
    ((await (await call("GET", legacy, "/contracts", sa)).json()) as { data: unknown }).data,
  );
  expect(view.summary?.totalPkwt?.firstStartDate).toBe("2020-01-01");
  expect(view.contracts[0]?.pkwtFirstStartDate).toBe("2020-01-01");
});
test("old changeStatus guarded; entry requires contract+grant and is atomic", async () => {
  const id = await makeEmployee("INTERNSHIP");
  const input = { employmentStatusId: statuses.get("PKWT"), effectiveDate: "2020-01-01" };
  expect((await call("POST", id, "/status-change", sa, input)).status).toBe(422);
  expect(
    (
      await call("POST", team, "/status-change", sa, {
        ...input,
        employmentStatusId: statuses.get("PERMANENT"),
      })
    ).status,
  ).toBe(422);
  expect(
    (await call("POST", id, "/status-change", hrNoGrant, { ...input, contract: initial })).status,
  ).toBe(403);
  expect(
    (
      await call("POST", id, "/status-change", sa, {
        ...input,
        contract: { ...initial, endDate: "2022-01-01" },
      })
    ).status,
  ).toBe(422);
  expect((await prisma.employee.findUniqueOrThrow({ where: { id } })).employmentStatusId).toBe(
    statuses.get("INTERNSHIP") ?? "",
  );
  expect(
    (await call("POST", id, "/status-change", sa, { ...input, contract: initial })).status,
  ).toBe(200);
  expect(await prisma.employmentContract.count({ where: { employeeId: id } })).toBe(1);
  await assertContractCopy(id);
  const probation = await makeEmployee("INTERNSHIP");
  expect(
    (
      await call("POST", probation, "/status-change", hr, {
        employmentStatusId: statuses.get("PROBATION"),
        effectiveDate: "2025-01-01",
        contract: { startDate: "2025-01-01", endDate: "2025-03-31" },
      })
    ).status,
  ).toBe(200);
  expect(
    (await prisma.employee.findUniqueOrThrow({ where: { id: probation } })).pkwttStartDate,
  ).toEqual(date("2025-01-01"));
  await assertContractCopy(probation);
});
test("THL promotes directly to permanent without contract", async () => {
  const id = await makeEmployee("DAILY_WORKER");
  await action(id, "/promote", { effectiveDate: "2025-01-01" });
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id } });
  expect(employee.pkwttStartDate).toEqual(date("2025-01-01"));
  expect(employee.employmentStatusId).toBe(statuses.get("PERMANENT") ?? "");
});
test("database constraints: sequence, dates, root metadata and active uniqueness", async () => {
  const id = await makeEmployee();
  const first = await active(id);
  for (const data of [
    {
      kind: "PKWT" as const,
      sequence: 4,
      startDate: date("2026-01-01"),
      endDate: date("2026-02-01"),
    },
    {
      kind: "PROBATION" as const,
      sequence: 1,
      startDate: date("2026-01-01"),
      endDate: date("2026-02-01"),
    },
    {
      kind: "PKWT" as const,
      sequence: 1,
      startDate: date("2026-02-01"),
      endDate: date("2026-01-01"),
    },
  ])
    await expect(
      (async () =>
        prisma.employmentContract.create({
          data: { ...data, employeeId: id, companyId: company, status: "ENDED" },
        }))(),
    ).rejects.toThrow();
  await expect(
    (async () =>
      prisma.employmentContract.create({
        data: {
          employeeId: id,
          companyId: company,
          kind: "PKWT",
          sequence: 2,
          startDate: date("2022-01-01"),
          endDate: date("2022-12-31"),
          previousContractId: first.id,
          pkwtFirstStartDate: date("2020-01-01"),
          status: "ENDED",
        },
      }))(),
  ).rejects.toThrow();
  await expect(
    (async () =>
      prisma.employmentContract.create({
        data: {
          employeeId: id,
          companyId: company,
          kind: "PKWT",
          sequence: 1,
          startDate: date("2026-01-01"),
          endDate: date("2026-02-01"),
        },
      }))(),
  ).rejects.toThrow();
});
test("OpenAPI exposes all routes and named response schemas", async () => {
  const response = await app.request("/api/v1/openapi.json");
  const document = (await response.json()) as {
    paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    components: { schemas: Record<string, unknown> };
  };
  for (const path of [
    "/contracts",
    "/contracts/{contractId}/extend",
    "/promote",
    "/probation/fail",
    "/contracts/{contractId}/end",
  ])
    expect(document.paths[`/api/v1/employees/{id}${path}`]?.post).toBeDefined();
  expect(document.paths["/api/v1/employees/{id}/contracts"]?.get).toBeDefined();
  for (const name of [
    "EmploymentContract",
    "EmploymentContractSummary",
    "EmployeeContracts",
    "EmploymentContractActionResult",
  ])
    expect(document.components.schemas[name]).toBeDefined();
});

test("new PKWTT employees start tenure on join date; inactive employees reject every action", async () => {
  const created = await app.request("/api/v1/employees", {
    method: "POST",
    headers: { ...sa.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: company,
      fullName: `KTR ${RUN} new permanent`,
      employeeNumber: `KTR-${RUN}-new`,
      positionId: position,
      employmentStatusId: statuses.get("PERMANENT"),
      joinDate: "2025-01-01",
    }),
  });
  expect(created.status).toBe(201);
  const payload = (await created.json()) as { data: { id: string } };
  employees.push(payload.data.id);
  expect(
    (await prisma.employee.findUniqueOrThrow({ where: { id: payload.data.id } })).pkwttStartDate,
  ).toEqual(date("2025-01-01"));
  const id = await makeEmployee();
  await prisma.employee.update({
    where: { id },
    data: { isActive: false, endDate: date("2025-01-01"), exitReason: "CONTRACT_ENDED" },
  });
  const contractId = crypto.randomUUID();
  for (const [path, body] of [
    ["/contracts", initial],
    [`/contracts/${contractId}/extend`, { endDate: "2022-12-31" }],
    ["/promote", { effectiveDate: "2024-01-01" }],
    ["/probation/fail", { effectiveDate: "2024-01-01" }],
    [`/contracts/${contractId}/end`, { effectiveDate: "2024-01-01" }],
  ] as const)
    expect((await call("POST", id, path, sa, body)).status).toBe(422);
});

test("extension snapshots current company after a transfer", async () => {
  const id = await makeEmployee();
  const first = await active(id);
  await prisma.employee.update({ where: { id }, data: { companyId: otherCompany } });
  const result = await action(
    id,
    `/contracts/${first.id}/extend`,
    { endDate: "2022-12-31" },
    hrOther,
  );
  expect(result.contract?.companyId).toBe(otherCompany);
  expect(
    (await prisma.employmentContract.findUniqueOrThrow({ where: { id: first.id } })).companyId,
  ).toBe(company);
});

describe("KTR-D2 revisi: daftar PKWT per tahap", () => {
  const list = async (query: string, login = sa) => {
    const res = await app.request(`/api/v1/employees?${query}`, { headers: login.headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; contractStage: number | null; contractEndDate: string | null }[];
    };
    return body.data;
  };
  const stages = async () => {
    const res = await app.request(`/api/v1/employees/summary?companyId=${otherCompany}`, {
      headers: sa.headers,
    });
    const body = (await res.json()) as {
      data: { active: { pkwtStages: Record<"stage1" | "stage2" | "stage3" | "none", number> } };
    };
    return body.data.active.pkwtStages;
  };
  test("filter pkwtStage, urut tahap/akhir kontrak (null di akhir), cakupan & summary", async () => {
    const before = await stages();
    const one = await makeEmployee("PKWT", undefined, otherCompany);
    await active(one, { ...initial, startDate: "2025-06-01", endDate: "2027-05-31" });
    const three = await makeEmployee("PKWT", undefined, otherCompany);
    await active(three, {
      kind: "PKWT",
      sequence: 3,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      firstPkwtStartDate: "2022-01-01",
    });
    const none = await makeEmployee("PKWT", undefined, otherCompany);
    const q = `q=${encodeURIComponent(`KTR ${RUN}`)}&companyId=${otherCompany}&category=PKWT`;
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
    // Test lain di file ini juga membuat karyawan PKWT di PT kedua; cek keanggotaan, bukan isi persis.
    const s1 = ids(await list(`${q}&pkwtStage=1`));
    expect(s1).toContain(one);
    expect(s1).not.toContain(three);
    expect(s1).not.toContain(none);
    const s3 = ids(await list(`${q}&pkwtStage=3`));
    expect(s3).toContain(three);
    expect(s3).not.toContain(one);
    expect(ids(await list(`${q}&pkwtStage=2`))).not.toContain(one);
    expect(ids(await list(`${q}&pkwtStage=NONE`))).toContain(none);
    expect(ids(await list(`${q}&pkwtStage=NONE`))).not.toContain(one);
    const byEnd = await list(`${q}&sort=contractEndDate:asc&pageSize=100`);
    expect(ids(byEnd).indexOf(three)).toBeLessThan(ids(byEnd).indexOf(one));
    expect(ids(byEnd).indexOf(one)).toBeLessThan(ids(byEnd).indexOf(none));
    const byEndDesc = await list(`${q}&sort=contractEndDate:desc&pageSize=100`);
    expect(ids(byEndDesc).indexOf(one)).toBeLessThan(ids(byEndDesc).indexOf(three));
    expect(ids(byEndDesc).indexOf(three)).toBeLessThan(ids(byEndDesc).indexOf(none));
    const byStage = await list(`${q}&sort=contractStage:desc&pageSize=100`);
    expect(ids(byStage).indexOf(three)).toBeLessThan(ids(byStage).indexOf(one));
    expect(byEnd.find((r) => r.id === one)).toMatchObject({
      contractStage: 1,
      contractEndDate: "2027-05-31",
    });
    // HR PT ACP tidak melihat karyawan PT lain walau filter tahap cocok.
    expect(ids(await list(`q=${encodeURIComponent(`KTR ${RUN}`)}&pkwtStage=1`, hr))).not.toContain(
      one,
    );
    const after = await stages();
    expect(after.stage1 - before.stage1).toBe(1);
    expect(after.stage3 - before.stage3).toBe(1);
    expect(after.stage2 - before.stage2).toBe(0);
    expect(after.none - before.none).toBe(1);
    expect((await call("GET", one, "", sa)).status).toBe(200);
    const bad = await app.request("/api/v1/employees?pkwtStage=4", { headers: sa.headers });
    expect(bad.status).toBe(400);
  });
  test("nonaktif & aktif kembali biasa tidak mengubah kontrak; salinan tetap sama", async () => {
    const id = await makeEmployee();
    await active(id, { ...initial, startDate: "2025-06-01", endDate: "2027-05-31" });
    const off = await call("POST", id, "/deactivate", sa, {
      effectiveDate: "2025-12-01",
      exitReason: "RESIGNATION",
    });
    expect(off.status).toBe(200);
    await assertContractCopy(id);
    const on = await call("POST", id, "/reactivate", sa, { effectiveDate: "2026-01-02" });
    expect(on.status).toBe(200);
    await assertContractCopy(id);
  });
});

test("aktif kembali tidak boleh jadi jalan pintas ke/dari PKWT/Percobaan (KTR-D4)", async () => {
  const deactivate = async (id: string) =>
    expect(
      (
        await call("POST", id, "/deactivate", sa, {
          effectiveDate: "2025-12-01",
          exitReason: "RESIGNATION",
        })
      ).status,
    ).toBe(200);
  // Dari PKWT ke Karyawan Tetap lewat aktif kembali → 422, data tidak berubah.
  const pkwt = await makeEmployee("PKWT");
  await deactivate(pkwt);
  const toPermanent = await call("POST", pkwt, "/reactivate", sa, {
    effectiveDate: "2026-01-02",
    employmentStatusId: statuses.get("PERMANENT"),
  });
  expect(toPermanent.status).toBe(422);
  expect(await toPermanent.text()).toContain("tab Kepegawaian");
  expect((await prisma.employee.findUniqueOrThrow({ where: { id: pkwt } })).isActive).toBe(false);
  // Status sama tetap boleh.
  const same = await call("POST", pkwt, "/reactivate", sa, { effectiveDate: "2026-01-02" });
  expect(same.status).toBe(200);
  // Dari kategori lain ke Masa Percobaan → 422.
  const intern = await makeEmployee("INTERNSHIP");
  await deactivate(intern);
  const toProbation = await call("POST", intern, "/reactivate", sa, {
    effectiveDate: "2026-01-02",
    employmentStatusId: statuses.get("PROBATION"),
  });
  expect(toProbation.status).toBe(422);
  // Dari kategori lain ke Karyawan Tetap → boleh; masa kerja PKWTT mulai tanggal efektif.
  const toPermanentOk = await call("POST", intern, "/reactivate", sa, {
    effectiveDate: "2026-01-02",
    employmentStatusId: statuses.get("PERMANENT"),
  });
  expect(toPermanentOk.status).toBe(200);
  expect(
    (await prisma.employee.findUniqueOrThrow({ where: { id: intern } })).pkwttStartDate,
  ).toEqual(date("2026-01-02"));
});
