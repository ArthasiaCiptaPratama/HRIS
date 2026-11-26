import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { EMPLOYEE_PHOTO_BUCKET } from "../../../src/core/storage.ts";
import { settingsToday } from "../../../src/modules/attendance/index.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D33 — GET /attendance/people: kartu "Per karyawan" Data Absen Harian. Hanya karyawan dalam cakupan yang
// punya hari absen dengan ≥1 punch; urut tanggal kerja terakhir terbaru; cari nama/NIP; berhalaman.
// Data uji di 1997 (+ satu hari absen "hari ini") dan dipisah dari data lain lewat q = RUN.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(`tmp-${RUN.toLowerCase()}`);
const prisma = getPrisma();
const fake = createFakeStorage();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: fake.storage,
});
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const SELFIE = `selfie/${RUN}-rahasia.jpg`;
const LAT = "-3.123456";
const LNG = "116.654321";

const ids = {
  status: "",
  department: "",
  position: "",
  location: "",
  pattern: "",
  crew: "",
  companyA: "",
  companyB: "",
};
const emp = { mgr: "", e1: "", e2: "", e3: "", e4: "", e5: "", e6: "" };
let today = "";
let todayPunchAt: Date;
let h: Record<
  "sa" | "hrA" | "hrB" | "mgr" | "mgrNoEmp" | "employee" | "personnel",
  Record<string, string>
>;

type Person = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  position: string | null;
  division: string | null;
  company: { id: string; name: string } | null;
  crew: { id: string; name: string } | null;
  isActive: boolean;
  firstWorkDate: string;
  lastWorkDate: string;
  lastPunchAt: string | null;
  todayStatus: string | null;
  photoUrl: string | null;
};
type Page = { data: Person[]; meta: { page: number; pageSize: number; total: number } };

const get = (headers: Record<string, string>, query: Record<string, string> = {}) =>
  app.request(`/api/v1/attendance/people?${new URLSearchParams(query)}`, { headers });
async function list(headers: Record<string, string>, query: Record<string, string> = {}) {
  const res = await get(headers, { q: RUN, ...query });
  expect(res.status).toBe(200);
  return (await res.json()) as Page;
}
const names = (page: Page) => page.data.map((p) => p.id);

