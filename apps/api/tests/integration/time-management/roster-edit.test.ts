import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { settingsToday } from "../../../src/modules/attendance/calendar.service.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";

// TM-D24: perubahan roster karyawan yang sudah ber-crew (lewat Isi dengan template) diajukan → disetujui atasan +
// HR lain → baru diterapkan. Karyawan tanpa crew langsung diisi. Pengaju tidak memutus pengajuannya sendiri.
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
const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const code = (c: string) => `${c}${RUN.slice(0, 4)}`;

type Edit = {
  id: string;
  status: string;
  employee: { id: string };
  preview: { date: string; from: string | null; to: string | null }[];
  approval: { id: string } | null;
};
const ids = {
  status: "",
  department: "",
  position: "",
  location: "",
  shifts: [] as string[],
  emp: {} as Record<"mgr" | "ani" | "budi" | "cici", string>,
};
let companyId = "";
let today = "";
let E = "";
let t2 = "";
let h: Record<"hr1" | "hr2" | "mgr" | "emp", Record<string, string>>;

const assign = (templateId: string, employeeIds: string[], effectiveDate = E) =>
  call("POST", `/roster-custom-templates/${templateId}/assign`, h.hr1, {
    workLocationId: ids.location,
    employeeIds,
    effectiveDate,
  });
const dayCode = async (employeeId: string, date: string) =>
  (
    await prisma.rosterDay.findFirst({
      where: { employeeId, workDate: D(date) },
      include: { shift: true },
    })
  )?.shift?.code ?? "OFF";
const mine = async () => data<Edit[]>(await call("GET", "/roster-edits?scope=mine", h.hr1));

beforeAll(async () => {
  today = await settingsToday();
  E = plusDays(today, 4);
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `RE ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `RE ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `RE ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: {
        name: `Site RE ${RUN}`,
        city: "Tanah Laut",
        latitude: -3.6,
        longitude: 115.1,
        radiusM: 300,
      },
    })
  ).id;
  for (const [c, start, end] of [
    ["D", 420, 1140],
    ["N", 1140, 420],
  ] as const) {
    ids.shifts.push(
      (
        await prisma.shift.create({
          data: {
            companyId,
            code: code(c),
            name: `Uji RE ${RUN} ${c}`,
            startMinute: start,
            endMinute: end,
          },
        })
      ).id,
    );
  }
  const mk = async (n: string, managerId: string | null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `RE-${RUN}-${n}`,
          fullName: `${n} ${RUN}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
        },
      })
    ).id;
  ids.emp.mgr = await mk("Mgr", null);
  for (const n of ["ani", "budi", "cici"] as const) ids.emp[n] = await mk(n, ids.emp.mgr);
  h = {
    hr1: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    hr2: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: ids.emp.mgr, companies: [companyId] }))
      .headers,
    emp: (await auth.loginAs("EMPLOYEE", { employeeId: ids.emp.budi, companies: [companyId] }))
      .headers,
  };
  const mkTemplate = async (name: string, steps: string[]) =>
    (
      await data<{ id: string }>(
        await call("POST", "/roster-custom-templates", h.hr1, {
          companyId,
          name,
          steps,
          crewCount: 1,
          crewOffsetDays: 0,
        }),
      )
    ).id;
  // Budi & Cici sudah ber-crew (template siang); Ani belum punya crew.
  const t1 = await mkTemplate(`Siang ${RUN}`, [code("D"), code("D"), "OFF"]);
  t2 = await mkTemplate(`Malam ${RUN}`, [code("N"), code("N"), "OFF", "OFF"]);
  const first = await data<{ approvalCount: number }>(
    await assign(t1, [ids.emp.budi, ids.emp.cici], plusDays(today, 1)),
  );
  expect(first.approvalCount).toBe(0);
});

