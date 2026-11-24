import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import type { Actor } from "../../../src/core/access/index.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import {
  createApprovalRequest,
  reassignPendingManagerSteps,
  releasePendingManagerSteps,
} from "../../../src/modules/approval/index.ts";
import { approveNormalPendingPunches, punch } from "../../../src/modules/attendance/index.ts";
import { deleteAttendanceData, patchAttendanceSettings } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// EMP-D8 P1: waktu server tetap untuk pasangan absen normal dan persetujuan tanpa atasan.
const RUN = crypto.randomUUID().slice(0, 8);
const prisma = getPrisma();
const auth = createAuthFixture(RUN);
const fake = createFakeStorage();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: fake.storage,
});
const SITE = { latitude: -3.85, longitude: 115.3 };
const DATE = "2026-11-10";
const at = (time: string) => new Date(`${DATE}T${time}:00+08:00`);
const dateOf = (date: string) => new Date(`${date}T00:00:00Z`);
const fx = {
  company: "",
  otherCompany: "",
  department: "",
  position: "",
  status: "",
  location: "",
  shift: "",
  employees: [] as string[],
};
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let hr: Login;
let otherHr: Login;
let hr2: Login;
let sa: Login;
let manager: string;
let noAccount: string;
let inactiveManager: string;
let restore: () => Promise<void>;
const call = (method: string, path: string, who: Login, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...who.headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function employee(tag: string, managerId: string | null = manager, companyId = fx.company) {
  const row = await prisma.employee.create({
    data: {
      employeeNumber: `AP-${RUN}-${crypto.randomUUID().slice(0, 8)}`,
      fullName: `Auto ${RUN} ${tag}`,
      joinDate: dateOf("2024-01-01"),
      companyId,
      employmentStatusId: fx.status,
      positionId: fx.position,
      workLocationId: fx.location,
      managerId,
    },
  });
  fx.employees.push(row.id);
  await prisma.rosterDay.create({
    data: { employeeId: row.id, workDate: dateOf(DATE), shiftId: fx.shift, source: "PATTERN" },
  });
  return row.id;
}
async function login(employeeId: string) {
  return auth.loginAs("EMPLOYEE", { employeeId, companies: [fx.company] });
}
function actor(who: Login): Actor {
  return {
    accountId: who.account.id,
    authUserId: who.account.authUserId,
    email: who.account.email,
    role: who.account.role,
    employeeId: who.account.employeeId,
    isPrimarySuperAdmin: false,
    grants: new Set(),
    companyIds: new Set([fx.company]),
  };
}
async function device(who: Login, kind: "IN" | "OUT", time: string, extra = {}) {
  const res = await call("POST", "/attendance/selfie-upload", who, { contentType: "image/jpeg" });
  expect(res.status).toBe(200);
  const {
    data: { path },
  } = (await res.json()) as { data: { path: string } };
  fake.putObject("attendance-selfies", path, { size: 150_000, contentType: "image/jpeg" });
  return punch(
    { actor: actor(who) },
    {
      kind,
      ...SITE,
      accuracyM: 10,
      selfiePath: path,
      reason: "Test attendance",
      confirmed: true,
      ...extra,
    },
    at(time),
  );
}
const decide = (id: string, who: Login, note?: string) =>
  call("POST", `/approvals/${id}/decision`, who, {
    decision: "APPROVED",
    ...(note ? { note } : {}),
  });

beforeAll(async () => {
  restore = await patchAttendanceSettings({
    timezone: "Asia/Makassar",
    requireCheckOut: true,
    freeOutsideCheckOutsPerMonth: 0,
  });
  fx.company = await createTestCompany(`AP${RUN}`, `Auto ${RUN}`);
  fx.otherCompany = await createTestCompany(`AX${RUN}`, `Other ${RUN}`);
  fx.department = (await prisma.department.create({ data: { name: `AP ${RUN}` } })).id;
  fx.position = (
    await prisma.position.create({ data: { name: `AP ${RUN}`, departmentId: fx.department } })
  ).id;
  fx.status = (await prisma.employmentStatus.create({ data: { name: `AP ${RUN}` } })).id;
  fx.location = (
    await prisma.workLocation.create({
      data: { name: `AP ${RUN}`, city: "Test", ...SITE, radiusM: 500 },
    })
  ).id;
  fx.shift = (
    await prisma.shift.create({
      data: {
        companyId: fx.company,
        code: "DAY",
        name: `AP ${RUN}`,
        startMinute: 480,
        endMinute: 960,
      },
    })
  ).id;
  manager = await employee("manager", null);
  noAccount = await employee("no-account", null);
  inactiveManager = await employee("inactive", null);
  await auth.loginAs("MANAGER", { employeeId: manager });
  await auth.loginAs("MANAGER", { employeeId: inactiveManager, isActive: false });
  hr = await auth.loginAs("HR_ADMIN", { companies: [fx.company] });
  hr2 = await auth.loginAs("HR_ADMIN", { companies: [fx.company] });
  otherHr = await auth.loginAs("HR_ADMIN", { companies: [fx.otherCompany] });
  sa = await auth.loginAs("SUPER_ADMIN");
});
afterAll(async () => {
  await restore();
  const requests = await prisma.approvalRequest.findMany({
    where: { requesterEmployeeId: { in: fx.employees } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: requests.map((r) => r.id) } } });
  await deleteAttendanceData(fx.employees);
  await prisma.attendancePeriod.deleteMany({ where: { companyId: fx.company } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: fx.employees } } });
  await prisma.shift.deleteMany({ where: { id: fx.shift } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: fx.employees } } });
  await prisma.position.delete({ where: { id: fx.position } });
  await prisma.department.delete({ where: { id: fx.department } });
  await prisma.workLocation.delete({ where: { id: fx.location } });
  await prisma.employmentStatus.delete({ where: { id: fx.status } });
  await prisma.company.deleteMany({ where: { id: { in: [fx.company, fx.otherCompany] } } });
  await disconnectPrisma();
});

