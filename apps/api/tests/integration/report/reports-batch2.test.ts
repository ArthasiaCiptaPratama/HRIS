import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { tenureBucket } from "@hris/shared";
import { strFromU8, unzipSync } from "fflate";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// ARS-D21 (Laporan batch 2): masa kerja + jubilee, demografi agregat, mutasi & promosi menurut level
// jabatan, ulang tahun tanpa tahun lahir, aset tanpa harga + belum kembali, pengajuan data per grant.
const RUN = crypto.randomUUID().slice(0, 4).toUpperCase();
const auth = createAuthFixture(`rq${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
  storagePathPrefix: "",
});

type Headers = Record<string, string>;
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const call = (path: string, headers: Headers) => app.request(`/api/v1${path}`, { headers });
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => ((await res.json()) as { data: any }).data;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const YEAR = Number(TODAY.slice(0, 4));
const MONTH = Number(TODAY.slice(5, 7));
const MM = TODAY.slice(5, 7);
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ids = {
  co: "",
  other: "",
  status: "",
  unit: "",
  otherUnit: "",
  staff: "",
  spv: "",
  staff2: "",
  noLevel: "",
  a: "",
  b: "",
  c: "",
  category: "",
  ppeType: "",
};
const assetIds: string[] = [];
const startedAt = new Date();
let sa: Login;
let hr: Login;
let hrReview: Login;
let mgr: Login;

async function employee(n: string, extra: Record<string, unknown>) {
  const row = await prisma.employee.create({
    data: {
      companyId: ids.co,
      employeeNumber: `RQ-${RUN}-${n}`,
      fullName: `Laporan2 ${RUN} ${n}`,
      employmentStatusId: ids.status,
      positionId: ids.staff,
      joinDate: date("2024-01-02"),
      ...extra,
    },
  });
  return row.id;
}
const history = (employeeId: string, extra: Record<string, unknown>) =>
  prisma.employmentHistory.create({
    data: {
      employeeId,
      changeType: "POSITION_CHANGED",
      effectiveDate: date("2025-04-01"),
      changedBy: sa.account.id,
      ...extra,
    },
  });

beforeAll(async () => {
  ids.co = await createTestCompany(`S${RUN}`, `PT Laporan2 ${RUN}`);
  ids.other = await createTestCompany(`T${RUN}`, `PT Asal ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `RQ St ${RUN}` } })).id;
  ids.unit = (
    await prisma.department.create({ data: { name: `RQ Unit ${RUN}`, companyId: ids.co } })
  ).id;
  ids.otherUnit = (
    await prisma.department.create({ data: { name: `RQ Lain ${RUN}`, companyId: ids.co } })
  ).id;
  const position = async (name: string, departmentId: string, level: string | null) =>
    (
      await prisma.position.create({
        data: { name: `RQ ${name} ${RUN}`, departmentId, level: level as never },
      })
    ).id;
  ids.staff = await position("Staf", ids.unit, "STAFF");
  ids.spv = await position("Spv", ids.unit, "SUPERVISOR");
  ids.staff2 = await position("Staf2", ids.otherUnit, "STAFF");
  ids.noLevel = await position("Tanpa", ids.unit, null);
  sa = await auth.loginAs("SUPER_ADMIN");
  // A: genap 5 tahun bulan ini (jubilee), laki-laki, S1 + SMA, kota "jakarta", ulang tahun bulan ini.
  ids.a = await employee("A", { joinDate: date(`${YEAR - 5}-${MM}-01`), gender: "MALE" });
  // B: masuk tahun lalu, perempuan, kota "JAKARTA" (satu kelompok dengan A), lahir bulan lain.
  ids.b = await employee("B", { joinDate: date(`${YEAR - 1}-01-15`), gender: "FEMALE" });
  // C: sudah keluar — masih memegang aset & APD wajib kembali.
  ids.c = await employee("C", {
    positionId: ids.staff,
    endDate: date(`${YEAR}-01-31`),
    isActive: false,
    exitReason: "RESIGNATION",
  });
  const otherMonth = String((MONTH % 12) + 1).padStart(2, "0");
  await prisma.employeePersonal.create({
    data: { employeeId: ids.a, birthDate: date(`1995-${MM}-07`), originCity: "jakarta" },
  });
  await prisma.employeePersonal.create({
    data: { employeeId: ids.b, birthDate: date(`1960-${otherMonth}-03`), originCity: "JAKARTA" },
  });
  await prisma.education.createMany({
    data: [
      { employeeId: ids.a, schoolName: "SMA Uji", level: "SMA" },
      { employeeId: ids.a, schoolName: "Univ Uji", level: "S1" },
    ],
  });
  // Mutasi & promosi 2025.
  await history(ids.a, { fromPositionId: ids.staff, toPositionId: ids.spv }); // promosi
  await history(ids.b, { fromPositionId: ids.staff, toPositionId: ids.staff2 }); // mutasi + pindah PT
  await history(ids.b, {
    changeType: "COMPANY_CHANGED",
    fromCompanyId: ids.other,
    toCompanyId: ids.co,
  });
  await history(ids.c, {
    fromPositionId: ids.noLevel,
    toPositionId: ids.staff,
    effectiveDate: date("2025-06-10"),
  }); // level kosong
  await history(ids.a, {
    changeType: "COMPANY_CHANGED",
    fromCompanyId: ids.other,
    toCompanyId: ids.co,
    effectiveDate: date("2025-09-01"),
  }); // pindah PT saja
  await history(ids.a, {
    effectiveDate: date("2024-12-31"),
    fromPositionId: ids.spv,
    toPositionId: ids.staff,
  }); // tahun lain
  // Aset: dipegang C (keluar), tersedia, dipegang A lewat tanggal kembali; APD wajib kembali di C.
  ids.category = (
    await prisma.assetCategory.create({
      data: { code: `Q${RUN}`.slice(0, 6), name: `RQ Kat ${RUN}` },
    })
  ).id;
  const asset = async (n: string, status: "AVAILABLE" | "ASSIGNED") => {
    const row = await prisma.asset.create({
      data: {
        code: `RQ-${RUN}-${n}`,
        categoryId: ids.category,
        name: `Laptop ${n}`,
        companyId: ids.co,
        status,
        purchasePrice: "12345678.00",
      },
    });
    assetIds.push(row.id);
    return row.id;
  };
  const held = await asset("1", "ASSIGNED");
  await asset("2", "AVAILABLE");
  const loan = await asset("3", "ASSIGNED");
  await prisma.assetAssignment.create({
    data: {
      assetId: held,
      employeeId: ids.c,
      assignedAt: date(`${YEAR - 1}-06-01`),
      conditionOut: "GOOD",
      assignedBy: sa.account.id,
    },
  });
  await prisma.assetAssignment.create({
    data: {
      assetId: loan,
      employeeId: ids.a,
      assignedAt: date(`${YEAR - 1}-06-01`),
      dueBackAt: date(`${YEAR - 1}-07-01`),
      conditionOut: "GOOD",
      assignedBy: sa.account.id,
    },
  });
  ids.ppeType = (
    await prisma.ppeType.create({
      data: { code: `P${RUN}`.slice(0, 6), name: `RQ Helm ${RUN}`, mustReturn: true },
    })
  ).id;
  await prisma.ppeIssue.create({
    data: {
      ppeTypeId: ids.ppeType,
      employeeId: ids.c,
      quantity: 2,
      issuedAt: date(`${YEAR - 1}-06-01`),
      issuedBy: sa.account.id,
    },
  });
  // Pengajuan data: 1 disetujui (2 hari), 1 ditolak (1 hari), 1 menunggu — semua tahun ini.
  const request = (section: string, status: string, created: string, reviewed: string | null) =>
    prisma.dataChangeRequest.create({
      data: {
        employeeId: ids.a,
        section: section as never,
        status: status as never,
        payload: { rahasia: `NILAI-${RUN}` },
        submittedBy: sa.account.id,
        createdAt: new Date(created),
        reviewedAt: reviewed ? new Date(reviewed) : null,
        reviewedBy: reviewed ? sa.account.id : null,
      },
    });
  await request("PERSONAL", "APPROVED", `${YEAR}-01-10T02:00:00Z`, `${YEAR}-01-12T02:00:00Z`);
  await request("BANK", "REJECTED", `${YEAR}-01-10T02:00:00Z`, `${YEAR}-01-11T02:00:00Z`);
  await request("PERSONAL", "PENDING", `${YEAR}-01-20T02:00:00Z`, null);
  // 31 Des 20.00 UTC = 1 Jan 03.00 WIB → masuk tahun ini (bukan tahun lalu).
  await request("EMERGENCY", "CANCELLED", `${YEAR - 1}-12-31T20:00:00Z`, null);
  hr = await auth.loginAs("HR_ADMIN", { companies: [ids.co] });
  hrReview = await auth.loginAs("HR_ADMIN", {
    companies: [ids.co],
    grants: [{ permission: "EMPLOYEE_CHANGES_REVIEW" }],
  });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.a });
});

