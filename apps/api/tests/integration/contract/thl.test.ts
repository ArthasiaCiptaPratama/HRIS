import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  addContractDays,
  type EmploymentCategory,
  shiftThlMonth,
  thlCurrentMonth,
  thlWageChangeLabel,
} from "@hris/shared";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { employeeContractsSchema } from "../../../src/modules/contract/index.ts";
import { remindContracts } from "../../../src/modules/employee/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";

const RUN = crypto.randomUUID().slice(0, 8).toUpperCase();
const prisma = getPrisma();
const auth = createAuthFixture(`thl-${RUN}`);
const app = createApp({
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  logger: createLogger("error", () => {}),
});
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login, hr: Login, hrNo: Login, hrOther: Login, manager: Login, self: Login;
let company = "",
  otherCompany = "",
  department = "",
  position = "";
let required = "",
  approaching = "",
  noStatus = "",
  permanent = "",
  inactive = "",
  boss = "";
const employees: string[] = [];
const createdStatuses: string[] = [];
const statuses = new Map<EmploymentCategory, string>();
const date = (d: string) => new Date(`${d}T00:00:00Z`);
const now = new Date();
const currentMonth = thlCurrentMonth(now);
const lastMonth = shiftThlMonth(currentMonth, -1);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
async function employee(key: string, category: EmploymentCategory = "DAILY_WORKER", active = true) {
  const row = await prisma.employee.create({
    data: {
      employeeNumber: `THL-${RUN}-${key.toUpperCase()}`,
      fullName: `THL ${RUN} ${key}`,
      companyId: company,
      positionId: position,
      employmentStatusId: statuses.get(category) ?? "",
      joinDate: date("2020-01-01"),
      isActive: active,
      managerId: boss || null,
    },
  });
  employees.push(row.id);
  return row.id;
}
const request = (path: string, login?: Login, method = "GET", input?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...login?.headers, ...(input ? { "Content-Type": "application/json" } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
const wageInput = { amount: 150_000, effectiveFrom: "2020-01-01", note: "Penetapan THL" };
const put = (id: string, login?: Login, input: unknown = wageInput) =>
  request(`/employees/${id}/daily-wage`, login, "PUT", input);
async function contracts(id: string, login: Login) {
  const response = await request(`/employees/${id}/contracts`, login);
  expect(response.status).toBe(200);
  return employeeContractsSchema.parse(((await response.json()) as { data: unknown }).data);
}
async function days(id: string, month: string, approved: number) {
  await prisma.attendanceDay.createMany({
    data: Array.from({ length: approved }, (_, i) => ({
      employeeId: id,
      companyId: company,
      workDate: date(`${month}-${String(i + 1).padStart(2, "0")}`),
      status: "APPROVED" as const,
      labels: [],
    })),
  });
}
beforeAll(async () => {
  company = await createTestCompany(`T${RUN.slice(0, 7)}`, `THL ${RUN}`);
  otherCompany = await createTestCompany(`U${RUN.slice(0, 7)}`, `THL other ${RUN}`);
  department = (await prisma.department.create({ data: { name: `THL ${RUN}` } })).id;
  position = (
    await prisma.position.create({ data: { name: `THL ${RUN}`, departmentId: department } })
  ).id;
  for (const category of ["DAILY_WORKER", "PERMANENT"] as const) {
    let row = await prisma.employmentStatus.findUnique({ where: { category } });
    if (!row) {
      row = await prisma.employmentStatus.create({
        data: { name: `THL ${RUN} ${category}`, category },
      });
      createdStatuses.push(row.id);
    }
    statuses.set(category, row.id);
  }
  boss = await employee("boss", "PERMANENT");
  required = await employee("required");
  approaching = await employee("approaching");
  noStatus = await employee("none");
  permanent = await employee("permanent", "PERMANENT");
  inactive = await employee("inactive", "DAILY_WORKER", false);
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", {
    companies: [company],
    grants: [{ permission: "LABOR_COST_READ" }],
  });
  hrNo = await auth.loginAs("HR_ADMIN", { companies: [company] });
  hrOther = await auth.loginAs("HR_ADMIN", {
    companies: [otherCompany],
    grants: [{ permission: "LABOR_COST_READ" }],
  });
  manager = await auth.loginAs("MANAGER", { employeeId: boss });
  self = await auth.loginAs("EMPLOYEE", { employeeId: required });
  for (const offset of [-3, -2, -1]) {
    const month = shiftThlMonth(currentMonth, offset);
    await days(required, month, 21);
    await days(approaching, month, offset === -3 ? 20 : 21);
    await days(noStatus, month, offset === -2 ? 20 : 21);
  }
  await days(required, currentMonth, 2);
  await prisma.attendanceDay.createMany({
    data: (["OPEN", "PENDING", "REJECTED", "ALPHA", "LEAVE"] as const).map((status, i) => ({
      employeeId: required,
      companyId: company,
      workDate: date(`${lastMonth}-${i + 22}`),
      status,
      labels: [],
    })),
  });
});
afterAll(async () => {
  const ids = (
    await prisma.employee.findMany({
      where: { employeeNumber: { startsWith: `THL-${RUN}-` } },
      select: { id: true },
    })
  ).map((e) => e.id);
  const accounts = (
    await prisma.account.findMany({
      where: { email: { startsWith: `auth-thl-${RUN}-` } },
      select: { id: true },
    })
  ).map((a) => a.id);
  await prisma.importJob.deleteMany({ where: { actorAccountId: { in: accounts } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.notification.deleteMany({
    where: { type: "contract.thl.required", body: { contains: `THL ${RUN}` } },
  });
  await auth.cleanup();
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: ids } } });
  await prisma.employee.updateMany({ where: { id: { in: ids } }, data: { managerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  await prisma.position.delete({ where: { id: position } });
  await prisma.department.delete({ where: { id: department } });
  await prisma.company.deleteMany({ where: { id: { in: [company, otherCompany] } } });
  await prisma.employmentStatus.deleteMany({ where: { id: { in: createdStatuses } } });
  await disconnectPrisma();
});

describe("THL wages and attendance", () => {
  test("PUT access matrix and GET redaction", async () => {
    for (const [login, status] of [
      [sa, 200],
      [hr, 200],
      [hrNo, 403],
      [hrOther, 404],
      [manager, 403],
      [self, 403],
      [undefined, 401],
    ] as const)
      expect((await put(required, login)).status).toBe(status);
    for (const login of [sa, hr]) {
      const thl = (await contracts(required, login)).thl;
      expect(thl?.access.wage).toBe(true);
      expect(thl?.dailyWage?.amount).toBe(150_000);
      expect(thl?.wageHistory).toHaveLength(1);
    }
    for (const login of [hrNo, manager, self]) {
      const thl = (await contracts(required, login)).thl;
      expect(thl?.access.wage).toBe(false);
      expect(thl?.dailyWage).toBeNull();
      expect(thl).not.toHaveProperty("wageHistory");
      expect(JSON.stringify(thl)).not.toContain("150000");
    }
    expect((await request(`/employees/${required}/contracts`, hrOther)).status).toBe(404);
    expect((await request(`/employees/${required}/contracts`)).status).toBe(401);
    expect((await contracts(permanent, sa)).thl).toBeNull();
  });
  test("validation 400, inactive/non THL 422, overwrite, audit without amount", async () => {
    for (const extra of [
      { amount: 0 },
      { amount: -1 },
      { amount: 100_000_001 },
      { amount: 1.234 },
      { note: " " },
      { note: "a".repeat(301) },
      { effectiveFrom: "2025-02-30" },
      { effectiveFrom: "2019-12-31" },
    ])
      expect((await put(required, sa, { ...wageInput, ...extra })).status).toBe(400);
    expect((await put(permanent, sa)).status).toBe(422);
    expect((await put(inactive, sa)).status).toBe(422);
    expect((await put(required, sa, { ...wageInput, amount: 150_000.25 })).status).toBe(200);
    expect(await prisma.dailyWage.count({ where: { employeeId: required } })).toBe(1);
    const audits = await prisma.auditLog.findMany({
      where: { entityId: required, action: "contract.daily_wage.set" },
    });
    expect(audits.length).toBeGreaterThan(0);
    for (const row of audits) {
      expect(row.after).toEqual({ effectiveFrom: "2020-01-01", source: "api" });
      expect(row.before).toBeNull();
    }
    expect(await prisma.employeeFieldChange.count({ where: { employeeId: required } })).toBe(0);
    await put(required, sa);
  });
  test("future rate remains history until its effective date", async () => {
    expect(
      (
        await put(required, sa, {
          amount: 700_000,
          effectiveFrom: addContractDays(today, 365),
          note: "Tarif mendatang",
        })
      ).status,
    ).toBe(200);
    const thl = (await contracts(required, sa)).thl;
    expect(thl?.dailyWage?.amount).toBe(150_000);
    expect(thl?.wageHistory?.[0]?.amount).toBe(700_000);
  });
  test("DB positive CHECK, unique effective date, employee cascade", async () => {
    const target = await employee("constraint");
    const data = {
      employeeId: target,
      companyId: company,
      effectiveFrom: date("2020-01-01"),
      note: "Test",
      createdBy: sa.account.id,
    };
    await expect(
      (async () => prisma.dailyWage.create({ data: { ...data, amount: 0 } }))(),
    ).rejects.toThrow();
    await prisma.dailyWage.create({ data: { ...data, amount: 100 } });
    await expect(
      (async () => prisma.dailyWage.create({ data: { ...data, amount: 200 } }))(),
    ).rejects.toThrow();
    await prisma.employee.delete({ where: { id: target } });
    expect(await prisma.dailyWage.count({ where: { employeeId: target } })).toBe(0);
  });
  test("APPROVED only; OPEN/PENDING separate; three full months and current month", async () => {
    const thl = (await contracts(required, hrNo)).thl;
    expect(thl?.evaluation.status).toBe("REQUIRED");
    expect(thl?.evaluation.months.map((m) => m.presentDays)).toEqual([21, 21, 21]);
    expect(thl?.evaluation.months[2]?.pendingDays).toBe(2);
    expect(thl?.evaluation.currentMonth).toEqual({
      month: currentMonth,
      presentDays: 2,
      pendingDays: 0,
    });
    expect((await contracts(approaching, hrNo)).thl?.evaluation.status).toBe("APPROACHING");
    expect((await contracts(noStatus, hrNo)).thl?.evaluation.status).toBe("NONE");
  });
  test("employee filter and scoped summary", async () => {
    for (const [status, id] of [
      ["REQUIRED", required],
      ["APPROACHING", approaching],
    ] as const) {
      const response = await request(`/employees?companyId=${company}&thlStatus=${status}`, hrNo);
      expect(response.status).toBe(200);
      const body = z
        .object({
          data: z.array(
            z.object({
              id: z.string(),
              thlStatus: z.string(),
              thlPresentDaysLastMonth: z.number(),
            }),
          ),
          meta: z.object({ total: z.number() }),
        })
        .parse(await response.json());
      expect(body.data).toEqual([{ id, thlStatus: status, thlPresentDaysLastMonth: 21 }]);
      expect(body.meta.total).toBe(1);
    }
    const response = await request(`/employees/summary?companyId=${company}`, hrNo);
    expect(response.status).toBe(200);
    const summary = z
      .object({
        data: z.object({
          active: z.object({
            thlStatuses: z.object({ REQUIRED: z.number(), APPROACHING: z.number() }),
          }),
        }),
      })
      .parse(await response.json());
    expect(summary.data.active.thlStatuses).toEqual({ REQUIRED: 1, APPROACHING: 1 });
    const other = await request(`/employees?companyId=${company}&thlStatus=REQUIRED`, hrOther);
    expect(z.object({ data: z.array(z.unknown()) }).parse(await other.json()).data).toHaveLength(0);
  });
  test("cron REQUIRED to company HR + manager, no APPROACHING; second run dedupes", async () => {
    await remindContracts(now);
    const where = { type: "contract.thl.required", body: { contains: `THL ${RUN}` } };
    const notes = await prisma.notification.findMany({ where });
    expect(notes.map((n) => n.recipientAccountId).sort()).toEqual(
      [hr.account.id, hrNo.account.id, manager.account.id].sort(),
    );
    for (const note of notes) {
      expect(note.body).toContain("required");
      expect(note.body).toContain("PP 35/2021 Ps. 10");
      expect(note.body).toContain("Jadikan Karyawan Tetap");
      expect(note.body).toContain(lastMonth);
      expect(note.body).toContain("21 hari hadir");
      if (note.recipientAccountId === manager.account.id) expect(note.link).toBeNull();
      else expect(note.link).toContain(required);
      expect(note.dedupeKey).toContain(required);
      expect(note.dedupeKey).toContain(lastMonth);
    }
    await remindContracts(now);
    expect(await prisma.notification.count({ where })).toBe(notes.length);
  });
});

const reportSchema = z.object({
  data: z.object({
    month: z.string(),
    note: z.string(),
    access: z.object({ wage: z.boolean() }),
    rows: z.array(
      z.object({
        employeeId: z.string(),
        presentDays: z.number(),
        pendingDays: z.number(),
        dailyWage: z.number().nullable().optional(),
        wageSegments: z
          .array(z.object({ effectiveFrom: z.string(), amount: z.number() }))
          .optional(),
        estimatedWage: z.number().nullable().optional(),
      }),
    ),
  }),
});
describe("THL report and export", () => {
  test("sum daily rates effective on APPROVED dates, round once to rupiah", async () => {
    await put(required, sa, {
      amount: 200_000.25,
      effectiveFrom: `${lastMonth}-11`,
      note: "Tarif baru",
    });
    const response = await request(
      `/reports/thl-attendance-wage?companyId=${company}&month=${lastMonth}`,
      hr,
    );
    expect(response.status).toBe(200);
    const report = reportSchema.parse(await response.json()).data;
    expect(report.rows.find((r) => r.employeeId === required)).toMatchObject({
      presentDays: 21,
      pendingDays: 2,
      dailyWage: 200_000.25,
      estimatedWage: 3_700_003,
    });
    // Upah berubah dalam bulan → segmen (awal bulan + perubahan) supaya HR paham asal perkiraan.
    const segments = report.rows.find((r) => r.employeeId === required)?.wageSegments ?? [];
    expect(segments).toHaveLength(2);
    expect(segments[1]).toEqual({ effectiveFrom: `${lastMonth}-11`, amount: 200_000.25 });
    expect(thlWageChangeLabel(segments)).toContain("(11 ");
    expect(report.note.toLowerCase()).toContain("perkiraan, bukan payroll");
    expect(report.rows.find((r) => r.employeeId === noStatus)).toMatchObject({
      dailyWage: null,
      estimatedWage: null,
    });
    const no = await request(
      `/reports/thl-attendance-wage?companyId=${company}&month=${lastMonth}`,
      hrNo,
    );
    const raw = await no.json();
    const redacted = reportSchema.parse(raw).data;
    expect(redacted.access.wage).toBe(false);
    for (const row of redacted.rows) {
      expect(row).not.toHaveProperty("dailyWage");
      expect(row).not.toHaveProperty("estimatedWage");
      expect(row).not.toHaveProperty("wageSegments");
    }
    const other = reportSchema.parse(
      await (
        await request(
          `/reports/thl-attendance-wage?companyId=${company}&month=${lastMonth}`,
          hrOther,
        )
      ).json(),
    );
    expect(other.data.rows).toHaveLength(0);
    expect((await request("/reports/thl-attendance-wage?month=2026-13", sa)).status).toBe(400);
    expect((await request("/reports/thl-attendance-wage", manager)).status).toBe(403);
    expect((await request("/reports/thl-attendance-wage")).status).toBe(401);
    const defaultReport = reportSchema.parse(
      await (await request(`/reports/thl-attendance-wage?companyId=${company}`, sa)).json(),
    );
    expect(defaultReport.data.month).toBe(lastMonth);
  });
  test("xlsx follows wage access, OpenAPI contains named schemas and new endpoint", async () => {
    for (const login of [hr, hrNo]) {
      const response = await request(
        `/reports/thl-attendance-wage/export?companyId=${company}&month=${lastMonth}`,
        login,
      );
      expect(response.status).toBe(200);
      const file = z
        .object({ data: z.object({ fileName: z.string(), contentBase64: z.string() }) })
        .parse(await response.json()).data;
      expect(file.fileName).toEndWith(".xlsx");
      const xml = Object.values(unzipSync(Buffer.from(file.contentBase64, "base64")))
        .map((bytes) => strFromU8(bytes))
        .join(" ");
      expect(xml).toContain("Hari hadir");
      expect(xml.includes("Perkiraan upah")).toBe(login === hr);
      if (login === hrNo) {
        expect(xml).not.toContain("200000.25");
        expect(xml).not.toContain("3700003");
      }
    }
    const spec = await (await request("/openapi.json")).text();
    expect(spec).toContain("/employees/{id}/daily-wage");
    expect(spec).toContain("ThlDetails");
    expect(spec).toContain("ThlAttendanceWageReport");
  });
});

const previewSchema = z.object({
  data: z.object({
    previewHash: z.string(),
    rows: z.array(
      z.object({
        action: z.string(),
        issues: z.array(z.object({ code: z.string(), severity: z.string() })),
        dailyWage: z
          .object({ action: z.string(), amount: z.number(), effectiveFrom: z.string() })
          .nullable(),
      }),
    ),
  }),
});
function importBody(key: string, extra: Record<string, unknown> = {}, mode = "UPSERT") {
  return {
    fileName: "thl.xlsx",
    fileSha256: "a".repeat(64),
    mode,
    companyId: company,
    rows: [
      {
        sourceRow: 2,
        raw: {
          employeeNumber: `THL-${RUN}-${key.toUpperCase()}`,
          fullName: `THL ${RUN} ${key}`,
          joinDate: "2020-01-01",
          employmentStatusText: "Harian Lepas",
          positionName: `THL ${RUN}`,
          departmentName: `THL ${RUN}`,
          dailyWage: "Rp 150.000",
          ...extra,
        },
      },
    ],
  };
}
async function preview(body: ReturnType<typeof importBody>, login = sa) {
  const response = await request("/employee-imports/preview", login, "POST", body);
  expect(response.status).toBe(200);
  return previewSchema.parse(await response.json()).data;
}
async function importWage(body: ReturnType<typeof importBody>, login = sa) {
  const p = await preview(body, login);
  const response = await request("/employee-imports", login, "POST", {
    ...body,
    previewHash: p.previewHash,
  });
  expect({ status: response.status, body: await response.json() }).toMatchObject({ status: 201 });
  return p;
}
describe("import daily wage", () => {
  test("new THL, Indonesian parser, effective join date, audit without amount", async () => {
    const p = await importWage(importBody("import-new", { dailyWage: "150.000,00" }), hr);
    expect(p.rows[0]?.dailyWage).toEqual({
      action: "SET",
      amount: 150_000,
      effectiveFrom: "2020-01-01",
    });
    const e = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: `THL-${RUN}-IMPORT-NEW` },
    });
    expect(
      (await prisma.dailyWage.findFirstOrThrow({ where: { employeeId: e.id } })).amount.toString(),
    ).toBe("150000");
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: { entityId: e.id, action: "contract.daily_wage.set" },
        })
      ).after,
    ).toEqual({ effectiveFrom: "2020-01-01", source: "import" });
  });
  test("existing THL changed rate effective today, FILL_EMPTY and CREATE_ONLY", async () => {
    const body = importBody("import-new", { dailyWage: "160000" });
    const p = await importWage(body);
    expect(p.rows[0]?.dailyWage?.effectiveFrom).toBe(today);
    const e = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: `THL-${RUN}-IMPORT-NEW` },
    });
    expect(await prisma.dailyWage.count({ where: { employeeId: e.id } })).toBe(2);
    const fill = await importWage(importBody("import-new", { dailyWage: "170000" }, "FILL_EMPTY"));
    expect(fill.rows[0]?.dailyWage?.action).toBe("KEEP");
    expect(await prisma.dailyWage.count({ where: { employeeId: e.id } })).toBe(2);
    const createOnly = await importWage(
      importBody("import-new", { dailyWage: "180000" }, "CREATE_ONLY"),
    );
    expect(createOnly.rows[0]?.action).toBe("SKIP");
    const empty = await employee("empty");
    await importWage(importBody("empty", {}, "FILL_EMPTY"));
    expect(await prisma.dailyWage.count({ where: { employeeId: empty } })).toBe(1);
  });
  test("non THL and no grant ignored with warning; no wage in preview", async () => {
    const p = await preview(importBody("permanent", { employmentStatusText: "Karyawan Tetap" }));
    expect(p.rows[0]?.issues.some((i) => i.code === "DAILY_WAGE_IGNORED")).toBe(true);
    expect(p.rows[0]?.dailyWage).toBeNull();
    const no = await importWage(
      importBody("import-denied", { dailyWage: "invalid ignored cell" }),
      hrNo,
    );
    expect(no.rows[0]?.issues.some((i) => i.code === "DAILY_WAGE_NO_PERMISSION")).toBe(true);
    expect(no.rows[0]?.dailyWage).toBeNull();
    const e = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: `THL-${RUN}-IMPORT-DENIED` },
    });
    expect(await prisma.dailyWage.count({ where: { employeeId: e.id } })).toBe(0);
  });
  test("preview hash invalidated by existing wage change", async () => {
    const body = importBody("import-new", { dailyWage: "190000" });
    const before = await preview(body);
    const e = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: `THL-${RUN}-IMPORT-NEW` },
    });
    await put(e.id, sa, { amount: 180_000, effectiveFrom: today, note: "Perubahan bersamaan" });
    const after = await preview(body);
    expect(after.previewHash).not.toBe(before.previewHash);
    expect(
      (await request("/employee-imports", sa, "POST", { ...body, previewHash: before.previewHash }))
        .status,
    ).toBe(409);
  });
});

