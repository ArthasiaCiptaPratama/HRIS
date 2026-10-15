import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D1 — lokasi absen per karyawan: bawaan (crew → lokasi kerja) / lokasi khusus / bebas lokasi (PLAN §5.4).
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
});
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data;

const SITE_A = { latitude: -3.85, longitude: 115.3 };
const SITE_B = { latitude: -2.55, longitude: 121.95 }; // jauh dari A
const FAR = { latitude: 1.0, longitude: 100.0 }; // jauh dari semua site uji

const ids = {
  company: "",
  otherCompany: "",
  status: "",
  department: "",
  position: "",
  siteA: "",
  siteB: "",
  noGeo: "",
  crew: "",
  pattern: "",
  employees: [] as string[],
};
const emp = { a: "", b: "", other: "" };
let h: Record<"sa" | "hr" | "hrOther" | "mgr" | "a" | "b", Record<string, string>>;

interface Row {
  employeeId: string;
  mode: string;
  customLocation: { id: string } | null;
  effective: { source: string; location: { id: string } | null; crewName: string | null };
}
const list = async (headers = h.sa, companyId = ids.company) =>
  call("GET", `/attendance-locations?companyId=${companyId}&q=${RUN}`, headers);
const rowOf = async (employeeId: string) =>
  (await data<{ employees: Row[] }>(await list())).employees.find(
    (r) => r.employeeId === employeeId,
  );
const precheck = async (headers: Record<string, string>, at: typeof SITE_A) =>
  data<{ labels: string[]; insideGeofence: boolean }>(
    await call("POST", "/attendance/precheck", headers, { kind: "IN", ...at, accuracyM: 15 }),
  );

beforeAll(async () => {
  ids.company = await acpCompanyId();
  ids.otherCompany = await createTestCompany(`L${RUN}`, `PT Lokasi ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `LS ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `LS ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `LS ${RUN}`, departmentId: ids.department } })
  ).id;
  const loc = async (name: string, point: typeof SITE_A | null) =>
    (
      await prisma.workLocation.create({
        data: { name: `${name} ${RUN}`, ...(point ? { ...point, radiusM: 500 } : {}) },
      })
    ).id;
  ids.siteA = await loc("Site A", SITE_A);
  ids.siteB = await loc("Site B", SITE_B);
  ids.noGeo = await loc("Tanpa Geofence", null);

  const mk = async (n: string, companyId = ids.company) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `LS-${RUN}-${n}`,
          fullName: `Lokasi ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          workLocationId: ids.siteA,
        },
      })
    ).id;
  emp.a = await mk("A");
  emp.b = await mk("B");
  emp.other = await mk("O", ids.otherCompany);
  ids.employees.push(emp.a, emp.b, emp.other);

  // a anggota crew di Site A; b tanpa crew (lokasi kerja Site A).
  ids.pattern = (
    await prisma.rosterPattern.create({
      data: { companyId: ids.company, name: `LP ${RUN}`, steps: ["OFF"] },
    })
  ).id;
  ids.crew = (
    await prisma.crew.create({
      data: {
        companyId: ids.company,
        workLocationId: ids.siteA,
        name: `LC ${RUN}`,
        patternId: ids.pattern,
        cycleStartDate: new Date("2024-01-01T00:00:00Z"),
      },
    })
  ).id;
  await prisma.crewMember.create({
    data: { crewId: ids.crew, employeeId: emp.a, startDate: new Date("2024-01-01T00:00:00Z") },
  });

  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN")).headers,
    hrOther: (await auth.loginAs("HR_ADMIN", { companies: [ids.otherCompany] })).headers,
    mgr: (await auth.loginAs("MANAGER", { companies: [ids.company] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [ids.company] })).headers,
    b: (await auth.loginAs("EMPLOYEE", { employeeId: emp.b, companies: [ids.company] })).headers,
  };
});

