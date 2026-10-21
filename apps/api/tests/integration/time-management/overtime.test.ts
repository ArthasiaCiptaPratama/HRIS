import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { readTimeSettings, syncOvertimeForDay } from "../../../src/modules/attendance/index.ts";
import {
  breakLocationsViewSchema,
  gradeWageViewSchema,
  overtimeSummarySchema,
  overtimeViewSchema,
} from "../../../src/modules/attendance/overtime.schema.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// TM-D6 lembur (usulan otomatis + Atasan & HR, rupiah sesuai hak), TM-D7 istirahat, TM-D8 template JT.
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
const SITE = { latitude: -3.81, longitude: 115.21 };

const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const offsetH = OFFSET_H[(await readTimeSettings()).timezone] ?? 8;
const at = (date: string, hhmm: string) =>
  new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - offsetH * 3600_000);
const nowLocal = new Date(Date.now() + offsetH * 3600_000);
const minuteNow = nowLocal.getUTCHours() * 60 + nowLocal.getUTCMinutes();
const today = nowLocal.toISOString().slice(0, 10);
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
// Oktober 2026 tanpa tanggal merah nasional → hari kerja biasa.
const DAY1 = "2026-10-05";
const DAY2 = "2026-10-06";
const DAY3 = "2026-10-07";

const ids = {
  status: "",
  department: "",
  position: "",
  location: "",
  grade: "",
  company2: "",
  employees: [] as string[],
  shifts: [] as string[],
};
let companyId = "";
const emp = { mgr: "", a: "", b: "" };
let h: Record<"sa" | "hr" | "hrCost" | "mgr" | "a" | "b", Record<string, string>>;
let breakBefore: unknown = null;

/** Hari absen lengkap (masuk, istirahat, pulang) pada tanggal lampau, langsung di DB. */
async function seedDay(
  date: string,
  times: { in: string; out: string; breakStart?: string; breakEnd?: string },
) {
  const shiftId = ids.shifts[0] as string;
  const day = await prisma.attendanceDay.create({
    data: {
      employeeId: emp.a,
      companyId,
      managerEmployeeId: emp.mgr,
      workDate: D(date),
      shiftId,
      shiftCode: `O${RUN.slice(0, 5)}`,
      scheduledStart: at(date, "08:00"),
      scheduledEnd: at(date, "17:00"),
      checkOutDeadline: at(date, "21:00"),
      workLocationId: ids.location,
      status: "PENDING",
      labels: [],
    },
  });
  const punches: { kind: "IN" | "OUT" | "BREAK_START" | "BREAK_END"; hhmm: string }[] = [
    { kind: "IN", hhmm: times.in },
    { kind: "OUT", hhmm: times.out },
  ];
  if (times.breakStart) punches.push({ kind: "BREAK_START", hhmm: times.breakStart });
  if (times.breakEnd) punches.push({ kind: "BREAK_END", hhmm: times.breakEnd });
  for (const p of punches) {
    await prisma.attendancePunch.create({
      data: {
        dayId: day.id,
        kind: p.kind,
        at: at(date, p.hhmm),
        insideGeofence: true,
        labels: [],
        status: p.kind.startsWith("BREAK") ? "APPROVED" : "PENDING",
      },
    });
  }
  await syncOvertimeForDay(day.id);
  return day.id;
}

