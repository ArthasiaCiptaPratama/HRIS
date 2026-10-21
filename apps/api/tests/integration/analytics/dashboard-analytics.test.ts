import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// DSB-D1 / TM-D10 — dashboard analitik pada PT uji terisolasi, bulan 2026-09.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
});
const call = (path: string, headers: Record<string, string>) =>
  app.request(`/api/v1${path}`, { headers });
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data;
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const WAGE = 7_200_000;

const ids = {
  company: "",
  other: "",
  department: "",
  position: "",
  grade: "",
  statuses: [] as string[],
  employees: [] as string[],
};
const emp = { e1: "", e2: "", e3: "", e4: "" };
let h: Record<"sa" | "hr" | "hrCost" | "hrOther" | "mgr" | "emp", Record<string, string>>;

type Analytics = {
  showCost: boolean;
  headcount: {
    start: number;
    joined: number;
    left: number;
    end: number;
    turnoverPct: number;
    leftByReason: Record<string, number>;
    history: unknown[];
  };
  gender: { gender: string; count: number }[];
  tenure: { avgYears: number; buckets: { bucket: string; count: number }[] };
  leave: { usedDays: number; remainingDays: number; onLeaveToday: number; pendingRequests: number };
  projection: {
    month: string;
    contractEnds: number;
    tierChanges: number;
    retirements: number | null;
    costDelta: number | null;
  }[];
  laborCost: {
    rows: { category: string; headcount: number; wage: number }[];
    wageMissing: number;
  } | null;
  liability: {
    severance: number;
    upmk: number;
    pkwt: number;
    leaveComp: number;
    total: number;
    employees: number;
    wageMissing: number;
  } | null;
};

