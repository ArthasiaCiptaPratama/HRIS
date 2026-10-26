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

// Time Management Tahap F â€” koreksi, rekap, tutup periode â†’ ALPHA, surat pernyataan (D-071).
// Bulan 2001-01 dipakai supaya tidak ada data nyata yang ikut ditutup.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const MONTH = "2001-01";
// TM-D3: koreksi hanya s.d. tanggal kerja + 3 hari → alur koreksi diuji pada tanggal baru-baru ini.
const RECENT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
  new Date(Date.now() - 2 * 86_400_000),
);
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
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
// Zona waktu jam shift mengikuti pengaturan Time Management yang sedang aktif (WIB/WITA/WIT).
const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const offsetH = OFFSET_H[(await readTimeSettings()).timezone] ?? 8;
/** "HH:mm" lokal pada tanggal → ISO UTC. */
const localToIso = (date: string, hhmm: string) =>
  new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - offsetH * 3600_000).toISOString();

const ids = { status: "", department: "", position: "", employees: [] as string[] };
let companyId = "";
let shiftId = "";
const emp = { mgr: "", a: "", b: "" };
let h: Record<"sa" | "hr" | "hrGrant" | "mgr" | "a" | "b", Record<string, string>>;
let alphaDayId = "";

async function dayStatus(employeeId: string, date: string) {
  return (
    await prisma.attendanceDay.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: D(date) } },
    })
  )?.status;
}

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `PR ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `PR ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `PR ${RUN}`, departmentId: ids.department } })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `PR-${RUN}-${n}`,
          fullName: `Periode ${RUN} ${n}`,
          joinDate: new Date("2000-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
        },
      })
    ).id;
  emp.mgr = await mk("MGR");
  emp.a = await mk("A", emp.mgr);
  emp.b = await mk("B", emp.mgr);
  ids.employees.push(emp.a, emp.b, emp.mgr);
  shiftId = (
    await prisma.shift.create({
      data: {
        companyId,
        code: `P${RUN.slice(0, 5)}`,
        name: `Periode ${RUN}`,
        startMinute: 420,
        endMinute: 1140,
      },
    })
  ).id;
  for (const [date, work] of [
    ["2001-01-10", true],
    ["2001-01-11", true],
    ["2001-01-12", false],
    ["2001-01-15", true],
  ] as const) {
    await prisma.rosterDay.create({
      data: {
        employeeId: emp.a,
        workDate: D(date),
        shiftId: work ? shiftId : null,
        source: "MANUAL",
      },
    });
  }
  const base = { employeeId: emp.a, companyId, managerEmployeeId: emp.mgr, labels: [] };
  await prisma.attendanceDay.create({
    data: { ...base, workDate: D("2001-01-11"), status: "REJECTED" },
  });
  await prisma.attendanceDay.create({
    data: { ...base, workDate: D("2001-01-15"), status: "LEAVE" },
  });

  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    hrGrant: (
      await auth.loginAs("HR_ADMIN", {
        companies: [companyId],
        grants: [{ permission: "PAYROLL_PERIOD_PREPARE" }],
      })
    ).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
    b: (await auth.loginAs("EMPLOYEE", { employeeId: emp.b, companies: [companyId] })).headers,
  };
});

