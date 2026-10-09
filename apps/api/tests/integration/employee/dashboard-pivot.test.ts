import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// D-062: pivot agregat Dashboard — baris × kolom + filter, cakupan PT (D-040), dimensi pribadi ber-grant.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
const get = (query: string, headers: Record<string, string>) =>
  app.request(`/api/v1/dashboard/pivot?${query}`, { headers });

interface Pivot {
  rowKeys: { key: string; label: string; total: number }[];
  colKeys: { key: string; label: string; total: number }[];
  cells: { row: string; col: string; count: number }[];
  total: number;
}
const read = async (res: Response) => ((await res.json()) as { data: Pivot }).data;
const cell = (p: Pivot, row: string, col = "") =>
  p.cells.find((c) => c.row === row && c.col === col)?.count ?? 0;

type Role = "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE";
let headers: Record<Role, Record<string, string>>;
let hrGrantHeaders: Record<string, string>;
let hrOtherHeaders: Record<string, string>;
const ids = {
  status: "",
  division: "",
  department: "",
  position: "",
  location: "",
  otherCompany: "",
  employees: [] as string[],
};
/** Semua query di file ini dibatasi ke lokasi uji supaya data lain di DB tidak ikut terhitung. */
const onlyTestRows = () => `filter=location:${ids.location}`;

beforeAll(async () => {
  headers = {} as Record<Role, Record<string, string>>;
  for (const role of ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] as const)
    headers[role] = (await auth.loginAs(role)).headers;
  hrGrantHeaders = (
    await auth.loginAs("HR_ADMIN", { grants: [{ permission: "EMPLOYEE_PERSONAL_READ" }] })
  ).headers;
  ids.otherCompany = await createTestCompany(`P${RUN}`, `PT Pivot ${RUN}`);
  hrOtherHeaders = (await auth.loginAs("HR_ADMIN", { companies: [ids.otherCompany] })).headers;

  ids.status = (await prisma.employmentStatus.create({ data: { name: `Pivot ${RUN}` } })).id;
  ids.division = (
    await prisma.department.create({ data: { name: `Div Pivot ${RUN}`, unitType: "DIVISION" } })
  ).id;
  ids.department = (
    await prisma.department.create({
      data: { name: `Dept Pivot ${RUN}`, unitType: "DEPARTMENT", parentId: ids.division },
    })
  ).id;
  ids.position = (
    await prisma.position.create({
      data: { name: `Jab Pivot ${RUN}`, departmentId: ids.department, level: "STAFF" },
    })
  ).id;
  ids.location = (
    await prisma.workLocation.create({ data: { name: `Lok Pivot ${RUN}`, city: "Sampit" } })
  ).id;
  const base = {
    companyId: await acpCompanyId(),
    employmentStatusId: ids.status,
    positionId: ids.position,
    workLocationId: ids.location,
  };
  const mk = async (n: string, gender: "MALE" | "FEMALE", isActive = true) =>
    (
      await prisma.employee.create({
        data: {
          ...base,
          employeeNumber: `PVT-${RUN}-${n}`,
          fullName: `Pivot Rahasia ${RUN} ${n}`,
          gender,
          joinDate: new Date("2020-02-01T00:00:00.000Z"),
          isActive,
          ...(isActive
            ? {}
            : {
                endDate: new Date("2026-01-01T00:00:00.000Z"),
                exitReason: "RESIGNATION" as const,
              }),
        },
      })
    ).id;
  ids.employees.push(
    await mk("A", "MALE"),
    await mk("B", "FEMALE"),
    await mk("C", "MALE"),
    await mk("D", "MALE", false),
  );
  const [a, b] = ids.employees as [string, string];
  // A: SD + SMA → tertinggi SMA; B: S1; C: tanpa riwayat → NONE.
  await prisma.education.createMany({
    data: [
      { employeeId: a, schoolName: "SD Uji", level: "SD" },
      { employeeId: a, schoolName: "SMA Uji", level: "SMA" },
      { employeeId: b, schoolName: "Univ Uji", level: "S1" },
    ],
  });
  await prisma.employeePersonal.create({ data: { employeeId: a, religion: "ISLAM" } });
});

afterAll(async () => {
  await prisma.education.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.employeePersonal.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  if (ids.position) await prisma.position.delete({ where: { id: ids.position } });
  if (ids.department) await prisma.department.delete({ where: { id: ids.department } });
  if (ids.division) await prisma.department.delete({ where: { id: ids.division } });
  if (ids.location) await prisma.workLocation.delete({ where: { id: ids.location } });
  if (ids.status) await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await auth.cleanup();
  if (ids.otherCompany) await prisma.company.delete({ where: { id: ids.otherCompany } });
  await disconnectPrisma();
});

