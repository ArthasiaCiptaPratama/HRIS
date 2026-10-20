import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import {
  markNoAttendanceAlpha,
  readTimeSettings,
  runApprovalDigest,
  runAttendanceReminders,
} from "../../../src/modules/attendance/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// Paket UX 2026-10-20: notifikasi Time Management, pengingat absen (TM-D2), antrean & ringkasan harian.
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
const daysAgo = (n: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const ids = { status: "", department: "", position: "", employees: [] as string[] };
let companyId = "";
const shiftIds: string[] = [];
const emp = { mgr: "", a: "" };
let h: { mgr: Record<string, string>; a: Record<string, string>; hr: Record<string, string> };
const accounts = { mgr: "", a: "" };

const notesOf = (accountId: string, type?: string) =>
  prisma.notification.findMany({
    where: { recipientAccountId: accountId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
  });

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `TN ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `TN ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `TN ${RUN}`, departmentId: ids.department } })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `TN-${RUN}-${n}`,
          fullName: `Notif ${RUN} ${n}`,
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
  ids.employees.push(emp.a, emp.mgr);

  // Shift hari ini yang sudah mulai 2 jam lalu (lewat toleransi telat) & masih jauh dari batas pulang.
  const running = await prisma.shift.create({
    data: {
      companyId,
      code: `R${RUN.slice(0, 5)}`,
      name: `Notif jalan ${RUN}`,
      startMinute: (minuteNow - 120 + 1440) % 1440,
      endMinute: (minuteNow + 360) % 1440,
      lateToleranceMin: 15,
    },
  });
  // Shift biasa untuk hari Alpha.
  const plain = await prisma.shift.create({
    data: {
      companyId,
      code: `P${RUN.slice(0, 5)}`,
      name: `Notif biasa ${RUN}`,
      startMinute: 420,
      endMinute: 1020,
    },
  });
  shiftIds.push(running.id, plain.id);
  await prisma.rosterDay.createMany({
    data: [
      { employeeId: emp.a, workDate: D(today), shiftId: running.id, source: "MANUAL" },
      { employeeId: emp.a, workDate: D(daysAgo(2)), shiftId: plain.id, source: "MANUAL" },
    ],
  });

  const mgr = await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] });
  const a = await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] });
  h = { mgr: mgr.headers, a: a.headers, hr: (await auth.loginAs("HR_ADMIN")).headers };
  accounts.mgr = mgr.account.id;
  accounts.a = a.account.id;
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
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.deleteMany({ where: { id: { in: shiftIds } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("notifikasi Time Management", () => {
  test("pengingat belum Clock In (TM-D2) sekali saja per tanggal", async () => {
    await runAttendanceReminders(new Date(), [emp.a]);
    await runAttendanceReminders(new Date(), [emp.a]);
    const notes = await notesOf(accounts.a, "attendance.reminder_in");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toContain("Belum Clock In");
    expect(notes[0]?.link).toBe("/absen");
  });

  test("hari tanpa absen → Alpha + notifikasi dengan batas koreksi", async () => {
    await markNoAttendanceAlpha(new Date(), [emp.a]);
    const notes = await notesOf(accounts.a, "attendance.alpha");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toContain("paling lambat");
  });

  test("koreksi: atasan diberi tahu & antrean bertambah; keputusan diberitahukan ke karyawan", async () => {
    const res = await call("POST", "/attendance/corrections", h.a, {
      workDate: daysAgo(2),
      checkIn: "07:00",
      checkOut: "17:00",
      reason: "Lupa absen, HP tertinggal",
    });
    expect(res.status).toBe(200);
    const created = await data<{ approval: { id: string } }>(res);
    expect(await notesOf(accounts.mgr, "attendance.correction_new")).toHaveLength(1);

    const queue = await data<{ corrections: number; total: number }>(
      await call("GET", "/time/queue", h.mgr),
    );
    expect(queue.corrections).toBe(1);
    expect(queue.total).toBeGreaterThanOrEqual(1);
    expect((await data<{ total: number }>(await call("GET", "/time/queue", h.a))).total).toBe(0);

    // Ringkasan harian ke atasan: sekali per tanggal.
    await runApprovalDigest();
    await runApprovalDigest();
    const digest = await notesOf(accounts.mgr, "attendance.approval_digest");
    expect(digest).toHaveLength(1);
    expect(digest[0]?.title).toContain("menunggu keputusan");

    for (const who of [h.mgr, h.hr]) {
      await call("POST", `/approvals/${created.approval.id}/decision`, who, {
        decision: "APPROVED",
      });
    }
    const decided = await notesOf(accounts.a, "attendance.correction_decided");
    expect(decided).toHaveLength(1);
    expect(decided[0]?.title).toContain("disetujui");
  });
});
