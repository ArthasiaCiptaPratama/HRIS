import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { settingsToday } from "../../../src/modules/attendance/calendar.service.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// TM-D23 Fase 1: template roster buatan HR — buat, validasi, akses, pasang ke lokasi (pola + crew bergeser).
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

type Template = {
  id: string;
  name: string;
  installations: {
    patternId: string;
    workLocationName: string;
    crews: { name: string; cycleStartDate: string }[];
  }[];
};
const code = (c: string) => `${c}${RUN.slice(0, 4)}`;
let companyId = "";
let otherCompany = "";
let locationId = "";
let h: Record<"hr" | "otherHr" | "emp", Record<string, string>>;
const shiftIds: string[] = [];
let templateId = "";
const people = {
  status: "",
  department: "",
  position: "",
  employees: [] as string[],
  location2: "",
};
// TM-D21: "hari ini" mengikuti zona pengaturan TM (bukan WIB tetap).
let today = "";
const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  today = await settingsToday();
  companyId = await acpCompanyId();
  otherCompany = await createTestCompany(`RT${RUN.slice(0, 4)}`, `PT Uji RT ${RUN}`);
  locationId = (
    await prisma.workLocation.create({
      data: {
        name: `Site RT ${RUN}`,
        city: "Tanah Laut",
        latitude: -3.8,
        longitude: 115.3,
        radiusM: 300,
      },
    })
  ).id;
  // D 07–19, N 19–07, M = 00–08 malam setelah tanggal roster, M2 = 00–08 TANPA centang (N lalu M2 bentrok).
  for (const [c, start, end, next] of [
    ["D", 420, 1140, false],
    ["N", 1140, 420, false],
    ["M", 0, 480, true],
    ["M2", 0, 480, false],
  ] as const) {
    shiftIds.push(
      (
        await prisma.shift.create({
          data: {
            companyId,
            code: code(c),
            name: `Uji RT ${RUN} ${c}`,
            startMinute: start,
            endMinute: end,
            startsNextDay: next,
          },
        })
      ).id,
    );
  }
  people.status = (await prisma.employmentStatus.create({ data: { name: `RT ${RUN}` } })).id;
  people.department = (await prisma.department.create({ data: { name: `RT ${RUN}` } })).id;
  people.position = (
    await prisma.position.create({ data: { name: `RT ${RUN}`, departmentId: people.department } })
  ).id;
  people.location2 = (
    await prisma.workLocation.create({
      data: {
        name: `Site RT2 ${RUN}`,
        city: "Tanah Laut",
        latitude: -3.7,
        longitude: 115.2,
        radiusM: 300,
      },
    })
  ).id;
  for (const n of ["Ani", "Budi", "Cici", "Dedi", "Eko", "Fajar"]) {
    people.employees.push(
      (
        await prisma.employee.create({
          data: {
            employeeNumber: `RT-${RUN}-${n}`,
            fullName: `${n} ${RUN}`,
            joinDate: new Date("2024-01-01T00:00:00Z"),
            companyId,
            employmentStatusId: people.status,
            positionId: people.position,
            isActive: n !== "Fajar",
          },
        })
      ).id,
    );
  }
  h = {
    hr: (await auth.loginAs("HR_ADMIN", { companies: [companyId] })).headers,
    otherHr: (await auth.loginAs("HR_ADMIN", { companies: [otherCompany] })).headers,
    emp: (await auth.loginAs("EMPLOYEE")).headers,
  };
});

