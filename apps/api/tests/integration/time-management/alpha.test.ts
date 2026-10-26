import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { markNoAttendanceAlpha } from "../../../src/modules/attendance/index.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D3 — hari kerja roster tanpa absen → Alpha; koreksi s.d. tanggal kerja + 3 hari; rekam jejak permanen.
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

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const daysAgo = (n: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const EXPIRED = daysAgo(6); // lewat batas H+3
const CORRECTABLE = daysAgo(2); // masih dalam batas
const PRESENT = daysAgo(3); // ada absen → bukan Alpha
const OFF = daysAgo(4); // hari OFF roster → bukan Alpha
const BEFORE_RULE = "2026-09-30"; // sebelum ALPHA_RULE_START → aturan lama (tutup periode)

const ids = { status: "", department: "", position: "", employees: [] as string[] };
let companyId = "";
let shiftId = "";
const emp = { mgr: "", a: "", other: "" };
let h: Record<"hr" | "mgr" | "a" | "other", Record<string, string>>;

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `AL ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `AL ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `AL ${RUN}`, departmentId: ids.department } })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `AL-${RUN}-${n}`,
          fullName: `Alpha ${RUN} ${n}`,
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
  emp.other = await mk("O");
  ids.employees.push(emp.a, emp.mgr, emp.other);
  shiftId = (
    await prisma.shift.create({
      data: {
        companyId,
        code: `A${RUN.slice(0, 5)}`,
        name: `Alpha ${RUN}`,
        startMinute: 7 * 60,
        endMinute: 17 * 60,
      },
    })
  ).id;
  for (const date of [EXPIRED, CORRECTABLE, PRESENT, BEFORE_RULE]) {
    await prisma.rosterDay.create({
      data: { employeeId: emp.a, workDate: D(date), shiftId, source: "MANUAL" },
    });
  }
  await prisma.rosterDay.create({
    data: { employeeId: emp.a, workDate: D(OFF), shiftId: null, source: "MANUAL" },
  });
  await prisma.attendanceDay.create({
    data: {
      employeeId: emp.a,
      companyId,
      managerEmployeeId: emp.mgr,
      workDate: D(PRESENT),
      status: "PENDING",
      labels: [],
    },
  });
  h = {
    hr: (await auth.loginAs("HR_ADMIN")).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
    other: (await auth.loginAs("EMPLOYEE", { employeeId: emp.other, companies: [companyId] }))
      .headers,
  };
});

