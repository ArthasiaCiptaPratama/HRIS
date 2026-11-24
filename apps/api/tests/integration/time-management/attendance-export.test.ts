import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";

// TM-D31 — POST /attendance/days/export: Detail per crew (Ringkasan + sheet crew menurut keanggotaan pada
// tanggal itu) & Flash 5 kolom. Data uji di Maret 1998 supaya tidak bercampur data lain.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(`tmx-${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
const FROM = "1998-03-01";
const TO = "1998-03-08";
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const offsetH = OFFSET_H[(await readTimeSettings()).timezone] ?? 7;
/** "HH:mm" lokal pada tanggal → instan UTC. */
const local = (date: string, hhmm: string) =>
  new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - offsetH * 3600_000);
const SELFIE = `selfie/${RUN}-rahasia.jpg`;
const LAT = "-3.123456";
const LNG = "116.654321";

const ids = {
  status: "",
  department: "",
  division: "",
  position: "",
  departmentNoDiv: "",
  positionNoDiv: "",
  location: "",
  shift: "",
  pattern: "",
  patternB: "",
  companyA: "",
  companyB: "",
  crewX: "",
  crewY: "",
  crewZ: "",
  shiftB: "",
};
const emp = { mgr: "", e1: "", e2: "", e3: "", e4: "", mv: "", nc: "" };
let h: Record<
  "sa" | "hrA" | "hrB" | "mgr" | "mgrNoEmp" | "employee" | "personnel",
  Record<string, string>
>;

