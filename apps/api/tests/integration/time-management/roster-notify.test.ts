import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { extendAllRosters, readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";

// TM-D13 Fase C (poin 12): karyawan diberi tahu bila jadwalnya berubah (hari ini ke depan).
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const ids = { status: "", department: "", position: "", employees: [] as string[], shift: "" };
let companyId = "";
let code = "";
let hr: Record<string, string> = {};
const accountOf: Record<string, string> = {};
let today = "";
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const notices = (employee: string) =>
  prisma.notification.findMany({
    where: { recipientAccountId: accountOf[employee], type: "attendance.roster_changed" },
  });

beforeAll(async () => {
  const settings = await readTimeSettings();
  const offsetH =
    { "Asia/Jakarta": 7, "Asia/Makassar": 8, "Asia/Jayapura": 9 }[settings.timezone] ?? 7;
  today = new Date(Date.now() + offsetH * 3600_000).toISOString().slice(0, 10);
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `RN ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `RN ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `RN ${RUN}`, departmentId: ids.department } })
  ).id;
  for (const n of ["A", "B"]) {
    const employee = await prisma.employee.create({
      data: {
        employeeNumber: `RN-${RUN}-${n}`,
        fullName: `Roster ${RUN} ${n}`,
        joinDate: new Date("2024-01-01T00:00:00Z"),
        companyId,
        employmentStatusId: ids.status,
        positionId: ids.position,
      },
    });
    ids.employees.push(employee.id);
    const login = await auth.loginAs("EMPLOYEE", {
      employeeId: employee.id,
      companies: [companyId],
    });
    accountOf[n] = login.account.id;
  }
  code = `R${RUN.slice(0, 5)}`;
  ids.shift = (
    await prisma.shift.create({
      data: { companyId, code, name: `Uji RN ${RUN}`, startMinute: 480, endMinute: 960 },
    })
  ).id;
  hr = (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers;
});

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { recipientAccountId: { in: Object.values(accountOf) } },
  });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.delete({ where: { id: ids.shift } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("notifikasi perubahan jadwal (TM-D13 Fase C)", () => {
  test("HR mengubah sel roster ke depan → karyawan diberi tahu tanggal & shift lama → baru", async () => {
    const date = addDays(today, 2);
    const [a] = ids.employees as [string];
    const res = await call("PUT", "/roster/cells", hr, {
      companyId,
      cells: [{ employeeId: a, date, code }],
    });
    expect(res.status).toBe(200);
    const list = await notices("A");
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Jadwal Anda diubah HR");
    expect(list[0]?.body).toContain(`tanpa roster → ${code}`);
    expect(list[0]).toMatchObject({ targetType: "ROSTER", targetId: date });

    await call("PUT", "/roster/cells", hr, {
      companyId,
      cells: [{ employeeId: a, date, code: "OFF" }],
    });
    const again = await notices("A");
    expect(again).toHaveLength(2);
    expect(again.some((n) => n.body?.includes(`${code} → OFF`))).toBe(true);
  });

  test("tanpa perubahan nyata / tanggal yang sudah lewat → tidak ada notifikasi", async () => {
    const [, b] = ids.employees as [string, string];
    await call("PUT", "/roster/cells", hr, {
      companyId,
      cells: [{ employeeId: b, date: addDays(today, -2), code }],
    });
    expect(await notices("B")).toHaveLength(0);
    const date = addDays(today, 3);
    await call("PUT", "/roster/cells", hr, { companyId, cells: [{ employeeId: b, date, code }] });
    await call("PUT", "/roster/cells", hr, { companyId, cells: [{ employeeId: b, date, code }] });
    expect(await notices("B")).toHaveLength(1);
  });

  test("cron perpanjangan roster tidak mengirim notifikasi", async () => {
    const before = (await notices("A")).length + (await notices("B")).length;
    await extendAllRosters();
    expect((await notices("A")).length + (await notices("B")).length).toBe(before);
  });
});
