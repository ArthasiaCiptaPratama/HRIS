import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// Time Management Tahap B — roster tambang (D-068).
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
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const ids = {
  status: "",
  department: "",
  position: "",
  location: "",
  otherCompany: "",
  employees: [] as string[],
};
let companyId = "";
const emp: Record<"mgr" | "a" | "b" | "c", string> = { mgr: "", a: "", b: "", c: "" };
let h: Record<"sa" | "hr" | "hrOther" | "mgr" | "a" | "b", Record<string, string>>;
let shiftD = ""; // id shift siang uji (dipakai untuk memastikan pembuatan berhasil)
let crewId = "";

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.otherCompany = await createTestCompany(`R${RUN}`, `PT Roster ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `RS ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `RS ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `RS ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: {
        name: `Site RS ${RUN}`,
        city: "Tanah Laut",
        latitude: -3.8,
        longitude: 115.4,
        radiusM: 500,
      },
    })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `RS-${RUN}-${n}`,
          fullName: `Roster ${RUN} ${n}`,
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
  emp.b = await mk("B", emp.mgr);
  emp.c = await mk("C");
  ids.employees.push(emp.a, emp.b, emp.c, emp.mgr);
  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN")).headers,
    hrOther: (await auth.loginAs("HR_ADMIN", { companies: [ids.otherCompany] })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
    b: (await auth.loginAs("EMPLOYEE", { employeeId: emp.b, companies: [companyId] })).headers,
  };
});

