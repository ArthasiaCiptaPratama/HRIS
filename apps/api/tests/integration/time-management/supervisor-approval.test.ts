import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// ORG-D9: atasan = pemegang pos tepat di atasnya, apa pun role akunnya.
// - Atasan ber-akun EMPLOYEE memutuskan langkah "Atasan" untuk bawahan langsungnya saja + melihat antreannya.
// - Atasan tanpa akun aktif → snapshot saat pengajuan = tanpa atasan (SA memutus, HR PT mengambil alih).
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
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ids = { status: "", department: "", position: "", employees: [] as string[] };
const emp = { boss: "", sub: "", stranger: "", noAcc: "", noAccSub: "" };
let companyId = "";
let shiftId = "";
let permitTypeId = "";
let h: Record<"sa" | "hr" | "boss" | "sub" | "stranger" | "noAccSub", Record<string, string>>;

type LeaveDto = {
  id: string;
  status: string;
  approval: { id: string; canDecide: boolean; canOverride: boolean } | null;
};

async function requestPermit(headers: Record<string, string>, date: string) {
  const res = await call("POST", "/leave-requests", headers, {
    leaveTypeId: permitTypeId,
    startDate: date,
    endDate: date,
    reason: "Urusan keluarga",
  });
  expect(res.status).toBe(200);
  return data<LeaveDto>(res);
}

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `SV ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `SV ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `SV ${RUN}`, departmentId: ids.department } })
  ).id;
  const mk = async (n: string, managerId: string | null = null) => {
    const id = (
      await prisma.employee.create({
        data: {
          employeeNumber: `SV-${RUN}-${n}`,
          fullName: `Atasan ${RUN} ${n}`,
          joinDate: D("2020-01-01"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
        },
      })
    ).id;
    ids.employees.push(id);
    return id;
  };
  emp.boss = await mk("BOSS");
  emp.sub = await mk("SUB", emp.boss);
  emp.stranger = await mk("STR");
  emp.noAcc = await mk("NOACC");
  emp.noAccSub = await mk("NOACCSUB", emp.noAcc);

  shiftId = (
    await prisma.shift.create({
      data: {
        companyId,
        code: `S${RUN.slice(0, 5)}`,
        name: `Atasan ${RUN}`,
        startMinute: 420,
        endMinute: 1140,
      },
    })
  ).id;
  for (const employeeId of [emp.sub, emp.stranger, emp.noAccSub]) {
    for (const date of ["2097-06-02", "2097-06-03"]) {
      await prisma.rosterDay.create({
        data: { employeeId, workDate: D(date), shiftId, source: "MANUAL" },
      });
    }
  }

  const loginEmployee = async (employeeId: string) =>
    (await auth.loginAs("EMPLOYEE", { employeeId, companies: [companyId] })).headers;
  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    boss: await loginEmployee(emp.boss),
    sub: await loginEmployee(emp.sub),
    stranger: await loginEmployee(emp.stranger),
    noAccSub: await loginEmployee(emp.noAccSub),
  };
  const created = await call("POST", "/leave-types", h.sa, {
    code: `SV_${RUN}`,
    name: `Izin atasan ${RUN}`,
    category: "PERMIT",
    maxDaysPerRequest: 1,
    documentRequiredAfterDays: null,
    isActive: true,
  });
  expect(created.status).toBe(200);
  permitTypeId = (await data<{ id: string }>(created)).id;
});