afterAll(async () => {
  const templates = await prisma.rosterTemplate.findMany({
    where: { name: { contains: RUN } },
    select: { patterns: { select: { id: true } } },
  });
  const patternIds = templates.flatMap((t) => t.patterns.map((p) => p.id));
  const crews = await prisma.crew.findMany({
    where: { patternId: { in: patternIds } },
    select: { id: true },
  });
  await prisma.rosterDay.deleteMany({ where: { crewId: { in: crews.map((c) => c.id) } } });
  await prisma.crew.deleteMany({ where: { patternId: { in: patternIds } } });
  await prisma.rosterPattern.deleteMany({ where: { id: { in: patternIds } } });
  await prisma.rosterTemplate.deleteMany({ where: { name: { contains: RUN } } });
  const edits = await prisma.rosterEditRequest.findMany({
    where: { employeeId: { in: people.employees } },
    select: { id: true },
  });
  await prisma.approvalRequest.deleteMany({ where: { subjectId: { in: edits.map((e) => e.id) } } });
  await prisma.rosterEditRequest.deleteMany({ where: { employeeId: { in: people.employees } } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: people.employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: people.employees } } });
  await prisma.shift.deleteMany({ where: { id: { in: shiftIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: people.employees } } });
  await prisma.position.delete({ where: { id: people.position } });
  await prisma.department.delete({ where: { id: people.department } });
  await prisma.employmentStatus.delete({ where: { id: people.status } });
  await prisma.workLocation.delete({ where: { id: people.location2 } });
  await prisma.workLocation.delete({ where: { id: locationId } });
  await auth.cleanup();
  await prisma.company.delete({ where: { id: otherCompany } });
  await disconnectPrisma();
});

const def = (extra: Record<string, unknown> = {}) => ({
  companyId,
  name: `Rotasi ${RUN}`,
  description: "2 siang, 2 malam, 2 libur",
  steps: [code("D"), code("D"), code("N"), code("N"), "OFF", "OFF"],
  crewCount: 3,
  crewOffsetDays: 2,
  ...extra,
});