describe("opsi C daftar THL: thlAttendance + sort thlStreak", () => {
  const attendanceMonth = z.object({
    month: z.string(),
    presentDays: z.number(),
    pendingDays: z.number(),
    beforeJoin: z.boolean(),
  });
  const listSchema = z.object({
    data: z.array(
      z.object({
        id: z.string(),
        thlAttendance: z
          .object({
            months: z.array(attendanceMonth),
            currentMonth: attendanceMonth,
            streak: z.number(),
          })
          .nullable(),
      }),
    ),
    meta: z.object({ total: z.number() }),
  });
  const list = async (query: string, login: Login = hrNo) => {
    const response = await request(`/employees?companyId=${company}&${query}`, login);
    expect(response.status).toBe(200);
    return listSchema.parse(await response.json());
  };
  let late = "";
  beforeAll(async () => {
    // Masuk pertengahan bulan penuh terakhir: dua bulan sebelumnya "–" (bukan 0).
    late = await employee("late");
    await prisma.employee.update({
      where: { id: late },
      data: { joinDate: date(`${lastMonth}-15`) },
    });
    await days(late, lastMonth, 21);
  });

  test("tiga bulan penuh + bulan berjalan, batas 20/21, streak putus, sebelum masuk", async () => {
    const body = await list(`category=DAILY_WORKER&q=${encodeURIComponent(`THL ${RUN}`)}`);
    const of = (id: string) => body.data.find((row) => row.id === id)?.thlAttendance;
    const months = [-3, -2, -1].map((offset) => shiftThlMonth(currentMonth, offset));
    expect(of(required)?.months.map((m) => [m.month, m.presentDays])).toEqual(
      months.map((m) => [m, 21]),
    );
    expect(of(required)?.months[2]?.pendingDays).toBe(2);
    expect(of(required)?.currentMonth).toEqual({
      month: currentMonth,
      presentDays: 2,
      pendingDays: 0,
      beforeJoin: false,
    });
    expect(of(required)?.streak).toBe(3);
    // 20 di bulan tertua: dua bulan terakhir ≥ 21 → streak 2.
    expect(of(approaching)?.months.map((m) => m.presentDays)).toEqual([20, 21, 21]);
    expect(of(approaching)?.streak).toBe(2);
    // 21, 20, 21: putus di bulan tengah → streak 1.
    expect(of(noStatus)?.streak).toBe(1);
    expect(of(late)?.months.map((m) => m.beforeJoin)).toEqual([true, true, false]);
    expect(of(late)?.streak).toBe(1);
    // Non-THL (dan THL nonaktif) tidak membawa data hadir.
    const all = await list(`q=${encodeURIComponent(`THL ${RUN} permanent`)}`);
    expect(all.data.map((row) => row.thlAttendance)).toEqual([null]);
  });

  test("sort thlStreak desc/asc setelah filter + cakupan, paginasi halaman 2", async () => {
    const q = `category=DAILY_WORKER&q=${encodeURIComponent(`THL ${RUN}`)}`;
    const full = await list(`${q}&sort=thlStreak:desc&pageSize=100`);
    const ids = full.data.map((row) => row.id);
    const position = (id: string) => ids.indexOf(id);
    expect(position(required)).toBeLessThan(position(approaching));
    expect(position(approaching)).toBeLessThan(position(noStatus));
    // Seri streak 1: hadir bulan terakhir sama (21) → urut nama ("late" < "none").
    expect(position(late)).toBeLessThan(position(noStatus));
    const keys = full.data.map((row) => row.thlAttendance?.streak ?? -1);
    expect(keys).toEqual([...keys].sort((a, b) => b - a));
    // Halaman 2 (pageSize 2) = potongan yang sama dari urutan lengkap; total tetap.
    const page2 = await list(`${q}&sort=thlStreak:desc&pageSize=2&page=2`);
    expect(page2.data.map((row) => row.id)).toEqual(ids.slice(2, 4));
    expect(page2.meta.total).toBe(full.meta.total);
    const asc = await list(`${q}&sort=thlStreak:asc&pageSize=100`);
    const ascIds = asc.data.map((row) => row.id);
    expect(ascIds.indexOf(noStatus)).toBeLessThan(ascIds.indexOf(approaching));
    expect(ascIds.indexOf(approaching)).toBeLessThan(ascIds.indexOf(required));
    // Filter chip status tetap diterapkan sebelum urut.
    const chip = await list(`${q}&thlStatus=APPROACHING&sort=thlStreak:desc`);
    expect(chip.data.map((row) => row.id)).toEqual([approaching]);
    expect(chip.meta.total).toBe(1);
    // Cakupan PT: HR PT lain tidak melihat apa pun walau diurutkan.
    const other = await list(`${q}&sort=thlStreak:desc`, hrOther);
    expect(other.data).toHaveLength(0);
  });
});