afterAll(async () => {
  await prisma.approvalRequest.deleteMany({
    where: { requesterEmployeeId: { in: ids.employees } },
  });
  await prisma.rosterChangeRequest.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crew.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.rosterPattern.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.shift.deleteMany({ where: { name: { contains: RUN } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.company.delete({ where: { id: ids.otherCompany } });
  await disconnectPrisma();
});

const shift = (code: string, start: number, end: number) => ({
  companyId,
  code,
  name: `${code} ${RUN}`,
  startMinute: start,
  endMinute: end,
  checkInOpenMin: 60,
  lateToleranceMin: 15,
  earlyLeaveToleranceMin: 15,
  checkOutCloseMin: 240,
});

describe("shift, pola, crew", () => {
  test("shift: HR PT boleh; HR PT lain & karyawan 403; kode ganda 409; jam sama 422; lintas malam terbaca", async () => {
    // Kode unik per run supaya tidak bentrok data lain di PT ACP.
    const d = shift(`D${RUN.slice(0, 4)}`, 7 * 60, 19 * 60);
    expect((await call("POST", "/shifts", h.hrOther, d)).status).toBe(403);
    expect((await call("POST", "/shifts", h.a, d)).status).toBe(403);
    const created = await call("POST", "/shifts", h.hr, d);
    expect(created.status).toBe(200);
    shiftD = (await data<{ id: string }>(created)).id;
    expect(shiftD).toBeTruthy();
    expect((await call("POST", "/shifts", h.hr, d)).status).toBe(409);
    expect((await call("POST", "/shifts", h.hr, shift("X1", 60, 60))).status).toBe(422);
    const night = await data<{ crossesMidnight: boolean }>(
      await call("POST", "/shifts", h.sa, shift(`N${RUN.slice(0, 4)}`, 19 * 60, 7 * 60)),
    );
    expect(night.crossesMidnight).toBe(true);
    const list = await data<{ code: string }[]>(
      await call("GET", `/shifts?companyId=${companyId}`, h.a),
    );
    expect(list.some((s) => s.code === d.code)).toBe(true);
  });

  test("pola: kode tak dikenal 422; crew dibuat; anggota → hari roster terbentuk dari hari ini", async () => {
    const code = `D${RUN.slice(0, 4)}`;
    expect(
      (
        await call("POST", "/roster-patterns", h.hr, {
          companyId,
          name: `Bad ${RUN}`,
          steps: ["ZZ"],
        })
      ).status,
    ).toBe(422);
    const pattern = await data<{ id: string; workDays: number }>(
      await call("POST", "/roster-patterns", h.hr, {
        companyId,
        name: `2/1 ${RUN}`,
        steps: [code, code, "OFF"],
      }),
    );
    expect(pattern.workDays).toBe(2);
    const crew = await data<{ id: string }>(
      await call("POST", "/crews", h.hr, {
        companyId,
        workLocationId: ids.location,
        name: `Crew A ${RUN}`,
        patternId: pattern.id,
        cycleStartDate: today,
      }),
    );
    crewId = crew.id;
    // Karyawan PT lain/tidak aktif ditolak.
    const res = await call("PUT", `/crews/${crewId}/members`, h.hr, {
      employeeIds: [emp.a, emp.b],
      effectiveDate: today,
    });
    expect(res.status).toBe(200);
    expect((await data<{ members: unknown[] }>(res)).members).toHaveLength(2);
    const roster = await data<{ date: string; code: string }[]>(
      await call("GET", `/roster/employees/${emp.a}?from=${today}&to=${addDays(today, 5)}`, h.a),
    );
    expect(roster.map((d) => d.code)).toEqual([code, code, "OFF", code, code, "OFF"]);
  });
});

describe("grid & akses", () => {
  const month = today.slice(0, 7);
  test("HR melihat anggota crew; MANAGER timnya; karyawan dirinya; HR PT lain 403", async () => {
    const hrGrid = await data<{ employees: { id: string }[]; canEdit: boolean }>(
      await call("GET", `/roster?companyId=${companyId}&month=${month}&crewId=${crewId}`, h.hr),
    );
    expect(hrGrid.employees.map((e) => e.id).sort()).toEqual([emp.a, emp.b].sort());
    expect(hrGrid.canEdit).toBe(true);
    const mgrGrid = await data<{ employees: { id: string }[]; canEdit: boolean }>(
      await call("GET", `/roster?companyId=${companyId}&month=${month}`, h.mgr),
    );
    expect(mgrGrid.employees.map((e) => e.id).sort()).toEqual([emp.a, emp.b, emp.mgr].sort());
    expect(mgrGrid.canEdit).toBe(false);
    const own = await data<{ employees: { id: string }[] }>(
      await call("GET", `/roster?companyId=${companyId}&month=${month}`, h.a),
    );
    expect(own.employees.map((e) => e.id)).toEqual([emp.a]);
    expect(
      (await call("GET", `/roster?companyId=${companyId}&month=${month}`, h.hrOther)).status,
    ).toBe(403);
    expect(
      (await call("GET", `/roster/employees/${emp.b}?from=${today}&to=${today}`, h.a)).status,
    ).toBe(404);
  });

  test("edit sel manual tidak ditimpa pembangkitan ulang pola", async () => {
    const date = addDays(today, 2); // OFF di pola
    const code = `N${RUN.slice(0, 4)}`;
    expect(
      (
        await call("PUT", "/roster/cells", h.hr, {
          companyId,
          cells: [{ employeeId: emp.a, date, code }],
        })
      ).status,
    ).toBe(200);
    // Pembangkitan ulang (ubah crew tanpa mengubah isi) tidak menimpa sel manual.
    await call("PUT", `/crews/${crewId}/members`, h.hr, {
      employeeIds: [emp.a, emp.b],
      effectiveDate: today,
    });
    const day = await data<{ code: string; source: string }[]>(
      await call("GET", `/roster/employees/${emp.a}?from=${date}&to=${date}`, h.hr),
    );
    expect(day[0]).toMatchObject({ code, source: "MANUAL" });
    expect(
      (
        await call("PUT", "/roster/cells", h.hr, {
          companyId,
          cells: [{ employeeId: emp.a, date, code: "QQ" }],
        })
      ).status,
    ).toBe(422);
  });

  test("import: pratinjau melaporkan NIP tak dikenal; simpan ditolak sampai bersih", async () => {
    const code = `D${RUN.slice(0, 4)}`;
    const rows = [
      { employeeNumber: `RS-${RUN}-C`, date: addDays(today, 1), code },
      { employeeNumber: "TIDAK-ADA", date: addDays(today, 1), code },
    ];
    const preview = await data<{ total: number; valid: number }>(
      await call("POST", "/roster/import/preview", h.hr, { companyId, rows }),
    );
    expect(preview).toMatchObject({ total: 2, valid: 1 });
    expect((await call("POST", "/roster/import/commit", h.hr, { companyId, rows })).status).toBe(
      422,
    );
    const ok = await call("POST", "/roster/import/commit", h.hr, { companyId, rows: [rows[0]] });
    expect(await data<{ saved: number }>(ok)).toEqual({ saved: 1 });
  });
});

describe("perubahan & tukar shift (rekan → atasan + HR)", () => {
  test("ubah satu tanggal: disetujui atasan + HR → roster berubah (sumber CHANGE)", async () => {
    const date = addDays(today, 3); // kerja di pola
    const created = await data<{ id: string; status: string; approval: { id: string } }>(
      await call("POST", "/roster-changes", h.a, {
        date,
        toCode: "OFF",
        reason: "Urusan keluarga",
      }),
    );
    expect(created.status).toBe("PENDING");
    const inbox = await data<{ id: string }[]>(
      await call("GET", "/roster-changes?scope=inbox", h.mgr),
    );
    expect(inbox.some((c) => c.id === created.id)).toBe(true);
    await call("POST", `/approvals/${created.approval.id}/decision`, h.mgr, {
      decision: "APPROVED",
    });
    await call("POST", `/approvals/${created.approval.id}/decision`, h.hr, {
      decision: "APPROVED",
    });
    const day = await data<{ code: string; source: string }[]>(
      await call("GET", `/roster/employees/${emp.a}?from=${date}&to=${date}`, h.a),
    );
    expect(day[0]).toMatchObject({ code: "OFF", source: "CHANGE" });
  });

  test("tukar: rekan setuju dulu, lalu approval; kedua roster bertukar", async () => {
    const date = addDays(today, 4);
    await call("PUT", "/roster/cells", h.hr, {
      companyId,
      cells: [{ employeeId: emp.b, date, code: "OFF" }],
    });
    const created = await data<{ id: string; status: string }>(
      await call("POST", "/roster-changes", h.a, {
        date,
        peerEmployeeId: emp.b,
        reason: "Tukar jadwal",
      }),
    );
    expect(created.status).toBe("AWAITING_PEER");
    // Hanya rekan yang bisa menjawab.
    expect(
      (await call("POST", `/roster-changes/${created.id}/peer-response`, h.mgr, { accept: true }))
        .status,
    ).toBe(404);
    const accepted = await data<{ status: string; approval: { id: string } }>(
      await call("POST", `/roster-changes/${created.id}/peer-response`, h.b, { accept: true }),
    );
    expect(accepted.status).toBe("PENDING");
    await call("POST", `/approvals/${accepted.approval.id}/decision`, h.mgr, {
      decision: "APPROVED",
    });
    await call("POST", `/approvals/${accepted.approval.id}/decision`, h.hr, {
      decision: "APPROVED",
    });
    const a = await data<{ code: string }[]>(
      await call("GET", `/roster/employees/${emp.a}?from=${date}&to=${date}`, h.hr),
    );
    const b = await data<{ code: string }[]>(
      await call("GET", `/roster/employees/${emp.b}?from=${date}&to=${date}`, h.hr),
    );
    expect(a[0]?.code).toBe("OFF");
    expect(b[0]?.code).toBe(`D${RUN.slice(0, 4)}`);
  });

  test("tanggal lampau ditolak; batal oleh pengaju", async () => {
    expect(
      (
        await call("POST", "/roster-changes", h.a, {
          date: addDays(today, -1),
          toCode: "OFF",
          reason: "lama",
        })
      ).status,
    ).toBe(422);
    const created = await data<{ id: string }>(
      await call("POST", "/roster-changes", h.a, {
        date: addDays(today, 5),
        toCode: `N${RUN.slice(0, 4)}`,
        reason: "Batal nanti",
      }),
    );
    const cancelled = await data<{ status: string }>(
      await call("POST", `/roster-changes/${created.id}/cancel`, h.a),
    );
    expect(cancelled.status).toBe("CANCELLED");
  });
});