afterAll(async () => {
  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: { in: ids.employees } },
    select: { id: true },
  });
  await prisma.approvalRequest.deleteMany({
    where: { subjectId: { in: requests.map((r) => r.id) } },
  });
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.leaveLedger.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.leaveType.deleteMany({ where: { code: `SV_${RUN}` } });
  await deleteAttendanceData(ids.employees);
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.delete({ where: { id: shiftId } });
  await auth.cleanup();
  await prisma.employee.updateMany({
    where: { id: { in: ids.employees } },
    data: { managerId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("atasan ber-akun EMPLOYEE (ORG-D9)", () => {
  test("/me.isSupervisor = punya bawahan langsung aktif", async () => {
    const boss = await data<{ role: string; isSupervisor: boolean }>(
      await call("GET", "/me", h.boss),
    );
    expect(boss).toMatchObject({ role: "EMPLOYEE", isSupervisor: true });
    const sub = await data<{ isSupervisor: boolean }>(await call("GET", "/me", h.sub));
    expect(sub.isSupervisor).toBe(false);
  });

  test("memutuskan langkah Atasan untuk bawahan langsung; antrean berisi bawahan saja", async () => {
    const own = await requestPermit(h.sub, "2097-06-02");
    const foreign = await requestPermit(h.stranger, "2097-06-02");

    const inbox = await data<LeaveDto[]>(await call("GET", "/leave-requests?scope=inbox", h.boss));
    expect(inbox.map((r) => r.id)).toEqual([own.id]);
    const detail = await data<LeaveDto>(await call("GET", `/leave-requests/${own.id}`, h.boss));
    expect(detail.approval).toMatchObject({ canDecide: true, canOverride: false });

    const decided = await call("POST", `/approvals/${own.approval?.id}/decision`, h.boss, {
      decision: "APPROVED",
    });
    expect(decided.status).toBe(200);
    expect((await data<{ status: string }>(decided)).status).toBe("PENDING");
    const row = await prisma.approvalStep.findFirstOrThrow({
      where: { requestId: own.approval?.id, kind: "MANAGER" },
    });
    expect(row).toMatchObject({ decision: "APPROVED", isOverride: false });

    // Bukan bawahannya: tidak terlihat & tidak bisa diputus (tidak membocorkan keberadaan).
    expect((await call("GET", `/leave-requests/${foreign.id}`, h.boss)).status).toBe(404);
    const denied = await call("POST", `/approvals/${foreign.approval?.id}/decision`, h.boss, {
      decision: "APPROVED",
    });
    expect(denied.status).toBe(404);
    // Bawahan tanpa bawahan tidak punya antrean.
    expect(await data<LeaveDto[]>(await call("GET", "/leave-requests?scope=inbox", h.sub))).toEqual(
      [],
    );
  });

  test("antrean absen & Alpha terbuka; daftar tim khusus MANAGER tetap tertutup", async () => {
    expect(
      (await call("GET", "/attendance/days?scope=inbox&from=2097-06-01&to=2097-06-30", h.boss))
        .status,
    ).toBe(200);
    expect((await call("GET", "/attendance/alpha-verifications", h.boss)).status).toBe(200);
    expect(
      (await call("GET", "/attendance/days?scope=all&from=2097-06-01&to=2097-06-30", h.boss))
        .status,
    ).toBe(403);
    expect((await call("GET", "/leave-requests?scope=all", h.boss)).status).toBe(403);
    expect((await call("GET", "/employees", h.boss)).status).toBe(403);
    // Karyawan tanpa bawahan tetap tidak punya antrean Alpha.
    expect((await call("GET", "/attendance/alpha-verifications", h.sub)).status).toBe(403);
  });

  test("SPL: pemilih bawahan langsung; SPL untuk bukan bawahan ditolak", async () => {
    const subs = await data<{ id: string }[]>(
      await call("GET", "/overtime-orders/subordinates", h.boss),
    );
    expect(subs.map((s) => s.id)).toEqual([emp.sub]);
    expect(
      await data<unknown[]>(await call("GET", "/overtime-orders/subordinates", h.sub)),
    ).toEqual([]);
    const body = (employeeId: string) => ({
      employeeId,
      workDate: "2097-06-03",
      startTime: null,
      endTime: "20:00",
      reason: "Target produksi",
    });
    expect((await call("PUT", "/overtime-orders", h.boss, body(emp.stranger))).status).toBe(403);
    expect((await call("PUT", "/overtime-orders", h.boss, body(emp.sub))).status).toBe(200);
  });
});

describe("atasan tanpa akun aktif (ORG-D9)", () => {
  test("snapshot pengajuan tanpa atasan → satu langkah HR regular, SA override", async () => {
    const req = await requestPermit(h.noAccSub, "2097-06-02");
    const stored = await prisma.approvalRequest.findFirstOrThrow({
      where: { subjectId: req.id },
    });
    expect(stored.managerEmployeeId).toBeNull();
    const asSa = await data<LeaveDto>(await call("GET", `/leave-requests/${req.id}`, h.sa));
    expect(asSa.approval).toMatchObject({ canDecide: false, canOverride: true });
    const asHr = await data<LeaveDto>(await call("GET", `/leave-requests/${req.id}`, h.hr));
    // EMP-D8 P1: HR PT memutus satu langkah regular; langkah atasan tidak dibuat.
    expect(asHr.approval).toMatchObject({ canDecide: true });
    const steps = await prisma.approvalStep.findMany({ where: { requestId: stored.id } });
    expect(steps.map((s) => s.kind)).toEqual(["HR"]);
  });

  test("atasan yang punya akun aktif tetap disimpan sebagai pemutus", async () => {
    const req = await requestPermit(h.sub, "2097-06-03");
    const stored = await prisma.approvalRequest.findFirstOrThrow({
      where: { subjectId: req.id },
    });
    expect(stored.managerEmployeeId).toBe(emp.boss);
  });
});
