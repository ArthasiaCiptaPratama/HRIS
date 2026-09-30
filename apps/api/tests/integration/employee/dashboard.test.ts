import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";

// Dashboard (D-035 lanjutan): agregat kepegawaian SA/HR — jumlah saja, tanpa data per orang.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
const get = (headers: Record<string, string>) => app.request("/api/v1/dashboard", { headers });

interface Dashboard {
  overview: { total: number; active: number; inactive: number; avgTenureYears: number | null };
  byDepartment: { id: string | null; name: string; count: number }[];
  byLocation: { id: string | null; name: string; city: string | null; count: number }[];
  byPosition: { id: string | null; count: number }[];
  byJoinYear: { year: number; count: number }[];
  byEducationPivot: { levels: { level: string; count: number }[]; total: number }[];
}
const read = async (res: Response) => ((await res.json()) as { data: Dashboard }).data;
const kuliah = (d: Dashboard) =>
  d.byEducationPivot.reduce(
    (sum, c) => sum + (c.levels.find((l) => l.level === "Kuliah")?.count ?? 0),
    0,
  );

const ids = { status: "", department: "", position: "", location: "", employees: [] as string[] };
let headers: Record<Role, Record<string, string>>;
type Role = "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE";

beforeAll(async () => {
  headers = {} as Record<Role, Record<string, string>>;
  for (const role of ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] as const)
    headers[role] = (await auth.loginAs(role)).headers;
});

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  if (ids.position) await prisma.position.delete({ where: { id: ids.position } });
  if (ids.department) await prisma.department.delete({ where: { id: ids.department } });
  if (ids.location) await prisma.workLocation.delete({ where: { id: ids.location } });
  if (ids.status) await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await auth.cleanup();
  await disconnectPrisma();
});

describe("GET /dashboard", () => {
  test("akses: SA & HR 200; MANAGER & EMPLOYEE 403; tanpa token 401", async () => {
    expect((await get(headers.SUPER_ADMIN)).status).toBe(200);
    expect((await get(headers.HR_ADMIN)).status).toBe(200);
    expect((await get(headers.MANAGER)).status).toBe(403);
    expect((await get(headers.EMPLOYEE)).status).toBe(403);
    expect((await get({})).status).toBe(401);
  });

  test("agregat bertambah sesuai karyawan baru; nonaktif hanya di overview; tanpa nama orang", async () => {
    const before = await read(await get(headers.HR_ADMIN));
    // Status sendiri (tanpa kategori): CI menjalankan test di DB kosong tanpa seed.
    ids.status = (await prisma.employmentStatus.create({ data: { name: `Dash ${RUN}` } })).id;
    ids.department = (await prisma.department.create({ data: { name: `Dash ${RUN}` } })).id;
    ids.position = (
      await prisma.position.create({
        data: { name: `Jab Dash ${RUN}`, departmentId: ids.department },
      })
    ).id;
    ids.location = (
      await prisma.workLocation.create({ data: { name: `Lok Dash ${RUN}`, city: "Palangka Raya" } })
    ).id;
    const base = {
      employmentStatusId: ids.status,
      positionId: ids.position,
      workLocationId: ids.location,
    };
    const mk = async (n: string, joinDate: string, isActive = true) =>
      (
        await prisma.employee.create({
          data: {
            ...base,
            employeeNumber: `DSH-${RUN}-${n}`,
            fullName: `Dash Rahasia ${RUN} ${n}`,
            joinDate: new Date(`${joinDate}T00:00:00.000Z`),
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
      await mk("A", "2019-03-01"),
      await mk("B", "2019-07-01"),
      await mk("C", "2020-01-01", false),
    );
    await prisma.education.create({
      data: { employeeId: ids.employees[0] as string, schoolName: "Universitas Uji", level: "S1" },
    });
    await prisma.education.create({
      data: { employeeId: ids.employees[0] as string, schoolName: "SMA Uji", level: "SMA" },
    });

    const res = await get(headers.HR_ADMIN);
    const text = await res.clone().text();
    const after = await read(res);
    expect(after.overview.total - before.overview.total).toBe(3);
    expect(after.overview.active - before.overview.active).toBe(2);
    expect(after.overview.inactive - before.overview.inactive).toBe(1);
    expect(after.byDepartment.find((d) => d.id === ids.department)).toMatchObject({ count: 2 });
    expect(after.byLocation.find((l) => l.id === ids.location)).toMatchObject({
      city: "Palangka Raya",
      count: 2,
    });
    expect(after.byPosition.find((p) => p.id === ids.position)?.count).toBe(2);
    // Jenjang tertinggi yang dihitung (S1 → Kuliah), satu kali per orang.
    expect(kuliah(after) - kuliah(before)).toBe(1);
    const y2019 = (d: Dashboard) => d.byJoinYear.find((j) => j.year === 2019)?.count ?? 0;
    expect(y2019(after) - y2019(before)).toBe(2);
    expect(after.overview.avgTenureYears).not.toBeNull();
    expect(text).not.toContain("Rahasia");
    expect(text).not.toContain(`DSH-${RUN}`);
  });
});