afterAll(async () => {
  const corrections = await prisma.attendanceCorrection.findMany({
    where: { employeeId: { in: ids.employees } },
    select: { id: true },
  });
  await prisma.approvalRequest.deleteMany({
    where: { subjectId: { in: corrections.map((c) => c.id) } },
  });
  await prisma.attendanceCorrection.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await deleteAttendanceData(ids.employees);
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.delete({ where: { id: shiftId } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

const statusOf = async (date: string) =>
  (
    await prisma.attendanceDay.findUnique({
      where: { employeeId_workDate: { employeeId: emp.a, workDate: D(date) } },
    })
  )?.status ?? null;

describe("TM-D3: hari tanpa absen → Alpha", () => {
  test("hanya hari kerja roster tanpa absen sejak 1 Okt 2026; idempoten", async () => {
    const first = await markNoAttendanceAlpha(new Date(), [emp.a]);
    expect(first.marked).toBe(2);
    expect(await statusOf(EXPIRED)).toBe("ALPHA");
    expect(await statusOf(CORRECTABLE)).toBe("ALPHA");
    expect(await statusOf(PRESENT)).toBe("PENDING");
    expect(await statusOf(OFF)).toBeNull();
    expect(await statusOf(BEFORE_RULE)).toBeNull();
    const day = await prisma.attendanceDay.findUnique({
      where: { employeeId_workDate: { employeeId: emp.a, workDate: D(CORRECTABLE) } },
    });
    expect(day?.labels).toEqual(["NO_ATTENDANCE"]);
    expect((await markNoAttendanceAlpha(new Date(), [emp.a])).marked).toBe(0);
  });

  test("Data Absen Harian tanpa Alpha tidak absen; rekap per karyawan tetap memuat Alpha (2026-10-21)", async () => {
    const range = `from=${EXPIRED}&to=${today}`;
    const all = (await (
      await call("GET", `/attendance/days?scope=all&${range}`, h.mgr)
    ).json()) as {
      data: { employee: { id: string }; workDate: string; status: string }[];
    };
    const mine = all.data.filter((d) => d.employee.id === emp.a);
    expect(mine.some((d) => d.workDate === PRESENT)).toBe(true);
    expect(mine.some((d) => d.status === "ALPHA")).toBe(false);
    const perEmployee = (await (
      await call("GET", `/attendance/days?scope=all&${range}&employeeId=${emp.a}`, h.mgr)
    ).json()) as { data: { status: string }[] };
    expect(perEmployee.data.some((d) => d.status === "ALPHA")).toBe(true);
  });

  test("koreksi: lewat H+3 ditolak; dalam batas boleh walau Alpha → disetujui, penanda tetap", async () => {
    const late = await call("POST", "/attendance/corrections", h.a, {
      workDate: EXPIRED,
      checkIn: "07:00",
      checkOut: "17:00",
      reason: "Lupa absen, HP mati",
    });
    expect(late.status).toBe(422);
    const res = await call("POST", "/attendance/corrections", h.a, {
      workDate: CORRECTABLE,
      checkIn: "07:00",
      checkOut: "17:00",
      reason: "Lupa absen, HP mati",
    });
    expect(res.status).toBe(200);
    const created = await data<{ approval: { id: string } }>(res);
    for (const who of [h.mgr, h.hr]) {
      expect(
        (
          await call("POST", `/approvals/${created.approval.id}/decision`, who, {
            decision: "APPROVED",
          })
        ).status,
      ).toBe(200);
    }
    const day = await prisma.attendanceDay.findUnique({
      where: { employeeId_workDate: { employeeId: emp.a, workDate: D(CORRECTABLE) } },
    });
    expect(day?.status).toBe("APPROVED");
    expect(day?.labels).toEqual(expect.arrayContaining(["NO_ATTENDANCE", "CORRECTED"]));
  });

  test("rekam jejak: karyawan sendiri & atasan melihat; karyawan lain tidak", async () => {
    type Record = {
      summary: { ALPHA_EXPIRED: number; CORRECTED: number };
      items: { workDate: string; outcome: string; deadline: string }[];
    };
    const mine = await data<Record>(await call("GET", "/attendance/record/me", h.a));
    expect(mine.summary).toMatchObject({ ALPHA_EXPIRED: 1, CORRECTED: 1 });
    expect(mine.items.find((i) => i.workDate === EXPIRED)?.outcome).toBe("ALPHA_EXPIRED");
    expect(mine.items.find((i) => i.workDate === CORRECTABLE)?.outcome).toBe("CORRECTED");
    const viaManager = await data<Record>(
      await call("GET", `/attendance/record/employees/${emp.a}`, h.mgr),
    );
    expect(viaManager.summary.ALPHA_EXPIRED).toBe(1);
    expect((await call("GET", `/attendance/record/employees/${emp.a}`, h.other)).status).toBe(404);
  });

  test("rekap bulanan: kolom dikoreksi & kedaluwarsa", async () => {
    const month = today.slice(0, 7);
    if (EXPIRED.slice(0, 7) !== month || CORRECTABLE.slice(0, 7) !== month) return; // awal bulan
    const recap = await data<{
      rows: { employee: { id: string }; corrected: number; expired: number }[];
    }>(await call("GET", `/attendance/recap?companyId=${companyId}&month=${month}`, h.hr));
    expect(recap.rows.find((r) => r.employee.id === emp.a)).toMatchObject({
      corrected: 1,
      expired: 1,
    });
  });
});
