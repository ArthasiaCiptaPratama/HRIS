import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";

// IMP-D1: Import melengkapi pemegang bagan ber-NIP sementara "ASLI-" (dibuat org:import-local) supaya
// file data asli tidak menggandakan karyawan. Saran nama/inisial di Pratinjau, pilihan HR per baris.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(`ich-${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
const call = (path: string, headers: Record<string, string>, body: unknown) =>
  app.request(`/api/v1${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => ((await res.json()) as { data: any }).data;

type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login;
let hrOther: Login;
const ids = {
  company: "",
  other: "",
  dept: "",
  postPosition: "",
  filePosition: "",
  status: "",
  post: "",
  bdm: "",
  arif: "",
  twinA: "",
  twinB: "",
  otherHolder: "",
};
const DEPT = `Dept ICH ${RUN}`;
const NUM = (n: string) => `ICH-${RUN}-${n}`;
const ASLI = (n: string) => `ASLI-ICH-${RUN}-${n}`;

async function holder(
  label: string,
  fullName: string,
  companyId = ids.company,
  orgPostId?: string,
) {
  return (
    await prisma.employee.create({
      data: {
        employeeNumber: ASLI(label),
        fullName,
        companyId,
        employmentStatusId: ids.status,
        positionId: ids.postPosition,
        joinDate: new Date("2020-01-01T00:00:00.000Z"),
        ...(orgPostId ? { orgPostId } : {}),
      },
    })
  ).id;
}

const fileRow = (sourceRow: number, raw: Record<string, unknown>) => ({ sourceRow, raw });
const body = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  fileName: "asli.xlsx",
  fileSha256: "b".repeat(64),
  mode: "UPSERT",
  companyId: ids.company,
  rows,
  ...extra,
});
const base = (n: string, fullName: string, extra: Record<string, unknown> = {}) => ({
  employeeNumber: NUM(n),
  fullName,
  joinDate: "2019-03-04",
  employmentStatusText: "PKWT",
  departmentName: DEPT,
  positionName: `Jab File ${RUN}`,
  ...extra,
});
const preview = async (payload: unknown, headers = sa.headers) =>
  data(await call("/employee-imports/preview", headers, payload));

beforeAll(async () => {
  ids.company = await createTestCompany(`C${RUN}`, `PT ICH ${RUN}`);
  ids.other = await createTestCompany(`D${RUN}`, `PT ICH Lain ${RUN}`);
  ids.dept = (await prisma.department.create({ data: { name: DEPT, companyId: ids.company } })).id;
  ids.postPosition = (
    await prisma.position.create({ data: { name: `Jab Pos ${RUN}`, departmentId: ids.dept } })
  ).id;
  ids.filePosition = (
    await prisma.position.create({ data: { name: `Jab File ${RUN}`, departmentId: ids.dept } })
  ).id;
  ids.status =
    (await prisma.employmentStatus.findUnique({ where: { category: "PKWT" } }))?.id ??
    (await prisma.employmentStatus.create({ data: { name: `PKWT ${RUN}`, category: "PKWT" } })).id;
  ids.post = (
    await prisma.orgPost.create({ data: { positionId: ids.postPosition, headcount: 3 } })
  ).id;
  ids.bdm = await holder("BDM", `Budiman ${RUN}, S.H., M.H.`, ids.company, ids.post);
  ids.arif = await holder("ARF", `M. Arif${RUN}`, ids.company, ids.post);
  ids.twinA = await holder("TWA", `Kembar ${RUN}`);
  ids.twinB = await holder("TWB", `Kembar ${RUN}`);
  ids.otherHolder = await holder("OTH", `Lain ${RUN}`, ids.other);
  sa = await auth.loginAs("SUPER_ADMIN");
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.other] });
});

afterAll(async () => {
  const employees = await prisma.employee.findMany({
    where: {
      OR: [
        { employeeNumber: { startsWith: `ICH-${RUN}-` } },
        { employeeNumber: { startsWith: `ASLI-ICH-${RUN}-` } },
        { companyId: { in: [ids.company, ids.other] } },
      ],
    },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);
  const accountIds = (
    await prisma.account.findMany({
      where: { email: { startsWith: `auth-ich-${RUN.toLowerCase()}-` } },
      select: { id: true },
    })
  ).map((a) => a.id);
  const jobs = await prisma.importJob.findMany({
    where: { actorAccountId: { in: accountIds } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...employeeIds, ...jobs.map((j) => j.id)] } },
  });
  await prisma.importJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
  await auth.cleanup();
  await prisma.employmentHistory.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.orgPost.deleteMany({ where: { id: ids.post } });
  const depts = await prisma.department.findMany({
    where: { OR: [{ id: ids.dept }, { name: { contains: RUN } }] },
    select: { id: true },
  });
  await prisma.position.deleteMany({ where: { departmentId: { in: depts.map((d) => d.id) } } });
  await prisma.department.deleteMany({ where: { id: { in: depts.map((d) => d.id) } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.company, ids.other] } } });
  await disconnectPrisma();
});

describe("IMP-D1 Pratinjau", () => {
  test("saran nama (tanpa gelar) & inisial wajib dipilih; tanpa kandidat tidak error; PT lain tidak", async () => {
    const result = await preview(
      body([
        fileRow(2, base("Z", `BUDIMAN ${RUN}`)),
        fileRow(3, base("I", `Muhammad Arif${RUN}`)),
        fileRow(4, base("K", `Kembar ${RUN}`)),
        fileRow(5, base("N", `Orang Baru ${RUN}`)),
        fileRow(6, base("L", `Lain ${RUN}`)),
      ]),
    );
    const byRow = new Map(result.rows.map((r: { sourceRow: number }) => [r.sourceRow, r]));
    // biome-ignore lint/suspicious/noExplicitAny: bentuk baris pratinjau
    const at = (n: number) => byRow.get(n) as any;
    expect(at(2).chartHolder.candidates).toEqual([{ id: ids.bdm, match: "NAME" }]);
    expect(at(2).action).toBe("ERROR");
    expect(at(2).issues.map((i: { code: string }) => i.code)).toContain(
      "CHART_HOLDER_CHOICE_REQUIRED",
    );
    expect(at(3).chartHolder.candidates).toEqual([{ id: ids.arif, match: "INITIALS" }]);
    expect(
      at(4)
        .chartHolder.candidates.map((c: { id: string }) => c.id)
        .sort(),
    ).toEqual([ids.twinA, ids.twinB].sort());
    expect(at(5).chartHolder).toEqual({ candidates: [], choice: null });
    expect(at(5).action).toBe("CREATE");
    // Pemegang bagan PT lain tidak disarankan untuk baris PT ini.
    expect(at(6).chartHolder.candidates).toEqual([]);
    // Daftar "belum dilengkapi" memuat pemegang bagan PT ini (dengan label pos).
    // biome-ignore lint/suspicious/noExplicitAny: daftar pemegang
    const holders = result.chartHolders.filter((h: any) => h.companyId === ids.company);
    expect(holders.map((h: { id: string }) => h.id).sort()).toEqual(
      [ids.bdm, ids.arif, ids.twinA, ids.twinB].sort(),
    );
    expect(holders.find((h: { id: string }) => h.id === ids.bdm).postLabel).toContain("Jab Pos");
  });

  test("HR PT lain tidak melihat pemegang bagan PT ini; satu pemegang dipilih dua baris → TAKEN", async () => {
    const hrView = await preview(
      body([fileRow(2, base("Z", `BUDIMAN ${RUN}`))], { companyId: ids.other }),
      hrOther.headers,
    );
    expect(hrView.chartHolders.map((h: { id: string }) => h.id)).toEqual([ids.otherHolder]);
    const twice = await preview(
      body([fileRow(2, base("Z", `BUDIMAN ${RUN}`)), fileRow(3, base("Y", `Siapa ${RUN}`))], {
        chartHolderChoices: { "2": ids.bdm, "3": ids.bdm },
      }),
    );
    const codes = twice.rows[1].issues.map((i: { code: string }) => i.code);
    expect(codes).toContain("CHART_HOLDER_TAKEN");
    // Pilihan yang bukan pemegang bagan → INVALID.
    const invalid = await preview(
      body([fileRow(2, base("Z", `BUDIMAN ${RUN}`))], {
        chartHolderChoices: { "2": crypto.randomUUID() },
      }),
    );
    expect(invalid.rows[0].issues.map((i: { code: string }) => i.code)).toContain(
      "CHART_HOLDER_INVALID",
    );
  });
});

describe("IMP-D1 Simpan", () => {
  test("gabung: NIP asli + data file, pos & jabatan pos tetap, tanpa karyawan baru, audit; NEW = baru", async () => {
    const before = await prisma.employee.count({ where: { companyId: ids.company } });
    const payload = body(
      [
        fileRow(2, base("Z", `BUDIMAN ${RUN}`, { phoneNumber: "081234567890" })),
        // Tanpa NIP: NIP sementara dikosongkan, NIK jadi kunci (manual dipilih tanpa saran).
        fileRow(3, {
          ...base("I", `Arif Lengkap ${RUN}`, { ktpNumber: "6271011205800977" }),
          employeeNumber: "",
        }),
        fileRow(4, base("K", `Kembar ${RUN}`)),
      ],
      {
        chartHolderChoices: { "2": ids.bdm, "3": ids.arif, "4": "NEW" },
        companyId: ids.company,
      },
    );
    const p = await preview(payload);
    expect(p.rows.map((r: { action: string }) => r.action)).toEqual(["UPDATE", "UPDATE", "CREATE"]);
    expect(p.rows[0].issues.map((i: { code: string }) => i.code)).toContain("CHART_POSITION_KEPT");
    const saved = await call("/employee-imports", sa.headers, {
      ...payload,
      previewHash: p.previewHash,
    });
    expect(saved.status).toBe(201);

    const bdm = await prisma.employee.findUniqueOrThrow({ where: { id: ids.bdm } });
    expect(bdm.employeeNumber).toBe(NUM("Z"));
    expect(bdm.fullName).toBe(`BUDIMAN ${RUN}`);
    expect(bdm.phoneNumber).toBe("081234567890");
    expect(bdm.orgPostId).toBe(ids.post);
    expect(bdm.positionId).toBe(ids.postPosition);
    const isn = await prisma.employee.findUniqueOrThrow({ where: { id: ids.arif } });
    expect(isn.employeeNumber).toBeNull();
    expect(isn.orgPostId).toBe(ids.post);
    // Hanya baris "NEW" yang menambah karyawan.
    expect(await prisma.employee.count({ where: { companyId: ids.company } })).toBe(before + 1);
    const audits = await prisma.auditLog.findMany({
      where: {
        action: "employee.import.chart_holder_merged",
        entityId: { in: [ids.bdm, ids.arif] },
      },
    });
    expect(audits).toHaveLength(2);

    // Setelah dilengkapi, tidak lagi muncul sebagai pemegang bagan sementara.
    const again = await preview(body([fileRow(2, base("Q", `Siapa Lagi ${RUN}`))]));
    const remaining = again.chartHolders.map((h: { id: string }) => h.id);
    expect(remaining).not.toContain(ids.bdm);
    expect(remaining).not.toContain(ids.arif);
  });
});