describe("GET /dashboard/pivot", () => {
  test("akses: SA & HR 200; MANAGER & EMPLOYEE 403; tanpa token 401", async () => {
    expect((await get("rows=education", headers.SUPER_ADMIN)).status).toBe(200);
    expect((await get("rows=education", headers.HR_ADMIN)).status).toBe(200);
    expect((await get("rows=education", headers.MANAGER)).status).toBe(403);
    expect((await get("rows=education", headers.EMPLOYEE)).status).toBe(403);
    expect((await get("rows=education", {})).status).toBe(401);
  });

  test("400: dimensi tak dikenal, filter tanpa format dimensi:nilai, status salah", async () => {
    expect((await get("rows=salary", headers.HR_ADMIN)).status).toBe(400);
    expect((await get("rows=education&filter=gaji", headers.HR_ADMIN)).status).toBe(400);
    expect((await get("rows=education&filter=salary:1", headers.HR_ADMIN)).status).toBe(400);
    expect((await get("rows=education&status=semua", headers.HR_ADMIN)).status).toBe(400);
  });

  test("pendidikan × kategori: jenjang tertinggi per orang, aktif saja, urutan SD→S3 lalu NONE", async () => {
    const res = await get(`rows=education&cols=category&${onlyTestRows()}`, headers.HR_ADMIN);
    const text = await res.clone().text();
    const p = await read(res);
    expect(p.total).toBe(3);
    expect(p.rowKeys.map((r) => r.key)).toEqual(["SMA", "S1", "NONE"]);
    expect(p.rowKeys.find((r) => r.key === "SMA")?.label).toBe("SMA/SMK");
    expect(p.colKeys).toEqual([{ key: "NONE", label: "Tanpa kategori", total: 3 }]);
    expect(cell(p, "SMA", "NONE")).toBe(1);
    expect(cell(p, "S1", "NONE")).toBe(1);
    expect(cell(p, "NONE", "NONE")).toBe(1);
    expect(cell(p, "SD", "NONE")).toBe(0);
    // Tanpa data per orang.
    expect(text).not.toContain("Rahasia");
    expect(text).not.toContain(`PVT-${RUN}`);
  });

  test("filter berulang & status: gender × status, divisi induk, kota", async () => {
    const p = await read(
      await get(`rows=gender&cols=status&status=all&${onlyTestRows()}`, headers.SUPER_ADMIN),
    );
    expect(p.total).toBe(4);
    expect(cell(p, "MALE", "active")).toBe(2);
    expect(cell(p, "MALE", "inactive")).toBe(1);
    expect(cell(p, "FEMALE", "active")).toBe(1);

    const male = await read(
      await get(`rows=division&${onlyTestRows()}&filter=gender:MALE`, headers.HR_ADMIN),
    );
    expect(male.rowKeys).toEqual([{ key: ids.division, label: `Div Pivot ${RUN}`, total: 2 }]);

    const city = await read(
      await get(`rows=city&cols=positionLevel&${onlyTestRows()}`, headers.HR_ADMIN),
    );
    expect(cell(city, "Sampit", "STAFF")).toBe(3);
  });

  test("D-040: HR PT lain tidak melihat karyawan ACP", async () => {
    const p = await read(await get(`rows=education&${onlyTestRows()}`, hrOtherHeaders));
    expect(p.total).toBe(0);
    expect(p.rowKeys).toEqual([]);
  });

  test("dimensi pribadi: HR tanpa grant 403 (juga lewat filter); HR ber-grant & SA 200", async () => {
    expect((await get("rows=religion", headers.HR_ADMIN)).status).toBe(403);
    expect((await get("rows=education&cols=age", headers.HR_ADMIN)).status).toBe(403);
    expect(
      (await get("rows=education&filter=maritalStatus:MARRIED", headers.HR_ADMIN)).status,
    ).toBe(403);
    const p = await read(await get(`rows=religion&${onlyTestRows()}`, hrGrantHeaders));
    expect(cell(p, "ISLAM")).toBe(1);
    expect(cell(p, "NONE")).toBe(2);
    expect((await get("rows=age", headers.SUPER_ADMIN)).status).toBe(200);
  });
});