const call = (headers: Record<string, string>, body: unknown) =>
  app.request("/api/v1/attendance/days/export", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

type Sheet = { name: string; xml: string; rows: Map<number, Map<string, string>> };
/** Isi workbook: sheet (nama → baris → kolom → teks/nilai). */
async function workbook(res: Response) {
  expect(res.status).toBe(200);
  const { data } = (await res.json()) as {
    data: { fileName: string; rows: number; contentBase64: string };
  };
  const files = unzipSync(Buffer.from(data.contentBase64, "base64"));
  const text = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  const names = [...text("xl/workbook.xml").matchAll(/<sheet name="([^"]*)"/g)].map((m) =>
    (m[1] as string).replace(/&amp;/g, "&"),
  );
  const sheets: Sheet[] = names.map((name, i) => {
    const xml = text(`xl/worksheets/sheet${i + 1}.xml`);
    const rows = new Map<number, Map<string, string>>();
    for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>(.*?)<\/c>)/g)) {
      const inner = m[3] ?? "";
      const value = /<t[^>]*>(.*?)<\/t>/.exec(inner)?.[1] ?? /<v>(.*?)<\/v>/.exec(inner)?.[1] ?? "";
      const row = rows.get(Number(m[2])) ?? new Map<string, string>();
      row.set(m[1] as string, value);
      rows.set(Number(m[2]), row);
    }
    return { name, xml, rows };
  });
  const all = Object.values(files)
    .map((f) => strFromU8(f))
    .join("\n");
  return { ...data, sheets, all };
}
/** Baris data (setelah header bertuliskan kolom A = header pertama). */
function table(sheet: Sheet, firstHeader: string) {
  const sorted = [...sheet.rows.entries()].sort((a, b) => a[0] - b[0]);
  const at = sorted.findIndex(([, r]) => r.get("A") === firstHeader);
  const header = sorted[at]?.[1] as Map<string, string>;
  const columns = [...header.entries()].map(([col, name]) => ({ col, name }));
  return {
    header: columns.map((c) => c.name),
    rows: sorted
      .slice(at + 1)
      .filter(([, r]) => r.size >= columns.length - 1 && r.get("B"))
      .map(([, r]) => Object.fromEntries(columns.map((c) => [c.name, r.get(c.col) ?? ""]))),
  };
}
const serial = (iso: string) =>
  String((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

beforeAll(async () => {
  ids.companyA = await createTestCompany(`XA${RUN.slice(0, 5)}`, `Ekspor Absen A ${RUN}`);
  ids.companyB = await createTestCompany(`XB${RUN.slice(0, 5)}`, `Ekspor Absen B ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `TMX ${RUN}` } })).id;
  ids.division = (
    await prisma.department.create({ data: { name: `Divisi TMX ${RUN}`, unitType: "DIVISION" } })
  ).id;
  ids.department = (
    await prisma.department.create({ data: { name: `TMX ${RUN}`, parentId: ids.division } })
  ).id;
  ids.position = (
    await prisma.position.create({
      data: { name: `Jabatan TMX ${RUN}`, departmentId: ids.department },
    })
  ).id;
  // Unit tanpa leluhur DIVISION → Divisi "—".
  ids.departmentNoDiv = (await prisma.department.create({ data: { name: `TMXND ${RUN}` } })).id;
  ids.positionNoDiv = (
    await prisma.position.create({
      data: { name: `Jabatan ND ${RUN}`, departmentId: ids.departmentNoDiv },
    })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site TMX ${RUN}`, latitude: -3.12, longitude: 116.65, radiusM: 200 },
    })
  ).id;
  const mk = async (n: string, companyId: string, extra = {}) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `TMX-${RUN}-${n}`,
          fullName: `Ekspor ${RUN} ${n}`,
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
  emp.e2 = await mk("Adi", ids.companyA, { managerId: emp.mgr, positionId: ids.positionNoDiv });
  emp.e3 = await mk("Keluar", ids.companyA, { isActive: false });
  emp.e4 = await mk("PTB", ids.companyB);
  emp.mv = await mk("Pindah", ids.companyB); // pindah A → B di tengah rentang April
  emp.nc = await mk("TanpaCrew", ids.companyB);

  ids.shift = (
    await prisma.shift.create({
      data: {
        companyId: ids.companyA,
        code: `X${RUN.slice(0, 5)}`,
        name: `TMX ${RUN}`,
        startMinute: 420,
        endMinute: 1140,
      },
    })
  ).id;
  ids.shiftB = (
    await prisma.shift.create({
      data: {
        companyId: ids.companyB,
        code: `Y${RUN.slice(0, 5)}`,
        name: `TMX B ${RUN}`,
        startMinute: 480,
        endMinute: 1020,
      },
    })
  ).id;
  ids.pattern = (
    await prisma.rosterPattern.create({
      data: { companyId: ids.companyA, name: `TMX ${RUN}`, steps: ["OFF"] },
    })
  ).id;
  ids.patternB = (
    await prisma.rosterPattern.create({
      data: { companyId: ids.companyB, name: `TMX ${RUN}`, steps: ["OFF"] },
    })
  ).id;
  const crew = async (name: string, companyId: string, patternId: string, deleted = false) =>
    (
      await prisma.crew.create({
        data: {
          companyId,
          workLocationId: ids.location,
          name,
          patternId,
          cycleStartDate: D(FROM),
          ...(deleted ? { deletedAt: new Date() } : {}),
        },
      })
    ).id;
  ids.crewX = await crew(`TMX ${RUN} X`, ids.companyA, ids.pattern);
  ids.crewY = await crew(`TMX ${RUN} Y`, ids.companyA, ids.pattern, true);
  ids.crewZ = await crew(`TMX ${RUN} Z`, ids.companyB, ids.patternB);
  await prisma.crewMember.createMany({
    data: [
      {
        crewId: ids.crewX,
        employeeId: emp.e1,
        startDate: D("1998-02-01"),
        endDate: D("1998-03-05"),
      },
      { crewId: ids.crewY, employeeId: emp.e1, startDate: D("1998-03-06") },
      { crewId: ids.crewX, employeeId: emp.e2, startDate: D("1998-02-01") },
      { crewId: ids.crewZ, employeeId: emp.e4, startDate: D("1998-02-01") },
      // Karyawan pindah PT: crew PT A s.d. 4 April, crew PT B mulai 5 April.
      {
        crewId: ids.crewX,
        employeeId: emp.mv,
        startDate: D("1998-03-01"),
        endDate: D("1998-04-04"),
      },
      { crewId: ids.crewZ, employeeId: emp.mv, startDate: D("1998-04-05") },
    ],
  });
  // Rentang April: 1–2 shift PT A, 3 OFF tanpa shift/crew (tanggal crew PT A), 5–6 shift PT B,
  // 7 OFF tanpa shift/crew (tanggal crew PT B). Karyawan PT B tanpa crew: OFF tanpa shift/crew tanggal 3.
  const mvRoster = (date: string, shiftId: string | null) => ({
    employeeId: emp.mv,
    workDate: D(date),
    shiftId,
    source: "MANUAL" as const,
  });
  await prisma.rosterDay.createMany({
    data: [
      mvRoster("1998-04-01", ids.shift),
      mvRoster("1998-04-02", ids.shift),
      mvRoster("1998-04-03", null),
      mvRoster("1998-04-05", ids.shiftB),
      mvRoster("1998-04-06", ids.shiftB),
      mvRoster("1998-04-07", null),
      { employeeId: emp.nc, workDate: D("1998-04-03"), source: "MANUAL" as const, shiftId: null },
    ],
  });
  // Roster 1–8 Maret: e1 & e2 kerja kecuali 7 (OFF) & 8 (time off); e3 (sudah keluar) kerja tanggal 1.
  const dates = ["01", "02", "03", "04", "05", "06", "07", "08"].map((d) => `1998-03-${d}`);
  await prisma.rosterDay.createMany({
    data: [emp.e1, emp.e2].flatMap((employeeId) =>
      dates.map((date) => ({
        employeeId,
        workDate: D(date),
        shiftId: date.endsWith("07") || date.endsWith("08") ? null : ids.shift,
        timeOff: date.endsWith("08"),
        source: "MANUAL" as const,
      })),
    ),
  });
  await prisma.rosterDay.create({
    data: { employeeId: emp.e3, workDate: D("1998-03-01"), shiftId: ids.shift, source: "MANUAL" },
  });

  const day = (
    employeeId: string,
    date: string,
    status: string,
    companyId = ids.companyA,
    labels: string[] = [],
  ) =>
    prisma.attendanceDay.create({
      data: {
        employeeId,
        companyId,
        managerEmployeeId: emp.mgr,
        workDate: D(date),
        shiftId: ids.shift,
        shiftCode: `X${RUN.slice(0, 5)}`,
        scheduledStart: local(date, "07:00"),
        scheduledEnd: local(date, "19:00"),
        status: status as never,
        labels,
      },
    });
  const punchBase = {
    latitude: LAT,
    longitude: LNG,
    accuracyM: 10,
    workLocationId: ids.location,
    selfiePath: SELFIE,
  };
  const d1 = await day(emp.e1, "1998-03-01", "APPROVED");
  await prisma.attendancePunch.createMany({
    data: [
      {
        ...punchBase,
        dayId: d1.id,
        kind: "IN",
        at: local("1998-03-01", "07:05"),
        distanceM: 20,
        insideGeofence: true,
        labels: [],
        status: "APPROVED",
      },
      {
        ...punchBase,
        dayId: d1.id,
        kind: "OUT",
        at: local("1998-03-01", "19:10"),
        distanceM: 350,
        insideGeofence: false,
        labels: ["OUTSIDE_RADIUS"],
        status: "APPROVED",
      },
    ],
  });
  const d2 = await day(emp.e1, "1998-03-02", "REJECTED", ids.companyA, ["LATE"]);
  await prisma.attendancePunch.create({
    data: {
      ...punchBase,
      dayId: d2.id,
      kind: "IN",
      at: local("1998-03-02", "08:30"),
      distanceM: 5,
      insideGeofence: true,
      labels: ["LATE"],
      status: "REJECTED",
    },
  });
  const d3 = await day(emp.e1, "1998-03-03", "APPROVED");
  await prisma.attendancePunch.createMany({
    data: [
      {
        ...punchBase,
        dayId: d3.id,
        kind: "IN",
        at: local("1998-03-03", "06:55"),
        distanceM: 5,
        insideGeofence: true,
        labels: [],
        status: "APPROVED",
      },
      {
        ...punchBase,
        dayId: d3.id,
        kind: "OUT",
        at: local("1998-03-04", "01:30"),
        distanceM: 5,
        insideGeofence: true,
        labels: [],
        status: "APPROVED",
      },
    ],
  });
  await day(emp.e2, "1998-03-04", "ALPHA", ids.companyA, ["NO_ATTENDANCE"]);
  await day(emp.e2, "1998-03-05", "LEAVE");
  await day(emp.e3, "1998-03-01", "APPROVED");
  await day(emp.e4, "1998-03-01", "APPROVED", ids.companyB);
  await day(emp.mv, "1998-04-01", "APPROVED", ids.companyA); // hari absen saat masih di PT A
  const dB = await day(emp.mv, "1998-04-06", "APPROVED", ids.companyB);
  await prisma.attendanceDay.update({
    where: { id: dB.id },
    data: { shiftId: ids.shiftB, shiftCode: `Y${RUN.slice(0, 5)}` },
  });

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
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: all } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: all } } });
  await prisma.crew.deleteMany({ where: { id: { in: [ids.crewX, ids.crewY, ids.crewZ] } } });
  await prisma.rosterPattern.deleteMany({ where: { id: { in: [ids.pattern, ids.patternB] } } });
  await prisma.shift.deleteMany({ where: { id: { in: [ids.shift, ids.shiftB] } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: all } } });
  await prisma.position.deleteMany({ where: { id: { in: [ids.position, ids.positionNoDiv] } } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.department.deleteMany({
    where: { id: { in: [ids.departmentNoDiv, ids.division] } },
  });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.companyA, ids.companyB] } } });
  await disconnectPrisma();
});

