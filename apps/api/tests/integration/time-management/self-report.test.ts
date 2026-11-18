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

// TM-D29 (STAGING) — absen mandiri crew berizin: jam diisi sendiri (tanggal bebas, termasuk mendatang),
// foto galeri, GPS HP, lokasi acuan = lokasi crew, tetap butuh persetujuan. Hapus file ini saat dicabut.
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
const message = async (res: Response) =>
  ((await res.json()) as { error: { message: string } }).error.message;

const BUCKET = "attendance-selfies";
const SITE = { latitude: -3.85, longitude: 115.3 };
const FAR = { latitude: -3.7, longitude: 115.3 }; // ± 16 km dari site
const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const offsetH = OFFSET_H[(await readTimeSettings()).timezone] ?? 8;
const today = new Date(Date.now() + offsetH * 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ids = { status: "", department: "", position: "", location: "", pattern: "", crew: "" };
const emp = { mgr: "", intern: "", other: "" };
let companyId = "";
let h: Record<"sa" | "hr" | "mgr" | "intern" | "other", Record<string, string>>;

async function photo(headers: Record<string, string>) {
  const upload = await data<{ path: string }>(
    await call("POST", "/attendance/selfie-upload", headers, { contentType: "image/jpeg" }),
  );
  fake.putObject(BUCKET, upload.path, { size: 180_000, contentType: "image/jpeg" });
  return upload.path;
}

type DayView = {
  id: string;
  status: string;
  labels: string[];
  punches: { kind: string; labels: string[]; source: string; status: string; at: string }[];
};
const selfPunch = async (
  headers: Record<string, string>,
  workDate: string,
  kind: "IN" | "OUT",
  time: string,
  where = SITE,
) =>
  call("POST", "/attendance/self-report", headers, {
    workDate,
    kind,
    time,
    photoPath: await photo(headers),
    ...where,
    accuracyM: 12,
  });

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `SR ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `SR ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `SR ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site SR ${RUN}`, city: "Tanah Laut", ...SITE, radiusM: 500 },
    })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `SR-${RUN}-${n}`,
          fullName: `Absen Mandiri ${RUN} ${n}`,
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
  emp.intern = await mk("INT", emp.mgr);
  emp.other = await mk("OTH", emp.mgr);
  ids.pattern = (
    await prisma.rosterPattern.create({
      data: { companyId, name: `Pola SR ${RUN}`, steps: ["OFF"] },
    })
  ).id;
  ids.crew = (
    await prisma.crew.create({
      data: {
        companyId,
        workLocationId: ids.location,
        name: `Intern SR ${RUN}`,
        patternId: ids.pattern,
        cycleStartDate: dateOf("2024-01-01"),
        members: { create: { employeeId: emp.intern, startDate: dateOf(addDays(today, -30)) } },
      },
    })
  ).id;
  // Alpha "tidak absen" kemarin → absen mandiri membukanya tanpa koreksi.
  await prisma.attendanceDay.create({
    data: {
      employeeId: emp.intern,
      companyId,
      managerEmployeeId: emp.mgr,
      workDate: dateOf(addDays(today, -1)),
      status: "ALPHA",
      labels: ["NO_ATTENDANCE"],
    },
  });

  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    intern: (await auth.loginAs("EMPLOYEE", { employeeId: emp.intern, companies: [companyId] }))
      .headers,
    other: (await auth.loginAs("EMPLOYEE", { employeeId: emp.other, companies: [companyId] }))
      .headers,
  };
});