beforeAll(async () => {
  today = await settingsToday();
  ids.companyA = await createTestCompany(`PA${RUN.slice(0, 5)}`, `Per Karyawan A ${RUN}`);
  ids.companyB = await createTestCompany(`PB${RUN.slice(0, 5)}`, `Per Karyawan B ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `TMP ${RUN}` } })).id;
  ids.department = (
    await prisma.department.create({ data: { name: `Divisi TMP ${RUN}`, unitType: "DIVISION" } })
  ).id;
  ids.position = (
    await prisma.position.create({
      data: { name: `Jabatan TMP ${RUN}`, departmentId: ids.department },
    })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site TMP ${RUN}`, latitude: -3.12, longitude: 116.65, radiusM: 200 },
    })
  ).id;
  const mk = async (n: string, companyId: string, extra = {}) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `PPL-${RUN}-${n}`,
          fullName: `Kartu ${RUN} ${n}`,
          joinDate: D("1990-01-01"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          ...extra,
        },
      })
    ).id;
  emp.mgr = await mk("MGR", ids.companyA);
  emp.e1 = await mk("Budi", ids.companyA, { managerId: emp.mgr });
  emp.e2 = await mk("Adi", ids.companyA, { managerId: emp.mgr });
  emp.e3 = await mk("TanpaPunch", ids.companyA, { managerId: emp.mgr });
  emp.e4 = await mk("PTB", ids.companyB);
  emp.e5 = await mk("Keluar", ids.companyA, { isActive: false });
  emp.e6 = await mk("Pindah", ids.companyB); // sekarang PT B; hari absen lama di PT A
  // Foto profil Personnel Management (bukan selfie absen).
  for (const id of [emp.e1, emp.e6]) {
    const path = `dev/test/employees/${id}/photo-${RUN}.webp`;
    await prisma.employee.update({ where: { id }, data: { photoPath: path } });
    fake.putObject(EMPLOYEE_PHOTO_BUCKET, path, { size: 10, contentType: "image/webp" });
  }

  ids.pattern = (
    await prisma.rosterPattern.create({
      data: { companyId: ids.companyA, name: `TMP ${RUN}`, steps: ["OFF"] },
    })
  ).id;
  ids.crew = (
    await prisma.crew.create({
      data: {
        companyId: ids.companyA,
        workLocationId: ids.location,
        name: `Crew TMP ${RUN}`,
        patternId: ids.pattern,
        cycleStartDate: D("1997-01-01"),
      },
    })
  ).id;
  await prisma.crewMember.create({
    data: { crewId: ids.crew, employeeId: emp.e1, startDate: D("1997-01-01") },
  });

  const day = (employeeId: string, date: string, status: string, companyId = ids.companyA) =>
    prisma.attendanceDay.create({
      data: {
        employeeId,
        companyId,
        managerEmployeeId: emp.mgr,
        workDate: D(date),
        status: status as never,
        labels: [],
      },
    });
  const punch = (dayId: string, kind: "IN" | "OUT", at: Date) =>
    prisma.attendancePunch.create({
      data: {
        dayId,
        kind,
        at,
        latitude: LAT,
        longitude: LNG,
        accuracyM: 10,
        insideGeofence: true,
        selfiePath: SELFIE,
        labels: [],
        status: "APPROVED",
      },
    });
  // e1: 1 & 3 Mei 1997; jam terakhir = OUT 3 Mei.
  await punch(
    (await day(emp.e1, "1997-05-01", "APPROVED")).id,
    "IN",
    new Date("1997-05-01T00:05:00Z"),
  );
  const e1Last = await day(emp.e1, "1997-05-03", "APPROVED");
  await punch(e1Last.id, "IN", new Date("1997-05-03T00:00:00Z"));
  await punch(e1Last.id, "OUT", new Date("1997-05-03T11:10:00Z"));
  // e2: 2 Mei 1997 + hari ini (OPEN, baru absen masuk).
  await punch(
    (await day(emp.e2, "1997-05-02", "APPROVED")).id,
    "IN",
    new Date("1997-05-02T00:00:00Z"),
  );
  todayPunchAt = new Date();
  await punch((await day(emp.e2, today, "OPEN")).id, "IN", todayPunchAt);
  // e3: hanya Alpha & cuti tanpa punch → tidak tampil.
  await day(emp.e3, "1997-05-05", "ALPHA");
  await day(emp.e3, "1997-05-06", "LEAVE");
  // e4: PT B.
  await punch(
    (await day(emp.e4, "1997-05-04", "PENDING", ids.companyB)).id,
    "IN",
    new Date("1997-05-04T00:00:00Z"),
  );
  // e5: nonaktif, tetap tampil.
  await punch(
    (await day(emp.e5, "1997-04-01", "APPROVED")).id,
    "IN",
    new Date("1997-04-01T00:00:00Z"),
  );
  // e6: hari absen saat masih di PT A (snapshot), kini PT B.
  await punch(
    (await day(emp.e6, "1997-04-15", "REJECTED")).id,
    "IN",
    new Date("1997-04-15T00:00:00Z"),
  );

  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hrA: (await auth.loginAs("HR_ADMIN", { companies: [ids.companyA] })).headers,
    hrB: (await auth.loginAs("HR_ADMIN", { companies: [ids.companyB] })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [ids.companyA] }))
      .headers,
    mgrNoEmp: (await auth.loginAs("MANAGER", { companies: [ids.companyA] })).headers,
    employee: (await auth.loginAs("EMPLOYEE", { employeeId: emp.e1, companies: [ids.companyA] }))
      .headers,
    personnel: (await auth.loginAs("HR_PERSONNEL", { companies: [ids.companyA] })).headers,
  };
});

afterAll(async () => {
  const all = Object.values(emp);
  await deleteAttendanceData(all);
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: all } } });
  await prisma.crew.deleteMany({ where: { id: ids.crew } });
  await prisma.rosterPattern.deleteMany({ where: { id: ids.pattern } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: all } } });
  await prisma.position.deleteMany({ where: { id: ids.position } });
  await prisma.department.deleteMany({ where: { id: ids.department } });
  await prisma.workLocation.deleteMany({ where: { id: ids.location } });
  await prisma.employmentStatus.deleteMany({ where: { id: ids.status } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.companyA, ids.companyB] } } });
  await disconnectPrisma();
});