const detail = (extra: Record<string, unknown> = {}) => ({
  kind: "DETAIL",
  from: FROM,
  to: TO,
  ...extra,
});
const flash = (extra: Record<string, unknown> = {}) => ({
  kind: "FLASH",
  from: FROM,
  to: TO,
  ...extra,
});

describe("akses & validasi", () => {
  test("tanpa token 401", async () => {
    expect((await call({}, detail())).status).toBe(401);
  });

  test("body tidak sah 400 (tanggal terbalik, > 92 hari, kind/field asing, crewIds kosong)", async () => {
    for (const body of [
      detail({ from: TO, to: FROM }),
      detail({ from: "1998-01-01", to: "1998-04-03" }),
      { kind: "CSV", from: FROM, to: TO },
      flash({ crewIds: [ids.crewX] }),
      detail({ crewIds: [] }),
      detail({ companyId: "bukan-uuid" }),
    ]) {
      expect((await call(h.sa, body)).status).toBe(400);
    }
    expect(
      (await call(h.sa, detail({ from: "1998-01-01", to: "1998-04-02", companyId: ids.companyA })))
        .status,
    ).toBe(200);
  });

  test("403: EMPLOYEE, HR_PERSONNEL, MANAGER tanpa karyawan, HR di PT lain, MANAGER di PT lain", async () => {
    expect((await call(h.employee, detail())).status).toBe(403);
    expect((await call(h.employee, flash())).status).toBe(403);
    expect((await call(h.personnel, detail())).status).toBe(403);
    expect((await call(h.mgrNoEmp, detail())).status).toBe(403);
    expect((await call(h.hrA, detail({ companyId: ids.companyB }))).status).toBe(403);
    expect((await call(h.hrA, flash({ companyId: ids.companyB }))).status).toBe(403);
    expect((await call(h.mgr, flash({ companyId: ids.companyB }))).status).toBe(403);
  });

  test("crew asing / dihapus / tidak dikenal → 422 tanpa menyebut nama crew", async () => {
    for (const crewIds of [
      [ids.crewZ],
      [ids.crewY],
      [crypto.randomUUID()],
      [ids.crewX, ids.crewZ],
    ]) {
      const res = await call(h.hrA, detail({ crewIds }));
      expect(res.status).toBe(422);
      const body = JSON.stringify(await res.json());
      expect(body).not.toContain(`TMX ${RUN}`);
    }
  });
});

