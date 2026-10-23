import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { markNoAttendanceAlpha, readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";

// TM-D13 Fase B (poin 16): Alpha per shift → atasan diberi tahu & memverifikasi; tutup periode menunggu.
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

const ids = { company: "", status: "", department: "", position: "", shift: "", mgr: "", emp: "" };
const accounts = { mgr: "", emp: "" };
let h: Record<"mgr" | "emp" | "sa", Record<string, string>>;
let alphaDate = "";
let alphaDayId = "";

beforeAll(async () => {
  const settings = await readTimeSettings();
  const offsetH =
    { "Asia/Jakarta": 7, "Asia/Makassar": 8, "Asia/Jayapura": 9 }[settings.timezone] ?? 7;
  const today = new Date(Date.now() + offsetH * 3600_000).toISOString().slice(0, 10);
  alphaDate = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  ids.company = (
    await prisma.company.create({
      data: { code: `AV${RUN.slice(0, 4)}`, name: `PT Uji AV ${RUN}` },
    })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `AV ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `AV ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `AV ${RUN}`, departmentId: ids.department } })
  ).id;
  const mk = async (n: string, managerId: string | null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `AV-${RUN}-${n}`,
          fullName: `Alpha ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId: ids.company,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
        },
      })
    ).id;
  ids.mgr = await mk("MGR", null);
  ids.emp = await mk("EMP", ids.mgr);
  ids.shift = (
    await prisma.shift.create({
      data: {
        companyId: ids.company,
        code: `A${RUN.slice(0, 4)}`,
        name: `Uji AV ${RUN}`,
        startMinute: 480,
        endMinute: 960,
      },
    })
  ).id;
  await prisma.rosterDay.create({
    data: {
      employeeId: ids.emp,
      workDate: new Date(`${alphaDate}T00:00:00Z`),
      shiftId: ids.shift,
      source: "MANUAL",
    },
  });
  const mgr = await auth.loginAs("MANAGER", { employeeId: ids.mgr, companies: [ids.company] });
  const emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.emp, companies: [ids.company] });
  accounts.mgr = mgr.account.id;
  accounts.emp = emp.account.id;
  h = { mgr: mgr.headers, emp: emp.headers, sa: (await auth.loginAs("SUPER_ADMIN")).headers };
});

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { recipientAccountId: { in: Object.values(accounts) } },
  });
  await prisma.attendancePeriod.deleteMany({ where: { companyId: ids.company } });
  await prisma.attendanceDay.deleteMany({ where: { companyId: ids.company } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: [ids.emp, ids.mgr] } } });
  await prisma.shift.deleteMany({ where: { id: ids.shift } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: [ids.emp, ids.mgr] } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.company.delete({ where: { id: ids.company } });
  await disconnectPrisma();
});

describe("verifikasi Alpha oleh atasan (TM-D13 Fase B)", () => {
  test("shift lewat tanpa absen → Alpha menunggu verifikasi; atasan diberi tahu", async () => {
    await markNoAttendanceAlpha(new Date(), [ids.emp]);
    const day = await prisma.attendanceDay.findFirstOrThrow({ where: { employeeId: ids.emp } });
    expect(day).toMatchObject({ status: "ALPHA", alphaVerification: "PENDING" });
    alphaDayId = day.id;
    const notice = await prisma.notification.findFirst({
      where: { recipientAccountId: accounts.mgr, type: "attendance.alpha_verify" },
    });
    expect(notice?.title).toContain("perlu verifikasi");
  });

  test("antrean atasan berisi hari itu; karyawan tidak bisa membuka / memverifikasi diri sendiri", async () => {
    const inbox = await data<{ dayId: string; canVerify: boolean; verification: string }[]>(
      await call("GET", "/attendance/alpha-verifications", h.mgr),
    );
    expect(inbox).toEqual([
      expect.objectContaining({ dayId: alphaDayId, canVerify: true, verification: "PENDING" }),
    ]);
    expect((await call("GET", "/attendance/alpha-verifications", h.emp)).status).toBe(403);
    expect(
      (
        await call("POST", `/attendance/alpha-verifications/${alphaDayId}`, h.emp, {
          outcome: "SICK",
          note: "Sakit",
        })
      ).status,
    ).toBe(403);
  });

  test("tutup periode ditolak selama masih ada Alpha belum diverifikasi", async () => {
    // Alpha bulan lalu (sudah berakhir) yang belum diverifikasi.
    await prisma.attendanceDay.create({
      data: {
        employeeId: ids.emp,
        companyId: ids.company,
        managerEmployeeId: ids.mgr,
        workDate: new Date("2026-09-15T00:00:00Z"),
        status: "ALPHA",
        labels: ["NO_ATTENDANCE"],
        alphaVerification: "PENDING",
      },
    });
    const input = { companyId: ids.company, month: "2026-09" };
    const preview = await data<{ unverifiedAlpha: number }>(
      await call("POST", "/attendance/periods/preview", h.sa, input),
    );
    expect(preview.unverifiedAlpha).toBe(1);
    const closed = await call("POST", "/attendance/periods/close", h.sa, input);
    expect(closed.status).toBe(422);
    expect(((await closed.json()) as { error: { message: string } }).error.message).toContain(
      "belum diverifikasi",
    );
  });

  test("atasan memilih Sakit (catatan wajib) → tersimpan, karyawan diberi tahu cara mengajukan", async () => {
    const short = await call("POST", `/attendance/alpha-verifications/${alphaDayId}`, h.mgr, {
      outcome: "SICK",
      note: "x",
    });
    expect(short.status).toBe(400);
    const res = await call("POST", `/attendance/alpha-verifications/${alphaDayId}`, h.mgr, {
      outcome: "SICK",
      note: "Demam, sudah izin lewat telepon",
    });
    expect(res.status).toBe(200);
    expect(await data(res)).toMatchObject({ verification: "SICK" });
    const notice = await prisma.notification.findFirst({
      where: { recipientAccountId: accounts.emp, type: "attendance.alpha_verified" },
    });
    expect(notice?.title).toContain("Sakit");
    expect(notice?.body).toContain("Ajukan Sakit");
    const inbox = await data<{ dayId: string }[]>(
      await call("GET", "/attendance/alpha-verifications", h.mgr),
    );
    expect(inbox.map((i) => i.dayId)).not.toContain(alphaDayId);
  });
});