describe("GET /attendance/people — 200", () => {
  test("SA: hanya karyawan ber-punch, urut tanggal kerja terakhir terbaru, isi kartu", async () => {
    const page = await list(h.sa);
    expect(names(page)).toEqual([emp.e2, emp.e4, emp.e1, emp.e6, emp.e5]);
    expect(page.meta).toEqual({ page: 1, pageSize: 24, total: 5 });

    const e1 = page.data.find((p) => p.id === emp.e1) as Person;
    expect(e1).toEqual({
      id: emp.e1,
      fullName: `Kartu ${RUN} Budi`,
      employeeNumber: `PPL-${RUN}-Budi`,
      position: `Jabatan TMP ${RUN}`,
      division: `Divisi TMP ${RUN}`,
      company: { id: ids.companyA, name: `Per Karyawan A ${RUN}` },
      crew: { id: ids.crew, name: `Crew TMP ${RUN}` },
      isActive: true,
      firstWorkDate: "1997-05-01",
      lastWorkDate: "1997-05-03",
      lastPunchAt: "1997-05-03T11:10:00.000Z",
      todayStatus: null,
      photoUrl: expect.stringContaining("https://storage.test/sign/employee-photos/"),
    });
    const e2 = page.data.find((p) => p.id === emp.e2) as Person;
    expect(e2.firstWorkDate).toBe("1997-05-02");
    expect(e2.lastWorkDate).toBe(today);
    expect(e2.lastPunchAt).toBe(todayPunchAt.toISOString());
    expect(e2.todayStatus).toBe("OPEN");
    expect(e2.crew).toBeNull();
    expect(e2.photoUrl).toBeNull();
    const e5 = page.data.find((p) => p.id === emp.e5) as Person;
    expect(e5.isActive).toBe(false);
    // Snapshot PT pada hari absen (PT A) tidak menggantikan PT saat ini.
    expect(page.data.find((p) => p.id === emp.e6)?.company?.id).toBe(ids.companyB);
  });

  test("tanpa data sensitif / selfie / koordinat di respons", async () => {
    const res = await get(h.sa, { q: RUN });
    const text = await res.text();
    const body = JSON.parse(text) as Page;
    for (const person of body.data) {
      expect(Object.keys(person).sort()).toEqual(
        [
          "company",
          "crew",
          "division",
          "employeeNumber",
          "firstWorkDate",
          "fullName",
          "id",
          "isActive",
          "lastPunchAt",
          "lastWorkDate",
          "photoUrl",
          "position",
          "todayStatus",
        ].sort(),
      );
    }
    expect(text).not.toContain(SELFIE);
    expect(text).not.toContain("attendance-selfies");
    expect(text).not.toContain(LAT);
    expect(text).not.toContain(LNG);
  });

  test("paging: meta & potongan halaman; halaman lewat akhir kosong", async () => {
    const p2 = await list(h.sa, { pageSize: "2", page: "2" });
    expect(names(p2)).toEqual([emp.e1, emp.e6]);
    expect(p2.meta).toEqual({ page: 2, pageSize: 2, total: 5 });
    const p3 = await list(h.sa, { pageSize: "2", page: "3" });
    expect(names(p3)).toEqual([emp.e5]);
    const p9 = await list(h.sa, { pageSize: "2", page: "9" });
    expect(p9.data).toEqual([]);
    expect(p9.meta.total).toBe(5);
  });

  test("q mencari nama atau NIP (tidak peka huruf besar/kecil)", async () => {
    expect(names(await list(h.sa, { q: `kartu ${RUN.toLowerCase()} budi` }))).toEqual([emp.e1]);
    expect(names(await list(h.sa, { q: `PPL-${RUN}-PTB` }))).toEqual([emp.e4]);
    const none = await list(h.sa, { q: `${RUN}-tidak-ada` });
    expect(none).toEqual({ data: [], meta: { page: 1, pageSize: 24, total: 0 } });
  });

  test("SA dengan companyId hanya hari di PT itu", async () => {
    expect(names(await list(h.sa, { companyId: ids.companyB }))).toEqual([emp.e4]);
  });

  test("HR hanya PT-nya (snapshot hari absen, sama dengan listDays); foto mengikuti Personnel Management", async () => {
    const a = await list(h.hrA);
    expect(names(a)).toEqual([emp.e2, emp.e1, emp.e6, emp.e5]);
    expect(a.data.find((p) => p.id === emp.e1)?.photoUrl).not.toBeNull();
    // e6 kini PT B: HR PT A tidak melihat fotonya di Personnel Management → null.
    expect(a.data.find((p) => p.id === emp.e6)?.photoUrl).toBeNull();
    expect(names(await list(h.hrA, { companyId: ids.companyA }))).toEqual([
      emp.e2,
      emp.e1,
      emp.e6,
      emp.e5,
    ]);
    expect(names(await list(h.hrB))).toEqual([emp.e4]);
  });

  test("MANAGER hanya bawahan langsung (companyId hanya menyaring)", async () => {
    const page = await list(h.mgr);
    expect(names(page)).toEqual([emp.e2, emp.e1]);
    expect(page.data.find((p) => p.id === emp.e1)?.photoUrl).not.toBeNull();
    expect((await list(h.mgr, { companyId: ids.companyB })).data).toEqual([]);
  });
});

describe("GET /attendance/people — 400/401/403", () => {
  test("400 paging / uuid / q tidak valid", async () => {
    const invalid: Record<string, string>[] = [
      { page: "0" },
      { page: "abc" },
      { pageSize: "0" },
      { pageSize: "101" },
      { companyId: "bukan-uuid" },
      { q: "x".repeat(101) },
    ];
    for (const query of invalid) {
      const res = await get(h.sa, query);
      expect(res.status).toBe(400);
    }
  });

  test("401 tanpa token", async () => {
    expect((await get({})).status).toBe(401);
  });

  test("403 EMPLOYEE, HR Kepegawaian, MANAGER tanpa karyawan, HR PT lain", async () => {
    expect((await get(h.employee)).status).toBe(403);
    expect((await get(h.personnel)).status).toBe(403);
    expect((await get(h.mgrNoEmp)).status).toBe(403);
    expect((await get(h.hrA, { companyId: ids.companyB })).status).toBe(403);
    expect((await get(h.hrB, { companyId: ids.companyA })).status).toBe(403);
  });
});