describe("DETAIL", () => {
  test("SA, PT A, semua crew + Tanpa crew: sheet per crew menurut tanggal, crew dihapus tetap tampil", async () => {
    const res = await call(h.sa, detail({ companyId: ids.companyA, includeNoCrew: true }));
    const wb = await workbook(res);
    expect(wb.fileName).toBe(`absensi-${FROM}_${TO}.xlsx`);
    // e1: 5 hari crew X + 3 hari crew Y (dihapus); e2: 8 hari X; e3 (keluar): 1 hari tanpa crew.
    expect(wb.rows).toBe(17);
    expect(wb.sheets.map((s) => s.name)).toEqual([
      "Ringkasan",
      `TMX ${RUN} X`,
      `TMX ${RUN} Y (dihapus)`,
      "Tanpa crew",
    ]);
    const [summary, x, y, none] = wb.sheets as [Sheet, Sheet, Sheet, Sheet];
    const crewX = table(x, "NIP");
    expect(crewX.header).toEqual([
      "NIP",
      "Nama",
      "Crew",
      "Tanggal",
      "Hari",
      "Shift",
      "Jadwal Masuk",
      "Jadwal Pulang",
      "Clock In",
      "Lokasi Clock In",
      "Peta In",
      "Clock Out",
      "Lokasi Clock Out",
      "Peta Out",
      "Status",
      "Label",
    ]);
    // Urut Nama lalu Tanggal: Adi (8 hari) lalu Budi (5 hari).
    expect(crewX.rows.map((r) => `${r.Nama?.split(" ").at(-1)}|${r.Tanggal}`)).toEqual([
      ...["01", "02", "03", "04", "05", "06", "07", "08"].map(
        (d) => `Adi|${serial(`1998-03-${d}`)}`,
      ),
      ...["01", "02", "03", "04", "05"].map((d) => `Budi|${serial(`1998-03-${d}`)}`),
    ]);
    const budi = (d: string) =>
      crewX.rows.find(
        (r) => r.Nama?.endsWith("Budi") && r.Tanggal === serial(`1998-03-${d}`),
      ) as Record<string, string>;
    expect(budi("01")).toMatchObject({
      NIP: `TMX-${RUN}-Budi`,
      Crew: `TMX ${RUN} X`,
      Hari: "Minggu",
      Shift: `X${RUN.slice(0, 5)}`,
      "Jadwal Masuk": "07:00",
      "Jadwal Pulang": "19:00",
      "Clock In": "07:05",
      "Lokasi Clock In": `Site TMX ${RUN} (dalam radius)`,
      "Peta In": "Buka di Google Maps",
      "Clock Out": "19:10",
      "Lokasi Clock Out": `350 m dari Site TMX ${RUN} (di luar radius)`,
      "Peta Out": "Buka di Google Maps",
      Status: "Disetujui",
    });
    expect(budi("02")).toMatchObject({
      Status: "Ditolak",
      Label: "Telat, Clock In ditolak",
      "Clock Out": "",
    });
    expect(budi("03")["Clock Out"]).toBe("01:30 (+1)");
    expect(budi("04")).toMatchObject({
      Status: "Tanpa absen",
      "Clock In": "",
      "Jadwal Masuk": "07:00",
    });
    const adi = (d: string) =>
      crewX.rows.find(
        (r) => r.Nama?.endsWith("Adi") && r.Tanggal === serial(`1998-03-${d}`),
      ) as Record<string, string>;
    expect(adi("04")).toMatchObject({ Status: "Alpha", Label: "Tidak absen" });
    expect(adi("05").Status).toBe("Cuti/izin/sakit");
    expect(adi("07")).toMatchObject({ Status: "OFF", Shift: "OFF", "Jadwal Masuk": "" });
    expect(adi("08")).toMatchObject({ Status: "Time off", Shift: "TO" });
    // Tautan peta: rumus HYPERLINK; koordinat hanya di dalam rumus, tidak sebagai teks sel.
    expect(x.xml).toContain(
      `HYPERLINK(&quot;https://www.google.com/maps?q=${Number(LAT)},${Number(LNG)}&quot;`,
    );
    const visible = wb.all.replace(/<f>.*?<\/f>/g, "");
    expect(visible).not.toContain(String(Number(LAT)));
    expect(visible).not.toContain(String(Number(LNG)));
    // Tidak ada selfie.
    expect(wb.all).not.toContain(SELFIE);
    expect(wb.all.toLowerCase()).not.toContain("selfie");

    const crewY = table(y, "NIP");
    expect(crewY.rows.map((r) => r.Crew)).toEqual(Array(3).fill(`TMX ${RUN} Y (dihapus)`));
    const noCrew = table(none, "NIP");
    expect(noCrew.rows).toHaveLength(1);
    expect(noCrew.rows[0]).toMatchObject({
      Nama: `Ekspor ${RUN} Keluar`,
      Crew: "Tanpa crew",
      Status: "Disetujui",
    });

    const recap = table(summary, "NIP");
    expect(recap.header).toEqual([
      "NIP",
      "Nama",
      "Crew",
      "Hari kerja",
      "Hadir (disetujui)",
      "Menunggu",
      "Ditolak",
      "Telat",
      "Pulang cepat",
      "Alpha",
      "Cuti/izin/sakit",
      "Tanpa absen",
    ]);
    const line = (name: string, crew: string) =>
      recap.rows.find((r) => r.Nama?.endsWith(name) && r.Crew === crew) as Record<string, string>;
    expect(line("Budi", `TMX ${RUN} X`)).toMatchObject({
      "Hari kerja": "5",
      "Hadir (disetujui)": "2",
      Ditolak: "1",
      Telat: "1",
      "Tanpa absen": "2",
    });
    expect(line("Budi", `TMX ${RUN} Y (dihapus)`)).toMatchObject({
      "Hari kerja": "1",
      "Tanpa absen": "1",
    });
    expect(line("Adi", `TMX ${RUN} X`)).toMatchObject({
      "Hari kerja": "6",
      Alpha: "1",
      "Cuti/izin/sakit": "1",
      "Tanpa absen": "4",
      "Hadir (disetujui)": "0",
    });
    // Data PT B tidak ikut.
    expect(wb.all).not.toContain(`Ekspor ${RUN} PTB`);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "attendance.export", after: { path: ["from"], equals: FROM } },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.after).toEqual({
      kind: "DETAIL",
      from: FROM,
      to: TO,
      companyId: ids.companyA,
      crewCount: 2,
      rows: 17,
    });
  });

  test("tanpa Tanpa crew; HR memilih crew X (± Tanpa crew bebas dari pilihan crew)", async () => {
    const all = await workbook(await call(h.sa, detail({ companyId: ids.companyA })));
    expect(all.rows).toBe(16);
    expect(all.sheets.map((s) => s.name)).not.toContain("Tanpa crew");
    const onlyX = await workbook(await call(h.hrA, detail({ crewIds: [ids.crewX] })));
    expect(onlyX.sheets.map((s) => s.name)).toEqual(["Ringkasan", `TMX ${RUN} X`]);
    expect(onlyX.rows).toBe(13);
    const xAndNone = await workbook(
      await call(h.hrA, detail({ crewIds: [ids.crewX], includeNoCrew: true })),
    );
    expect(xAndNone.sheets.map((s) => s.name)).toEqual(["Ringkasan", `TMX ${RUN} X`, "Tanpa crew"]);
    expect(xAndNone.rows).toBe(14);
  });

  test("MANAGER: hanya bawahan langsung (karyawan keluar tanpa atasan tidak ikut)", async () => {
    const wb = await workbook(await call(h.mgr, detail({ includeNoCrew: true })));
    expect(wb.rows).toBe(16);
    expect(wb.all).not.toContain(`Ekspor ${RUN} Keluar`);
    // Sheet "Tanpa crew" diminta → tetap ada, tetapi kosong (karyawan di luar tim tidak ikut).
    const none = wb.sheets.find((s) => s.name === "Tanpa crew") as Sheet;
    expect(table(none, "NIP").rows).toHaveLength(0);
  });
});

