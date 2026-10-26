import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D12 — Clock Out dibuka 30 menit sebelum jam pulang (lebih awal = pulang cepat + alasan),
// Mulai istirahat hanya di jendela istirahat shift, Clock In hari OFF hanya lewat "Lembur hari libur".
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
type ErrorBody = { error: { code: string; message: string; details?: unknown[] } };
const SITE = { latitude: -3.85, longitude: 115.3 };

const settings = await readTimeSettings();
const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const local = new Date(Date.now() + (OFFSET_H[settings.timezone] ?? 8) * 3600_000);
const m = local.getUTCHours() * 60 + local.getUTCMinutes();
const today = local.toISOString().slice(0, 10);
const at = (offsetMin: number) => (((m + offsetMin) % 1440) + 1440) % 1440;

const ids = { status: "", department: "", position: "", location: "", employees: [] as string[] };
let companyId = "";
const emp: Record<"early" | "near" | "future" | "off", string> = {
  early: "",
  near: "",
  future: "",
  off: "",
};
let h: Record<"sa" | keyof typeof emp, Record<string, string>>;

async function selfie(headers: Record<string, string>) {
  const upload = await data<{ path: string }>(
    await call("POST", "/attendance/selfie-upload", headers, { contentType: "image/jpeg" }),
  );
  fake.putObject("attendance-selfies", upload.path, { size: 150_000, contentType: "image/jpeg" });
  return upload.path;
}
const punch = async (headers: Record<string, string>, kind: string, extra = {}) =>
  call("POST", "/attendance/punch", headers, {
    kind,
    ...SITE,
    accuracyM: 10,
    selfiePath: await selfie(headers),
    ...extra,
  });