describe("EMP-D8 P1: normal device punches", () => {
  test("normal IN + OUT approved without requests, day approved and audited", async () => {
    const who = await login(await employee("normal"));
    const start = await device(who, "IN", "08:00");
    expect(start.punches[0]).toMatchObject({ status: "APPROVED", approval: null, labels: [] });
    const end = await device(who, "OUT", "16:00");
    expect(end.status).toBe("APPROVED");
    expect(end.punches.every((p) => p.status === "APPROVED" && p.approval === null)).toBe(true);
    const punches = await prisma.attendancePunch.findMany({ where: { dayId: end.id } });
    expect(punches.map((p) => p.decidedAt?.toISOString()).sort()).toEqual([
      at("08:00").toISOString(),
      at("16:00").toISOString(),
    ]);
    expect(
      await prisma.approvalRequest.count({
        where: { subjectId: { in: punches.map((p) => p.id) } },
      }),
    ).toBe(0);
    const audits = await prisma.auditLog.findMany({
      where: { entityId: end.id, action: { in: ["attendance.check_in", "attendance.check_out"] } },
    });
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => (a.after as { autoApproved?: boolean }).autoApproved === true)).toBe(
      true,
    );
  });
  test("normal IN + flagged OUT leaves only OUT pending", async () => {
    const who = await login(await employee("flagged-out"));
    await device(who, "IN", "08:00");
    // Pulang terlambat tidak berlabel di engine; pulang lebih awal = EARLY_LEAVE.
    const day = await device(who, "OUT", "15:00");
    expect(day.status).toBe("PENDING");
    expect(day.punches.find((p) => p.kind === "IN")).toMatchObject({
      status: "APPROVED",
      approval: null,
    });
    expect(day.punches.find((p) => p.kind === "OUT")).toMatchObject({
      status: "PENDING",
      labels: ["EARLY_LEAVE"],
      approval: { steps: expect.any(Array) },
    });
  });
  test.each(["no-manager", "no-account", "inactive-account"])(
    "%s gets one HR step with scoped regular decision",
    async (tag) => {
      const managerId =
        tag === "no-manager" ? null : tag === "no-account" ? noAccount : inactiveManager;
      const who = await login(await employee(`staff-${tag}`, managerId));
      await device(who, "IN", "08:00");
      const day = await device(who, "OUT", "15:00");
      const request = day.punches.find((p) => p.kind === "OUT")?.approval;
      expect(request?.steps.map((s) => s.kind)).toEqual(["HR"]);
      const row = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request?.id } });
      expect(row).toMatchObject({ mode: "SINGLE", managerEmployeeId: null });
      expect([403, 404]).toContain((await decide(row.id, otherHr)).status);
      const view = await call("GET", `/approvals/${row.id}`, hr);
      expect(await view.json()).toMatchObject({
        data: { canDecide: true, steps: [{ kind: "HR", myRight: "regular" }] },
      });
      expect((await decide(row.id, hr)).status).toBe(200);
      expect(await prisma.attendanceDay.findUnique({ where: { id: day.id } })).toMatchObject({
        status: "APPROVED",
      });
    },
  );
  test("HR-only requests are not reassigned, explicit SINGLE still means manager", async () => {
    const employeeId = await employee("reassignment", null);
    const who = await login(employeeId);
    const day = await device(who, "IN", "08:30");
    const requestId = day.punches[0]?.approval?.id as string;
    expect(
      await prisma.$transaction((tx) => reassignPendingManagerSteps(tx, employeeId, manager)),
    ).toBe(0);
    expect(await prisma.$transaction((tx) => releasePendingManagerSteps(tx, noAccount))).toBe(0);
    expect(await prisma.approvalRequest.findUnique({ where: { id: requestId } })).toMatchObject({
      managerEmployeeId: null,
      mode: "SINGLE",
    });
    // EMP-D8 P1: mode SINGLE eksplisit (lembur) tidak diubah menjadi langkah HR.
    const single = await prisma.$transaction((tx) =>
      createApprovalRequest(tx, {
        subjectType: "ATTENDANCE_DAY",
        subjectId: day.id,
        requesterEmployeeId: employeeId,
        companyId: fx.company,
        managerEmployeeId: null,
        mode: "SINGLE",
      }),
    );
    expect(single.steps.map((step) => step.kind)).toEqual(["MANAGER"]);
    const view = await call("GET", `/approvals/${single.id}`, hr);
    expect(await view.json()).toMatchObject({
      data: { canDecide: true, steps: [{ kind: "MANAGER", myRight: "regular" }] },
    });
  });
  test.each([
    ["LOW_ACCURACY", { accuracyM: 500 }, "08:00"],
    ["MOCK_LOCATION", { isMock: true }, "08:00"],
    ["LATE", {}, "08:30"],
  ] as const)("%s always requires an approval request", async (label, extra, time) => {
    const who = await login(await employee(label));
    const day = await device(who, "IN", time, extra);
    expect(day.punches[0]?.labels).toContain(label);
    expect(day.punches[0]?.status).toBe("PENDING");
    expect(day.punches[0]?.approval?.status).toBe("PENDING");
  });
  test("manager request keeps two steps and forbids same HR deciding twice", async () => {
    const who = await login(await employee("two-steps"));
    const day = await device(who, "IN", "08:30");
    const request = day.punches[0]?.approval;
    expect(request?.steps).toHaveLength(2);
    expect((await decide(request?.id as string, hr)).status).toBe(200);
    expect((await decide(request?.id as string, hr, "Take over manager")).status).toBe(403);
  });
  test("manual HR input without manager waits for another person", async () => {
    const employeeId = await employee("manual", null);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Makassar",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const response = await call("POST", "/attendance/manual", hr, {
      employeeId,
      workDate: today,
      kind: "IN",
      time: "08:00",
      reason: "Device broken",
    });
    expect(response.status).toBe(200);
    const { data: day } = (await response.json()) as {
      data: {
        punches: {
          status: string;
          approval: { id: string; steps: { kind: string; decision: string }[] };
        }[];
      };
    };
    expect(day.punches[0]).toMatchObject({
      status: "PENDING",
      approval: { steps: [{ kind: "HR", decision: "PENDING" }] },
    });
    const id = day.punches[0]?.approval.id as string;
    expect((await decide(id, hr)).status).toBe(403);
    expect((await decide(id, sa)).status).toBe(422);
    expect((await decide(id, hr2)).status).toBe(200);
  });
});