afterAll(async () => {
  const employees = Object.values(ids.emp);
  const edits = await prisma.rosterEditRequest.findMany({
    where: { employeeId: { in: employees } },
    select: { id: true },
  });
  await prisma.approvalRequest.deleteMany({ where: { subjectId: { in: edits.map((e) => e.id) } } });
  await prisma.rosterEditRequest.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.notification.deleteMany({ where: { recipientAccountId: { in: [] } } });
  const templates = await prisma.rosterTemplate.findMany({
    where: { name: { contains: RUN } },
    select: { patterns: { select: { id: true } } },
  });
  const patternIds = templates.flatMap((t) => t.patterns.map((p) => p.id));
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.crew.deleteMany({ where: { patternId: { in: patternIds } } });
  await prisma.rosterPattern.deleteMany({ where: { id: { in: patternIds } } });
  await prisma.rosterTemplate.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.shift.deleteMany({ where: { id: { in: ids.shifts } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await disconnectPrisma();
});

describe("perubahan roster karyawan ber-crew wajib disetujui (TM-D24)", () => {
  test("isi template: Ani (tanpa crew) langsung berlaku, Budi (ber-crew) diajukan; roster Budi belum berubah", async () => {
    const preview = await data<{
      approvalCount: number;
      assignments: { employeeId: string; needsApproval: boolean }[];
    }>(
      await call("POST", `/roster-custom-templates/${t2}/assign/preview`, h.hr1, {
        workLocationId: ids.location,
        employeeIds: [ids.emp.ani, ids.emp.budi],
        effectiveDate: E,
      }),
    );
    expect(preview.approvalCount).toBe(1);
    expect(
      Object.fromEntries(preview.assignments.map((a) => [a.employeeId, a.needsApproval])),
    ).toEqual({ [ids.emp.ani]: false, [ids.emp.budi]: true });

    expect((await assign(t2, [ids.emp.ani, ids.emp.budi])).status).toBe(200);
    expect(await dayCode(ids.emp.ani, E)).toBe(code("N"));
    // Budi masih template siang (siklus mulai today+1: E = hari ke-4 → indeks 0 = D).
    expect(await dayCode(ids.emp.budi, E)).toBe(code("D"));
    const list = await mine();
    const budi = list.find((e) => e.employee.id === ids.emp.budi);
    expect(budi).toMatchObject({ status: "PENDING" });
    expect(budi?.preview).toHaveLength(14);
    expect(budi?.preview[0]).toEqual({ date: E, from: code("D"), to: code("N") });
  });

  test("selama menunggu, pengajuan baru untuk Budi dilewati", async () => {
    const preview = await data<{ skipped: { employeeId: string; reason: string }[] }>(
      await call("POST", `/roster-custom-templates/${t2}/assign/preview`, h.hr1, {
        workLocationId: ids.location,
        employeeIds: [ids.emp.budi],
        effectiveDate: E,
      }),
    );
    expect(preview.skipped).toEqual([
      expect.objectContaining({
        employeeId: ids.emp.budi,
        reason: expect.stringContaining("menunggu"),
      }),
    ]);
  });

  test("pengaju tidak bisa menyetujui; atasan + HR lain setuju → diterapkan mulai tanggal efektif", async () => {
    const budi = (await mine()).find((e) => e.employee.id === ids.emp.budi) as Edit;
    const approvalId = budi.approval?.id as string;
    const own = await call("POST", `/approvals/${approvalId}/decision`, h.hr1, {
      decision: "APPROVED",
    });
    expect(own.status).not.toBe(200);

    const inbox = await data<Edit[]>(await call("GET", "/roster-edits?scope=inbox", h.mgr));
    expect(inbox.map((e) => e.id)).toContain(budi.id);
    expect(
      (await call("POST", `/approvals/${approvalId}/decision`, h.mgr, { decision: "APPROVED" }))
        .status,
    ).toBe(200);
    expect(await dayCode(ids.emp.budi, E)).toBe(code("D")); // masih menunggu HR
    expect(
      (await call("POST", `/approvals/${approvalId}/decision`, h.hr2, { decision: "APPROVED" }))
        .status,
    ).toBe(200);

    const after = (await mine()).find((e) => e.id === budi.id);
    expect(after).toMatchObject({ status: "APPLIED" });
    expect(await dayCode(ids.emp.budi, E)).toBe(code("N"));
    expect(await dayCode(ids.emp.budi, plusDays(E, 2))).toBe("OFF");
    // Keanggotaan crew siang diakhiri sehari sebelum tanggal efektif.
    const old = await prisma.crewMember.findFirst({
      where: { employeeId: ids.emp.budi, crew: { name: { contains: `Siang ${RUN}` } } },
    });
    expect(old?.endDate?.toISOString().slice(0, 10)).toBe(plusDays(E, -1));
  });

  test("dibatalkan pengaju (HR lain 403) atau ditolak atasan → roster tetap", async () => {
    expect((await assign(t2, [ids.emp.cici])).status).toBe(200);
    let cici = (await mine()).find((e) => e.employee.id === ids.emp.cici && e.status === "PENDING");
    expect((await call("POST", `/roster-edits/${cici?.id}/cancel`, h.hr2)).status).toBe(403);
    const cancelled = await call("POST", `/roster-edits/${cici?.id}/cancel`, h.hr1);
    expect(await data<Edit>(cancelled)).toMatchObject({ status: "CANCELLED" });
    expect(await dayCode(ids.emp.cici, E)).toBe(code("D"));

    expect((await assign(t2, [ids.emp.cici])).status).toBe(200);
    cici = (await mine()).find((e) => e.employee.id === ids.emp.cici && e.status === "PENDING");
    const rejected = await call("POST", `/approvals/${cici?.approval?.id}/decision`, h.mgr, {
      decision: "REJECTED",
      note: "Cici masih dibutuhkan di shift siang",
    });
    expect(rejected.status).toBe(200);
    expect((await mine()).find((e) => e.id === cici?.id)).toMatchObject({ status: "REJECTED" });
    expect(await dayCode(ids.emp.cici, E)).toBe(code("D"));
  });

  test("karyawan tidak bisa melihat semua pengajuan PT", async () => {
    expect(
      (await call("GET", `/roster-edits?scope=all&companyId=${companyId}`, h.emp)).status,
    ).toBe(403);
  });
});