afterAll(async () => {
  const corrections = await prisma.attendanceCorrection.findMany({
    where: { employeeId: { in: ids.employees } },
    select: { id: true },
  });
  const days = await prisma.attendanceDay.findMany({
    where: { employeeId: { in: ids.employees } },
    select: { id: true },
  });
  await prisma.approvalRequest.deleteMany({
    where: { subjectId: { in: [...corrections, ...days].map((r) => r.id) } },
  });
  await prisma.attendanceCorrection.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.attendanceStatement.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await deleteAttendanceData(ids.employees);
  await prisma.attendancePeriod.deleteMany({ where: { companyId, month: MONTH } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.delete({ where: { id: shiftId } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("koreksi absensi", () => {
  test("koreksi lewat batas tanggal kerja + 3 hari ditolak (TM-D3)", async () => {
    const res = await call("POST", "/attendance/corrections", h.a, {
      workDate: "2001-01-10",
      checkIn: "07:00",
      reason: "Lupa absen, HP tertinggal",
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain(
      "Batas koreksi",
    );
  });

  test("lupa absen â†’ koreksi; Atasan + HR setuju â†’ hari disetujui berlabel CORRECTED", async () => {
    const res = await call("POST", "/attendance/corrections", h.a, {
      workDate: RECENT,
      checkIn: "07:00",
      checkOut: "19:00",
      reason: "Lupa absen, HP tertinggal",
    });
    expect(res.status).toBe(200);
    const created = await data<{
      id: string;
      approval: { id: string };
      checkInAt: string;
      checkOutAt: string;
    }>(res);
    expect(created.checkInAt).toBe(localToIso(RECENT, "07:00"));
    expect(created.checkOutAt).toBe(localToIso(RECENT, "19:00"));
    expect(
      (
        await call("POST", "/attendance/corrections", h.a, {
          workDate: RECENT,
          checkIn: "07:00",
          reason: "Dobel",
        })
      ).status,
    ).toBe(409);
    const inbox = await data<{ id: string }[]>(
      await call("GET", "/attendance/corrections?scope=inbox", h.mgr),
    );
    expect(inbox.some((c) => c.id === created.id)).toBe(true);
    for (const who of [h.mgr, h.hr]) {
      const r = await call("POST", `/approvals/${created.approval.id}/decision`, who, {
        decision: "APPROVED",
      });
      expect(r.status).toBe(200);
    }
    const day = await prisma.attendanceDay.findUnique({
      where: { employeeId_workDate: { employeeId: emp.a, workDate: D(RECENT) } },
    });
    expect(day).toMatchObject({ status: "APPROVED", labels: ["CORRECTED"] });
  });
});

describe("rekap & tutup periode", () => {
  test("rekap bulanan: hadir, ditolak, cuti", async () => {
    const recap = await data<{
      period: { status: string };
      rows: {
        employee: { id: string };
        present: number;
        rejected: number;
        leave: number;
        workDays: number;
      }[];
    }>(await call("GET", `/attendance/recap?companyId=${companyId}&month=${MONTH}`, h.hr));
    expect(recap.period.status).toBe("OPEN");
    expect(recap.rows.find((r) => r.employee.id === emp.a)).toMatchObject({
      workDays: 3,
      present: 0,
      rejected: 1,
      leave: 1,
    });
    expect(
      (await call("GET", `/attendance/recap?companyId=${companyId}&month=${MONTH}`, h.a)).status,
    ).toBe(403);
  });

  test("tutup: HR tanpa grant 403; HR ber-grant â†’ hari ditolak menjadi ALPHA; tutup ulang 409", async () => {
    const body = { companyId, month: MONTH };
    expect((await call("POST", "/attendance/periods/preview", h.hr, body)).status).toBe(403);
    const preview = await data<{ sample: { employee: { id: string }; date: string }[] }>(
      await call("POST", "/attendance/periods/preview", h.hrGrant, body),
    );
    // 2001-01-10 tanpa absen (koreksi lewat batas TM-D3) ikut menjadi ALPHA saat tutup periode.
    expect(preview.sample.filter((s) => s.employee.id === emp.a).map((s) => s.date)).toEqual([
      "2001-01-10",
      "2001-01-11",
    ]);
    expect((await call("POST", "/attendance/periods/close", h.hrGrant, body)).status).toBe(200);
    expect(await dayStatus(emp.a, "2001-01-11")).toBe("ALPHA");
    expect(await dayStatus(emp.a, "2001-01-10")).toBe("ALPHA");
    expect(await dayStatus(emp.a, "2001-01-15")).toBe("LEAVE");
    expect((await call("POST", "/attendance/periods/close", h.sa, body)).status).toBe(409);
    expect(
      (
        await call("POST", "/attendance/periods/preview", h.sa, {
          companyId,
          month: new Date().toISOString().slice(0, 7),
        })
      ).status,
    ).toBe(422);
  });

  test("periode tertutup mengunci roster & koreksi", async () => {
    const cell = await call("PUT", "/roster/cells", h.sa, {
      companyId,
      cells: [{ employeeId: emp.a, date: "2001-01-12", code: `P${RUN.slice(0, 5)}` }],
    });
    expect(cell.status).toBe(422);
    const correction = await call("POST", "/attendance/corrections", h.a, {
      workDate: "2001-01-11",
      checkIn: "07:00",
      reason: "Terlambat koreksi",
    });
    expect(correction.status).toBe(422);
  });
});

describe("surat pernyataan absensi", () => {
  test("karyawan membuat pernyataan untuk hari ALPHA sendiri; sekali saja; HR & atasan melihat", async () => {
    const mine = await data<{ dayId: string; workDate: string; statement: unknown }[]>(
      await call("GET", "/attendance/statements/me", h.a),
    );
    const alpha = mine.find((m) => m.workDate === "2001-01-11");
    expect(alpha?.statement).toBeNull();
    alphaDayId = alpha?.dayId as string;
    const body = { dayId: alphaDayId, reason: "Anak sakit mendadak, tidak sempat memberi kabar." };
    expect((await call("POST", "/attendance/statements", h.b, body)).status).toBe(404);
    expect(
      (await call("POST", "/attendance/statements", h.a, { ...body, reason: "pendek" })).status,
    ).toBe(400);
    expect((await call("POST", "/attendance/statements", h.a, body)).status).toBe(200);
    expect((await call("POST", "/attendance/statements", h.a, body)).status).toBe(409);
    for (const who of [h.hr, h.mgr]) {
      const list = await data<{ dayId: string; statement: { reason: string } | null }[]>(
        await call("GET", `/attendance/statements?companyId=${companyId}&month=${MONTH}`, who),
      );
      expect(list.find((r) => r.dayId === alphaDayId)?.statement?.reason).toContain("Anak sakit");
    }
  });
});
