import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { readTimeSettings, settingsToday } from "../../../src/modules/attendance/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// Batas "hari ini" roster, periode & koreksi mengikuti zona pengaturan TM (README TM:52), bukan WIB tetap.
// Jendela uji 00:30 WITA = 23:30 WIB hari sebelumnya; cron roster-extend jalan 17:15 UTC (00:15 WITA).
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
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 00:30 WITA 28 Okt 2026 (masih 27 Okt di WIB). */
const WINDOW = new Date("2026-10-27T16:30:00.000Z");
const TODAY_WITA = "2026-10-28";

const ids = {
  status: "",
  department: "",
  position: "",
  location: "",
  emptyCompany: "",
  employees: [] as string[],
};
let companyId = "";
let previousSettings: unknown = null;
const emp = { mgr: "", a: "" };
let h: Record<"sa" | "hr" | "a", Record<string, string>>;

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.emptyCompany = await createTestCompany(`Z${RUN}`, `PT Zona ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `TZ ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `TZ ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `TZ ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: {
        name: `Site TZ ${RUN}`,
        city: "Tanah Laut",
        latitude: -3.8,
        longitude: 115.4,
        radiusM: 500,
      },
    })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `TZ-${RUN}-${n}`,
          fullName: `Zona ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
        },
      })
    ).id;
  emp.mgr = await mk("MGR");
  emp.a = await mk("A", emp.mgr);
  ids.employees.push(emp.a, emp.mgr);
  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
  };
  previousSettings = await readTimeSettings();
  const res = await call("PUT", "/time-settings", h.sa, {
    ...(previousSettings as object),
    timezone: "Asia/Makassar",
  });
  expect(res.status).toBe(200);
});

afterEach(() => {
  setSystemTime();
});

afterAll(async () => {
  setSystemTime();
  await call("PUT", "/time-settings", h.sa, previousSettings);
  const corrections = await prisma.attendanceCorrection.findMany({
    where: { employeeId: { in: ids.employees } },
    select: { id: true },
  });
  await prisma.approvalRequest.deleteMany({
    where: { subjectId: { in: corrections.map((c) => c.id) } },
  });
  await prisma.attendanceCorrection.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.notification.deleteMany({
    where: { dedupeKey: { in: corrections.map((c) => `tm-correction-new:${c.id}`) } },
  });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crew.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.rosterPattern.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.shift.deleteMany({ where: { name: { contains: RUN } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.company.delete({ where: { id: ids.emptyCompany } });
  await disconnectPrisma();
});

describe("zona pengaturan WITA, pukul 00:30 WITA (23:30 WIB hari sebelumnya)", () => {
  test("hari ini bersama (dipakai roster, periode & cuti) mengikuti zona pengaturan, termasuk ganti tahun", async () => {
    expect(await settingsToday(WINDOW)).toBe(TODAY_WITA);
    // Cron leave-daily 17:45 UTC = 00:45 WITA 1 Jan: proses awal tahun cuti harus sudah tahun baru.
    expect(await settingsToday(new Date("2026-12-31T16:45:00.000Z"))).toBe("2027-01-01");
  });

  test("koreksi untuk kemarin (WITA) diterima, bukan dianggap hari ini", async () => {
    setSystemTime(WINDOW);
    const res = await call("POST", "/attendance/corrections", h.a, {
      workDate: addDays(TODAY_WITA, -1),
      checkIn: "07:00",
      checkOut: "17:00",
      reason: "Lupa absen, uji zona waktu",
    });
    expect(res.status).toBe(200);
  });

  test("tutup periode bulan lalu bisa dipratinjau pada tanggal 1 pukul 00:30 WITA", async () => {
    setSystemTime(new Date("2026-09-30T16:30:00.000Z"));
    const res = await call("POST", "/attendance/periods/preview", h.sa, {
      companyId: ids.emptyCompany,
      month: "2026-09",
    });
    expect(res.status).toBe(200);
  });

  test("anggota crew → hari roster dibangkitkan sampai hari ini (WITA) + horizon", async () => {
    setSystemTime(WINDOW);
    const code = `Z${RUN.slice(0, 4)}`;
    expect(
      (
        await call("POST", "/shifts", h.hr, {
          companyId,
          code,
          name: `${code} ${RUN}`,
          startMinute: 7 * 60,
          endMinute: 17 * 60,
          checkInOpenMin: 60,
          lateToleranceMin: 15,
          earlyLeaveToleranceMin: 15,
          checkOutCloseMin: 240,
        })
      ).status,
    ).toBe(200);
    const pattern = await data<{ id: string }>(
      await call("POST", "/roster-patterns", h.hr, {
        companyId,
        name: `Zona ${RUN}`,
        steps: [code],
      }),
    );
    const crew = await data<{ id: string }>(
      await call("POST", "/crews", h.hr, {
        companyId,
        workLocationId: ids.location,
        name: `Crew Zona ${RUN}`,
        patternId: pattern.id,
        cycleStartDate: TODAY_WITA,
      }),
    );
    const res = await call("PUT", `/crews/${crew.id}/members`, h.hr, {
      employeeIds: [emp.a],
      effectiveDate: TODAY_WITA,
    });
    expect(res.status).toBe(200);
    const last = await prisma.rosterDay.findFirst({
      where: { employeeId: emp.a },
      orderBy: { workDate: "desc" },
    });
    const { rosterHorizonDays } = await readTimeSettings();
    expect(last?.workDate.toISOString().slice(0, 10)).toBe(addDays(TODAY_WITA, rosterHorizonDays));
  });
});