describe("DETAIL: karyawan pindah PT di tengah rentang (temuan review TM-D31)", () => {
  const P_FROM = "1998-04-01";
  const P_TO = "1998-04-08";
  const pindah = { from: P_FROM, to: P_TO, includeNoCrew: true };
  const shiftA = `X${RUN.slice(0, 5)}`;
  const shiftBCode = `Y${RUN.slice(0, 5)}`;

  test("HR PT B: tidak ada shift, crew, atau baris roster PT A; baris PT B & karyawan tanpa crew tetap", async () => {
    const wb = await workbook(await call(h.hrB, detail(pindah)));
    expect(wb.all).not.toContain(shiftA);
    expect(wb.all).not.toContain(`TMX ${RUN} X`);
    expect(wb.sheets.map((s) => s.name)).toEqual(["Ringkasan", `TMX ${RUN} Z`, "Tanpa crew"]);
    const z = table(wb.sheets[1] as Sheet, "NIP");
    expect(z.rows.map((r) => `${r.Tanggal}|${r.Shift}`)).toEqual([
      `${serial("1998-04-05")}|${shiftBCode}`,
      `${serial("1998-04-06")}|${shiftBCode}`,
      `${serial("1998-04-07")}|OFF`,
    ]);
    // OFF tanpa shift/crew pada tanggal crew PT A (3 April) milik karyawan pindah ikut dibuang;
    // karyawan PT B tanpa crew tetap tampil.
    const none = table(wb.sheets[2] as Sheet, "NIP");
    expect(none.rows.map((r) => `${r.Nama?.split(" ").at(-1)}|${r.Tanggal}|${r.Shift}`)).toEqual([
      `TanpaCrew|${serial("1998-04-03")}|OFF`,
    ]);
    expect(wb.rows).toBe(4);
  });

  test("HR PT B, FLASH: hanya hari absen PT B", async () => {
    const wb = await workbook(await call(h.hrB, flash({ from: P_FROM, to: P_TO })));
    const t = table(wb.sheets[0] as Sheet, "Nama");
    expect(t.rows.map((r) => `${r.Nama?.split(" ").at(-1)}|${r.Tanggal}`)).toEqual([
      `Pindah|${serial("1998-04-06")}`,
    ]);
  });

  test("SA tanpa companyId: jadwal & crew kedua PT tetap tampil", async () => {
    const wb = await workbook(await call(h.sa, detail(pindah)));
    expect(wb.all).toContain(shiftA);
    expect(wb.all).toContain(shiftBCode);
    expect(wb.sheets.map((s) => s.name)).toEqual(
      expect.arrayContaining([`TMX ${RUN} X`, `TMX ${RUN} Z`]),
    );
  });
});

