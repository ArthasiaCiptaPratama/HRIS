import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// MOB-D3/MOB-D7 — absen dari app Android: label lokasi palsu, kanal & versi, idempotensi punch.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const fake = createFakeStorage();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: fake.storage,
});
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data;
const BUCKET = "attendance-selfies";
const SITE = { latitude: -3.85, longitude: 115.3 };

// Waktu WITA (pengaturan bawaan Asia/Makassar) supaya shift uji selalu sedang berlangsung.
// Zona waktu jam shift mengikuti pengaturan Time Management yang sedang aktif (WIB/WITA/WIT).
const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const offsetH = OFFSET_H[(await readTimeSettings()).timezone] ?? 8;
const nowWita = new Date(Date.now() + offsetH * 3600_000);
const witaMinute = nowWita.getUTCHours() * 60 + nowWita.getUTCMinutes();
const todayWita = nowWita.toISOString().slice(0, 10);

const ids = { status: "", department: "", position: "", location: "", employees: [] as string[] };
let companyId = "";
const emp = { mgr: "", a: "", b: "" };
let h: Record<"hr" | "mgr" | "a" | "b" | "otherEmp", Record<string, string>>;

async function selfie(headers: Record<string, string>) {
  const upload = await data<{ path: string }>(
    await call("POST", "/attendance/selfie-upload", headers, { contentType: "image/jpeg" }),
  );
  fake.putObject(BUCKET, upload.path, { size: 150_000, contentType: "image/jpeg" });
  return upload.path;
}

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `AM ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `AM ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `AM ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site AM ${RUN}`, city: "Tanah Laut", ...SITE, radiusM: 500 },
    })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `AM-${RUN}-${n}`,
          fullName: `Absen ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
          workLocationId: ids.location,
        },
      })
    ).id;
  emp.mgr = await mk("MGR");
  emp.a = await mk("A", emp.mgr);
  emp.b = await mk("B", emp.mgr);
  ids.employees.push(emp.a, emp.b, emp.mgr);

  // Shift mulai 10 menit lagi (jendela absen masuk sudah buka) & berlangsung 8 jam.
  const shift = await prisma.shift.create({
    data: {
      companyId,
      code: `T${RUN.slice(0, 5)}`,
      name: `Uji ${RUN}`,
      startMinute: (witaMinute + 10) % 1440,
      endMinute: (witaMinute + 8 * 60) % 1440,
    },
  });
  const pattern = await prisma.rosterPattern.create({
    data: { companyId, name: `P ${RUN}`, steps: [shift.code] },
  });
  const crew = await prisma.crew.create({
    data: {
      companyId,
      workLocationId: ids.location,
      name: `C ${RUN}`,
      patternId: pattern.id,
      cycleStartDate: new Date(`${todayWita}T00:00:00Z`),
    },
  });
  await prisma.crewMember.create({
    data: { crewId: crew.id, employeeId: emp.a, startDate: new Date("2024-01-01T00:00:00Z") },
  });
  for (const offset of [-1, 0, 1]) {
    const d = new Date(Date.parse(`${todayWita}T00:00:00Z`) + offset * 86_400_000);
    await prisma.rosterDay.create({
      data: {
        employeeId: emp.a,
        workDate: d,
        shiftId: shift.id,
        crewId: crew.id,
        source: "PATTERN",
      },
    });
  }

  h = {
    hr: (await auth.loginAs("HR_ADMIN")).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
    b: (await auth.loginAs("EMPLOYEE", { employeeId: emp.b, companies: [companyId] })).headers,
    otherEmp: (await auth.loginAs("EMPLOYEE")).headers,
  };
});

afterAll(async () => {
  const days = await prisma.attendanceDay.findMany({
    where: { employeeId: { in: ids.employees } },
    select: { id: true },
  });
  await prisma.approvalRequest.deleteMany({ where: { subjectId: { in: days.map((d) => d.id) } } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crew.deleteMany({ where: { name: `C ${RUN}` } });
  await prisma.rosterPattern.deleteMany({ where: { name: `P ${RUN}` } });
  await prisma.shift.deleteMany({ where: { name: `Uji ${RUN}` } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

const APP = { "X-App-Version": "1.0.0+3" };

describe("absen dari app (MOB-D3, MOB-D7)", () => {
  test("precheck isMock → label MOCK_LOCATION tanpa wajib alasan", async () => {
    const pre = await data<{ labels: string[]; reasonRequired: boolean }>(
      await call(
        "POST",
        "/attendance/precheck",
        { ...h.a, ...APP },
        {
          kind: "IN",
          ...SITE,
          accuracyM: 10,
          isMock: true,
        },
      ),
    );
    expect(pre.labels).toContain("MOCK_LOCATION");
    expect(pre.reasonRequired).toBe(false);
  });

  test("punch app: tanpa alasan tetap diterima; kanal APP + versi + label tersimpan; retry kunci sama → hari yang sama", async () => {
    const key = `key-${RUN}-0001`;
    const body = {
      kind: "IN",
      ...SITE,
      accuracyM: 10,
      isMock: true,
      selfiePath: await selfie(h.a),
    };
    const headers = { ...h.a, ...APP, "Idempotency-Key": key };
    const first = await call("POST", "/attendance/punch", headers, body);
    expect(first.status).toBe(200);
    const day = await data<{ id: string; labels: string[] }>(first);
    expect(day.labels).toContain("MOCK_LOCATION");

    const punch = await prisma.attendancePunch.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });
    expect(punch.channel).toBe("APP");
    expect(punch.appVersion).toBe("1.0.0+3");
    expect(punch.labels).toContain("MOCK_LOCATION");
    expect(punch.status).toBe("PENDING");

    // Respons pertama hilang di jaringan → app mengulang dengan kunci sama: bukan 409.
    const retry = await call("POST", "/attendance/punch", headers, body);
    expect(retry.status).toBe(200);
    expect((await data<{ id: string }>(retry)).id).toBe(day.id);
    expect(await prisma.attendancePunch.count({ where: { dayId: day.id } })).toBe(1);

    // Tanpa kunci, absen masuk kedua tetap bentrok seperti biasa.
    const again = { ...body, selfiePath: await selfie(h.a) };
    expect((await call("POST", "/attendance/punch", { ...h.a, ...APP }, again)).status).toBe(409);
  });

  test("kunci milik karyawan lain → 409; format kunci salah → 400", async () => {
    const body = {
      kind: "IN",
      ...SITE,
      accuracyM: 10,
      reason: "uji",
      selfiePath: await selfie(h.b),
    };
    expect(
      (
        await call(
          "POST",
          "/attendance/punch",
          { ...h.b, "Idempotency-Key": `key-${RUN}-0001` },
          body,
        )
      ).status,
    ).toBe(409);
    expect(
      (await call("POST", "/attendance/punch", { ...h.b, "Idempotency-Key": "pendek" }, body))
        .status,
    ).toBe(400);
  });

  test("punch tanpa X-App-Version (PWA) → kanal PWA, tanpa versi", async () => {
    const body = {
      kind: "IN",
      ...SITE,
      accuracyM: 10,
      reason: "uji PWA",
      selfiePath: await selfie(h.b),
    };
    const res = await call("POST", "/attendance/punch", h.b, body);
    expect(res.status).toBe(200);
    const day = await data<{ id: string }>(res);
    const punch = await prisma.attendancePunch.findFirstOrThrow({ where: { dayId: day.id } });
    expect(punch.channel).toBe("PWA");
    expect(punch.appVersion).toBeNull();
    expect(punch.labels).not.toContain("MOCK_LOCATION");
  });
});