afterAll(async () => {
  await prisma.employeeLocationSetting.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crew.deleteMany({ where: { id: ids.crew } });
  await prisma.rosterPattern.deleteMany({ where: { id: ids.pattern } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.deleteMany({
    where: { id: { in: [ids.siteA, ids.siteB, ids.noGeo] } },
  });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.company.delete({ where: { id: ids.otherCompany } });
  await disconnectPrisma();
});

describe("lokasi absen per karyawan (TM-D1)", () => {
  test("akses: SA & HR PT boleh; HR PT lain, MANAGER, karyawan 403", async () => {
    expect((await list(h.sa)).status).toBe(200);
    expect((await list(h.hr)).status).toBe(200);
    expect((await list(h.hrOther)).status).toBe(403);
    expect((await list(h.mgr)).status).toBe(403);
    expect((await list(h.a)).status).toBe(403);
    const body = { employeeIds: [emp.a], mode: "ANYWHERE" };
    expect((await call("PUT", "/attendance-locations", h.hrOther, body)).status).toBe(403);
    expect((await call("PUT", "/attendance-locations", h.mgr, body)).status).toBe(403);
    // HR PT A tidak boleh mengatur karyawan PT lain (meski dicampur dalam satu permintaan).
    expect(
      (
        await call("PUT", "/attendance-locations", h.hr, {
          employeeIds: [emp.a, emp.other],
          mode: "ANYWHERE",
        })
      ).status,
    ).toBe(403);
    expect((await rowOf(emp.a))?.mode).toBe("DEFAULT");
  });

  test("bawaan: lokasi crew lebih dulu, lalu lokasi kerja; hanya lokasi ber-geofence yang bisa dipilih", async () => {
    const view = await data<{ employees: Row[]; locations: { id: string }[] }>(await list());
    const a = view.employees.find((r) => r.employeeId === emp.a);
    const b = view.employees.find((r) => r.employeeId === emp.b);
    expect(a?.effective).toMatchObject({ source: "CREW", crewName: `LC ${RUN}` });
    expect(a?.effective.location?.id).toBe(ids.siteA);
    expect(b?.effective).toMatchObject({ source: "EMPLOYEE", crewName: null });
    const options = view.locations.map((l) => l.id);
    expect(options).toContain(ids.siteB);
    expect(options).not.toContain(ids.noGeo);
  });

  test("validasi: lokasi wajib untuk mode khusus; lokasi tanpa geofence 422; karyawan tak dikenal 404", async () => {
    expect(
      (await call("PUT", "/attendance-locations", h.sa, { employeeIds: [emp.a], mode: "LOCATION" }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("PUT", "/attendance-locations", h.sa, {
          employeeIds: [emp.a],
          mode: "LOCATION",
          workLocationId: ids.noGeo,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("PUT", "/attendance-locations", h.sa, {
          employeeIds: [crypto.randomUUID()],
          mode: "ANYWHERE",
        })
      ).status,
    ).toBe(404);
  });

  test("lokasi khusus mengalahkan crew: absen di Site B sah, di Site A jadi lokasi lain; tercatat di audit", async () => {
    const res = await call("PUT", "/attendance-locations", h.hr, {
      employeeIds: [emp.a],
      mode: "LOCATION",
      workLocationId: ids.siteB,
    });
    expect(await data<{ updated: number }>(res)).toEqual({ updated: 1 });
    expect((await rowOf(emp.a))?.effective).toMatchObject({ source: "CUSTOM" });

    const today = await data<{
      location: { id: string };
      locationSource: string;
      anywhere: boolean;
    }>(await call("GET", "/attendance/me/today", h.a));
    expect(today).toMatchObject({ locationSource: "CUSTOM", anywhere: false });
    expect(today.location.id).toBe(ids.siteB);

    const atB = await precheck(h.a, SITE_B);
    expect(atB.insideGeofence).toBe(true);
    expect(atB.labels).not.toContain("OTHER_LOCATION");
    expect((await precheck(h.a, SITE_A)).labels).toContain("OTHER_LOCATION");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "attendance.location_setting.update", entityId: emp.a },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.after).toMatchObject({ mode: "LOCATION", workLocationId: ids.siteB });
  });

  test("bebas lokasi: tidak dicek geofence (tanpa label di luar radius), banyak karyawan sekaligus", async () => {
    const res = await call("PUT", "/attendance-locations", h.sa, {
      employeeIds: [emp.a, emp.b],
      mode: "ANYWHERE",
    });
    expect(await data<{ updated: number }>(res)).toEqual({ updated: 2 });
    const today = await data<{ anywhere: boolean; locationSource: string; location: unknown }>(
      await call("GET", "/attendance/me/today", h.b),
    );
    expect(today).toMatchObject({ anywhere: true, locationSource: "ANYWHERE", location: null });
    const far = await precheck(h.b, FAR);
    expect(far.labels).not.toContain("OUTSIDE_RADIUS");
    expect(far.labels).not.toContain("OTHER_LOCATION");
  });

  test("kembali ke bawaan: perilaku lama pulih (di luar radius berlabel); mengulang tidak menulis audit", async () => {
    const body = { employeeIds: [emp.a, emp.b], mode: "DEFAULT" };
    expect(
      await data<{ updated: number }>(await call("PUT", "/attendance-locations", h.sa, body)),
    ).toEqual({ updated: 2 });
    expect((await rowOf(emp.a))?.effective.source).toBe("CREW");
    expect((await precheck(h.b, FAR)).labels).toContain("OUTSIDE_RADIUS");
    expect(
      await data<{ updated: number }>(await call("PUT", "/attendance-locations", h.sa, body)),
    ).toEqual({ updated: 0 });
  });
});
