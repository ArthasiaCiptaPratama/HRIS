import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { overtimeOrderViewSchema } from "../../../src/modules/attendance/overtime.contract.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D17: perintah lembur (SPL) — Atasan / HR PT / SA, sebelum dijalani; batas absen pulang ikut mundur.
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

const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const offsetH = OFFSET_H[(await readTimeSettings()).timezone] ?? 8;
const local = new Date(Date.now() + offsetH * 3600_000);
const today = local.toISOString().slice(0, 10);
const minuteNow = local.getUTCHours() * 60 + local.getUTCMinutes();
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
  .toISOString()
  .slice(0, 10);

const ids = { status: "", department: "", position: "", company2: "", employees: [] as string[] };
let companyId = "";
let shiftId = "";
const emp = { mgr: "", a: "", other: "" };
let h: Record<"sa" | "hr" | "hr2" | "mgr" | "a" | "otherMgr", Record<string, string>>;
let accountA = "";

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `SPL ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `SPL ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `SPL ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.company2 = (
    await prisma.company.create({ data: { code: `S${RUN.slice(0, 5)}`, name: `PT SPL ${RUN}` } })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `SPL-${RUN}-${n}`,
          fullName: `SPL ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
        },
      })
    ).id;
  emp.mgr = await mk("MGR");
  emp.other = await mk("OTHER");
  emp.a = await mk("A", emp.mgr);
  ids.employees.push(emp.a, emp.mgr, emp.other);

  // Shift hari ini: mulai 2 jam lagi, 6 jam (jam pulang masih jauh).
  shiftId = (
    await prisma.shift.create({
      data: {
        companyId,
        code: `Q${RUN.slice(0, 5)}`,
        name: `SPL ${RUN}`,
        startMinute: (minuteNow + 120) % 1440,
        endMinute: (minuteNow + 480) % 1440,
        checkOutCloseMin: 30,
      },
    })
  ).id;
  await prisma.rosterDay.create({
    data: { employeeId: emp.a, workDate: D(today), shiftId, source: "MANUAL" },
  });

  const a = await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] });
  accountA = a.account.id;
  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    hr2: (await auth.loginAs("HR_ADMIN", { companies: [ids.company2] })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: a.headers,
    otherMgr: (await auth.loginAs("MANAGER", { employeeId: emp.other, companies: [companyId] }))
      .headers,
  };
});