afterAll(async () => {
  const employees = [emp.intern, emp.other, emp.mgr];
  await deleteAttendanceData(employees);
  await prisma.crew.deleteMany({ where: { id: ids.crew } });
  await prisma.rosterPattern.deleteMany({ where: { id: ids.pattern } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("TM-D29 absen mandiri (staging)", () => {
  test("izin per crew: hanya SA/HR PT; karyawan ditolak; status HP mengikuti izin", async () => {
    const before = await data<{ enabled: boolean }>(
      await call("GET", "/attendance/self-report/me", h.intern),
    );
    expect(before.enabled).toBe(false);
    expect(
      (
        await call("PUT", "/attendance/self-report/crews", h.intern, {
          crewId: ids.crew,
          enabled: true,
        })
      ).status,
    ).toBe(403);
    const on = await call("PUT", "/attendance/self-report/crews", h.hr, {
      crewId: ids.crew,
      enabled: true,
    });
    expect(on.status).toBe(200);
    expect(await data<{ enabled: boolean; activeMembers: number }>(on)).toMatchObject({
      enabled: true,
      activeMembers: 1,
    });
    const list = await data<{ crewId: string; enabled: boolean }[]>(
      await call("GET", `/attendance/self-report/crews?companyId=${companyId}`, h.sa),
    );
    expect(list.find((c) => c.crewId === ids.crew)?.enabled).toBe(true);
    const status = await data<{ enabled: boolean; crewName: string; location: { id: string } }>(
      await call("GET", "/attendance/self-report/me", h.intern),
    );
    expect(status).toMatchObject({ enabled: true, crewName: `Intern SR ${RUN}` });
    expect(status.location.id).toBe(ids.location);
  });

  test("karyawan di luar crew berizin → 403", async () => {
    const res = await selfPunch(h.other, today, "IN", "09:00");
    expect(res.status).toBe(403);
    expect(
      (await data<{ enabled: boolean }>(await call("GET", "/attendance/self-report/me", h.other)))
        .enabled,
    ).toBe(false);
  });

  test("tanggal mendatang diterima; label Mandiri + Foto galeri; persetujuan dibuat", async () => {
    const future = addDays(today, 10);
    const inRes = await selfPunch(h.intern, future, "IN", "09:00");
    expect(inRes.status).toBe(200);
    const out = await selfPunch(h.intern, future, "OUT", "18:00");
    expect(out.status).toBe(200);
    const day = await data<DayView>(out);
    expect(day.status).toBe("PENDING");
    expect(day.labels).toEqual(expect.arrayContaining(["SELF_REPORT", "GALLERY_PHOTO"]));
    expect(day.punches.map((p) => p.kind).sort()).toEqual(["IN", "OUT"]);
    for (const p of day.punches) {
      expect(p.source).toBe("MANUAL");
      expect(p.status).toBe("PENDING");
      expect(p.labels).toContain("SELF_REPORT");
    }
    const punchIds = (await prisma.attendancePunch.findMany({ where: { dayId: day.id } })).map(
      (p) => p.id,
    );
    const requests = await prisma.approvalRequest.findMany({
      where: { subjectType: "ATTENDANCE_PUNCH", subjectId: { in: punchIds } },
    });
    expect(requests).toHaveLength(2);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "attendance.punch.self_report", entityId: { in: punchIds } },
    });
    expect(audit).not.toBeNull();
  });

  test("Alpha tidak absen → terbuka lagi tanpa koreksi; GPS jauh tetap dicatat di luar radius", async () => {
    const yesterday = addDays(today, -1);
    expect((await selfPunch(h.intern, yesterday, "IN", "09:00", FAR)).status).toBe(200);
    const day = await data<DayView>(await selfPunch(h.intern, yesterday, "OUT", "18:00"));
    expect(day.status).toBe("PENDING");
    expect(day.labels).not.toContain("NO_ATTENDANCE");
    const inPunch = day.punches.find((p) => p.kind === "IN");
    expect(inPunch?.labels).toContain("OUTSIDE_RADIUS");
  });

  test("jam pulang butuh jam masuk; jam masuk harus sebelum jam pulang; ganti selama belum diputuskan", async () => {
    const d = addDays(today, 20);
    const noIn = await selfPunch(h.intern, d, "OUT", "18:00");
    expect(noIn.status).toBe(422);
    expect(await message(noIn)).toContain("jam masuk");
    expect((await selfPunch(h.intern, d, "IN", "09:00")).status).toBe(200);
    expect((await selfPunch(h.intern, d, "OUT", "18:00")).status).toBe(200);
    expect((await selfPunch(h.intern, d, "IN", "19:00")).status).toBe(422);
    // Ganti jam masuk (masih menunggu persetujuan) → punch lama terganti, approval lama dibatalkan.
    const changed = await data<DayView>(await selfPunch(h.intern, d, "IN", "08:30"));
    expect(changed.punches.filter((p) => p.kind === "IN")).toHaveLength(1);
  });

  test("absen yang sudah diputuskan / bukan mandiri tidak bisa diganti sendiri", async () => {
    const d = addDays(today, 25);
    const day = await data<DayView>(await selfPunch(h.intern, d, "IN", "09:00"));
    await prisma.attendancePunch.updateMany({
      where: { dayId: day.id },
      data: { status: "APPROVED" },
    });
    const res = await selfPunch(h.intern, d, "IN", "08:00");
    expect(res.status).toBe(422);
    expect(await message(res)).toContain("lewat HR");
  });

  test("izin dicabut → absen mandiri ditolak", async () => {
    await call("PUT", "/attendance/self-report/crews", h.hr, { crewId: ids.crew, enabled: false });
    expect((await selfPunch(h.intern, addDays(today, 30), "IN", "09:00")).status).toBe(403);
    expect(await prisma.selfReportCrew.count({ where: { crewId: ids.crew } })).toBe(0);
  });
});
