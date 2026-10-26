import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import {
  createSelfieUpload,
  getToday,
  precheck,
  punch,
} from "../../../src/modules/attendance/attendance.service.ts";
import { readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { withEmployeeCompanyScope } from "../../../src/modules/employee/index.ts";
import { loadActor } from "../../../src/modules/iam/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D13: absen per shift. Kasus pemilik projek: shift 3 roster tgl X (malam setelah X, 00:00–08:00 tgl X+1)
// lalu shift 2 roster tgl X+1 (16:00–24:00) → dua hari absen terpisah, tgl X tidak hilang / Alpha.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const fake = createFakeStorage();
createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: fake.storage,
});

const SITE = { latitude: -3.85, longitude: 115.3 };
// Tanggal jauh di depan supaya tidak bersinggungan dengan data/cron lain.
const X = "2027-03-10";
const X1 = "2027-03-11";
const ids = {
  status: "",
  department: "",
  position: "",
  location: "",
  employee: "",
  shifts: [] as string[],
};
let ctx: Awaited<ReturnType<typeof makeCtx>>;
let offsetH = 7;
const at = (date: string, hhmm: string) =>
  new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - offsetH * 3600_000);

async function makeCtx(authUserId: string) {
  const actor = await loadActor(authUserId);
  if (!actor) throw new Error("aktor tidak termuat");
  return { actor: await withEmployeeCompanyScope(actor), userAgent: "test" };
}

async function punchAt(kind: "IN" | "OUT", when: Date, extra: Record<string, unknown> = {}) {
  const upload = await createSelfieUpload(ctx, "image/jpeg");
  fake.putObject(upload.bucket, upload.path, { size: 150_000, contentType: "image/jpeg" });
  return punch(
    ctx,
    { kind, ...SITE, accuracyM: 10, selfiePath: upload.path, confirmed: true, ...extra },
    when,
  );
}

beforeAll(async () => {
  offsetH =
    { "Asia/Jakarta": 7, "Asia/Makassar": 8, "Asia/Jayapura": 9 }[
      (await readTimeSettings()).timezone
    ] ?? 7;
  const companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `SI ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `SI ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `SI ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site SI ${RUN}`, city: "Tanah Laut", ...SITE, radiusM: 500 },
    })
  ).id;
  ids.employee = (
    await prisma.employee.create({
      data: {
        employeeNumber: `SI-${RUN}`,
        fullName: `Shift ${RUN}`,
        joinDate: new Date("2024-01-01T00:00:00Z"),
        companyId,
        employmentStatusId: ids.status,
        positionId: ids.position,
        workLocationId: ids.location,
      },
    })
  ).id;
  const mk = (code: string, startMinute: number, endMinute: number, startsNextDay: boolean) =>
    prisma.shift.create({
      data: {
        companyId,
        code: `${code}${RUN.slice(0, 4)}`,
        name: `Uji SI ${RUN} ${code}`,
        startMinute,
        endMinute,
        startsNextDay,
      },
    });
  const s3 = await mk("T", 0, 8 * 60, true);
  const s2 = await mk("S", 16 * 60, 0, false);
  ids.shifts.push(s3.id, s2.id);
  await prisma.rosterDay.createMany({
    data: [
      {
        employeeId: ids.employee,
        workDate: new Date(`${X}T00:00:00Z`),
        shiftId: s3.id,
        source: "MANUAL",
      },
      {
        employeeId: ids.employee,
        workDate: new Date(`${X1}T00:00:00Z`),
        shiftId: s2.id,
        source: "MANUAL",
      },
    ],
  });
  const login = await auth.loginAs("EMPLOYEE", {
    employeeId: ids.employee,
    companies: [companyId],
  });
  ctx = await makeCtx(login.account.authUserId);
});

afterAll(async () => {
  const days = await prisma.attendanceDay.findMany({
    where: { employeeId: ids.employee },
    select: { id: true, punches: { select: { id: true } } },
  });
  const subjects = days.flatMap((d) => [d.id, ...d.punches.map((p) => p.id)]);
  await prisma.approvalRequest.deleteMany({ where: { subjectId: { in: subjects } } });
  await prisma.overtimeRequest.deleteMany({ where: { employeeId: ids.employee } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: ids.employee } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: ids.employee } });
  await prisma.shift.deleteMany({ where: { id: { in: ids.shifts } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: ids.employee } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("absen per shift (TM-D13)", () => {
  test("tap-in 23:50 tgl X → tanggal kerja X (shift 3 roster X), jadwal 00:00–08:00 tgl X+1", async () => {
    const day = await punchAt("IN", at(X, "23:50"));
    expect(day.workDate).toBe(X);
    expect(day.scheduledStart).toBe(at(X1, "00:00").toISOString());
    expect(day.scheduledEnd).toBe(at(X1, "08:00").toISOString());
  });

  test("tap-out 08:05 tgl X+1 → hari X (terkunci ke shift yang di-tap-in)", async () => {
    const day = await punchAt("OUT", at(X1, "08:05"));
    expect(day.workDate).toBe(X);
    expect(day.punches.map((p) => p.kind)).toEqual(["IN", "OUT"]);
  });

  test("tap-in 15:45 tgl X+1 (tanggal kalender sama) → shift 2 roster X+1; jeda < 8 jam ditandai & alasan wajib", async () => {
    const pre = await precheck(ctx, { kind: "IN", ...SITE, accuracyM: 10 }, at(X1, "15:45"));
    expect(pre.workDate).toBe(X1);
    expect(pre.labels).toContain("SHORT_REST");
    expect(pre.reasonRequired).toBe(true);
    await expect(punchAt("IN", at(X1, "15:45"))).rejects.toThrow(/Alasan wajib/);
    const day = await punchAt("IN", at(X1, "15:45"), { reason: "Ganti shift rekan yang sakit" });
    expect(day.workDate).toBe(X1);
    expect(day.labels).toContain("SHORT_REST");
  });

  test("dua hari absen terpisah; tanggal X tidak menjadi Alpha", async () => {
    const days = await prisma.attendanceDay.findMany({
      where: { employeeId: ids.employee },
      orderBy: { workDate: "asc" },
    });
    expect(days.map((d) => d.workDate.toISOString().slice(0, 10))).toEqual([X, X1]);
    expect(days.find((d) => d.workDate.toISOString().startsWith(X))?.status).not.toBe("ALPHA");
  });

  test("beranda saat shift 2 berjalan: Clock Out; batas Clock Out dari jadwal saat tap-in", async () => {
    // Master shift diubah setelah tap-in: jadwal hari terbuka tidak ikut berubah.
    await prisma.shift.update({
      where: { id: ids.shifts[1] as string },
      data: { endMinute: 22 * 60 },
    });
    const today = await getToday(ctx, at(X1, "18:00"));
    expect(today.next).toBe("OUT");
    expect(today.openDay?.workDate).toBe(X1);
    expect(today.checkOutOpensAt).toBe(at(X1, "23:30").toISOString());
  });
});