beforeAll(async () => {
  companyId = await acpCompanyId();
  const setting = await prisma.timeSetting.findUnique({ where: { key: "breakLocations" } });
  breakBefore = setting?.value ?? null;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `OT ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `OT ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `OT ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Pelabuhan OT ${RUN}`, city: "Tanah Bumbu", ...SITE, radiusM: 500 },
    })
  ).id;
  ids.grade = (await prisma.grade.create({ data: { name: `OT-L1 ${RUN}` } })).id;
  ids.company2 = (
    await prisma.company.create({ data: { code: `T${RUN.slice(0, 5)}`, name: `PT Uji JT ${RUN}` } })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `OT-${RUN}-${n}`,
          fullName: `Lembur ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
          workLocationId: ids.location,
          gradeId: ids.grade,
        },
      })
    ).id;
  emp.mgr = await mk("MGR");
  emp.a = await mk("A", emp.mgr);
  emp.b = await mk("B", emp.mgr);
  ids.employees.push(emp.a, emp.b, emp.mgr);

  const office = await prisma.shift.create({
    data: {
      companyId,
      code: `O${RUN.slice(0, 5)}`,
      name: `Kantor ${RUN}`,
      startMinute: 8 * 60,
      endMinute: 17 * 60,
      breakMin: 60,
    },
  });
  // Shift untuk alur absen istirahat lewat HP: mulai 10 menit lagi, 8 jam.
  const live = await prisma.shift.create({
    data: {
      companyId,
      code: `L${RUN.slice(0, 5)}`,
      name: `Lapangan ${RUN}`,
      startMinute: (minuteNow + 10) % 1440,
      endMinute: (minuteNow + 8 * 60) % 1440,
      breakMin: 60,
    },
  });
  ids.shifts.push(office.id, live.id);
  await prisma.rosterDay.create({
    data: { employeeId: emp.b, workDate: D(today), shiftId: live.id, source: "MANUAL" },
  });

  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    hrCost: (
      await auth.loginAs("HR_ADMIN", {
        companies: [companyId, ids.company2],
        grants: [{ permission: "LABOR_COST_READ" }],
      })
    ).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
    b: (await auth.loginAs("EMPLOYEE", { employeeId: emp.b, companies: [companyId] })).headers,
  };
});

afterAll(async () => {
  const requests = await prisma.overtimeRequest.findMany({
    where: { employeeId: { in: ids.employees } },
    select: { id: true },
  });
  await prisma.approvalRequest.deleteMany({
    where: {
      OR: [
        { subjectId: { in: requests.map((r) => r.id) } },
        { requesterEmployeeId: { in: ids.employees } },
      ],
    },
  });
  await prisma.overtimeRequest.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crew.deleteMany({ where: { companyId: ids.company2 } });
  await prisma.rosterPattern.deleteMany({ where: { companyId: ids.company2 } });
  await prisma.shift.deleteMany({
    where: { OR: [{ id: { in: ids.shifts } }, { companyId: ids.company2 }] },
  });
  await prisma.gradeWage.deleteMany({ where: { gradeId: ids.grade } });
  if (breakBefore === null) {
    await prisma.timeSetting.deleteMany({ where: { key: "breakLocations" } });
  } else {
    await prisma.timeSetting.update({
      where: { key: "breakLocations" },
      data: { value: breakBefore as object },
    });
  }
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.grade.delete({ where: { id: ids.grade } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.company.delete({ where: { id: ids.company2 } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("upah grade & grant Biaya (TM-D6)", () => {
  test("SA mengisi upah grade; HR tanpa grant ditolak; HR ber-grant hanya membaca", async () => {
    const set = await call("PUT", `/grade-wages/${ids.grade}`, h.sa, {
      basePay: 5_700_000,
      fixedAllowance: 1_500_000,
    });
    expect(set.status).toBe(200);
    expect((await data<{ hourly: number }>(set)).hourly).toBe(41_618);

    expect((await call("GET", "/grade-wages", h.hr)).status).toBe(403);
    const list = await data<{ gradeId: string; basePay: number }[]>(
      await call("GET", "/grade-wages", h.hrCost),
    );
    expect(list.find((g) => g.gradeId === ids.grade)?.basePay).toBe(5_700_000);
    expect(
      (await call("PUT", `/grade-wages/${ids.grade}`, h.hrCost, { basePay: 1, fixedAllowance: 0 }))
        .status,
    ).toBe(403);
    expect((await call("GET", "/grade-wages", h.mgr)).status).toBe(403);
  });
});

describe("lokasi wajib absen istirahat (TM-D7)", () => {
  test("SA/HR mengatur; karyawan tidak", async () => {
    const before = await data<{ locations: { id: string; required: boolean }[] }>(
      await call("GET", "/break-locations", h.hr),
    );
    const others = before.locations.filter((l) => l.required).map((l) => l.id);
    const res = await call("PUT", "/break-locations", h.hr, {
      workLocationIds: [...others, ids.location],
    });
    expect(res.status).toBe(200);
    const view = await data<{ locations: { id: string; required: boolean }[] }>(res);
    expect(view.locations.find((l) => l.id === ids.location)?.required).toBe(true);
    expect((await call("GET", "/break-locations", h.a)).status).toBe(403);
  });
});

describe("usulan lembur otomatis (TM-D6)", () => {
  let requestId = "";

  test("pulang 18.50 → usulan 2 jam (3,5 jam setara) ke Atasan + HR; rupiah hanya untuk yang berhak", async () => {
    const dayId = await seedDay(DAY1, {
      in: "08:00",
      breakStart: "12:00",
      breakEnd: "13:00",
      out: "18:50",
    });
    const row = await prisma.overtimeRequest.findUnique({ where: { dayId } });
    expect(row?.proposedMin).toBe(120);
    expect(Number(row?.equivalentHours)).toBe(3.5);
    expect(row?.flags).toEqual([]);

    const inbox = await data<{ id: string; pay: number | null; approval: { id: string } }[]>(
      await call("GET", `/overtime?scope=inbox&from=${DAY1}&to=${DAY1}`, h.mgr),
    );
    const mine = inbox.find((o) => o.id === row?.id);
    expect(mine).toBeDefined();
    expect(mine?.pay).toBeNull();
    requestId = mine?.approval.id as string;

    const all = await data<{ id: string; pay: number | null }[]>(
      await call("GET", `/overtime?scope=all&from=${DAY1}&to=${DAY1}`, h.hrCost),
    );
    // 3,5 × 7,2 jt ÷ 173.
    expect(all.find((o) => o.id === row?.id)?.pay).toBe(145_665);
    const plainHr = await data<{ id: string; pay: number | null }[]>(
      await call("GET", `/overtime?scope=all&from=${DAY1}&to=${DAY1}`, h.hr),
    );
    expect(plainHr.find((o) => o.id === row?.id)?.pay).toBeNull();
    const me = await data<{ id: string; pay: number | null }[]>(
      await call("GET", `/overtime?scope=me&from=${DAY1}&to=${DAY1}`, h.a),
    );
    expect(me.find((o) => o.id === row?.id)?.pay).toBeNull();
    expect((await call("GET", `/overtime?scope=all&from=${DAY1}&to=${DAY1}`, h.a)).status).toBe(
      403,
    );

    const queue = await data<{ overtime: number }>(await call("GET", "/time/queue", h.mgr));
    expect(queue.overtime).toBeGreaterThanOrEqual(1);
  });

  test("disetujui Atasan + HR → APPROVED + notifikasi ke karyawan", async () => {
    for (const who of [h.mgr, h.hr]) {
      const res = await call("POST", `/approvals/${requestId}/decision`, who, {
        decision: "APPROVED",
      });
      expect(res.status).toBe(200);
    }
    const row = await prisma.overtimeRequest.findFirst({
      where: { employeeId: emp.a, workDate: D(DAY1) },
    });
    expect(row?.status).toBe("APPROVED");
    const account = await prisma.account.findFirst({ where: { employeeId: emp.a } });
    const notes = await prisma.notification.findMany({
      where: { recipientAccountId: account?.id, type: "attendance.overtime_decided" },
    });
    expect(notes[0]?.title).toContain("disetujui");
  });

  test("lewat 4 jam sehari → OVER_DAY_LIMIT; setuju tanpa alasan ditolak", async () => {
    const dayId = await seedDay(DAY2, {
      in: "08:00",
      breakStart: "12:00",
      breakEnd: "13:00",
      out: "21:30",
    });
    const row = await prisma.overtimeRequest.findUnique({ where: { dayId } });
    expect(row?.proposedMin).toBe(270);
    expect(row?.flags).toContain("OVER_DAY_LIMIT");
    const approval = await prisma.approvalRequest.findFirst({
      where: { subjectType: "OVERTIME", subjectId: row?.id },
    });
    const noNote = await call("POST", `/approvals/${approval?.id}/decision`, h.mgr, {
      decision: "APPROVED",
    });
    expect(noNote.status).toBe(422);
    const withNote = await call("POST", `/approvals/${approval?.id}/decision`, h.mgr, {
      decision: "APPROVED",
      note: "Bongkar muat kapal tertunda",
    });
    expect(withNote.status).toBe(200);
  });

  test("istirahat lebih 25 menit + pulang 18.00 → tanpa usulan, label BREAK_OVER", async () => {
    const dayId = await seedDay(DAY3, {
      in: "08:00",
      breakStart: "12:00",
      breakEnd: "13:25",
      out: "18:00",
    });
    expect(await prisma.overtimeRequest.findUnique({ where: { dayId } })).toBeNull();
    const day = await prisma.attendanceDay.findUnique({ where: { id: dayId } });
    expect(day?.labels).toContain("BREAK_OVER");
  });

  test("rekap bulanan: SA/HR ber-grant melihat rupiah per orang; atasan hanya total tim", async () => {
    const sa = await data<{
      rows: { employee: { id: string }; approvedMin: number; pay: number | null }[];
      totals: { pay: number | null };
    }>(await call("GET", "/overtime/summary?month=2026-10", h.sa));
    const row = sa.rows.find((r) => r.employee.id === emp.a);
    expect(row?.approvedMin).toBe(120);
    expect(row?.pay).toBe(145_665);

    const mgr = await data<{
      rows: { employee: { id: string }; pay: number | null }[];
      totals: { pay: number | null };
      showPay: boolean;
    }>(await call("GET", "/overtime/summary?month=2026-10", h.mgr));
    expect(mgr.showPay).toBe(false);
    expect(mgr.rows.every((r) => r.pay === null)).toBe(true);
    expect(mgr.totals.pay).toBe(145_665);

    const hr = await data<{ totals: { pay: number | null } }>(
      await call("GET", "/overtime/summary?month=2026-10", h.hr),
    );
    expect(hr.totals.pay).toBeNull();
  });
});

describe("absen istirahat lewat HP (TM-D7)", () => {
  async function selfie(headers: Record<string, string>) {
    const upload = await data<{ path: string }>(
      await call("POST", "/attendance/selfie-upload", headers, { contentType: "image/jpeg" }),
    );
    fake.putObject(BUCKET, upload.path, { size: 150_000, contentType: "image/jpeg" });
    return upload.path;
  }
  const punch = async (kind: string) =>
    call("POST", "/attendance/punch", h.b, {
      kind,
      ...SITE,
      accuracyM: 10,
      selfiePath: await selfie(h.b),
      confirmed: true,
      reason: "Uji istirahat",
    });

  test("Mulai → (Clock Out ditolak saat istirahat) → Selesai → Clock Out; sekali per hari", async () => {
    expect((await punch("IN")).status).toBe(200);
    let today = await data<{ breakState: string }>(await call("GET", "/attendance/me/today", h.b));
    expect(today.breakState).toBe("NONE");
    expect((await punch("BREAK_END")).status).toBe(422);
    expect((await punch("BREAK_START")).status).toBe(200);
    today = await data<{ breakState: string }>(await call("GET", "/attendance/me/today", h.b));
    expect(today.breakState).toBe("ON_BREAK");
    expect((await punch("OUT")).status).toBe(422);
    expect((await punch("BREAK_START")).status).toBe(409);
    expect((await punch("BREAK_END")).status).toBe(200);
    today = await data<{ breakState: string }>(await call("GET", "/attendance/me/today", h.b));
    expect(today.breakState).toBe("DONE");
    expect((await punch("OUT")).status).toBe(200);
    const day = await prisma.attendanceDay.findFirst({
      where: { employeeId: emp.b },
      include: { punches: true },
    });
    expect(day?.punches.map((p) => p.kind).sort()).toEqual([
      "BREAK_END",
      "BREAK_START",
      "IN",
      "OUT",
    ]);
    // Absen istirahat tanpa approval sendiri.
    expect(
      await prisma.approvalRequest.count({
        where: {
          subjectType: "ATTENDANCE_PUNCH",
          subjectId: {
            in: day?.punches.filter((p) => p.kind.startsWith("BREAK")).map((p) => p.id),
          },
        },
      }),
    ).toBe(0);
  });
});

describe("template roster JT (TM-D8)", () => {
  test("membuat 3 shift (7j + 1j lembur rutin, istirahat dibayar), pola 21 hari & 3 crew; kedua kali 409", async () => {
    const input = {
      template: "JT",
      companyId: ids.company2,
      workLocationId: ids.location,
      cycleStartDate: "2026-11-02",
    };
    expect((await call("POST", "/roster/templates", h.hr, input)).status).toBe(403);
    const res = await call("POST", "/roster/templates", h.hrCost, input);
    expect(res.status).toBe(200);
    const out = await data<{
      shifts: { code: string; regularOvertimeMin: number; breakPaid: boolean }[];
      pattern: { steps: string[]; workDays: number };
      crews: { name: string }[];
    }>(res);
    expect(out.shifts.map((s) => s.code)).toEqual(["JTP", "JTS", "JTM"]);
    expect(out.shifts.every((s) => s.regularOvertimeMin === 60 && s.breakPaid)).toBe(true);
    expect(out.pattern.steps).toHaveLength(21);
    expect(out.pattern.workDays).toBe(18);
    expect(out.crews).toHaveLength(3);
    expect((await call("POST", "/roster/templates", h.hrCost, input)).status).toBe(409);
  });

  test("template 13+1 (7j + 1j lembur rutin) & 5+2 (Senin–Jumat, crew mulai Senin)", async () => {
    const base = { companyId: ids.company2, workLocationId: ids.location };
    const rot = await data<{
      shifts: { code: string; regularOvertimeMin: number; breakPaid: boolean }[];
      pattern: { steps: string[]; workDays: number };
      crews: { name: string }[];
    }>(
      await call("POST", "/roster/templates", h.hrCost, {
        ...base,
        template: "ROT_13_1",
        cycleStartDate: "2026-11-04",
      }),
    );
    expect(rot.shifts).toMatchObject([{ code: "R13", regularOvertimeMin: 60, breakPaid: true }]);
    expect(rot.pattern).toMatchObject({ workDays: 13 });
    expect(rot.pattern.steps).toHaveLength(14);
    expect(rot.crews).toHaveLength(1);
    const week = await data<{
      shifts: { code: string; breakMin: number; breakPaid: boolean; regularOvertimeMin: number }[];
      pattern: { steps: string[] };
      crews: { id: string; cycleStartDate: string }[];
    }>(
      // Rabu 4 Nov 2026 → siklus dimulai Senin 2 Nov.
      await call("POST", "/roster/templates", h.hrCost, {
        ...base,
        template: "WEEK_5_2",
        cycleStartDate: "2026-11-04",
      }),
    );
    expect(week.shifts).toMatchObject([
      { code: "K52", breakMin: 60, breakPaid: false, regularOvertimeMin: 0 },
    ]);
    expect(week.pattern.steps).toEqual(["K52", "K52", "K52", "K52", "K52", "OFF", "OFF"]);
    expect(week.crews[0]?.cycleStartDate).toBe("2026-11-02");
  });
});

describe("kontrak OpenAPI bertipe (MOB-D10)", () => {
  test("respons lembur, upah grade, & lokasi istirahat lolos skema", async () => {
    const parse = async (
      schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
      res: Response,
    ) => {
      expect(res.status).toBe(200);
      const result = schema.safeParse(await data(res));
      expect(result.error).toBeUndefined();
    };
    await parse(
      overtimeViewSchema.array(),
      await call("GET", `/overtime?scope=all&from=${DAY1}&to=${DAY1}`, h.hrCost),
    );
    await parse(overtimeSummarySchema, await call("GET", "/overtime/summary?month=2026-10", h.sa));
    await parse(gradeWageViewSchema.array(), await call("GET", "/grade-wages", h.hrCost));
    await parse(breakLocationsViewSchema, await call("GET", "/break-locations", h.hr));
  });

  test("spec OpenAPI: rute baru tidak memakai skema kosong", async () => {
    const doc = (await (await app.request("/api/v1/openapi.json")).json()) as {
      paths: Record<
        string,
        Record<string, { requestBody?: unknown; responses: Record<string, unknown> }>
      >;
    };
    const paths = [
      ["/api/v1/overtime", "get"],
      ["/api/v1/overtime/summary", "get"],
      ["/api/v1/grade-wages", "get"],
      ["/api/v1/grade-wages/{gradeId}", "put"],
      ["/api/v1/break-locations", "put"],
      ["/api/v1/roster/templates", "post"],
      ["/api/v1/dashboard/analytics", "get"],
      ["/api/v1/leave-exit-settlements", "get"],
      ["/api/v1/leave-exit-settlements/{id}/paid", "post"],
    ] as const;
    for (const [path, method] of paths) {
      const op = doc.paths[path]?.[method];
      expect(op).toBeDefined();
      const text = JSON.stringify({ body: op?.requestBody, ok: op?.responses["200"] });
      expect(text).not.toContain('"data":{}');
      expect(text).not.toContain('"additionalProperties":{}');
    }
  });
});