describe("FLASH", () => {
  test("7 kolom (Jabatan & Divisi saat ini), hanya catatan hari absen, urut tanggal lalu nama, tanggal = sel tanggal Excel", async () => {
    const wb = await workbook(await call(h.sa, flash({ companyId: ids.companyA })));
    expect(wb.fileName).toBe(`absensi-flash-${FROM}_${TO}.xlsx`);
    expect(wb.sheets.map((s) => s.name)).toEqual(["Absensi"]);
    const t = table(wb.sheets[0] as Sheet, "Nama");
    expect(t.header).toEqual([
      "Nama",
      "Jabatan",
      "Divisi",
      "Tanggal",
      "Clock In",
      "Clock Out",
      "Status",
    ]);
    // Budi: jabatan di bawah unit berinduk DIVISION; Adi: unit tanpa divisi → "—".
    const placed = new Map(
      t.rows.map((r) => [r.Nama?.split(" ").at(-1), `${r.Jabatan}|${r.Divisi}`]),
    );
    expect(placed.get("Budi")).toBe(`Jabatan TMX ${RUN}|Divisi TMX ${RUN}`);
    expect(placed.get("Adi")).toBe(`Jabatan ND ${RUN}|—`);
    expect(
      t.rows.map(
        (r) =>
          `${r.Tanggal}|${r.Nama?.split(" ").at(-1)}|${r["Clock In"]}|${r["Clock Out"]}|${r.Status}`,
      ),
    ).toEqual([
      `${serial("1998-03-01")}|Budi|07:05|19:10|Disetujui`,
      `${serial("1998-03-01")}|Keluar|||Disetujui`,
      `${serial("1998-03-02")}|Budi|08:30||Ditolak`,
      `${serial("1998-03-03")}|Budi|06:55|01:30 (+1)|Disetujui`,
      `${serial("1998-03-04")}|Adi|||Alpha`,
      `${serial("1998-03-05")}|Adi|||Cuti/izin/sakit`,
    ]);
    expect(wb.rows).toBe(6);
    expect(wb.all).not.toContain("HYPERLINK");
    expect(wb.all).not.toContain(SELFIE);
  });

  test("cakupan: HR tanpa companyId = PT-nya; MANAGER = tim; SA tanpa companyId = semua PT", async () => {
    const hr = await workbook(await call(h.hrA, flash()));
    expect(hr.all).not.toContain(`Ekspor ${RUN} PTB`);
    expect(hr.all).toContain(`Ekspor ${RUN} Budi`);
    const mgr = await workbook(await call(h.mgr, flash()));
    // Budi 3 hari + Adi 2 hari; hari karyawan keluar (bukan bawahan) tidak ikut.
    expect(mgr.rows).toBe(5);
    expect(mgr.all).not.toContain(`Ekspor ${RUN} Keluar`);
    const sa = await workbook(await call(h.sa, flash()));
    expect(sa.all).toContain(`Ekspor ${RUN} PTB`);
  });
});

test("OpenAPI: rute ekspor terdokumentasi dengan skema AttendanceExportFile", async () => {
  const doc = (await (await app.request("/api/v1/openapi.json")).json()) as {
    paths: Record<string, { post?: { responses?: Record<string, unknown> } }>;
    components: { schemas: Record<string, unknown> };
  };
  const op = doc.paths["/api/v1/attendance/days/export"]?.post;
  expect(op).toBeDefined();
  expect(Object.keys(op?.responses ?? {})).toEqual(
    expect.arrayContaining(["200", "400", "401", "403", "422"]),
  );
  expect(doc.components.schemas.AttendanceExportFile).toBeDefined();
});
