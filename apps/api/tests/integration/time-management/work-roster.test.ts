import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { settingsToday } from "../../../src/modules/attendance/calendar.service.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";

// TM-D28: roster = siklus kerja–libur (non-lokal 13/1 × N + time off, lokal 6/1); lokal/non-lokal dari
// Homebase vs Homebase lokal lokasi kerja (override HR); roster + shift dirakit menjadi template jadwal.
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
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Roster = { id: string; name: string; summary: string; inUse: boolean; cycleLength: number };
type Residency = {
  employeeId: string;
  residency: string | null;
  source: string;
  note: string | null;
};

let companyId = "";
let otherCompany = "";
let locationId = "";
let officeLocationId = "";
const hb = { local: "", away: "" };
const ids = { status: "", department: "", position: "", shift: "" };
const emp = { local: "", away: "", unknown: "", office: "" };
let h: Record<"sa" | "hr" | "otherHr" | "emp", Record<string, string>>;
const SHIFT = `D${RUN.slice(0, 4)}`;

beforeAll(async () => {
  companyId = await createTestCompany(`WR${RUN.slice(0, 4)}`, `PT Uji Roster ${RUN}`);
  otherCompany = await createTestCompany(`WX${RUN.slice(0, 4)}`, `PT Lain Roster ${RUN}`);
  locationId = (
    await prisma.workLocation.create({
      data: {
        name: `Site WR ${RUN}`,
        city: "Tanah Laut",
        latitude: -3.8,
        longitude: 115.3,
        radiusM: 300,
      },
    })
  ).id;
  officeLocationId = (
    await prisma.workLocation.create({ data: { name: `Kantor WR ${RUN}`, city: "Jakarta" } })
  ).id;
  hb.local = (await prisma.homebase.create({ data: { name: `HB Pelaihari ${RUN}` } })).id;
  hb.away = (await prisma.homebase.create({ data: { name: `HB Surabaya ${RUN}` } })).id;
  ids.shift = (
    await prisma.shift.create({
      data: { companyId, code: SHIFT, name: `Uji WR ${RUN}`, startMinute: 420, endMinute: 960 },
    })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `WR ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `WR ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `WR ${RUN}`, departmentId: ids.department } })
  ).id;
  for (const [key, homebaseId] of [
    ["local", hb.local],
    ["away", hb.away],
    ["unknown", null],
    ["office", hb.away],
  ] as const) {
    const id = (
      await prisma.employee.create({
        data: {
          employeeNumber: `WR-${RUN}-${key}`,
          fullName: `Roster ${key} ${RUN}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          workLocationId: key === "office" ? officeLocationId : locationId,
          homebaseId,
        },
      })
    ).id;
    emp[key] = id;
    if (homebaseId) {
      await prisma.employeeHomebase.create({
        data: { employeeId: id, homebaseId, effectiveFrom: new Date("2024-01-01T00:00:00Z") },
      });
    }
  }
  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    otherHr: (await auth.loginAs("HR_ADMIN", { companies: [otherCompany] })).headers,
    emp: (await auth.loginAs("EMPLOYEE", { employeeId: emp.local, companies: [companyId] }))
      .headers,
  };
});

afterAll(async () => {
  const employees = Object.values(emp);
  const templates = await prisma.rosterTemplate.findMany({
    where: { companyId },
    select: { patterns: { select: { id: true } } },
  });
  const patternIds = templates.flatMap((t) => t.patterns.map((p) => p.id));
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.crew.deleteMany({ where: { patternId: { in: patternIds } } });
  await prisma.rosterPattern.deleteMany({ where: { companyId } });
  await prisma.rosterTemplate.deleteMany({ where: { companyId } });
  await prisma.workRoster.deleteMany({ where: { companyId: { in: [companyId, otherCompany] } } });
  await prisma.localHomebase.deleteMany({ where: { workLocationId: locationId } });
  await prisma.officeWorkLocation.deleteMany({ where: { workLocationId: officeLocationId } });
  await prisma.employeeResidency.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.employeeHomebase.deleteMany({ where: { employeeId: { in: employees } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.shift.deleteMany({ where: { id: ids.shift } });
  await prisma.homebase.deleteMany({ where: { id: { in: [hb.local, hb.away] } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.workLocation.deleteMany({ where: { id: { in: [locationId, officeLocationId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompany] } } });
  await disconnectPrisma();
});

/** Non-lokal pendek supaya time off masuk horizon: 3 kerja / 1 libur × 2, lalu time off 4 hari (12 hari). */
const shortNonLocal = {
  name: `Non-lokal pendek ${RUN}`,
  residency: "NON_LOCAL",
  workDays: 3,
  offDays: 1,
  cyclesBeforeTimeOff: 2,
  timeOffDays: 4,
  crewCount: 1,
};
let nonLocalId = "";
let localId = "";
let officeId = "";

describe("master roster (TM-D28)", () => {
  test("pola kerja bawaan office 5/2, 13/1 + time off & 6/1; validasi; akses PT", async () => {
    const created = await data<Roster[]>(
      await call("POST", "/work-rosters/defaults", h.hr, { companyId }),
    );
    expect(created.map((r) => r.summary).sort()).toEqual([
      "13/1 × 4 + time off 14 hari (70 hari)",
      "5/2",
      "6/1",
    ]);
    // Dipanggil lagi tidak menggandakan.
    expect(
      await data<Roster[]>(await call("POST", "/work-rosters/defaults", h.hr, { companyId })),
    ).toHaveLength(3);
    localId = created.find((r) => r.summary === "6/1")?.id as string;
    officeId = created.find((r) => r.summary === "5/2")?.id as string;

    expect(
      (
        await call("POST", "/work-rosters", h.hr, {
          ...shortNonLocal,
          companyId,
          timeOffDays: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (await call("POST", "/work-rosters", h.otherHr, { ...shortNonLocal, companyId })).status,
    ).toBe(403);
    // Karyawan boleh melihat master roster, tetapi tidak Homebase / lokal-non-lokal rekan kerja.
    expect((await call("GET", `/work-rosters?companyId=${companyId}`, h.emp)).status).toBe(200);
    expect(
      (await call("GET", `/work-rosters/residencies?companyId=${companyId}`, h.emp)).status,
    ).toBe(403);
    const res = await call("POST", "/work-rosters", h.hr, { ...shortNonLocal, companyId });
    expect(res.status).toBe(200);
    const roster = await data<Roster>(res);
    expect(roster).toMatchObject({ cycleLength: 12, inUse: false });
    nonLocalId = roster.id;
  });
});

describe("lokal / non-lokal (TM-D28)", () => {
  const list = async () =>
    new Map(
      (
        await data<Residency[]>(
          await call("GET", `/work-rosters/residencies?companyId=${companyId}`, h.hr),
        )
      ).map((r) => [r.employeeId, r]),
    );

  test("tanpa Homebase lokal lokasi → belum diketahui; setelah diatur: Homebase menentukan", async () => {
    expect((await list()).get(emp.local)).toMatchObject({
      residency: null,
      note: "Homebase lokal lokasi ini belum diatur",
    });
    expect(
      (
        await call("PUT", "/work-rosters/local-homebases", h.emp, {
          workLocationId: locationId,
          homebaseIds: [hb.local],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("PUT", "/work-rosters/local-homebases", h.hr, {
          workLocationId: locationId,
          homebaseIds: [hb.local],
        })
      ).status,
    ).toBe(200);
    const view = await data<{ locations: { id: string; homebaseIds: string[] }[] }>(
      await call("GET", "/work-rosters/local-homebases", h.hr),
    );
    expect(view.locations.find((l) => l.id === locationId)?.homebaseIds).toEqual([hb.local]);

    const rows = await list();
    expect(rows.get(emp.local)).toMatchObject({ residency: "LOCAL", source: "HOMEBASE" });
    expect(rows.get(emp.away)).toMatchObject({ residency: "NON_LOCAL", source: "HOMEBASE" });
    expect(rows.get(emp.unknown)).toMatchObject({
      residency: null,
      source: "UNKNOWN",
      note: "Homebase belum diisi",
    });
  });

  test("HR menetapkan manual & mengembalikan ke otomatis", async () => {
    const set = (residency: string | null) =>
      call("PUT", "/work-rosters/residencies", h.hr, {
        companyId,
        employeeIds: [emp.unknown],
        residency,
      });
    expect((await set("NON_LOCAL")).status).toBe(200);
    expect((await list()).get(emp.unknown)).toMatchObject({
      residency: "NON_LOCAL",
      source: "OVERRIDE",
    });
    expect((await set(null)).status).toBe(200);
    expect((await list()).get(emp.unknown)?.residency).toBeNull();
  });

  test("lokasi kerja kantor → office (mengalahkan Homebase), tanpa Homebase lokal pun", async () => {
    expect((await list()).get(emp.office)?.residency).toBeNull();
    expect(
      (
        await call("PUT", "/work-rosters/local-homebases", h.hr, {
          workLocationId: officeLocationId,
          office: true,
          homebaseIds: [],
        })
      ).status,
    ).toBe(200);
    const view = await data<{ locations: { id: string; office: boolean }[] }>(
      await call("GET", "/work-rosters/local-homebases", h.hr),
    );
    expect(view.locations.find((l) => l.id === officeLocationId)?.office).toBe(true);
    expect(view.locations.find((l) => l.id === locationId)?.office).toBe(false);
    expect((await list()).get(emp.office)).toMatchObject({
      residency: "OFFICE",
      source: "LOCATION",
    });
  });
});

describe("isi jadwal dengan roster (TM-D28)", () => {
  type Preview = {
    groups: {
      residency: string;
      templateName: string;
      plan: { assignments: { employeeId: string }[] };
    }[];
    unresolved: { employeeId: string; reason: string }[];
  };

  test("dipisah otomatis; tanpa Homebase tidak dipasang; time off = TO tanpa shift", async () => {
    const today = await settingsToday();
    const input = {
      companyId,
      workLocationId: locationId,
      employeeIds: [emp.local, emp.away, emp.unknown],
      effectiveDate: today,
      shiftCode: SHIFT,
      localRosterId: localId,
      nonLocalRosterId: nonLocalId,
    };
    expect((await call("POST", "/work-rosters/assign/preview", h.otherHr, input)).status).toBe(403);
    const preview = await data<Preview>(
      await call("POST", "/work-rosters/assign/preview", h.hr, input),
    );
    const groupOf = (r: string) => preview.groups.find((g) => g.residency === r);
    expect(groupOf("LOCAL")?.plan.assignments.map((a) => a.employeeId)).toEqual([emp.local]);
    expect(groupOf("NON_LOCAL")?.plan.assignments.map((a) => a.employeeId)).toEqual([emp.away]);
    expect(preview.unresolved).toEqual([
      expect.objectContaining({
        employeeId: emp.unknown,
        reason: expect.stringContaining("Homebase"),
      }),
    ]);

    const res = await call("POST", "/work-rosters/assign", h.hr, input);
    expect(res.status).toBe(200);

    // Non-lokal: 3 kerja, 1 OFF, 3 kerja, 1 OFF, lalu 4 hari time off.
    const days = await prisma.rosterDay.findMany({
      where: { employeeId: emp.away, workDate: { gte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { workDate: "asc" },
      take: 13,
      select: { shiftId: true, timeOff: true },
    });
    const kind = days.map((d) => (d.timeOff ? "TO" : d.shiftId ? "W" : "OFF"));
    expect(kind).toEqual(["W", "W", "W", "OFF", "W", "W", "W", "OFF", "TO", "TO", "TO", "TO", "W"]);

    // Lokal 6/1: satu OFF per 7 hari, jatuh di hari Minggu (siklus mulai Senin).
    const local = await prisma.rosterDay.findMany({
      where: {
        employeeId: emp.local,
        workDate: {
          gte: new Date(`${today}T00:00:00Z`),
          lte: new Date(`${addDays(today, 13)}T00:00:00Z`),
        },
      },
      select: { workDate: true, shiftId: true, timeOff: true },
    });
    const offs = local.filter((d) => !d.shiftId);
    expect(offs.length).toBe(2);
    expect(offs.every((d) => d.workDate.getUTCDay() === 0 && !d.timeOff)).toBe(true);
    expect(await prisma.rosterDay.count({ where: { employeeId: emp.unknown } })).toBe(0);

    // Grid menampilkan kode TO untuk hari time off.
    const timeOffDate = addDays(today, 8);
    const grid = await data<{ days: { employeeId: string; date: string; code: string }[] }>(
      await call("GET", `/roster?companyId=${companyId}&month=${timeOffDate.slice(0, 7)}`, h.hr),
    );
    expect(grid.days.find((d) => d.employeeId === emp.away && d.date === timeOffDate)?.code).toBe(
      "TO",
    );
  });

  test("roster yang sudah dipakai: siklus terkunci, nama boleh diubah", async () => {
    const rosters = await data<Roster[]>(
      await call("GET", `/work-rosters?companyId=${companyId}`, h.hr),
    );
    expect(rosters.find((r) => r.id === nonLocalId)?.inUse).toBe(true);
    const put = (body: Record<string, unknown>) =>
      call("PUT", `/work-rosters/${nonLocalId}`, h.hr, { ...shortNonLocal, companyId, ...body });
    expect((await put({ workDays: 4 })).status).toBe(422);
    const renamed = await put({ name: `Non-lokal FIFO ${RUN}` });
    expect(renamed.status).toBe(200);
    expect((await data<Roster>(renamed)).name).toBe(`Non-lokal FIFO ${RUN}`);
  });
});

describe("isi jadwal office (TM-D28)", () => {
  test("karyawan di lokasi kantor dipasangi pola office 5/2: OFF Sabtu & Minggu", async () => {
    const today = await settingsToday();
    const res = await call("POST", "/work-rosters/assign", h.hr, {
      companyId,
      workLocationId: officeLocationId,
      employeeIds: [emp.office],
      effectiveDate: today,
      shiftCode: SHIFT,
      officeRosterId: officeId,
      localRosterId: null,
      nonLocalRosterId: null,
    });
    expect(res.status).toBe(200);
    const result = await data<{ groups: { residency: string }[]; unresolved: unknown[] }>(res);
    expect(result.groups.map((g) => g.residency)).toEqual(["OFFICE"]);
    expect(result.unresolved).toEqual([]);
    const days = await prisma.rosterDay.findMany({
      where: {
        employeeId: emp.office,
        workDate: {
          gte: new Date(`${today}T00:00:00Z`),
          lte: new Date(`${addDays(today, 13)}T00:00:00Z`),
        },
      },
      select: { workDate: true, shiftId: true },
    });
    expect(days).toHaveLength(14);
    const offDays = days.filter((d) => !d.shiftId).map((d) => d.workDate.getUTCDay());
    expect(offDays.sort()).toEqual([0, 0, 6, 6]);
  });
});