afterAll(async () => {
  const employees = [ids.a, ids.b, ids.c].filter(Boolean);
  await prisma.dataChangeRequest.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  if (ids.category) await prisma.assetCategory.delete({ where: { id: ids.category } });
  await prisma.ppeIssue.deleteMany({ where: { employeeId: { in: employees } } });
  if (ids.ppeType) await prisma.ppeType.delete({ where: { id: ids.ppeType } });
  await auth.cleanup();
  await prisma.auditLog.deleteMany({
    where: { occurredAt: { gte: startedAt }, entityType: "report" },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  for (const id of [ids.staff, ids.spv, ids.staff2, ids.noLevel])
    if (id) await prisma.position.delete({ where: { id } });
  for (const id of [ids.unit, ids.otherUnit])
    if (id) await prisma.department.delete({ where: { id } });
  if (ids.status) await prisma.employmentStatus.delete({ where: { id: ids.status } });
  for (const id of [ids.co, ids.other]) if (id) await prisma.company.delete({ where: { id } });
  await disconnectPrisma();
});

const q = (extra = "") => `?companyId=${ids.co}${extra}`;
const names = (rows: { fullName: string }[]) => rows.map((r) => r.fullName);

describe("akses (ARS-D16/D21)", () => {
  test("SA & HR 200; MANAGER 403; tanpa token 401; bulan tidak valid 400", async () => {
    const month = `&year=${YEAR}&month=${MONTH}`;
    expect((await call(`/reports/tenure${q(month)}`, sa.headers)).status).toBe(200);
    expect((await call(`/reports/demographics${q()}`, hr.headers)).status).toBe(200);
    expect((await call(`/reports/assets${q()}`, mgr.headers)).status).toBe(403);
    expect((await call(`/reports/birthdays${q(month)}`, {})).status).toBe(401);
    expect(
      (await call(`/reports/birthdays${q(`&year=${YEAR}&month=13`)}`, hr.headers)).status,
    ).toBe(400);
  });
});

describe("masa kerja (ARS-D21)", () => {
  test("kelompok per hari ini untuk karyawan aktif + jubilee bulan terpilih", async () => {
    const r = await data(
      await call(`/reports/tenure${q(`&year=${YEAR}&month=${MONTH}`)}`, hr.headers),
    );
    expect(r.total).toBe(2); // C sudah keluar
    const count = (key: string) => r.buckets.find((b: { key: string }) => b.key === key).count;
    const expected = [
      tenureBucket(`${YEAR - 5}-${MM}-01`, TODAY),
      tenureBucket(`${YEAR - 1}-01-15`, TODAY),
    ];
    for (const key of new Set(expected)) {
      expect(count(key)).toBe(expected.filter((k) => k === key).length);
    }
    expect(r.jubilees).toEqual([
      expect.objectContaining({ fullName: `Laporan2 ${RUN} A`, years: 5 }),
    ]);
  });
});

describe("demografi (ARS-D21)", () => {
  test("agregat saja: gender, pendidikan tertinggi, kota asal disatukan; tanpa nama & tanggal lahir", async () => {
    const r = await data(await call(`/reports/demographics${q()}`, hr.headers));
    expect(r.total).toBe(2);
    const of = (rows: { label: string; count: number }[], label: string) =>
      rows.find((x) => x.label === label)?.count;
    expect(of(r.gender, "Laki-laki")).toBe(1);
    expect(of(r.gender, "Perempuan")).toBe(1);
    expect(of(r.education, "S1")).toBe(1);
    expect(of(r.education, "SMA/SMK")).toBeUndefined();
    expect(of(r.education, "Belum diisi")).toBe(1);
    expect(of(r.originCity, "Jakarta")).toBe(2);
    expect(of(r.age, "≥ 55 tahun")).toBe(1);
    const text = JSON.stringify(r);
    expect(text).not.toContain(`Laporan2 ${RUN}`);
    expect(text).not.toContain("1995-");
  });
});

describe("mutasi & promosi (ARS-D21)", () => {
  test("level naik = promosi, sama = mutasi (pindah PT digabung), kosong = belum diisi; tahun lain tidak masuk", async () => {
    const r = await data(await call(`/reports/movements${q("&year=2025")}`, hr.headers));
    expect(r.counts).toEqual({ PROMOTION: 1, DEMOTION: 0, TRANSFER: 2, UNRANKED: 1 });
    expect(r.total).toBe(4);
    expect(r.byMonth[3]).toMatchObject({ PROMOTION: 1, TRANSFER: 1 }); // April
    const b = r.rows.find((x: { fullName: string }) => x.fullName === `Laporan2 ${RUN} B`);
    expect(b).toMatchObject({
      kind: "TRANSFER",
      fromLevel: "Staf / Operator",
      toUnit: `RQ Lain ${RUN}`,
      fromCompany: `T${RUN}`,
      toCompany: `S${RUN}`,
    });
    const companyOnly = r.rows.find(
      (x: { effectiveDate: string }) => x.effectiveDate === "2025-09-01",
    );
    expect(companyOnly).toMatchObject({ kind: "TRANSFER", fromPosition: null });
  });
});

describe("ulang tahun (ARS-D21)", () => {
  test("karyawan aktif bulan terpilih, hanya hari (tanpa tahun lahir)", async () => {
    const r = await data(
      await call(`/reports/birthdays${q(`&year=${YEAR}&month=${MONTH}`)}`, hr.headers),
    );
    expect(names(r.rows)).toEqual([`Laporan2 ${RUN} A`]);
    expect(r.rows[0].day).toBe(7);
    expect(JSON.stringify(r)).not.toContain("1995");
  });
});

describe("aset (ARS-D21)", () => {
  test("per status + pinjaman terlambat + belum kembali dari karyawan keluar; harga tidak ikut", async () => {
    const r = await data(await call(`/reports/assets${q()}`, hr.headers));
    expect(r.total).toBe(3);
    expect(r.counts).toMatchObject({ AVAILABLE: 1, ASSIGNED: 2 });
    expect(r.overdueLoans).toBe(1);
    expect(
      r.unreturned.map((x: { kind: string; quantity: number }) => [x.kind, x.quantity]).sort(),
    ).toEqual([
      ["APD", 2],
      ["Aset", 1],
    ]);
    expect(names(r.unreturned)).toEqual([`Laporan2 ${RUN} C`, `Laporan2 ${RUN} C`]);
    expect(JSON.stringify(r)).not.toContain("12345678");
  });
});

describe("pengajuan perubahan data (ARS-D21)", () => {
  test("jumlah & rata-rata proses untuk semua HR; daftar hanya pemeriksa; nilai tidak ikut", async () => {
    const plain = await data(await call(`/reports/data-changes${q(`&year=${YEAR}`)}`, hr.headers));
    expect(plain.total).toBe(4);
    expect(plain.counts).toMatchObject({ PENDING: 1, APPROVED: 1, REJECTED: 1, CANCELLED: 1 });
    expect(plain.byMonth[0].submitted).toBe(4); // semua Januari menurut WIB
    expect(plain.pendingNow).toBe(1);
    expect(plain.averageDays).toBe(1.5);
    expect(plain.canList).toBe(false);
    expect(plain.rows).toEqual([]);
    expect(
      (await call(`/reports/data-changes/export${q(`&year=${YEAR}`)}`, hr.headers)).status,
    ).toBe(403);
    const granted = await data(
      await call(`/reports/data-changes${q(`&year=${YEAR}`)}`, hrReview.headers),
    );
    expect(granted.rows).toHaveLength(4);
    expect(JSON.stringify(granted)).not.toContain(`NILAI-${RUN}`);
  });
});

describe("ekspor Excel batch 2", () => {
  test("mutasi: sheet Ringkasan + daftar, filter tahun terbaca, audit", async () => {
    const res = await call(`/reports/movements/export${q("&year=2025")}`, hr.headers);
    expect(res.status).toBe(200);
    const file = await data(res);
    expect(file.fileName).toMatch(/^laporan-movements-/);
    const files = unzipSync(new Uint8Array(Buffer.from(file.contentBase64, "base64")));
    const xml = (path: string) => strFromU8(files[path] as Uint8Array);
    expect(xml("xl/workbook.xml")).toContain('<sheet name="Daftar perpindahan"');
    expect(xml("xl/worksheets/sheet1.xml")).toContain("Tahun 2025");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "report.export", entityId: "movements", actorAccountId: hr.account.id },
    });
    expect(audit).not.toBeNull();
  });

  test("ulang tahun & demografi bisa diekspor HR tanpa grant", async () => {
    expect(
      (await call(`/reports/birthdays/export${q(`&year=${YEAR}&month=${MONTH}`)}`, hr.headers))
        .status,
    ).toBe(200);
    expect((await call(`/reports/demographics/export${q()}`, hr.headers)).status).toBe(200);
    expect((await call(`/reports/assets/export${q()}`, hr.headers)).status).toBe(200);
    expect(
      (await call(`/reports/tenure/export${q(`&year=${YEAR}&month=${MONTH}`)}`, hr.headers)).status,
    ).toBe(200);
  });
});