afterAll(async () => {
  await deleteAttendanceData(ids.employees);
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.delete({ where: { id: shiftId } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.company.delete({ where: { id: ids.company2 } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

const order = (over: Record<string, unknown> = {}) => ({
  employeeId: emp.a,
  workDate: today,
  startTime: null,
  endTime: hhmm(minuteNow + 600),
  reason: "Bongkar muat kapal",
  ...over,
});

describe("perintah lembur (TM-D17)", () => {
  test("tanpa token 401; karyawan sendiri, atasan lain, & HR PT lain 403; body salah 400", async () => {
    expect((await app.request("/api/v1/overtime-orders", { method: "PUT" })).status).toBe(401);
    expect((await call("PUT", "/overtime-orders", h.a, order())).status).toBe(403);
    expect((await call("PUT", "/overtime-orders", h.otherMgr, order())).status).toBe(403);
    expect((await call("PUT", "/overtime-orders", h.hr2, order())).status).toBe(403);
    expect(
      (await call("PUT", "/overtime-orders", h.mgr, order({ startTime: null, endTime: null })))
        .status,
    ).toBe(400);
  });

  test("422: tanggal lampau; selesai lebih lambat sebelum jam pulang; mulai lebih awal sesudah jam masuk", async () => {
    expect(
      (await call("PUT", "/overtime-orders", h.mgr, order({ workDate: yesterday }))).status,
    ).toBe(422);
    expect(
      (await call("PUT", "/overtime-orders", h.mgr, order({ endTime: hhmm(minuteNow + 300) })))
        .status,
    ).toBe(422);
    expect(
      (
        await call(
          "PUT",
          "/overtime-orders",
          h.mgr,
          order({ startTime: hhmm(minuteNow + 180), endTime: null }),
        )
      ).status,
    ).toBe(422);
  });

  test("atasan membuat SPL → 200 sesuai kontrak, karyawan diberi tahu; ubah = baris yang sama", async () => {
    const res = await call("PUT", "/overtime-orders", h.mgr, order());
    expect(res.status).toBe(200);
    const view = overtimeOrderViewSchema.parse(await data(res));
    expect(view.canManage).toBe(true);
    expect(Date.parse(view.endsAt as string)).toBeGreaterThan(Date.now() + 9 * 3600_000);
    const notes = await prisma.notification.findMany({
      where: { recipientAccountId: accountA, type: "attendance.overtime_order" },
    });
    expect(notes).toHaveLength(1);

    const again = await data<{ id: string; startsAt: string | null }>(
      await call(
        "PUT",
        "/overtime-orders",
        h.hr,
        order({ startTime: hhmm(minuteNow + 60), endTime: hhmm(minuteNow + 540) }),
      ),
    );
    expect(again.id).toBe(view.id);
    expect(again.startsAt).not.toBeNull();
  });

  test("daftar: karyawan melihat miliknya (tanpa kelola), atasan lain tidak melihat", async () => {
    const mine = await data<{ id: string; canManage: boolean }[]>(
      await call("GET", `/overtime-orders?from=${today}&to=${today}`, h.a),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]?.canManage).toBe(false);
    const other = await data<unknown[]>(
      await call(
        "GET",
        `/overtime-orders?from=${today}&to=${today}&employeeId=${emp.a}`,
        h.otherMgr,
      ),
    );
    expect(other).toHaveLength(0);
  });

  test("today memuat SPL; SPL membuka Clock In lebih awal & batas absen pulang hari terbuka ikut SPL", async () => {
    const today_ = await data<{ overtimeOrder: { endsAt: string | null } | null }>(
      await call("GET", "/attendance/me/today", h.a),
    );
    expect(today_.overtimeOrder?.endsAt).not.toBeNull();
    // Hari terbuka (dibuat langsung): batas mengikuti akhir SPL + 30 menit.
    const day = await prisma.attendanceDay.create({
      data: {
        employeeId: emp.a,
        companyId,
        workDate: D(today),
        shiftId,
        scheduledStart: new Date(Date.now() + 120 * 60_000),
        scheduledEnd: new Date(Date.now() + 480 * 60_000),
        checkOutDeadline: new Date(Date.now() + 510 * 60_000),
        status: "OPEN",
        labels: [],
      },
    });
    const res = await call(
      "PUT",
      "/overtime-orders",
      h.mgr,
      order({ endTime: hhmm(minuteNow + 600) }),
    );
    expect(res.status).toBe(200);
    const endsAt = Date.parse((await data<{ endsAt: string }>(res)).endsAt);
    const after = await prisma.attendanceDay.findUnique({ where: { id: day.id } });
    expect(after?.checkOutDeadline?.getTime()).toBe(endsAt + 30 * 60_000);
  });

  test("batal: atasan lain 403; atasan 200 → batas absen pulang kembali ke jadwal", async () => {
    const row = await prisma.overtimeOrder.findFirstOrThrow({ where: { employeeId: emp.a } });
    expect((await call("POST", `/overtime-orders/${row.id}/cancel`, h.otherMgr)).status).toBe(403);
    expect((await call("POST", `/overtime-orders/${row.id}/cancel`, h.mgr)).status).toBe(200);
    expect(await prisma.overtimeOrder.findUnique({ where: { id: row.id } })).toBeNull();
    const day = await prisma.attendanceDay.findFirstOrThrow({ where: { employeeId: emp.a } });
    expect(day.checkOutDeadline?.getTime()).toBe(
      (day.scheduledEnd as Date).getTime() + 30 * 60_000,
    );
    expect((await call("POST", `/overtime-orders/${row.id}/cancel`, h.mgr)).status).toBe(404);
  });
});