// Data lama sengaja dibuat langsung: sebelum EMP-D8 semua absen normal mempunyai request.
async function legacy(
  tag: string,
  options: {
    labels?: string[];
    source?: "DEVICE" | "MANUAL";
    date?: string;
    dayStatus?: "PENDING" | "ALPHA" | "LEAVE";
    kind?: "IN" | "BREAK_START";
    requestStatus?: "PENDING" | "APPROVED";
    punchStatus?: "PENDING" | "APPROVED";
    companyId?: string;
  } = {},
) {
  const employeeId = await employee(`legacy-${tag}`, manager, options.companyId ?? fx.company);
  const legacyAt = (time: string) => new Date(`${options.date ?? DATE}T${time}:00+08:00`);
  const day = await prisma.attendanceDay.create({
    data: {
      employeeId,
      companyId: options.companyId ?? fx.company,
      workDate: dateOf(options.date ?? DATE),
      status: options.dayStatus ?? "PENDING",
      labels: [],
      punches: {
        create: [
          {
            kind: options.kind ?? "IN",
            at: legacyAt("08:00"),
            status: options.punchStatus ?? "PENDING",
            insideGeofence: true,
            labels: options.labels ?? [],
            source: options.source ?? "DEVICE",
          },
          {
            kind: "OUT",
            at: legacyAt("16:00"),
            status: "APPROVED",
            insideGeofence: true,
            labels: [],
            source: "DEVICE",
          },
        ],
      },
    },
    include: { punches: true },
  });
  const target = day.punches.find((p) => p.kind !== "OUT");
  const request = await prisma.approvalRequest.create({
    data: {
      subjectType: "ATTENDANCE_PUNCH",
      subjectId: target?.id as string,
      requesterEmployeeId: employeeId,
      companyId: options.companyId ?? fx.company,
      managerEmployeeId: manager,
      mode: "PARALLEL",
      status: options.requestStatus ?? "PENDING",
      steps: { create: [{ kind: "MANAGER" }, { kind: "HR" }] },
    },
  });
  return { day, punchId: target?.id as string, request };
}