beforeAll(async () => {
  ids.company = (
    await prisma.company.create({
      data: { code: `A${RUN.slice(0, 5)}`, name: `PT Analitik ${RUN}` },
    })
  ).id;
  ids.other = (
    await prisma.company.create({ data: { code: `B${RUN.slice(0, 5)}`, name: `PT Lain ${RUN}` } })
  ).id;
  ids.department = (await prisma.department.create({ data: { name: `AN ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `AN ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.grade = (await prisma.grade.create({ data: { name: `AN-G ${RUN}` } })).id;
  const st = async (name: string, category: "PERMANENT" | "PKWT" | null) => {
    const id = (
      await prisma.employmentStatus.create({ data: { name: `${name} ${RUN}`, category } })
    ).id;
    ids.statuses.push(id);
    return id;
  };
  // Kategori status unik per kategori → pakai status Tetap/PKWT yang ada (buat bila belum ada).
  const byCategory = async (category: "PERMANENT" | "PKWT", name: string) =>
    (await prisma.employmentStatus.findFirst({ where: { category } }))?.id ??
    (await st(name, category));
  const tetap = await byCategory("PERMANENT", "Tetap");
  const pkwt = await byCategory("PKWT", "PKWT");
  const lain = await st("Lain", null);
  const mk = async (n: string, data: Record<string, unknown>) => {
    const id = (
      await prisma.employee.create({
        data: {
          employeeNumber: `AN-${RUN}-${n}`,
          fullName: `Analitik ${RUN} ${n}`,
          companyId: ids.company,
          positionId: ids.position,
          ...data,
        } as never,
      })
    ).id;
    ids.employees.push(id);
    return id;
  };
  emp.e1 = await mk("E1", {
    joinDate: D("2020-08-01"),
    employmentStatusId: tetap,
    gender: "MALE",
    gradeId: ids.grade,
  });
  emp.e2 = await mk("E2", {
    joinDate: D("2026-03-15"),
    endDate: D("2027-02-28"),
    employmentStatusId: pkwt,
    gender: "FEMALE",
    gradeId: ids.grade,
  });
  emp.e3 = await mk("E3", {
    joinDate: D("2025-01-10"),
    endDate: D("2026-09-15"),
    isActive: false,
    exitReason: "RESIGNATION",
    employmentStatusId: tetap,
    gradeId: ids.grade,
  });
  emp.e4 = await mk("E4", {
    joinDate: D("2026-09-05"),
    employmentStatusId: lain,
    managerId: emp.e1,
  });
  // Akun pengubah dibuat test sendiri: DB kosong di CI belum punya akun apa pun.
  const sa = await auth.loginAs("SUPER_ADMIN");
  await prisma.gradeWage.create({
    data: {
      gradeId: ids.grade,
      basePay: 5_700_000,
      fixedAllowance: 1_500_000,
      updatedByAccountId: sa.account.id,
    },
  });
  await prisma.leaveLedger.createMany({
    data: [
      { employeeId: emp.e1, companyId: ids.company, year: 2026, kind: "GRANT", days: 12 },
      { employeeId: emp.e1, companyId: ids.company, year: 2026, kind: "USE", days: -2 },
    ],
  });
  h = {
    sa: sa.headers,
    hr: (await auth.loginAs("HR_ADMIN", { companies: [ids.company] })).headers,
    hrCost: (
      await auth.loginAs("HR_ADMIN", {
        companies: [ids.company],
        grants: [{ permission: "LABOR_COST_READ" }],
      })
    ).headers,
    hrOther: (await auth.loginAs("HR_ADMIN", { companies: [ids.other] })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.e1, companies: [ids.company] })).headers,
    emp: (await auth.loginAs("EMPLOYEE", { employeeId: emp.e4, companies: [ids.company] })).headers,
  };
});

afterAll(async () => {
  await prisma.leaveLedger.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.gradeWage.deleteMany({ where: { gradeId: ids.grade } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.grade.delete({ where: { id: ids.grade } });
  await prisma.employmentStatus.deleteMany({ where: { id: { in: ids.statuses } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.company, ids.other] } } });
  await disconnectPrisma();
});

const query = (extra = "") => `/dashboard/analytics?month=2026-09&companyId=${ids.company}${extra}`;

describe("dashboard analitik (DSB-D1)", () => {
  test("aktif/nonaktif bulan ini, turnover, gender, masa kerja, cuti", async () => {
    const a = await data<Analytics>(await call(query(), h.sa));
    // Awal: E1, E2, E3 · masuk: E4 · keluar: E3 (resign) · akhir: E1, E2, E4.
    expect(a.headcount).toMatchObject({
      start: 3,
      joined: 1,
      left: 1,
      end: 3,
      turnoverPct: 33.3,
      leftByReason: { RESIGNATION: 1 },
    });
    expect(a.headcount.history).toHaveLength(12);
    expect(Object.fromEntries(a.gender.map((g) => [g.gender, g.count]))).toEqual({
      MALE: 1,
      FEMALE: 1,
      UNKNOWN: 1,
    });
    const bucket = Object.fromEntries(a.tenure.buckets.map((b) => [b.bucket, b.count]));
    expect(bucket).toMatchObject({ "<1": 2, "5-10": 1 });
    expect(a.leave).toMatchObject({ usedDays: 2, remainingDays: 10, pendingRequests: 0 });
  });

  test("biaya hanya SA / HR ber-grant: labor cost & kewajiban PHK biasa", async () => {
    const a = await data<Analytics>(await call(query(), h.hrCost));
    expect(a.showCost).toBe(true);
    const cost = Object.fromEntries((a.laborCost?.rows ?? []).map((r) => [r.category, r.wage]));
    expect(cost).toMatchObject({ PERMANENT: WAGE, PKWT: WAGE, OTHER: 0 });
    expect(a.laborCost?.wageMissing).toBe(1);
    // E1 6,2 th: pesangon 7 + UPMK 3 bulan; E2 PKWT 6 bulan → ½ bulan; sisa cuti E1 10 hari ÷21.
    expect(a.liability).toMatchObject({
      severance: 7 * WAGE,
      upmk: 3 * WAGE,
      pkwt: WAGE / 2,
      leaveComp: 3_428_571,
      total: 10 * WAGE + WAGE / 2 + 3_428_571,
      employees: 2,
      wageMissing: 1,
    });
    const resign = await data<Analytics>(await call(query("&scenario=RESIGN"), h.hrCost));
    expect(resign.liability).toMatchObject({ severance: 0, upmk: 0 });

    const plain = await data<Analytics>(await call(query(), h.hr));
    expect(plain).toMatchObject({ showCost: false, laborCost: null, liability: null });
    expect(plain.projection.every((p) => p.costDelta === null)).toBe(true);
  });

  test("proyeksi 12 bulan: PKWT habis Feb 2027, kenaikan tingkat pesangon Agu 2027", async () => {
    const a = await data<Analytics>(await call(query(), h.sa));
    expect(a.projection).toHaveLength(12);
    const byMonth = Object.fromEntries(a.projection.map((p) => [p.month, p]));
    expect(byMonth["2027-02"]).toMatchObject({ contractEnds: 1 });
    // E1 genap 7 th: pesangon 7 → 8 bulan (+1 bulan upah).
    expect(byMonth["2027-08"]).toMatchObject({ tierChanges: 1, costDelta: WAGE });
    expect(byMonth["2026-10"]?.retirements).toBe(0);
    // HR tanpa grant data pribadi: proyeksi pensiun tidak dihitung.
    const plain = await data<Analytics>(await call(query(), h.hr));
    expect(plain.projection[0]?.retirements).toBeNull();
  });

  test("akses: HR PT lain 403, karyawan 403, atasan hanya timnya tanpa rupiah", async () => {
    expect((await call(query(), h.hrOther)).status).toBe(403);
    expect((await call(query(), h.emp)).status).toBe(403);
    expect((await call("/dashboard/analytics?month=2026-13", h.sa)).status).toBe(400);
    const team = await data<Analytics & { scope: string }>(
      await call("/dashboard/analytics?month=2026-09", h.mgr),
    );
    expect(team.scope).toBe("team");
    expect(team.showCost).toBe(false);
    expect(team.headcount.end).toBe(1);
  });
});
