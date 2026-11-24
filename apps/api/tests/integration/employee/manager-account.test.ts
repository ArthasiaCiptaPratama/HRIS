import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

type EmployeePage = { data: { id: string }[]; meta: { total: number } };
const pageBody = async (response: Response) => (await response.json()) as EmployeePage;

const RUN = crypto.randomUUID().slice(0, 8);
const prisma = getPrisma();
const auth = createAuthFixture(RUN);
const app = createApp({ logger: createLogger("error", () => {}), tokenVerifier: testVerifier });
const employees: string[] = [];
let companyA = "";
let companyB = "";
let department = "";
let position = "";
let status = "";
let missing = "";
let active = "";
let disabled = "";
let inactiveOnly = "";
let foreign = "";
let staff = "";
let hr: Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Awaited<ReturnType<typeof auth.loginAs>>;

async function employee(
  tag: string,
  companyId = companyA,
  managerId: string | null = null,
  isActive = true,
) {
  const row = await prisma.employee.create({
    data: {
      companyId,
      managerId,
      isActive,
      employeeNumber: `MA-${RUN}-${tag}`,
      fullName: `Manager account ${RUN} ${tag}`,
      joinDate: new Date("2024-01-01"),
      employmentStatusId: status,
      positionId: position,
    },
  });
  employees.push(row.id);
  return row.id;
}
const get = (path: string, headers: Record<string, string> = hr.headers) =>
  app.request(`/api/v1/employees${path}`, { headers });

beforeAll(async () => {
  companyA = await acpCompanyId();
  companyB = await createTestCompany(`M${RUN}`, `Manager Account ${RUN}`);
  department = (await prisma.department.create({ data: { name: `MA department ${RUN}` } })).id;
  position = (
    await prisma.position.create({ data: { name: `MA position ${RUN}`, departmentId: department } })
  ).id;
  status = (await prisma.employmentStatus.create({ data: { name: `MA status ${RUN}` } })).id;
  missing = await employee("missing");
  active = await employee("active");
  disabled = await employee("disabled");
  inactiveOnly = await employee("inactive-only");
  foreign = await employee("foreign", companyB);
  staff = await employee("staff");
  await employee("sub-missing", companyA, missing);
  await employee("sub-active", companyA, active);
  await employee("sub-disabled", companyA, disabled);
  await employee("sub-inactive", companyA, inactiveOnly, false);
  await employee("sub-foreign", companyB, foreign);
  await auth.loginAs("EMPLOYEE", { employeeId: active });
  await auth.loginAs("MANAGER", { employeeId: disabled, isActive: false });
  hr = await auth.loginAs("HR_ADMIN", { companies: [companyA] });
  sa = await auth.loginAs("SUPER_ADMIN");
});

afterAll(async () => {
  await auth.cleanup();
  await prisma.employee.updateMany({ where: { id: { in: employees } }, data: { managerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.deleteMany({ where: { id: position } });
  await prisma.department.deleteMany({ where: { id: department } });
  await prisma.employmentStatus.deleteMany({ where: { id: status } });
  await prisma.company.deleteMany({ where: { id: companyB } });
  await disconnectPrisma();
});

describe("EMP-D8 manager active accounts", () => {
  test("detail returns null, missing, active (any role), and disabled account states", async () => {
    for (const [managerId, expected] of [
      [null, null],
      [missing, false],
      [active, true],
      [disabled, false],
    ] as const) {
      await prisma.employee.update({ where: { id: staff }, data: { managerId } });
      const response = await get(`/${staff}?view=work`);
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { data: { managerHasActiveAccount: boolean | null } }).data
          .managerHasActiveAccount,
      ).toBe(expected);
    }
    await prisma.employee.update({ where: { id: staff }, data: { managerId: null } });
  });

  test("filter excludes accounts, non-managers and managers with only inactive subordinates; scopes PT and paginates", async () => {
    const query = `?managerWithoutAccount=true&q=${RUN}&sort=fullName:asc`;
    const response = await get(query);
    expect(response.status).toBe(200);
    const body = await pageBody(response);
    expect(body.data.map((row: { id: string }) => row.id).sort()).toEqual(
      [missing, disabled].sort(),
    );
    expect(body.meta.total).toBe(2);
    const page1 = await pageBody(await get(`${query}&pageSize=1`));
    const page2 = await pageBody(await get(`${query}&pageSize=1&page=2`));
    expect(page1.meta.total).toBe(2);
    expect(page2.meta.total).toBe(2);
    expect(page1.data[0]?.id).not.toBe(page2.data[0]?.id);
    const all = await pageBody(await get(query, sa.headers));
    expect(all.data.map((row: { id: string }) => row.id).sort()).toEqual(
      [missing, disabled, foreign].sort(),
    );
    const combined = await pageBody(await get(`${query}&companyId=${companyB}`));
    expect(combined.meta.total).toBe(0);
    const inactive = await pageBody(await get(`${query}&active=false`));
    expect(inactive.meta.total).toBe(0);
    const unfiltered = await pageBody(await get(`?managerWithoutAccount=false&q=${RUN}`));
    expect(unfiltered.data.some((row: { id: string }) => row.id === active)).toBe(true);
    expect(body.data.every((row: object) => !("managerHasActiveAccount" in row))).toBe(true);
  });

  test("manager options report active accounts accurately", async () => {
    const response = await get("/manager-options");
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { id: string; hasActiveAccount: boolean }[];
    };
    for (const [id, expected] of [
      [missing, false],
      [active, true],
      [disabled, false],
    ] as const) {
      expect(data.find((row: { id: string }) => row.id === id)?.hasActiveAccount).toBe(expected);
    }
    expect(data.some((row: { id: string }) => row.id === foreign)).toBe(false);
  });

  test("OpenAPI names the filter and adds fields only to the intended contracts", async () => {
    const response = await app.request("/api/v1/openapi.json");
    expect(response.status).toBe(200);
    type Schema = { enum?: string[]; properties?: Record<string, unknown>; allOf?: Schema[] };
    const spec = (await response.json()) as { components: { schemas: Record<string, Schema> } };
    const schemas = spec.components.schemas;
    const property = (schema: Schema | undefined, name: string): unknown =>
      schema?.properties?.[name] ??
      schema?.allOf?.map((part) => property(part, name)).find((value) => value !== undefined);
    expect(schemas.EmployeeManagerWithoutAccountFilter?.enum).toEqual(["true", "false"]);
    expect(property(schemas.EmployeeDetail, "managerHasActiveAccount")).toBeDefined();
    expect(property(schemas.ManagerOption, "hasActiveAccount")).toEqual({ type: "boolean" });
    expect(property(schemas.EmployeeListItem, "managerHasActiveAccount")).toBeUndefined();
    expect(property(schemas.EmployeeListRef, "hasActiveAccount")).toBeUndefined();
  });

  test("rejects invalid enum and unauthenticated requests", async () => {
    expect((await get("?managerWithoutAccount=invalid")).status).toBe(400);
    expect((await get("?managerWithoutAccount=true", {})).status).toBe(401);
  });
});
