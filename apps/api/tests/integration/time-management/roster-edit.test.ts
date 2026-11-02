import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { settingsToday } from "../../../src/modules/attendance/calendar.service.ts";
import * as rosterRepository from "../../../src/modules/attendance/roster.repository.ts";
import { patternCodeOn } from "../../../src/modules/attendance/roster-engine.ts";
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
  emp: {} as Record<
    "mgr" | "ani" | "budi" | "cici" | "dodi" | "eko" | "fani" | "gita" | "hani",
    string
  >,
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
  for (const n of ["ani", "budi", "cici", "dodi", "eko", "fani", "gita", "hani"] as const) {
    ids.emp[n] = await mk(n, ids.emp.mgr);
  }
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
  await prisma.notification.deleteMany({ where: { targetId: { in: edits.map((e) => e.id) } } });
  const templates = await prisma.rosterTemplate.findMany({
    where: { name: { contains: RUN } },
    select: { patterns: { select: { id: true } } },
  });
  const patternIds = templates.flatMap((t) => t.patterns.map((p) => p.id));
  await prisma.attendancePeriod.deleteMany({ where: { companyId, month: "2025-01" } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: employees } } });
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

  test("kuas: sel karyawan ber-crew diajukan, tanpa crew langsung; selama menunggu edit lagi ditolak; disetujui → tersimpan", async () => {
    const date = plusDays(E, 6);
    const before = await dayCode(ids.emp.budi, date);
    const res = await call("PUT", "/roster/cells", h.hr1, {
      companyId,
      cells: [
        { employeeId: ids.emp.budi, date, code: code("D") },
        { employeeId: ids.emp.mgr, date, code: code("D") },
      ],
    });
    expect(await data<{ updated: number; submitted: number }>(res)).toEqual({
      updated: 1,
      submitted: 1,
    });
    expect(await dayCode(ids.emp.mgr, date)).toBe(code("D"));
    expect(await dayCode(ids.emp.budi, date)).toBe(before);

    const again = await call("PUT", "/roster/cells", h.hr1, {
      companyId,
      cells: [{ employeeId: ids.emp.budi, date: plusDays(date, 1), code: "OFF" }],
    });
    expect(again.status).toBe(422);

    const edit = (await mine()).find(
      (e) => e.employee.id === ids.emp.budi && e.status === "PENDING",
    );
    expect(edit?.preview).toEqual([{ date, from: before, to: code("D") }]);
    for (const headers of [h.mgr, h.hr2]) {
      await call("POST", `/approvals/${edit?.approval?.id}/decision`, headers, {
        decision: "APPROVED",
      });
    }
    expect(await dayCode(ids.emp.budi, date)).toBe(code("D"));
    const day = await prisma.rosterDay.findFirst({
      where: { employeeId: ids.emp.budi, workDate: D(date) },
    });
    expect(day?.source).toBe("MANUAL");
  });

  test("import: baris karyawan ber-crew diajukan (IMPORT), disetujui → sumber IMPORT", async () => {
    const date = plusDays(E, 8);
    const res = await call("POST", "/roster/import/commit", h.hr1, {
      companyId,
      rows: [{ employeeNumber: `RE-${RUN}-ani`, date, code: "OFF" }],
    });
    expect(await data<{ saved: number; submitted: number }>(res)).toEqual({
      saved: 0,
      submitted: 1,
    });
    const edit = (await mine()).find(
      (e) => e.employee.id === ids.emp.ani && e.status === "PENDING",
    );
    expect(edit).toBeDefined();
    for (const headers of [h.mgr, h.hr2]) {
      await call("POST", `/approvals/${edit?.approval?.id}/decision`, headers, {
        decision: "APPROVED",
      });
    }
    const day = await prisma.rosterDay.findFirst({
      where: { employeeId: ids.emp.ani, workDate: D(date) },
    });
    expect(day).toMatchObject({ source: "IMPORT", shiftId: null });
  });

  test("atur anggota crew: tanpa crew langsung masuk; pindah & keluar diajukan → disetujui berlaku", async () => {
    const F = plusDays(today, 20);
    const malam = await prisma.crew.findFirstOrThrow({
      where: { name: { contains: `Malam ${RUN}` }, deletedAt: null },
    });
    // Anggota Malam sekarang: Ani, Budi. Target: Budi tetap, Mgr (tanpa crew) masuk, Cici (crew Siang) pindah,
    // Ani dikeluarkan.
    const res = await call("PUT", `/crews/${malam.id}/members`, h.hr1, {
      employeeIds: [ids.emp.budi, ids.emp.mgr, ids.emp.cici],
      effectiveDate: F,
    });
    expect(res.status).toBe(200);
    expect((await data<{ submitted: number }>(res)).submitted).toBe(2);
    expect(await dayCode(ids.emp.mgr, F)).toBe(code("N"));
    expect(await dayCode(ids.emp.cici, F)).toBe(code("D")); // masih crew Siang sampai disetujui

    const pending = (await mine()).filter(
      (e) => e.status === "PENDING" && [ids.emp.ani, ids.emp.cici].includes(e.employee.id),
    );
    expect(pending.map((e) => (e as Edit & { summary: string }).summary).sort()).toEqual([
      `Keluar dari crew ${malam.name}`,
      `Pindah ke crew ${malam.name}`,
    ]);
    for (const e of pending) {
      for (const headers of [h.mgr, h.hr2]) {
        await call("POST", `/approvals/${e.approval?.id}/decision`, headers, {
          decision: "APPROVED",
        });
      }
    }
    expect(await dayCode(ids.emp.cici, F)).toBe(code("N"));
    const ani = await prisma.rosterDay.findFirst({
      where: { employeeId: ids.emp.ani, workDate: D(F) },
    });
    expect(ani).toBeNull();
    const aniMembership = await prisma.crewMember.findFirst({
      where: { employeeId: ids.emp.ani, crewId: malam.id },
    });
    expect(aniMembership?.endDate?.toISOString().slice(0, 10)).toBe(plusDays(F, -1));
  });

  test("mundur (periode terbuka): hari tanpa absen ikut template, hari ber-absen tetap; periode tertutup 422", async () => {
    const dodi = ids.emp.dodi;
    const d3 = plusDays(today, -3);
    const d2 = plusDays(today, -2);
    for (const date of [d3, d2]) {
      await prisma.rosterDay.create({
        data: { employeeId: dodi, workDate: D(date), shiftId: ids.shifts[0], source: "MANUAL" },
      });
    }
    await prisma.attendanceDay.create({
      data: { employeeId: dodi, companyId, workDate: D(d2), status: "PENDING" },
    });
    const malam = await prisma.crew.findFirstOrThrow({
      where: { name: { contains: `Malam ${RUN}` }, deletedAt: null },
      include: { pattern: true },
    });
    const expected = (date: string) =>
      patternCodeOn(malam.pattern.steps, malam.cycleStartDate.toISOString().slice(0, 10), date);
    const alpha = [d3, plusDays(today, -1)].filter((d) => expected(d) !== "OFF").length;
    const body = { workLocationId: ids.location, employeeIds: [dodi], effectiveDate: d3 };
    const preview = await data<{
      newAlphaDays: number;
      replacedDays: number;
      approvalCount: number;
    }>(await call("POST", `/roster-custom-templates/${t2}/assign/preview`, h.hr1, body));
    expect(preview).toMatchObject({ newAlphaDays: alpha, approvalCount: 0, replacedDays: 1 });
    expect((await call("POST", `/roster-custom-templates/${t2}/assign`, h.hr1, body)).status).toBe(
      200,
    );
    expect(await dayCode(dodi, d3)).toBe(expected(d3) === "OFF" ? "OFF" : expected(d3));
    // Hari ber-absen: jadwal lama dipertahankan.
    expect(await dayCode(dodi, d2)).toBe(code("D"));
    expect(
      (await prisma.rosterDay.findFirst({ where: { employeeId: dodi, workDate: D(d2) } }))?.source,
    ).toBe("MANUAL");

    await prisma.attendancePeriod.create({
      data: { companyId, month: "2025-01", status: "CLOSED", closedAt: new Date() },
    });
    const closed = await call("POST", `/roster-custom-templates/${t2}/assign/preview`, h.hr1, {
      ...body,
      effectiveDate: "2025-01-15",
    });
    expect(closed.status).toBe(422);
  });
  // Review gabung 9c94f5d (2026-10-28): atur anggota crew satu transaksi; anggota yang mulai setelah tanggal
  // efektif tetap lewat approval; notifikasi keputusan dikirim setelah commit.
  const G = () => plusDays(today, 30);
  const atomCrew = () => prisma.crew.findFirstOrThrow({ where: { name: `Uji Atomik ${RUN}` } });
  const editOf = async (employeeId: string) =>
    (await mine()).find((e) => e.employee.id === employeeId && e.status === "PENDING") as Edit & {
      summary: string;
    };

  test("atur anggota crew atomik: gagal di tengah → anggota baru & pengajuan tidak ada yang berlaku", async () => {
    const malam = await prisma.crew.findFirstOrThrow({
      where: { name: { contains: `Malam ${RUN}` }, deletedAt: null },
    });
    const crew = await prisma.crew.create({
      data: {
        companyId,
        workLocationId: ids.location,
        name: `Uji Atomik ${RUN}`,
        patternId: malam.patternId,
        cycleStartDate: malam.cycleStartDate,
      },
    });
    await prisma.crewMember.create({
      data: { crewId: crew.id, employeeId: ids.emp.eko, startDate: D(today) },
    });
    // Fani (tanpa crew) masuk langsung + Eko dikeluarkan (diajukan); penyimpanan pengajuan gagal.
    const body = { employeeIds: [ids.emp.fani], effectiveDate: G() };
    const spy = spyOn(rosterRepository, "createRosterEdit").mockImplementationOnce(() => {
      throw new Error("gagal uji");
    });
    const failed = await call("PUT", `/crews/${crew.id}/members`, h.hr1, body);
    spy.mockRestore();
    expect(failed.status).toBe(500);
    expect(await prisma.crewMember.count({ where: { employeeId: ids.emp.fani } })).toBe(0);
    expect(await prisma.rosterDay.count({ where: { employeeId: ids.emp.fani } })).toBe(0);
    expect(await prisma.rosterEditRequest.count({ where: { employeeId: ids.emp.eko } })).toBe(0);

    const ok = await call("PUT", `/crews/${crew.id}/members`, h.hr1, body);
    expect(ok.status).toBe(200);
    expect((await data<{ submitted: number }>(ok)).submitted).toBe(1);
    expect(await prisma.rosterDay.count({ where: { employeeId: ids.emp.fani } })).toBeGreaterThan(
      0,
    );
    expect((await editOf(ids.emp.eko)).summary).toBe(`Keluar dari crew ${crew.name}`);
  });

  test("anggota yang mulai setelah tanggal efektif: dikeluarkan / dipindah tetap lewat approval", async () => {
    const crew = await atomCrew();
    const siang = await prisma.crew.findFirstOrThrow({
      where: { name: { contains: `Siang ${RUN}` }, deletedAt: null },
    });
    const later = D(plusDays(G(), 5));
    await prisma.crewMember.create({
      data: { crewId: crew.id, employeeId: ids.emp.gita, startDate: later },
    });
    await prisma.crewMember.create({
      data: { crewId: siang.id, employeeId: ids.emp.hani, startDate: later },
    });
    // Gita (mulai F+5) tidak ada di daftar; Hani (crew Siang mulai F+5) masuk.
    const res = await call("PUT", `/crews/${crew.id}/members`, h.hr1, {
      employeeIds: [ids.emp.eko, ids.emp.fani, ids.emp.hani],
      effectiveDate: G(),
    });
    expect(res.status).toBe(200);
    expect((await data<{ submitted: number }>(res)).submitted).toBe(2);
    expect(
      await prisma.crewMember.count({ where: { employeeId: ids.emp.gita, crewId: crew.id } }),
    ).toBe(1);
    expect(
      await prisma.crewMember.count({ where: { employeeId: ids.emp.hani, crewId: crew.id } }),
    ).toBe(0);
    expect(
      await prisma.crewMember.count({ where: { employeeId: ids.emp.hani, crewId: siang.id } }),
    ).toBe(1);
    expect((await editOf(ids.emp.gita)).summary).toBe(`Keluar dari crew ${crew.name}`);
    expect((await editOf(ids.emp.hani)).summary).toBe(`Pindah ke crew ${crew.name}`);
  });

  test("keputusan final → notifikasi hasil ke HR pengaju setelah commit; keputusan gagal tidak mengirim", async () => {
    const crew = await atomCrew();
    const decided = (id: string) =>
      prisma.notification.findMany({
        where: { type: "attendance.roster_edit_decided", targetType: "ROSTER_EDIT", targetId: id },
      });
    const gita = await editOf(ids.emp.gita);
    for (const headers of [h.mgr, h.hr2]) {
      const r = await call("POST", `/approvals/${gita.approval?.id}/decision`, headers, {
        decision: "APPROVED",
      });
      expect(r.status).toBe(200);
    }
    expect(
      await prisma.crewMember.count({ where: { employeeId: ids.emp.gita, crewId: crew.id } }),
    ).toBe(0);
    const applied = await decided(gita.id);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.title).toContain("disetujui");

    // Crew tujuan diarsipkan → keputusan gagal (transaksi batal): status tetap, tanpa notifikasi.
    const hani = await editOf(ids.emp.hani);
    await prisma.crew.update({ where: { id: crew.id }, data: { deletedAt: new Date() } });
    expect(
      (
        await call("POST", `/approvals/${hani.approval?.id}/decision`, h.mgr, {
          decision: "APPROVED",
        })
      ).status,
    ).toBe(200);
    const fail = await call("POST", `/approvals/${hani.approval?.id}/decision`, h.hr2, {
      decision: "APPROVED",
    });
    expect(fail.status).toBe(422);
    expect(await decided(hani.id)).toHaveLength(0);
    expect((await editOf(ids.emp.hani))?.id).toBe(hani.id);
    await prisma.crew.update({ where: { id: crew.id }, data: { deletedAt: null } });

    const rejected = await call("POST", `/approvals/${hani.approval?.id}/decision`, h.hr2, {
      decision: "REJECTED",
      note: "uji",
    });
    expect(rejected.status).toBe(200);
    const notes = await decided(hani.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toContain("ditolak");
    // Target notifikasi (deep link app): HR pengaju tetap boleh membuka detail yang sudah final.
    for (const [id, status] of [
      [gita.id, "APPLIED"],
      [hani.id, "REJECTED"],
    ] as const) {
      const detail = await call("GET", `/roster-edits/${id}`, h.hr1);
      expect(detail.status).toBe(200);
      expect((await data<Edit>(detail)).status).toBe(status);
    }
  });
});
