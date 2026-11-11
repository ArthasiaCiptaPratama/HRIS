import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { closeOverdueDays, readTimeSettings } from "../../../src/modules/attendance/index.ts";
import { deleteAttendanceData, patchAttendanceSettings } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D26: wajib absen datang & pulang (absen pulang bebas s.d. 24:00 → lewat itu Alpha; pulang di luar
// kantor: 2×/bulan langsung disetujui + peringatan, selebihnya approval). TM-D27: pengajuan lembur karyawan.
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
const FAR = { latitude: -3.7, longitude: 115.3 }; // ± 16 km dari site

const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const offsetH = OFFSET_H[(await readTimeSettings()).timezone] ?? 8;
const nowLocal = new Date(Date.now() + offsetH * 3600_000);
const localMinute = nowLocal.getUTCHours() * 60 + nowLocal.getUTCMinutes();
const today = nowLocal.toISOString().slice(0, 10);
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** 24:00 lokal tanggal tempat instan jatuh. */
const endOfLocalDay = (at: Date) => {
  const local = new Date(at.getTime() + offsetH * 3600_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${addDays(local, 1)}T00:00:00Z`) - offsetH * 3600_000);
};

const ids = { status: "", department: "", position: "", location: "", employees: [] as string[] };
let companyId = "";
const emp = { mgr: "", a: "", out: "", ot: "" };
let h: Record<"sa" | "hr" | "mgr" | "a" | "out" | "ot", Record<string, string>>;
let restoreSettings: () => Promise<void>;

async function selfie(headers: Record<string, string>) {
  const upload = await data<{ path: string }>(
    await call("POST", "/attendance/selfie-upload", headers, { contentType: "image/jpeg" }),
  );
  fake.putObject(BUCKET, upload.path, { size: 150_000, contentType: "image/jpeg" });
  return upload.path;
}

/** Hari absen terbuka (sudah Clock In) langsung di DB, untuk menguji Clock Out. */
async function openDay(employeeId: string, workDate: string) {
  return prisma.attendanceDay.create({
    data: {
      employeeId,
      companyId,
      managerEmployeeId: emp.mgr,
      workDate: dateOf(workDate),
      status: "OPEN",
      labels: [],
      checkOutDeadline: new Date(Date.now() + 86_400_000),
      punches: {
        create: {
          kind: "IN",
          at: new Date(Date.now() - 8 * 3600_000),
          ...SITE,
          accuracyM: 10,
          insideGeofence: true,
          labels: [],
        },
      },
    },
  });
}

beforeAll(async () => {
  restoreSettings = await patchAttendanceSettings({
    requireCheckOut: true,
    freeOutsideCheckOutsPerMonth: 2,
  });
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `RC ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `RC ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `RC ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site RC ${RUN}`, city: "Tanah Laut", ...SITE, radiusM: 500 },
    })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `RC-${RUN}-${n}`,
          fullName: `Wajib Pulang ${RUN} ${n}`,
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
  emp.out = await mk("OUT", emp.mgr);
  emp.ot = await mk("OT", emp.mgr);
  ids.employees.push(emp.a, emp.out, emp.ot, emp.mgr);

  // Shift mulai 10 menit lagi & berlangsung 8 jam (jendela absen masuk sudah buka).
  const shift = await prisma.shift.create({
    data: {
      companyId,
      code: `R${RUN.slice(0, 5)}`,
      name: `Uji RC ${RUN}`,
      startMinute: (localMinute + 10) % 1440,
      endMinute: (localMinute + 8 * 60) % 1440,
    },
  });
  for (const offset of [-1, 0, 1]) {
    await prisma.rosterDay.create({
      data: {
        employeeId: emp.a,
        workDate: dateOf(addDays(today, offset)),
        shiftId: shift.id,
        source: "PATTERN",
      },
    });
  }

  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
    out: (await auth.loginAs("EMPLOYEE", { employeeId: emp.out, companies: [companyId] })).headers,
    ot: (await auth.loginAs("EMPLOYEE", { employeeId: emp.ot, companies: [companyId] })).headers,
  };
});

afterAll(async () => {
  await restoreSettings();
  await prisma.attendanceCorrection.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await deleteAttendanceData(ids.employees);
  await prisma.notification.deleteMany({ where: { dedupeKey: { contains: RUN } } }).catch(() => {});
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.deleteMany({ where: { name: `Uji RC ${RUN}` } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("pengaturan TM-D26", () => {
  test("GET memuat wajib absen pulang & jatah; PUT tanpa kunci baru memakai bawaan", async () => {
    const settings = await data<{ requireCheckOut: boolean; freeOutsideCheckOutsPerMonth: number }>(
      await call("GET", "/time-settings", h.sa),
    );
    expect(settings).toMatchObject({ requireCheckOut: true, freeOutsideCheckOutsPerMonth: 2 });
    const bad = await call("PUT", "/time-settings", h.sa, {
      ...settings,
      freeOutsideCheckOutsPerMonth: -1,
    });
    expect(bad.status).toBe(400);
  });
});

describe("wajib absen datang & pulang (TM-D26)", () => {
  let dayId = "";

  test("Clock In: batas absen pulang = 24:00 tanggal jam pulang; layar memuat peringatan", async () => {
    const pre = await data<{
      requireCheckOut: boolean;
      checkOutDeadline: string;
      scheduledEnd: string;
    }>(await call("POST", "/attendance/precheck", h.a, { kind: "IN", ...SITE, accuracyM: 15 }));
    expect(pre.requireCheckOut).toBe(true);
    const expected = endOfLocalDay(new Date(pre.scheduledEnd)).toISOString();
    expect(pre.checkOutDeadline).toBe(expected);
    const day = await data<{ id: string }>(
      await call("POST", "/attendance/punch", h.a, {
        kind: "IN",
        ...SITE,
        accuracyM: 15,
        selfiePath: await selfie(h.a),
      }),
    );
    dayId = day.id;
    const row = await prisma.attendanceDay.findUniqueOrThrow({ where: { id: dayId } });
    expect(row.checkOutDeadline?.toISOString()).toBe(expected);
    const todayView = await data<{ requireCheckOut: boolean; checkOutDeadline: string | null }>(
      await call("GET", "/attendance/me/today", h.a),
    );
    expect(todayView).toMatchObject({ requireCheckOut: true, checkOutDeadline: expected });
  });

  test("lewat 24:00 tanpa absen pulang → Alpha (tidak absen pulang); approval absen masuk dibatalkan", async () => {
    const row = await prisma.attendanceDay.findUniqueOrThrow({
      where: { id: dayId },
      include: { punches: true },
    });
    // Sebelum batas: tetap terbuka.
    await closeOverdueDays(new Date((row.checkOutDeadline as Date).getTime() - 60_000), [emp.a]);
    expect((await prisma.attendanceDay.findUniqueOrThrow({ where: { id: dayId } })).status).toBe(
      "OPEN",
    );
    const after = new Date((row.checkOutDeadline as Date).getTime() + 60_000);
    expect((await closeOverdueDays(after, [emp.a])).closed).toBe(1);
    const alpha = await prisma.attendanceDay.findUniqueOrThrow({ where: { id: dayId } });
    expect(alpha.status).toBe("ALPHA");
    expect(alpha.labels).toEqual(expect.arrayContaining(["NO_CHECKOUT", "NO_CHECKOUT_ALPHA"]));
    const inPunch = row.punches.find((p) => p.kind === "IN");
    const request = await prisma.approvalRequest.findFirst({
      where: { subjectType: "ATTENDANCE_PUNCH", subjectId: inPunch?.id },
    });
    expect(request?.status).toBe("CANCELLED");
    const notices = await prisma.notification.findMany({
      where: {
        dedupeKey: { in: [`tm-alpha:${emp.a}:${today}`, `tm-alpha-team:${emp.a}:${today}`] },
      },
    });
    expect(notices.length).toBe(2);
  });

  test("Alpha tidak absen pulang bisa dikoreksi (H+3) & diisi manual HR; Alpha tutup periode tidak", async () => {
    const yesterday = addDays(today, -1);
    await prisma.attendanceDay.create({
      data: {
        employeeId: emp.out,
        companyId,
        managerEmployeeId: emp.mgr,
        workDate: dateOf(yesterday),
        status: "ALPHA",
        labels: ["NO_CHECKOUT", "NO_CHECKOUT_ALPHA"],
      },
    });
    const res = await call("POST", "/attendance/corrections", h.out, {
      workDate: yesterday,
      checkOut: "17:05",
      reason: "Lupa Clock Out, sudah pulang 17.05",
    });
    expect(res.status).toBe(200);
    // Alpha hasil tutup periode (tanpa penanda) tidak bisa dikoreksi.
    const twoDaysAgo = addDays(today, -2);
    await prisma.attendanceDay.create({
      data: {
        employeeId: emp.out,
        companyId,
        managerEmployeeId: emp.mgr,
        workDate: dateOf(twoDaysAgo),
        status: "ALPHA",
        labels: ["NO_CHECKOUT"],
      },
    });
    const closed = await call("POST", "/attendance/corrections", h.out, {
      workDate: twoDaysAgo,
      checkOut: "17:05",
      reason: "Lupa Clock Out",
    });
    expect(closed.status).toBe(422);
    // HR mengisi manual jam pulang hari Alpha karyawan A (hari ini) → hari kembali diproses.
    const manualIn = await prisma.attendanceDay.findUniqueOrThrow({ where: { id: dayId } });
    expect(manualIn.status).toBe("ALPHA");
    const manual = await call("POST", "/attendance/manual", h.hr, {
      employeeId: emp.a,
      workDate: today,
      kind: "OUT",
      time: "23:30",
      reason: "Bukti absen pulang di pos jaga",
    });
    expect(manual.status).toBe(200);
    const reopened = await prisma.attendanceDay.findUniqueOrThrow({ where: { id: dayId } });
    expect(reopened.status).not.toBe("ALPHA");
    expect(reopened.labels).toContain("NO_CHECKOUT_ALPHA");
  });
});

describe("absen pulang di luar lokasi kantor (TM-D26)", () => {
  const month = today.slice(0, 7);
  const dates = [`${month}-01`, `${month}-02`, `${month}-03`];

  test("ke-1 & ke-2 bulan ini langsung disetujui + peringatan; ke-3 wajib approval; alasan tetap wajib", async () => {
    const results: { nth: number; free: boolean; outStatus: string; hasApproval: boolean }[] = [];
    for (const date of dates) {
      const day = await openDay(emp.out, date);
      const pre = await data<{
        labels: string[];
        reasonRequired: boolean;
        outsideCheckOut: { nth: number; freeQuota: number; free: boolean } | null;
      }>(await call("POST", "/attendance/precheck", h.out, { kind: "OUT", ...FAR, accuracyM: 15 }));
      expect(pre.labels).toContain("OUTSIDE_RADIUS");
      expect(pre.reasonRequired).toBe(true);
      const body = { kind: "OUT", ...FAR, accuracyM: 15, selfiePath: await selfie(h.out) };
      expect((await call("POST", "/attendance/punch", h.out, body)).status).toBe(422);
      const res = await call("POST", "/attendance/punch", h.out, {
        ...body,
        confirmed: true,
        reason: "Pulang dari lokasi klien",
      });
      expect(res.status).toBe(200);
      const out = await prisma.attendancePunch.findFirstOrThrow({
        where: { dayId: day.id, kind: "OUT" },
      });
      const approval = await prisma.approvalRequest.findFirst({
        where: { subjectType: "ATTENDANCE_PUNCH", subjectId: out.id },
      });
      results.push({
        nth: pre.outsideCheckOut?.nth ?? 0,
        free: pre.outsideCheckOut?.free ?? false,
        outStatus: out.status,
        hasApproval: approval !== null,
      });
      const notice = await prisma.notification.findFirst({
        where: { dedupeKey: `tm-outside-out:${day.id}` },
      });
      expect(notice?.body?.toLowerCase()).toContain("jangan diulangi");
    }
    expect(results).toEqual([
      { nth: 1, free: true, outStatus: "APPROVED", hasApproval: false },
      { nth: 2, free: true, outStatus: "APPROVED", hasApproval: false },
      { nth: 3, free: false, outStatus: "PENDING", hasApproval: true },
    ]);
  });
});

describe("pengajuan lembur karyawan (TM-D27)", () => {
  const workDate = addDays(today, -1);
  let claimId = "";

  test("karyawan mengajukan untuk hari yang sudah absen; tanpa absen 422; ganda 409", async () => {
    // Hari OFF (tanpa roster) ber-absen kemarin: Clock In & Clock Out.
    const day = await openDay(emp.ot, workDate);
    await prisma.attendancePunch.create({
      data: {
        dayId: day.id,
        kind: "OUT",
        at: new Date(Date.now() - 3600_000),
        ...SITE,
        accuracyM: 10,
        insideGeofence: true,
        labels: [],
      },
    });
    await prisma.attendanceDay.update({ where: { id: day.id }, data: { status: "PENDING" } });
    const input = {
      workDate,
      startTime: "18:00",
      endTime: "21:00",
      reason: "Menyelesaikan laporan audit",
    };
    const none = await call("POST", "/overtime-claims", h.ot, {
      ...input,
      workDate: addDays(today, -5),
    });
    expect(none.status).toBe(422);
    const res = await call("POST", "/overtime-claims", h.ot, input);
    expect(res.status).toBe(200);
    const claim = await data<{
      id: string;
      status: string;
      checkOutAt: string | null;
      canCancel: boolean;
    }>(res);
    expect(claim).toMatchObject({ status: "PENDING", canCancel: true });
    expect(claim.checkOutAt).not.toBeNull();
    claimId = claim.id;
    expect((await call("POST", "/overtime-claims", h.ot, input)).status).toBe(409);
    const mine = await data<{ id: string }[]>(
      await call("GET", `/overtime-claims?scope=me&from=${workDate}&to=${today}`, h.ot),
    );
    expect(mine.map((c) => c.id)).toContain(claimId);
  });

  test("hanya HR PT / SA yang memutus; tolak wajib alasan; setuju → SPL susulan dengan jam yang diakui", async () => {
    const decide = (headers: Record<string, string>, body: unknown) =>
      call("POST", `/overtime-claims/${claimId}/decision`, headers, body);
    expect(
      (await decide(h.ot, { decision: "APPROVED", startTime: "18:00", endTime: "20:00" })).status,
    ).toBe(403);
    expect(
      (await decide(h.mgr, { decision: "APPROVED", startTime: "18:00", endTime: "20:00" })).status,
    ).toBe(403);
    expect((await decide(h.hr, { decision: "REJECTED" })).status).toBe(400);
    const inbox = await data<{ id: string; canDecide: boolean }[]>(
      await call(
        "GET",
        `/overtime-claims?scope=all&from=${workDate}&to=${today}&companyId=${companyId}`,
        h.hr,
      ),
    );
    expect(inbox.find((c) => c.id === claimId)?.canDecide).toBe(true);
    const res = await decide(h.hr, {
      decision: "APPROVED",
      startTime: "18:00",
      endTime: "20:00",
      note: "Diakui s.d. 20.00 sesuai laporan",
    });
    expect(res.status).toBe(200);
    expect(await data<{ status: string; approvedEndTime: string }>(res)).toMatchObject({
      status: "APPROVED",
      approvedEndTime: "20:00",
    });
    const order = await prisma.overtimeOrder.findFirstOrThrow({
      where: { employeeId: emp.ot, workDate: dateOf(workDate) },
    });
    expect(order.retroactive).toBe(true);
    expect((await decide(h.hr, { decision: "REJECTED", note: "x" })).status).toBe(409);
  });

  test("karyawan membatalkan pengajuannya yang masih menunggu", async () => {
    const created = await data<{ id: string }>(
      await call("POST", "/overtime-claims", h.ot, {
        workDate,
        startTime: "21:00",
        endTime: "22:00",
        reason: "Tambahan bongkar muat",
      }),
    );
    expect((await call("POST", `/overtime-claims/${created.id}/cancel`, h.mgr)).status).toBe(404);
    const cancelled = await data<{ status: string }>(
      await call("POST", `/overtime-claims/${created.id}/cancel`, h.ot),
    );
    expect(cancelled.status).toBe("CANCELLED");
  });
});