const checkIn = (headers: Record<string, string>) =>
  punch(headers, "IN", { reason: "Uji TM-D12", confirmed: true });

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `PW ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `PW ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `PW ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site PW ${RUN}`, city: "Tanah Laut", ...SITE, radiusM: 500 },
    })
  ).id;
  const mk = async (n: string) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `PW-${RUN}-${n}`,
          fullName: `Jendela ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          workLocationId: ids.location,
        },
      })
    ).id;
  for (const key of Object.keys(emp) as (keyof typeof emp)[]) emp[key] = await mk(key);
  ids.employees.push(...Object.values(emp));

  const mkShift = (code: string, start: number, end: number, bs: number, be: number) =>
    prisma.shift.create({
      data: {
        companyId,
        code: `${code}${RUN.slice(0, 4)}`,
        name: `Uji PW ${RUN}`,
        startMinute: at(start),
        endMinute: at(end),
        breakMin: 60,
        breakStartMinute: at(bs),
        breakEndMinute: at(be),
      },
    });
  // early: pulang 2 jam lagi, istirahat sedang dibuka. near: pulang 10 menit lagi, istirahat sudah lewat.
  // future: istirahat baru dibuka 1 jam lagi. off: roster OFF.
  const shifts = {
    early: await mkShift("E", -240, 120, -30, 30),
    near: await mkShift("N", -460, 10, -400, -340),
    future: await mkShift("F", -60, 420, 60, 120),
  };
  for (const offset of [-1, 0, 1]) {
    const workDate = new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000);
    for (const key of Object.keys(emp) as (keyof typeof emp)[]) {
      await prisma.rosterDay.create({
        data: {
          employeeId: emp[key],
          workDate,
          shiftId: key === "off" ? null : shifts[key].id,
          source: "PATTERN",
        },
      });
    }
  }

  const as = (employeeId: string) =>
    auth.loginAs("EMPLOYEE", { employeeId, companies: [companyId] }).then((a) => a.headers);
  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    early: await as(emp.early),
    near: await as(emp.near),
    future: await as(emp.future),
    off: await as(emp.off),
  };
});

afterAll(async () => {
  await deleteAttendanceData(ids.employees);
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.deleteMany({ where: { name: { startsWith: `Uji PW ${RUN}` } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("hari OFF (TM-D12)", () => {
  test("today.offDay; Clock In biasa ditolak, suruh istirahat", async () => {
    const today = await data<{ offDay: boolean; next: string }>(
      await call("GET", "/attendance/me/today", h.off),
    );
    expect(today).toMatchObject({ offDay: true, next: "IN" });
    const pre = await data<{ offDay: boolean }>(
      await call("POST", "/attendance/precheck", h.off, { kind: "IN", ...SITE, accuracyM: 10 }),
    );
    expect(pre.offDay).toBe(true);
    const res = await checkIn(h.off);
    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toContain("Silakan beristirahat");
    expect(body.error.details).toEqual([{ offDay: true }]);
  });

  test("Lembur hari libur: Clock In diterima dengan label di luar roster + alasan", async () => {
    const res = await punch(h.off, "IN", {
      offDayOvertime: true,
      reason: "Lembur bongkar muat",
      confirmed: true,
    });
    expect(res.status).toBe(200);
    expect((await data<{ labels: string[] }>(res)).labels).toContain("OUTSIDE_ROSTER");
    const after = await data<{ offDay: boolean; next: string }>(
      await call("GET", "/attendance/me/today", h.off),
    );
    expect(after).toMatchObject({ offDay: false, next: "OUT" });
  });

  test("hari kerja tidak dianggap OFF", async () => {
    const today = await data<{ offDay: boolean }>(
      await call("GET", "/attendance/me/today", h.future),
    );
    expect(today.offDay).toBe(false);
  });
});

describe("istirahat (TM-D12)", () => {
  test("di dalam jendela: Mulai & Selesai istirahat diterima; today memuat jendela", async () => {
    expect((await checkIn(h.early)).status).toBe(200);
    const today = await data<{ breakOpensAt: string | null; breakClosesAt: string | null }>(
      await call("GET", "/attendance/me/today", h.early),
    );
    expect(Date.parse(today.breakOpensAt as string)).toBeLessThan(Date.now());
    expect(Date.parse(today.breakClosesAt as string)).toBeGreaterThan(Date.now());
    expect((await punch(h.early, "BREAK_START")).status).toBe(200);
    expect((await punch(h.early, "BREAK_END")).status).toBe(200);
  });

  test("sebelum jendela: Mulai istirahat ditolak dengan jam buka", async () => {
    expect((await checkIn(h.future)).status).toBe(200);
    const res = await punch(h.future, "BREAK_START");
    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toContain("Mulai istirahat hanya bisa pukul");
    const pre = await data<{ breakOpensAt: string | null }>(
      await call("GET", "/attendance/me/today", h.future),
    );
    expect(Date.parse(pre.breakOpensAt as string)).toBeGreaterThan(Date.now());
  });

  test("sesudah jendela: Mulai istirahat ditolak", async () => {
    expect((await checkIn(h.near)).status).toBe(200);
    expect((await punch(h.near, "BREAK_START")).status).toBe(422);
  });
});

describe("Clock Out (TM-D12)", () => {
  test("dalam 30 menit sebelum jam pulang: tanpa label & tanpa alasan", async () => {
    const today = await data<{ checkOutOpensAt: string | null }>(
      await call("GET", "/attendance/me/today", h.near),
    );
    expect(Date.parse(today.checkOutOpensAt as string)).toBeLessThan(Date.now());
    const res = await punch(h.near, "OUT");
    expect(res.status).toBe(200);
    const day = await data<{ labels: string[] }>(res);
    expect(day.labels).not.toContain("EARLY_LEAVE");
  });

  test("sebelum dibuka: ditolak tanpa konfirmasi & alasan; pulang darurat diterima berlabel", async () => {
    const pre = await data<{ checkOutOpensAt: string | null; reasonRequired: boolean }>(
      await call("POST", "/attendance/precheck", h.early, { kind: "OUT", ...SITE, accuracyM: 10 }),
    );
    expect(Date.parse(pre.checkOutOpensAt as string)).toBeGreaterThan(Date.now());
    expect(pre.reasonRequired).toBe(true);
    expect((await punch(h.early, "OUT")).status).toBe(422);
    expect((await punch(h.early, "OUT", { confirmed: true })).status).toBe(422);
    const res = await punch(h.early, "OUT", { confirmed: true, reason: "Anak sakit" });
    expect(res.status).toBe(200);
    expect((await data<{ labels: string[] }>(res)).labels).toContain("EARLY_LEAVE");
  });
});

describe("master shift: jam istirahat (TM-D12)", () => {
  const base = () => ({
    companyId,
    code: `B${RUN.slice(0, 4)}`,
    name: `Uji PW ${RUN} master`,
    startMinute: 8 * 60,
    endMinute: 17 * 60,
    checkInOpenMin: 60,
    lateToleranceMin: 15,
    earlyLeaveToleranceMin: 15,
    checkOutCloseMin: 240,
    breakMin: 60,
  });

  test("jam istirahat di luar shift / hanya satu diisi → 422; valid tersimpan", async () => {
    const outside = await call("POST", "/shifts", h.sa, {
      ...base(),
      breakStartMinute: 18 * 60,
      breakEndMinute: 19 * 60,
    });
    expect(outside.status).toBe(422);
    const half = await call("POST", "/shifts", h.sa, { ...base(), breakStartMinute: 12 * 60 });
    expect(half.status).toBe(422);
    const ok = await call("POST", "/shifts", h.sa, {
      ...base(),
      breakStartMinute: 12 * 60,
      breakEndMinute: 13 * 60,
    });
    expect(ok.status).toBe(200);
    expect(await data(ok)).toMatchObject({ breakStartMinute: 720, breakEndMinute: 780 });
  });
});