describe("template roster buatan HR (TM-D23)", () => {
  test("HR PT membuat template; kode shift tak dikenal ditolak; karyawan & HR PT lain 403", async () => {
    const res = await call("POST", "/roster-custom-templates", h.hr, def());
    expect(res.status).toBe(200);
    const t = await data<Template & { cycleLength: number; workDays: number }>(res);
    expect(t).toMatchObject({ cycleLength: 6, workDays: 4, installations: [] });
    templateId = t.id;

    expect(
      (
        await call(
          "POST",
          "/roster-custom-templates",
          h.hr,
          def({ name: `X ${RUN}`, steps: ["ZZZ9"] }),
        )
      ).status,
    ).toBe(422);
    expect((await call("POST", "/roster-custom-templates", h.hr, def())).status).toBe(409);
    expect(
      (await call("POST", "/roster-custom-templates", h.emp, def({ name: `E ${RUN}` }))).status,
    ).toBe(403);
    expect(
      (await call("POST", "/roster-custom-templates", h.otherHr, def({ name: `O ${RUN}` }))).status,
    ).toBe(403);
    expect(
      (await call("GET", `/roster-custom-templates?companyId=${companyId}`, h.emp)).status,
    ).toBe(403);
  });

  test("pasang ke lokasi → 1 pola + 3 crew bergeser 2 hari; pasang ulang di lokasi sama 409", async () => {
    const res = await call("POST", `/roster-custom-templates/${templateId}/install`, h.hr, {
      workLocationId: locationId,
      cycleStartDate: "2027-01-10",
    });
    expect(res.status).toBe(200);
    const result = await data<{
      pattern: { steps: string[] };
      crews: { name: string; cycleStartDate: string; workLocation: { id: string } }[];
      restWarnings: string[];
    }>(res);
    expect(result.pattern.steps).toEqual(def().steps);
    expect(result.crews.map((c) => [c.name.split(" · ")[1], c.cycleStartDate])).toEqual([
      [`Crew A (Site RT ${RUN})`, "2027-01-10"],
      [`Crew B (Site RT ${RUN})`, "2027-01-08"],
      [`Crew C (Site RT ${RUN})`, "2027-01-06"],
    ]);
    expect(result.crews.every((c) => c.workLocation.id === locationId)).toBe(true);
    // D→D 12 jam, D→N 24 jam, N→N 12 jam: semua ≥ 8 jam → tanpa peringatan.
    expect(result.restWarnings).toEqual([]);

    const list = await data<Template[]>(
      await call("GET", `/roster-custom-templates?companyId=${companyId}`, h.hr),
    );
    const mine = list.find((t) => t.id === templateId);
    expect(mine?.installations).toHaveLength(1);
    expect(mine?.installations[0]?.workLocationName).toBe(`Site RT ${RUN}`);
    expect(
      (
        await call("POST", `/roster-custom-templates/${templateId}/install`, h.hr, {
          workLocationId: locationId,
          cycleStartDate: "2027-01-10",
        })
      ).status,
    ).toBe(409);
  });

  test("setelah dipasang: pola tidak bisa diubah (422), nama & keterangan bisa; arsip → hilang dari daftar", async () => {
    expect(
      (
        await call(
          "PUT",
          `/roster-custom-templates/${templateId}`,
          h.hr,
          def({ steps: [code("D"), "OFF"] }),
        )
      ).status,
    ).toBe(422);
    const renamed = await call(
      "PUT",
      `/roster-custom-templates/${templateId}`,
      h.hr,
      def({ name: `Rotasi ${RUN} v2`, description: "Diubah" }),
    );
    expect(renamed.status).toBe(200);
    expect((await data<Template>(renamed)).name).toBe(`Rotasi ${RUN} v2`);

    expect((await call("DELETE", `/roster-custom-templates/${templateId}`, h.hr)).status).toBe(200);
    const list = await data<Template[]>(
      await call("GET", `/roster-custom-templates?companyId=${companyId}`, h.hr),
    );
    expect(list.some((t) => t.id === templateId)).toBe(false);
    // Pola & crew hasil pemasangan tetap berjalan.
    const crews = await prisma.crew.count({
      where: { pattern: { templateId }, deletedAt: null },
    });
    expect(crews).toBe(3);
  });

  test("N lalu shift dini hari: dicentang aman (17 jam), tanpa centang bentrok 7 jam → peringatan", async () => {
    const install = async (name: string, steps: string[]) => {
      const t = await data<Template>(
        await call(
          "POST",
          "/roster-custom-templates",
          h.hr,
          def({ name, steps, crewCount: 1, crewOffsetDays: 0 }),
        ),
      );
      const res = await call("POST", `/roster-custom-templates/${t.id}/install`, h.hr, {
        workLocationId: locationId,
        cycleStartDate: "2027-02-01",
      });
      expect(res.status).toBe(200);
      return (await data<{ restWarnings: string[] }>(res)).restWarnings;
    };
    expect(await install(`Aman ${RUN}`, [code("N"), code("M"), "OFF"])).toEqual([]);
    const warnings = await install(`Bentrok ${RUN}`, [code("N"), code("M2"), "OFF"]);
    expect(warnings).toEqual([`Langkah 1→2: ${code("N")} lalu ${code("M2")} bertabrakan 7 jam.`]);
  });

  test("isi roster dengan template: belum terpasang → dipasang otomatis, 5 karyawan dibagi rata 2/2/1", async () => {
    const t = await data<Template>(
      await call("POST", "/roster-custom-templates", h.hr, def({ name: `Auto ${RUN}` })),
    );
    const effectiveDate = plusDays(today, 3);
    const [ani, budi, cici, dedi, eko, fajar] = people.employees as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    // Sel kuas Ani di tanggal efektif: ditimpa template (paksa tempel full).
    await prisma.rosterDay.create({
      data: {
        employeeId: ani,
        workDate: new Date(`${effectiveDate}T00:00:00Z`),
        shiftId: shiftIds[0],
        source: "MANUAL",
      },
    });
    const body = {
      workLocationId: people.location2,
      employeeIds: [eko, dedi, cici, budi, ani, fajar],
      effectiveDate,
    };
    const preview = await data<{
      installed: boolean;
      crews: { existing: number; added: number }[];
      assignments: { fullName: string; crewName: string; stays: boolean }[];
      skipped: { reason: string }[];
      replacedDays: number;
    }>(await call("POST", `/roster-custom-templates/${t.id}/assign/preview`, h.hr, body));
    expect(preview.installed).toBe(false);
    expect(preview.crews.map((c) => c.added)).toEqual([2, 2, 1]);
    // Urut nama → crew paling sedikit: Ani A, Budi B, Cici C, Dedi A, Eko B.
    expect(
      preview.assignments.map((a) => [
        a.fullName.split(" ")[0],
        a.crewName.split(" · ")[1]?.slice(0, 6),
      ]),
    ).toEqual([
      ["Ani", "Crew A"],
      ["Dedi", "Crew A"],
      ["Budi", "Crew B"],
      ["Eko", "Crew B"],
      ["Cici", "Crew C"],
    ]);
    expect(preview.skipped).toEqual([expect.objectContaining({ reason: "Tidak aktif" })]);
    expect(preview.replacedDays).toBe(1);
    expect(await prisma.crew.count({ where: { pattern: { templateId: t.id } } })).toBe(0);

    const res = await call("POST", `/roster-custom-templates/${t.id}/assign`, h.hr, body);
    expect(res.status).toBe(200);
    const crews = await prisma.crew.findMany({
      where: { pattern: { templateId: t.id } },
      orderBy: { name: "asc" },
      include: { members: true },
    });
    expect(crews.map((c) => c.members.length)).toEqual([2, 2, 1]);
    // Hari pola terbentuk mulai tanggal efektif; Crew A (mulai siklus = tanggal efektif) → D di hari ke-1.
    const dedis = await prisma.rosterDay.findFirst({
      where: { employeeId: dedi, workDate: new Date(`${effectiveDate}T00:00:00Z`) },
      include: { shift: true },
    });
    expect(dedis).toMatchObject({ source: "PATTERN", shift: { code: code("D") } });
    const anis = await prisma.rosterDay.findFirst({
      where: { employeeId: ani, workDate: new Date(`${effectiveDate}T00:00:00Z`) },
    });
    expect(anis?.source).toBe("PATTERN");
    const before = await prisma.rosterDay.count({
      where: { employeeId: dedi, workDate: { lt: new Date(`${effectiveDate}T00:00:00Z`) } },
    });
    expect(before).toBe(0);

    // TM-D24: Ani sudah ber-crew; diisi kuas lalu dipakai lagi → diajukan (sel kuas tetap sampai disetujui).
    await prisma.rosterDay.update({
      where: {
        employeeId_workDate: { employeeId: ani, workDate: new Date(`${effectiveDate}T00:00:00Z`) },
      },
      data: { source: "MANUAL", crewId: null, shiftId: shiftIds[1] },
    });
    const again = await data<{
      assignments: { stays: boolean; needsApproval: boolean }[];
      approvalCount: number;
    }>(
      await call("POST", `/roster-custom-templates/${t.id}/assign`, h.hr, {
        ...body,
        employeeIds: [ani],
      }),
    );
    expect(again).toMatchObject({
      assignments: [{ stays: true, needsApproval: true }],
      approvalCount: 1,
    });
    const anis2 = await prisma.rosterDay.findFirst({
      where: { employeeId: ani, workDate: new Date(`${effectiveDate}T00:00:00Z`) },
      include: { shift: true },
    });
    expect(anis2).toMatchObject({ source: "MANUAL", shift: { code: code("N") } });
    const pending = await prisma.rosterEditRequest.findMany({ where: { employeeId: ani } });
    expect(pending.map((p) => p.status)).toEqual(["PENDING"]);
  });

  test("hari terkunci (absen disetujui) tidak ditimpa saat paksa tempel", async () => {
    const list = await data<Template[]>(
      await call("GET", `/roster-custom-templates?companyId=${companyId}`, h.hr),
    );
    const t = list.find((x) => x.name === `Auto ${RUN}`) as Template;
    const budi = people.employees[1] as string;
    const date = plusDays(today, 4);
    await prisma.rosterDay.upsert({
      where: { employeeId_workDate: { employeeId: budi, workDate: new Date(`${date}T00:00:00Z`) } },
      update: { source: "MANUAL", crewId: null, shiftId: shiftIds[2] },
      create: {
        employeeId: budi,
        workDate: new Date(`${date}T00:00:00Z`),
        shiftId: shiftIds[2],
        source: "MANUAL",
      },
    });
    await prisma.attendanceDay.create({
      data: {
        employeeId: budi,
        companyId,
        workDate: new Date(`${date}T00:00:00Z`),
        status: "APPROVED",
      },
    });
    const res = await call("POST", `/roster-custom-templates/${t.id}/assign/preview`, h.hr, {
      workLocationId: people.location2,
      employeeIds: [budi],
      effectiveDate: plusDays(today, 3),
    });
    // Sel kuas Budi terkunci → tidak dihitung ditimpa; Budi tetap di crew → tidak ada perubahan.
    expect(await data(res)).toMatchObject({ replacedDays: 0, approvalCount: 0 });
    expect(
      (
        await call("POST", `/roster-custom-templates/${t.id}/assign`, h.hr, {
          workLocationId: people.location2,
          employeeIds: [budi],
          effectiveDate: plusDays(today, 3),
        })
      ).status,
    ).toBe(422);
    const day = await prisma.rosterDay.findFirst({
      where: { employeeId: budi, workDate: new Date(`${date}T00:00:00Z`) },
      include: { shift: true },
    });
    expect(day).toMatchObject({ source: "MANUAL", shift: { code: code("M") } });
    await prisma.attendanceDay.deleteMany({ where: { employeeId: budi } });
  });

  test("pindah crew lewat atur anggota crew: hari mulai tanggal efektif ikut crew baru (tidak kosong)", async () => {
    const effectiveDate = plusDays(today, 5);
    const dedi = people.employees[3] as string;
    const t2 = await data<Template>(
      await call(
        "POST",
        "/roster-custom-templates",
        h.hr,
        def({ name: `Malam ${RUN}`, steps: [code("N"), "OFF"], crewCount: 1, crewOffsetDays: 0 }),
      ),
    );
    const installed = await data<{ crews: { id: string }[] }>(
      await call("POST", `/roster-custom-templates/${t2.id}/install`, h.hr, {
        workLocationId: people.location2,
        cycleStartDate: effectiveDate,
      }),
    );
    const res = await call("PUT", `/crews/${installed.crews[0]?.id}/members`, h.hr, {
      employeeIds: [dedi],
      effectiveDate,
    });
    expect(res.status).toBe(200);
    const days = await prisma.rosterDay.findMany({
      where: {
        employeeId: dedi,
        workDate: {
          gte: new Date(`${effectiveDate}T00:00:00Z`),
          lte: new Date(`${plusDays(effectiveDate, 3)}T00:00:00Z`),
        },
      },
      orderBy: { workDate: "asc" },
      include: { shift: true },
    });
    expect(days.map((d) => d.shift?.code ?? "OFF")).toEqual([code("N"), "OFF", code("N"), "OFF"]);
  });

  test("isi roster: tanggal efektif lampau 422; karyawan 403", async () => {
    const body = {
      workLocationId: people.location2,
      employeeIds: [people.employees[0]],
      effectiveDate: plusDays(today, -1),
    };
    const list = await data<Template[]>(
      await call("GET", `/roster-custom-templates?companyId=${companyId}`, h.hr),
    );
    const t = list.find((x) => x.name === `Auto ${RUN}`) as Template;
    expect(
      (await call("POST", `/roster-custom-templates/${t.id}/assign/preview`, h.hr, body)).status,
    ).toBe(422);
    expect(
      (
        await call("POST", `/roster-custom-templates/${t.id}/assign`, h.emp, {
          ...body,
          effectiveDate: plusDays(today, 3),
        })
      ).status,
    ).toBe(403);
  });
});
