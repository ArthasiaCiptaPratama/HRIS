import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createSelfieUpload, punch } from "../../../src/modules/attendance/attendance.service.ts";
import { markNoAttendanceAlpha, readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { withEmployeeCompanyScope } from "../../../src/modules/employee/index.ts";
import { loadActor } from "../../../src/modules/iam/index.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D13: absen tepat 00:00 di DB nyata. X = 30 Apr (akhir bulan) supaya terlihat tanggal kerja tidak
// bergeser ke 1 Mei. Shift 2 = 16:00–24:00, shift 3 = 00:00–08:00 malam setelah tanggal roster.
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
const X = "2027-04-30";
const X1 = "2027-05-01";
const X2 = "2027-05-02";
const ids = {
  status: "",
  department: "",
  position: "",
  location: "",
  employees: [] as string[],
  shifts: [] as string[],
  accounts: [] as string[],
};
type Ctx = Awaited<ReturnType<typeof makeCtx>>;
const ctx: Record<"worker" | "absent", Ctx> = {} as never;
let offsetH = 7;
const at = (date: string, hhmm: string) =>
  new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - offsetH * 3600_000);
const dayOf = (employeeId: string, date: string) =>
  prisma.attendanceDay.findFirst({
    where: { employeeId, workDate: new Date(`${date}T00:00:00Z`) },
  });

async function makeCtx(authUserId: string) {
  const actor = await loadActor(authUserId);
  if (!actor) throw new Error("aktor tidak termuat");
  return { actor: await withEmployeeCompanyScope(actor), userAgent: "test" };
}

async function punchAt(who: Ctx, kind: "IN" | "OUT", when: Date) {
  const upload = await createSelfieUpload(who, "image/jpeg");
  fake.putObject(upload.bucket, upload.path, { size: 150_000, contentType: "image/jpeg" });
  return punch(
    who,
    { kind, ...SITE, accuracyM: 10, selfiePath: upload.path, confirmed: true },
    when,
  );
}

beforeAll(async () => {
  offsetH =
    { "Asia/Jakarta": 7, "Asia/Makassar": 8, "Asia/Jayapura": 9 }[
      (await readTimeSettings()).timezone
    ] ?? 7;
  const companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `MN ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `MN ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `MN ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site MN ${RUN}`, city: "Tanah Laut", ...SITE, radiusM: 500 },
    })
  ).id;
  const mkShift = (code: string, startMinute: number, endMinute: number, startsNextDay: boolean) =>
    prisma.shift.create({
      data: {
        companyId,
        code: `${code}${RUN.slice(0, 4)}`,
        name: `Uji MN ${RUN} ${code}`,
        startMinute,
        endMinute,
        startsNextDay,
      },
    });
  const s2 = await mkShift("S", 16 * 60, 0, false);
  const s3 = await mkShift("T", 0, 8 * 60, true);
  ids.shifts.push(s2.id, s3.id);
  const plan = { worker: [s2.id, s3.id], absent: [s3.id] } as const;
  for (const who of ["worker", "absent"] as const) {
    const employee = await prisma.employee.create({
      data: {
        employeeNumber: `MN-${RUN}-${who}`,
        fullName: `Midnight ${RUN} ${who}`,
        joinDate: new Date("2024-01-01T00:00:00Z"),
        companyId,
        employmentStatusId: ids.status,
        positionId: ids.position,
        workLocationId: ids.location,
      },
    });
    ids.employees.push(employee.id);
    // worker: roster X = shift 2, roster X+1 = shift 3. absent: roster X = shift 3, tidak absen.
    await prisma.rosterDay.createMany({
      data: plan[who].map((shiftId, i) => ({
        employeeId: employee.id,
        workDate: new Date(`${[X, X1][i]}T00:00:00Z`),
        shiftId,
        source: "MANUAL" as const,
      })),
    });
    const login = await auth.loginAs("EMPLOYEE", {
      employeeId: employee.id,
      companies: [companyId],
    });
    ids.accounts.push(login.account.id);
    ctx[who] = await makeCtx(login.account.authUserId);
  }
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { recipientAccountId: { in: ids.accounts } } });
  await deleteAttendanceData(ids.employees);
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.deleteMany({ where: { id: { in: ids.shifts } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("absen tepat 00:00 (TM-D13)", () => {
  test("shift 2 roster 30 Apr: Clock Out tepat 00:00 1 Mei → tetap hari 30 Apr, tanpa pulang cepat", async () => {
    const worker = ctx.worker;
    expect((await punchAt(worker, "IN", at(X, "15:55"))).workDate).toBe(X);
    const day = await punchAt(worker, "OUT", at(X1, "00:00"));
    expect(day.workDate).toBe(X);
    expect(day.scheduledEnd).toBe(at(X1, "00:00").toISOString());
    expect(day.labels).not.toContain("EARLY_LEAVE");
  });

  test("shift 3 roster 1 Mei: Clock In tepat 00:00 2 Mei → hari 1 Mei, tidak telat, jeda cukup", async () => {
    const day = await punchAt(ctx.worker, "IN", at(X2, "00:00"));
    expect(day.workDate).toBe(X1);
    expect(day.scheduledStart).toBe(at(X2, "00:00").toISOString());
    expect(day.labels).not.toContain("LATE");
    expect(day.labels).not.toContain("SHORT_REST");
    const out = await punchAt(ctx.worker, "OUT", at(X2, "08:00"));
    expect(out.workDate).toBe(X1);
  });

  test("dua hari absen tercatat di 30 Apr & 1 Mei; tidak ada hari 2 Mei", async () => {
    const [worker] = ids.employees as [string];
    expect(await dayOf(worker, X)).not.toBeNull();
    expect(await dayOf(worker, X1)).not.toBeNull();
    expect(await dayOf(worker, X2)).toBeNull();
  });

  test("shift 3 roster 30 Apr tanpa absen: belum Alpha sampai batas Clock Out 1 Mei 12:00", async () => {
    const [, absent] = ids.employees as [string, string];
    await markNoAttendanceAlpha(at(X1, "00:01"), [absent]);
    await markNoAttendanceAlpha(at(X1, "12:00"), [absent]);
    expect(await dayOf(absent, X)).toBeNull();
    await markNoAttendanceAlpha(at(X1, "12:01"), [absent]);
    const day = await dayOf(absent, X);
    expect(day).toMatchObject({ status: "ALPHA", alphaVerification: "PENDING" });
    // Alpha jatuh di tanggal roster (April), bukan 1 Mei.
    expect(await dayOf(absent, X1)).toBeNull();
  });

  test("pekerja yang absen tepat 00:00 tidak ikut di-Alpha-kan", async () => {
    const [worker] = ids.employees as [string];
    await markNoAttendanceAlpha(at(X2, "13:00"), [worker]);
    expect((await dayOf(worker, X))?.status).not.toBe("ALPHA");
    expect((await dayOf(worker, X1))?.status).not.toBe("ALPHA");
  });
});
