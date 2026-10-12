import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// Time Management Tahap E — cuti, izin, sakit (D-071). Tahun 2097/2098 dipakai supaya tidak bentrok
// dengan data nyata; pekerjaan jatah global (grant) diuji di unit test engine.
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
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ids = { status: "", department: "", position: "", employees: [] as string[] };
let companyId = "";
let shiftId = "";
const emp = { mgr: "", a: "", b: "" };
let h: Record<"sa" | "hr" | "mgr" | "a" | "b", Record<string, string>>;
const types: Record<string, string> = {};
const holidayIds: string[] = [];
let approvedId = "";

async function balance(employeeId: string, year: number) {
  const sum = await prisma.leaveLedger.aggregate({
    where: { employeeId, year },
    _sum: { days: true },
  });
  return sum._sum.days ?? 0;
}

async function approveBoth(requestId: string) {
  const req = await data<{ approval: { id: string } }>(
    await call("GET", `/leave-requests/${requestId}`, h.mgr),
  );
  for (const who of [h.mgr, h.hr]) {
    expect(
      (await call("POST", `/approvals/${req.approval.id}/decision`, who, { decision: "APPROVED" }))
        .status,
    ).toBe(200);
  }
}

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `LV ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `LV ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `LV ${RUN}`, departmentId: ids.department } })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `LV-${RUN}-${n}`,
          fullName: `Cuti ${RUN} ${n}`,
          joinDate: new Date("2020-01-01T00:00:00Z"),
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
        code: `L${RUN.slice(0, 5)}`,
        name: `Cuti ${RUN}`,
        startMinute: 420,
        endMinute: 1140,
      },
    })
  ).id;
  const roster: [string, string, boolean][] = [
    [emp.a, "2098-03-30", true],
    [emp.a, "2098-03-31", true],
    [emp.a, "2098-04-01", false],
    [emp.a, "2098-04-02", true],
    [emp.a, "2098-04-06", true],
    [emp.b, "2098-05-04", true],
  ];
  for (const [employeeId, date, work] of roster) {
    await prisma.rosterDay.create({
      data: { employeeId, workDate: D(date), shiftId: work ? shiftId : null, source: "MANUAL" },
    });
  }

  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
    b: (await auth.loginAs("EMPLOYEE", { employeeId: emp.b, companies: [companyId] })).headers,
  };
  for (const [date, name, kind] of [
    ["2098-03-31", `Merah ${RUN}`, "NATIONAL"],
    ["2098-05-04", `Bersama ${RUN}`, "COLLECTIVE_LEAVE"],
  ] as const) {
    const res = await call("POST", "/holidays", h.sa, { date, name, kind });
    holidayIds.push((await data<{ id: string }>(res)).id);
  }
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
  await prisma.leaveYear.deleteMany({ where: { year: { in: [2097, 2098] } } });
  await prisma.leaveType.deleteMany({ where: { code: `UJI_${RUN}` } });
  await prisma.holiday.deleteMany({ where: { id: { in: holidayIds } } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.shift.delete({ where: { id: shiftId } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("master jenis & saldo", () => {
  test("jenis bawaan tersedia; karyawan tidak bisa menambah, SA bisa", async () => {
    const list = await data<{ id: string; code: string }[]>(await call("GET", "/leave-types", h.a));
    for (const t of list) types[t.code] = t.id;
    expect(types.CUTI_TAHUNAN).toBeDefined();
    expect(types.SAKIT).toBeDefined();
    const body = {
      code: `UJI_${RUN}`,
      name: "Izin uji",
      category: "PERMIT",
      maxDaysPerRequest: 1,
      documentRequiredAfterDays: null,
      isActive: true,
    };
    expect((await call("POST", "/leave-types", h.a, body)).status).toBe(403);
    expect((await call("POST", "/leave-types", h.sa, body)).status).toBe(200);
    expect((await call("POST", "/leave-types", h.sa, body)).status).toBe(409);
  });

  test("penyesuaian saldo oleh HR PT (alasan wajib); karyawan 403", async () => {
    const adjust = (employeeId: string, year: number, days: number, who = h.hr) =>
      call("POST", "/leave-balances/adjust", who, {
        employeeId,
        year,
        days,
        note: "Saldo awal uji",
      });
    expect((await adjust(emp.a, 2097, 2, h.a)).status).toBe(403);
    expect((await adjust(emp.a, 2097, 2)).status).toBe(200);
    expect((await adjust(emp.a, 2098, 12)).status).toBe(200);
    expect((await adjust(emp.b, 2097, -3)).status).toBe(200);
    expect((await adjust(emp.b, 2098, 2)).status).toBe(200);
    expect(
      (
        await call("POST", "/leave-balances/adjust", h.hr, {
          employeeId: emp.a,
          year: 2098,
          days: 1,
          note: "",
        })
      ).status,
    ).toBe(400);
    expect(await balance(emp.a, 2098)).toBe(12);
  });
});

describe("pengajuan cuti tahunan", () => {
  test("pratinjau: hanya hari kerja roster (OFF & tanggal merah tidak); sisa tahun lalu dulu s.d. 31 Maret", async () => {
    const preview = await data<{ dates: string[]; charges: { year: number; days: number }[] }>(
      await call("POST", "/leave/preview", h.a, {
        leaveTypeId: types.CUTI_TAHUNAN,
        startDate: "2098-03-30",
        endDate: "2098-04-02",
      }),
    );
    expect(preview.dates).toEqual(["2098-03-30", "2098-04-02"]);
    expect(preview.charges.sort((x, y) => x.year - y.year)).toEqual([
      { year: 2097, days: 1 },
      { year: 2098, days: 1 },
    ]);
  });

  test("ajukan → saldo ditahan; bentrok rentang 409; Atasan + HR setuju → terpakai & hari LEAVE", async () => {
    const res = await call("POST", "/leave-requests", h.a, {
      leaveTypeId: types.CUTI_TAHUNAN,
      startDate: "2098-03-30",
      endDate: "2098-04-02",
      reason: "Pulang kampung",
    });
    expect(res.status).toBe(200);
    const created = await data<{ id: string; days: number; status: string }>(res);
    approvedId = created.id;
    expect(created).toMatchObject({ days: 2, status: "PENDING" });
    expect(await balance(emp.a, 2097)).toBe(1);
    expect(await balance(emp.a, 2098)).toBe(11);
    expect(
      (
        await call("POST", "/leave-requests", h.a, {
          leaveTypeId: types.CUTI_TAHUNAN,
          startDate: "2098-04-02",
          endDate: "2098-04-02",
          reason: "Dobel",
        })
      ).status,
    ).toBe(409);
    // Rekan satu tim tidak bisa melihat pengajuan orang lain.
    expect((await call("GET", `/leave-requests/${created.id}`, h.b)).status).toBe(404);

    await approveBoth(created.id);
    const done = await data<{ status: string }>(
      await call("GET", `/leave-requests/${created.id}`, h.a),
    );
    expect(done.status).toBe("APPROVED");
    expect(await balance(emp.a, 2097)).toBe(1);
    expect(await balance(emp.a, 2098)).toBe(11);
    const used = await prisma.leaveLedger.aggregate({
      where: { requestId: created.id, kind: "USE" },
      _sum: { days: true },
    });
    expect(used._sum.days).toBe(-2);
    const days = await prisma.attendanceDay.findMany({
      where: { employeeId: emp.a, status: "LEAVE" },
      select: { workDate: true },
      orderBy: { workDate: "asc" },
    });
    expect(days.map((d) => d.workDate.toISOString().slice(0, 10))).toEqual([
      "2098-03-30",
      "2098-04-02",
    ]);
  });

  test("ditolak Atasan (alasan wajib) → tahanan dikembalikan", async () => {
    const created = await data<{ id: string }>(
      await call("POST", "/leave-requests", h.a, {
        leaveTypeId: types.CUTI_TAHUNAN,
        startDate: "2098-04-06",
        endDate: "2098-04-06",
        reason: "Urusan keluarga",
      }),
    );
    expect(await balance(emp.a, 2098)).toBe(10);
    const req = await data<{ approval: { id: string } }>(
      await call("GET", `/leave-requests/${created.id}`, h.mgr),
    );
    const decide = (body: unknown) =>
      call("POST", `/approvals/${req.approval.id}/decision`, h.mgr, body);
    expect((await decide({ decision: "REJECTED" })).status).toBe(400);
    expect((await decide({ decision: "REJECTED", note: "Jadwal produksi padat" })).status).toBe(
      200,
    );
    expect(await balance(emp.a, 2098)).toBe(11);
  });
});

describe("sakit & pembatalan", () => {
  test("sakit 2 hari wajib surat dokter; lampiran milik sendiri; batal mengembalikan status", async () => {
    await prisma.rosterDay.createMany({
      data: ["2098-06-01", "2098-06-02"].map((date) => ({
        employeeId: emp.a,
        workDate: D(date),
        shiftId,
        source: "MANUAL" as const,
      })),
    });
    const body = {
      leaveTypeId: types.SAKIT,
      startDate: "2098-06-01",
      endDate: "2098-06-02",
      reason: "Demam",
    };
    expect((await call("POST", "/leave-requests", h.a, body)).status).toBe(422);
    const upload = await data<{ path: string }>(
      await call("POST", "/leave/attachment-upload", h.a, { contentType: "application/pdf" }),
    );
    expect(upload.path).toContain(`leave/${emp.a}/`);
    fake.putObject("leave-attachments", upload.path, {
      size: 80_000,
      contentType: "application/pdf",
    });
    const res = await call("POST", "/leave-requests", h.a, {
      ...body,
      attachmentPath: upload.path,
    });
    expect(res.status).toBe(200);
    const created = await data<{ id: string }>(res);
    // Sakit tidak memotong saldo cuti.
    expect(await balance(emp.a, 2098)).toBe(11);
    expect((await call("POST", `/leave-requests/${created.id}/cancel`, h.b)).status).toBe(404);
    const cancelled = await data<{ status: string }>(
      await call("POST", `/leave-requests/${created.id}/cancel`, h.a),
    );
    expect(cancelled.status).toBe("CANCELLED");
  });
});

describe("pekerjaan cuti", () => {
  test("cuti bersama di hari kerja roster tanpa absen → −1 cuti, sekali saja", async () => {
    expect(
      (await call("POST", "/leave-jobs", h.hr, { job: "collective", value: "2098-05-04" })).status,
    ).toBe(403);
    for (let i = 0; i < 2; i++) {
      expect(
        (await call("POST", "/leave-jobs", h.sa, { job: "collective", value: "2098-05-04" }))
          .status,
      ).toBe(200);
    }
    const entries = await prisma.leaveLedger.findMany({
      where: { employeeId: emp.b, kind: "COLLECTIVE" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.year).toBe(2098);
  });

  test("pelunasan hutang akhir Januari dari jatah baru; sisa tahun lalu hangus 1 April", async () => {
    // emp.b: 2097 = −3; 2098 = 2 − 1 (cuti bersama) = 1 → lunas 1, sisa hutang 2.
    await call("POST", "/leave-jobs", h.sa, { job: "settle", value: "2098" });
    expect(await balance(emp.b, 2098)).toBe(0);
    expect(await balance(emp.b, 2097)).toBe(-2);
    // emp.a: sisa 2097 = 1 → hangus.
    await call("POST", "/leave-jobs", h.sa, { job: "expire", value: "2098" });
    expect(await balance(emp.a, 2097)).toBe(0);
    expect(await balance(emp.b, 2097)).toBe(-2);
  });

  test("tabel saldo per PT (HR) & saldo saya", async () => {
    const table = await data<{ employee: { id: string }; balance: number; used: number }[]>(
      await call("GET", `/leave-balances?companyId=${companyId}&year=2098&q=Cuti ${RUN}`, h.hr),
    );
    const rowA = table.find((r) => r.employee.id === emp.a);
    expect(rowA).toMatchObject({ balance: 11, used: 1 });
    expect(
      (await call("GET", `/leave-balances?companyId=${companyId}&year=2098`, h.a)).status,
    ).toBe(403);
    const mine = await data<{ requests: { id: string }[] }>(await call("GET", "/leave/me", h.a));
    expect(mine.requests.some((r) => r.id === approvedId)).toBe(true);
  });
});
