import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { leaveExitSettlementSchema as exitSettlementSchema } from "../../../src/modules/leave/leave.contract.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// Time Management Tahap E — cuti, izin, sakit (D-072). Tahun 2097/2098 dipakai supaya tidak bentrok
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

const ids = { status: "", department: "", position: "", grade: "", employees: [] as string[] };
let companyId = "";
let shiftId = "";
const emp = { mgr: "", a: "", b: "" };
let h: Record<"sa" | "hr" | "mgr" | "a" | "b", Record<string, string>>;
const types: Record<string, string> = {};
const holidayIds: string[] = [];
let approvedId = "";
let rejectedId = "";

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
  await prisma.leaveYear.deleteMany({ where: { year: { in: [2095, 2096, 2097, 2098] } } });
  await prisma.leaveExitSettlement.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.attendancePeriod.deleteMany({ where: { companyId, month: "2098-08" } });
  if (ids.grade) {
    await prisma.gradeWage.deleteMany({ where: { gradeId: ids.grade } });
  }
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
  if (ids.grade) await prisma.grade.delete({ where: { id: ids.grade } });
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

  // Master Cuti (kuota per tahun) bukan untuk karyawan biasa (pemilik projek 2026-10-19);
  // jenis cuti tetap terbaca karyawan untuk form pengajuan.
  test("Master Cuti per tahun: karyawan 403; SA, HR, MANAGER boleh melihat", async () => {
    expect((await call("GET", "/leave-years", h.a)).status).toBe(403);
    for (const who of [h.sa, h.hr, h.mgr]) {
      expect((await call("GET", "/leave-years", who)).status).toBe(200);
    }
    expect((await call("GET", "/leave-types", h.a)).status).toBe(200);
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
  test("pratinjau: hanya hari kerja roster (OFF & tanggal merah tidak); TM-D9: seluruhnya saldo tahun mulai", async () => {
    const preview = await data<{ dates: string[]; charges: { year: number; days: number }[] }>(
      await call("POST", "/leave/preview", h.a, {
        leaveTypeId: types.CUTI_TAHUNAN,
        startDate: "2098-03-30",
        endDate: "2098-04-02",
      }),
    );
    expect(preview.dates).toEqual(["2098-03-30", "2098-04-02"]);
    // Sisa 2097 tidak lagi dipakai lebih dulu (D-072 lama) — hangus 31 Des 2097 (TM-D9).
    expect(preview.charges).toEqual([{ year: 2098, days: 2 }]);
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
    expect(await balance(emp.a, 2097)).toBe(2);
    expect(await balance(emp.a, 2098)).toBe(10);
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
    expect(await balance(emp.a, 2097)).toBe(2);
    expect(await balance(emp.a, 2098)).toBe(10);
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
    rejectedId = created.id;
    expect(await balance(emp.a, 2098)).toBe(9);
    const req = await data<{ approval: { id: string } }>(
      await call("GET", `/leave-requests/${created.id}`, h.mgr),
    );
    const decide = (body: unknown) =>
      call("POST", `/approvals/${req.approval.id}/decision`, h.mgr, body);
    expect((await decide({ decision: "REJECTED" })).status).toBe(400);
    expect((await decide({ decision: "REJECTED", note: "Jadwal produksi padat" })).status).toBe(
      200,
    );
    expect(await balance(emp.a, 2098)).toBe(10);
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
    expect(await balance(emp.a, 2098)).toBe(10);
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

  test("pelunasan hutang akhir Januari dari jatah baru; sisa tahun lalu hangus (TM-D9: 31 Desember)", async () => {
    // emp.b: 2097 = −3; 2098 = 2 − 1 (cuti bersama) = 1 → lunas 1, sisa hutang 2.
    await call("POST", "/leave-jobs", h.sa, { job: "settle", value: "2098" });
    expect(await balance(emp.b, 2098)).toBe(0);
    expect(await balance(emp.b, 2097)).toBe(-2);
    // emp.a: sisa 2097 = 2 → hangus 31 Desember 2097.
    await call("POST", "/leave-jobs", h.sa, { job: "expire", value: "2098" });
    expect(await balance(emp.a, 2097)).toBe(0);
    expect(await balance(emp.b, 2097)).toBe(-2);
    const expire = await prisma.leaveLedger.findFirst({
      where: { employeeId: emp.a, year: 2097, kind: "EXPIRE" },
    });
    expect(expire?.note).toBe("Sisa 2097 hangus 31 Desember 2097");
  });

  test("tabel saldo per PT (HR) & saldo saya", async () => {
    const table = await data<{ employee: { id: string }; balance: number; used: number }[]>(
      await call("GET", `/leave-balances?companyId=${companyId}&year=2098&q=Cuti ${RUN}`, h.hr),
    );
    const rowA = table.find((r) => r.employee.id === emp.a);
    expect(rowA).toMatchObject({ balance: 10, used: 2 });
    expect(
      (await call("GET", `/leave-balances?companyId=${companyId}&year=2098`, h.a)).status,
    ).toBe(403);
    const mine = await data<{ requests: { id: string }[] }>(await call("GET", "/leave/me", h.a));
    expect(mine.requests.some((r) => r.id === approvedId)).toBe(true);
  });
});

// Izin boleh melebihi jatah jenisnya; kelebihannya memotong cuti tahunan, saldo boleh minus
// (pemilik projek 2026-10-19). Jenis uji `UJI_<RUN>`: izin, jatah 1 hari per pengajuan.
describe("izin melebihi jatah → kelebihan memotong cuti tahunan", () => {
  const WORK = ["2098-07-06", "2098-07-07", "2098-07-08"];
  test("pratinjau & ajukan 3 hari: 1 hari izin + 2 hari cuti tahunan; tolak → kembali; setuju → terpakai", async () => {
    await prisma.rosterDay.createMany({
      data: [...WORK, "2098-07-13", "2098-07-14", "2098-07-15"].map((date) => ({
        employeeId: emp.a,
        workDate: D(date),
        shiftId,
        source: "MANUAL" as const,
      })),
    });
    const list = await data<{ id: string; code: string }[]>(await call("GET", "/leave-types", h.a));
    const permit = list.find((x) => x.code === `UJI_${RUN}`)?.id as string;
    types[`UJI_${RUN}`] = permit;
    const preview = await data<{ days: number; annualDays: number }>(
      await call("POST", "/leave/preview", h.a, {
        leaveTypeId: permit,
        startDate: WORK[0],
        endDate: WORK[2],
      }),
    );
    expect(preview).toMatchObject({ days: 3, annualDays: 2 });

    const before = await balance(emp.a, 2098);
    const first = await data<{ id: string; days: number; annualDays: number }>(
      await call("POST", "/leave-requests", h.a, {
        leaveTypeId: permit,
        startDate: WORK[0],
        endDate: WORK[2],
        reason: "Urusan keluarga di luar kota",
      }),
    );
    expect(first).toMatchObject({ days: 3, annualDays: 2 });
    expect(await balance(emp.a, 2098)).toBe(before - 2);
    const req = await data<{ approval: { id: string } }>(
      await call("GET", `/leave-requests/${first.id}`, h.mgr),
    );
    await call("POST", `/approvals/${req.approval.id}/decision`, h.mgr, {
      decision: "REJECTED",
      note: "Jadwal padat",
    });
    expect(await balance(emp.a, 2098)).toBe(before);

    const second = await data<{ id: string; annualDays: number }>(
      await call("POST", "/leave-requests", h.a, {
        leaveTypeId: permit,
        startDate: "2098-07-13",
        endDate: "2098-07-15",
        reason: "Urusan keluarga di luar kota",
      }),
    );
    expect(second.annualDays).toBe(2);
    await approveBoth(second.id);
    expect(await balance(emp.a, 2098)).toBe(before - 2);
    const used = await prisma.leaveLedger.aggregate({
      where: { requestId: second.id, kind: "USE" },
      _sum: { days: true },
    });
    expect(used._sum.days).toBe(-2);
  });

  test("izin dalam jatah tidak memotong cuti tahunan", async () => {
    const preview = await data<{ annualDays: number }>(
      await call("POST", "/leave/preview", h.a, {
        leaveTypeId: types[`UJI_${RUN}`],
        startDate: "2098-07-06",
        endDate: "2098-07-06",
      }),
    );
    expect(preview.annualDays).toBe(0);
  });
});

// Keterangan & berkas per jenis izin (diatur SA); lampiran yang tidak diwajibkan tetap opsional.
describe("keterangan & berkas per jenis izin", () => {
  type T = {
    id: string;
    code: string;
    description: string | null;
    documentLabel: string | null;
    documentRequiredAfterDays: number | null;
  };
  test("jenis bawaan membawa keterangan & berkas; SA mengubahnya; wajib/opsional tidak berubah", async () => {
    const list = await data<T[]>(await call("GET", "/leave-types", h.a));
    const duka = list.find((x) => x.code === "IZIN_DUKA") as T;
    expect(duka.description).toContain("meninggal");
    expect(duka.documentLabel).toBe("Surat keterangan kematian");
    expect(duka.documentRequiredAfterDays).toBeNull(); // tetap opsional

    const custom = list.find((x) => x.code === `UJI_${RUN}`) as T;
    const body = {
      code: `UJI_${RUN}`,
      name: "Izin uji",
      category: "PERMIT",
      maxDaysPerRequest: 1,
      documentRequiredAfterDays: null,
      isActive: true,
      description: "Izin khusus uji coba.",
      documentLabel: "Surat tugas",
    };
    expect((await call("PUT", `/leave-types/${custom.id}`, h.a, body)).status).toBe(403);
    const saved = await data<T>(await call("PUT", `/leave-types/${custom.id}`, h.sa, body));
    expect(saved).toMatchObject({
      description: "Izin khusus uji coba.",
      documentLabel: "Surat tugas",
      documentRequiredAfterDays: null,
    });
    // Tanpa lampiran tetap boleh (opsional).
    const preview = await data<{ documentRequired: boolean }>(
      await call("POST", "/leave/preview", h.a, {
        leaveTypeId: custom.id,
        startDate: "2098-07-06",
        endDate: "2098-07-06",
      }),
    );
    expect(preview.documentRequired).toBe(false);
  });
});

// TM-D9 (grill pemilik projek 2026-10-21): hangus 31 Des, saldo tahun mulai, pengajuan ulang ≤ 6 bulan,
// tahanan dilepas setelah hangus, pelunasan tanpa tahanan, cuti disetujui setelah tutup periode, hak keluar.
describe("TM-D9 aturan cuti tahunan baru", () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const lastYear = Number(today.slice(0, 4)) - 1;

  test("cuti lintas tahun 30 Des – 4 Jan seluruhnya memakai saldo tahun mulai", async () => {
    await prisma.rosterDay.createMany({
      data: ["2098-12-30", "2098-12-31", "2099-01-04"].map((date) => ({
        employeeId: emp.a,
        workDate: D(date),
        shiftId,
        source: "MANUAL" as const,
      })),
    });
    const preview = await data<{ charges: { year: number; days: number }[] }>(
      await call("POST", "/leave/preview", h.a, {
        leaveTypeId: types.CUTI_TAHUNAN,
        startDate: "2098-12-30",
        endDate: "2099-01-04",
      }),
    );
    // 30–31 Des (roster) + 1–2 Jan (tanpa roster → hari kerja Senin–Jumat) + 4 Jan (roster) = 5 hari.
    expect(preview.charges).toEqual([{ year: 2098, days: 5 }]);
  });

  test("tanggal di tahun yang saldonya sudah hangus → pengajuan cuti tahunan ditolak", async () => {
    const date = `${lastYear}-12-15`;
    await prisma.rosterDay.create({
      data: { employeeId: emp.a, workDate: D(date), shiftId, source: "MANUAL" },
    });
    const preview = await data<{ expiredYear: number | null }>(
      await call("POST", "/leave/preview", h.a, {
        leaveTypeId: types.CUTI_TAHUNAN,
        startDate: date,
        endDate: date,
      }),
    );
    expect(preview.expiredYear).toBe(lastYear);
    const res = await call("POST", "/leave-requests", h.a, {
      leaveTypeId: types.CUTI_TAHUNAN,
      startDate: date,
      endDate: date,
      reason: "Mundur ke tahun hangus",
    });
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("sudah hangus");
  });

  test("pengajuan ulang dari yang ditolak: ≤ 6 bulan, tanggal ke depan, sekali saja; pemutus melihat alasan tolak", async () => {
    const mineBefore = await data<{
      requests: { id: string; canResubmit: boolean; rejectionNote: string | null }[];
    }>(await call("GET", "/leave/me", h.a));
    const original = mineBefore.requests.find((r) => r.id === rejectedId);
    expect(original).toMatchObject({ canResubmit: true, rejectionNote: "Jadwal produksi padat" });
    expect(mineBefore.requests.find((r) => r.id === approvedId)?.canResubmit).toBe(false);

    await prisma.rosterDay.create({
      data: { employeeId: emp.a, workDate: D("2098-04-13"), shiftId, source: "MANUAL" },
    });
    const body = (extra: Record<string, unknown>) => ({
      leaveTypeId: types.CUTI_TAHUNAN,
      startDate: "2098-04-13",
      endDate: "2098-04-13",
      reason: "Ajukan ulang urusan keluarga",
      ...extra,
    });
    // Bukan pengajuan yang ditolak / milik orang lain / tanggal tidak ke depan.
    expect(
      (await call("POST", "/leave-requests", h.a, body({ resubmitOfId: approvedId }))).status,
    ).toBe(422);
    await prisma.rosterDay.create({
      data: { employeeId: emp.b, workDate: D("2098-04-13"), shiftId, source: "MANUAL" },
    });
    expect(
      (await call("POST", "/leave-requests", h.b, body({ resubmitOfId: rejectedId }))).status,
    ).toBe(404);
    expect(
      (
        await call("POST", "/leave-requests", h.a, {
          ...body({ resubmitOfId: rejectedId }),
          startDate: today,
          endDate: today,
          leaveTypeId: types.SAKIT,
        })
      ).status,
    ).toBe(422);
    // Lewat 6 bulan sejak ditolak → ditolak.
    const decidedAt = (await prisma.leaveRequest.findUnique({ where: { id: rejectedId } }))
      ?.decidedAt;
    await prisma.leaveRequest.update({
      where: { id: rejectedId },
      data: { decidedAt: new Date(Date.now() - 200 * 86_400_000) },
    });
    const late = await call("POST", "/leave-requests", h.a, body({ resubmitOfId: rejectedId }));
    expect(late.status).toBe(422);
    expect(JSON.stringify(await late.json())).toContain("Batas pengajuan ulang");
    await prisma.leaveRequest.update({ where: { id: rejectedId }, data: { decidedAt } });

    const res = await call("POST", "/leave-requests", h.a, body({ resubmitOfId: rejectedId }));
    expect(res.status).toBe(200);
    const created = await data<{
      id: string;
      resubmittedFrom: { id: string; rejectionNote: string | null } | null;
    }>(res);
    expect(created.resubmittedFrom).toMatchObject({
      id: rejectedId,
      rejectionNote: "Jadwal produksi padat",
    });
    // Pemutus (atasan) melihat riwayat penolakan; approval penuh lagi.
    const asMgr = await data<{
      resubmittedFrom: { rejectionNote: string | null } | null;
      approval: { steps: { kind: string; decision: string }[] };
    }>(await call("GET", `/leave-requests/${created.id}`, h.mgr));
    expect(asMgr.resubmittedFrom?.rejectionNote).toBe("Jadwal produksi padat");
    expect(asMgr.approval.steps.map((st) => st.decision)).toEqual(["PENDING", "PENDING"]);
    // Sekali saja per penolakan.
    await prisma.rosterDay.create({
      data: { employeeId: emp.a, workDate: D("2098-04-14"), shiftId, source: "MANUAL" },
    });
    expect(
      (
        await call("POST", "/leave-requests", h.a, {
          ...body({ resubmitOfId: rejectedId }),
          startDate: "2098-04-14",
          endDate: "2098-04-14",
        })
      ).status,
    ).toBe(409);
    const mineAfter = await data<{ requests: { id: string; canResubmit: boolean }[] }>(
      await call("GET", "/leave/me", h.a),
    );
    expect(mineAfter.requests.find((r) => r.id === rejectedId)?.canResubmit).toBe(false);
  });

  /** Pengajuan PENDING buatan langsung (untuk tahun lampau) + tahanannya. */
  async function pendingWithHold(employeeId: string, year: number, days: number) {
    const req = await prisma.leaveRequest.create({
      data: {
        employeeId,
        companyId,
        leaveTypeId: types.CUTI_TAHUNAN as string,
        category: "ANNUAL",
        startDate: D(`${year}-11-02`),
        endDate: D(`${year}-11-03`),
        workDates: [D(`${year}-11-02`), D(`${year}-11-03`)],
        days,
        reason: "Uji tahanan tahun hangus",
        createdByEmployeeId: employeeId,
      },
    });
    await prisma.leaveLedger.create({
      data: { employeeId, companyId, year, kind: "HOLD", days: -days, requestId: req.id },
    });
    return req.id;
  }

  test("tahanan dilepas setelah saldo hangus tidak menghidupkan saldo; hutang nyata tetap hutang", async () => {
    const y = lastYear - 1;
    // emp.b tahun y: hanya tahanan 2 hari (saldo 0 setelah hangus) → batal → tetap 0.
    await prisma.leaveLedger.create({
      data: { employeeId: emp.b, companyId, year: y, kind: "GRANT", days: 2 },
    });
    const first = await pendingWithHold(emp.b, y, 2);
    expect((await call("POST", `/leave-requests/${first}/cancel`, h.b)).status).toBe(200);
    expect(await balance(emp.b, y)).toBe(0);
    const expired = await prisma.leaveLedger.findFirst({
      where: { requestId: first, kind: "EXPIRE" },
    });
    expect(expired?.days).toBe(-2);
    // emp.mgr tahun y: hutang nyata −1 + tahanan 2 → batal → saldo −1 (tidak dihanguskan).
    await prisma.leaveLedger.create({
      data: { employeeId: emp.mgr, companyId, year: y, kind: "ADJUST", days: -1, note: "uji" },
    });
    const second = await pendingWithHold(emp.mgr, y, 2);
    const mgrHeaders = h.mgr;
    expect((await call("POST", `/leave-requests/${second}/cancel`, mgrHeaders)).status).toBe(200);
    expect(await balance(emp.mgr, y)).toBe(-1);
  });

  test("pelunasan hutang Januari tidak menghitung tahanan pengajuan yang masih menunggu", async () => {
    // emp.mgr 2095: hanya tahanan 3 hari (menunggu) → bukan hutang; 2096 jatah 5.
    await pendingWithHold(emp.mgr, 2095, 3);
    await prisma.leaveLedger.create({
      data: { employeeId: emp.mgr, companyId, year: 2096, kind: "GRANT", days: 5 },
    });
    await call("POST", "/leave-jobs", h.sa, { job: "settle", value: "2096" });
    expect(await balance(emp.mgr, 2096)).toBe(5);
    expect(
      await prisma.leaveLedger.count({
        where: { employeeId: emp.mgr, kind: "SETTLE", year: 2096 },
      }),
    ).toBe(0);
  });

  test("cuti disetujui setelah periode ditutup: Alpha → CUTI berlabel LEAVE_AFTER_CLOSE", async () => {
    const date = "2098-08-03";
    await prisma.rosterDay.create({
      data: { employeeId: emp.b, workDate: D(date), shiftId, source: "MANUAL" },
    });
    await prisma.attendanceDay.create({
      data: {
        employeeId: emp.b,
        companyId,
        managerEmployeeId: emp.mgr,
        workDate: D(date),
        status: "ALPHA",
        labels: ["NO_ATTENDANCE"],
      },
    });
    const created = await data<{ id: string }>(
      await call("POST", "/leave-requests", h.b, {
        leaveTypeId: types.CUTI_TAHUNAN,
        startDate: date,
        endDate: date,
        reason: "Cuti yang telat diputus",
      }),
    );
    await prisma.attendancePeriod.create({
      data: { companyId, month: "2098-08", status: "CLOSED", closedAt: new Date() },
    });
    await approveBoth(created.id);
    const day = await prisma.attendanceDay.findUnique({
      where: { employeeId_workDate: { employeeId: emp.b, workDate: D(date) } },
    });
    expect(day?.status).toBe("LEAVE");
    expect(day?.labels).toContain("LEAVE_AFTER_CLOSE");
  });

  test("karyawan keluar: sisa cuti dibayar (÷21 tanpa roster), hutang dicatat; rupiah hanya ber-grant; aktif lagi → batal", async () => {
    ids.grade = (await prisma.grade.create({ data: { name: `LV-G ${RUN}` } })).id;
    await prisma.gradeWage.create({
      data: {
        gradeId: ids.grade,
        basePay: 5_700_000,
        fixedAllowance: 1_500_000,
        updatedByAccountId: (await prisma.account.findFirstOrThrow()).id,
      },
    });
    const mkExit = async (n: string) => {
      const id = (
        await prisma.employee.create({
          data: {
            employeeNumber: `LV-${RUN}-${n}`,
            fullName: `Cuti ${RUN} ${n}`,
            joinDate: new Date("2020-01-01T00:00:00Z"),
            companyId,
            employmentStatusId: ids.status,
            positionId: ids.position,
            gradeId: ids.grade,
            isActive: false,
            endDate: D("2098-09-30"),
            exitReason: "RESIGNATION",
          },
        })
      ).id;
      ids.employees.push(id);
      return id;
    };
    const ex1 = await mkExit("EX1");
    const ex2 = await mkExit("EX2");
    await prisma.leaveLedger.createMany({
      data: [
        { employeeId: ex1, companyId, year: 2098, kind: "GRANT", days: 12 },
        { employeeId: ex1, companyId, year: 2098, kind: "USE", days: -4 },
        { employeeId: ex2, companyId, year: 2098, kind: "ADJUST", days: -2, note: "uji" },
      ],
    });
    const hrCost = (
      await auth.loginAs("HR_ADMIN", {
        companies: [companyId],
        grants: [{ permission: "LABOR_COST_READ" }],
      })
    ).headers;
    type Row = {
      id: string;
      employee: { id: string };
      remainingDays: number;
      debtDays: number;
      divisor: number;
      payAmount: number | null;
      debtAmount: number | null;
      status: string;
    };
    const list = async (who: Record<string, string>) =>
      data<Row[]>(await call("GET", `/leave-exit-settlements?companyId=${companyId}`, who));
    const withCost = await list(hrCost);
    expect(exitSettlementSchema.array().safeParse(withCost).error).toBeUndefined();
    const r1 = withCost.find((r) => r.employee.id === ex1) as Row;
    // 8 hari × 7,2 jt ÷ 21.
    expect(r1).toMatchObject({ remainingDays: 8, debtDays: 0, divisor: 21, payAmount: 2_742_857 });
    const r2 = withCost.find((r) => r.employee.id === ex2) as Row;
    expect(r2).toMatchObject({ remainingDays: 0, debtDays: 2, debtAmount: 685_714 });
    // HR tanpa grant: hari terlihat, rupiah tidak.
    const plain = (await list(h.hr)).find((r) => r.employee.id === ex1) as Row;
    expect(plain).toMatchObject({ remainingDays: 8, payAmount: null });
    expect((await call("GET", `/leave-exit-settlements?companyId=${companyId}`, h.a)).status).toBe(
      403,
    );
    // Review TM-D9: sisa tahun keluar tidak hilang oleh hangus 31 Des (hitung ulang setelah hangus).
    await prisma.leaveLedger.create({
      data: {
        employeeId: ex1,
        companyId,
        year: 2098,
        kind: "EXPIRE",
        days: -8,
        note: "uji hangus",
      },
    });
    const recalced = await data<Row>(
      await call("POST", `/leave-exit-settlements/${r1.id}/recalculate`, hrCost),
    );
    expect(recalced).toMatchObject({ remainingDays: 8, payAmount: 2_742_857 });
    // Idempoten: daftar dibuka lagi tidak membuat baris ganda.
    expect((await list(hrCost)).filter((r) => r.employee.id === ex1)).toHaveLength(1);
    // Tandai diproses; karyawan EX2 aktif lagi → settlement OPEN dibatalkan.
    expect(
      (await call("POST", `/leave-exit-settlements/${r1.id}/paid`, h.hr, { note: "Payroll Sep" }))
        .status,
    ).toBe(200);
    await prisma.employee.update({
      where: { id: ex2 },
      data: { isActive: true, endDate: null, exitReason: null },
    });
    const after = await list(hrCost);
    expect(after.find((r) => r.id === r1.id)?.status).toBe("PAID");
    expect(after.find((r) => r.id === r2.id)?.status).toBe("CANCELLED");
    // Tanggal keluar dikoreksi setelah PAID (tahun sama) → tidak dibuat settlement kedua (bayar ganda).
    await prisma.employee.update({ where: { id: ex1 }, data: { endDate: D("2098-10-15") } });
    expect((await list(hrCost)).filter((r) => r.employee.id === ex1)).toHaveLength(1);
  });
});