describe("EMP-D8 P1: normal pending backfill", () => {
  test("dry-run preserves all rows; apply selects normal device requests, audits and recomputes; rerun is empty", async () => {
    const normal = await legacy("normal");
    const oldMonth = await legacy("old-month", { date: "2026-09-10" });
    const excluded = await Promise.all([
      legacy("labelled", { labels: ["LOW_ACCURACY"] }),
      legacy("manual", { source: "MANUAL" }),
      legacy("closed", { date: "2026-10-10" }),
      legacy("alpha", { dayStatus: "ALPHA" }),
      legacy("leave", { dayStatus: "LEAVE" }),
      legacy("break", { kind: "BREAK_START" }),
      legacy("request-final", { requestStatus: "APPROVED" }),
      legacy("punch-final", { punchStatus: "APPROVED" }),
      legacy("future", { date: "2026-11-11" }),
      legacy("other-company", { companyId: fx.otherCompany }),
    ]);
    await prisma.attendancePeriod.create({
      data: { companyId: fx.company, month: "2026-10", status: "CLOSED" },
    });
    const requestIds = [normal, oldMonth, ...excluded].map((x) => x.request.id);
    const snapshot = async () => ({
      requests: await prisma.approvalRequest.findMany({
        where: { id: { in: requestIds } },
        include: { steps: true },
        orderBy: { id: "asc" },
      }),
      days: await prisma.attendanceDay.findMany({
        where: { id: { in: [normal, oldMonth, ...excluded].map((x) => x.day.id) } },
        include: { punches: true },
        orderBy: { id: "asc" },
      }),
      audits: await prisma.auditLog.count({ where: { entityId: { in: requestIds } } }),
    });
    const before = await snapshot();
    const options = { companyId: fx.company, before: "2026-11-11" };
    const dry = await approveNormalPendingPunches(options, at("17:00"));
    expect(dry).toMatchObject({
      dryRun: true,
      candidates: 2,
      approved: 0,
      failed: 0,
      groups: [
        { companyId: fx.company, month: "2026-09", count: 1 },
        { companyId: fx.company, month: "2026-11", count: 1 },
      ],
    });
    expect(await snapshot()).toEqual(before);
    const result = await approveNormalPendingPunches({ ...options, apply: true }, at("17:00"));
    expect(result).toMatchObject({ dryRun: false, candidates: 2, approved: 2, failed: 0 });
    for (const target of [normal, oldMonth]) {
      expect(await prisma.attendanceDay.findUnique({ where: { id: target.day.id } })).toMatchObject(
        { status: "APPROVED" },
      );
      expect(
        await prisma.attendancePunch.findUnique({ where: { id: target.punchId } }),
      ).toMatchObject({ status: "APPROVED", decidedAt: at("17:00") });
      const request = await prisma.approvalRequest.findUniqueOrThrow({
        where: { id: target.request.id },
        include: { steps: true },
      });
      expect(request.status).toBe("APPROVED");
      expect(request.decidedAt).toEqual(at("17:00"));
      expect(
        request.steps.every(
          (s) =>
            s.decision === "APPROVED" &&
            s.decidedByAccountId === null &&
            s.note === "Otomatis: absen normal (EMP-D8 P1)" &&
            !s.isOverride,
        ),
      ).toBe(true);
      expect(
        await prisma.auditLog.findFirst({
          where: { entityId: request.id, action: "approval.auto_approve" },
        }),
      ).toMatchObject({ actorAccountId: null });
    }
    for (const item of excluded) {
      expect(
        await prisma.attendancePunch.findUnique({ where: { id: item.punchId } }),
      ).toMatchObject({ status: item.day.punches.find((p) => p.id === item.punchId)?.status });
      expect(
        await prisma.approvalRequest.findUnique({ where: { id: item.request.id } }),
      ).toMatchObject({ status: item.request.status });
    }
    expect(await approveNormalPendingPunches({ ...options, apply: true })).toMatchObject({
      candidates: 0,
      approved: 0,
      failed: 0,
    });
  });
  test("one conflicting request fails without stopping other transactions", async () => {
    const broken = await legacy("conflict", { date: "2026-08-10" });
    const valid = await legacy("after-conflict", { date: "2026-08-11" });
    await prisma.approvalStep.updateMany({
      where: { requestId: broken.request.id, kind: "MANAGER" },
      data: { decision: "CANCELLED" },
    });
    const result = await approveNormalPendingPunches({
      apply: true,
      companyId: fx.company,
      before: "2026-09-01",
    });
    expect(result).toMatchObject({ candidates: 2, approved: 1, failed: 1 });
    expect(
      await prisma.approvalRequest.findUnique({ where: { id: broken.request.id } }),
    ).toMatchObject({ status: "PENDING" });
    expect(
      await prisma.attendancePunch.findUnique({ where: { id: broken.punchId } }),
    ).toMatchObject({ status: "PENDING" });
    expect(
      await prisma.approvalRequest.findUnique({ where: { id: valid.request.id } }),
    ).toMatchObject({ status: "APPROVED" });
  });
});
