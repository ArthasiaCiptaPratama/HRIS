import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { strFromU8, unzipSync } from "fflate";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// ARS-D16/D17 (Arsip gelombang 3, Laporan batch 1): angka laporan dari data uji di PT uji tersendiri
// (deterministik), akses SA/HR/HR PT lain/MANAGER/karyawan, daftar sensitif ber-grant, ekspor + audit.
const RUN = crypto.randomUUID().slice(0, 4).toUpperCase();
const auth = createAuthFixture(`rp${RUN.toLowerCase()}`);
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
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => ((await res.json()) as { data: any }).data;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ids = {
  co: "",
  other: "",
  status: "",
  unit: "",
  subUnit: "",
  otherUnit: "",
  posA: "",
  posB: "",
  a: "",
  b: "",
  c: "",
  d: "",
  x: "",
  sensitiveType: "",
  plainType: "",
  violation: "",
};
const startedAt = new Date();
let sa: Login;
let hr: Login;
let hrDocs: Login;
let hrSp: Login;
let hrOther: Login;
let mgr: Login;
let emp: Login;

async function employee(n: string, extra: Record<string, unknown>) {
  const row = await prisma.employee.create({
    data: {
      companyId: ids.co,
      employeeNumber: `RP-${RUN}-${n}`,
      fullName: `Laporan ${RUN} ${n}`,
      employmentStatusId: ids.status,
      positionId: ids.posA,
      joinDate: date("2024-01-02"),
      ...extra,
    },
  });
  return row.id;
}
async function doc(employeeId: string, typeId: string, expiresAt: string | null) {
  await prisma.employeeDocument.create({
    data: {
      employeeId,
      type: "OTHER",
      documentTypeId: typeId,
      storagePath: `test/${RUN}/${crypto.randomUUID()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1000,
      uploadedBy: sa.account.id,
      expiresAt: expiresAt ? date(expiresAt) : null,
    },
  });
}

beforeAll(async () => {
  ids.co = await createTestCompany(`R${RUN}`, `PT Laporan ${RUN}`);
  ids.other = await createTestCompany(`Q${RUN}`, `PT Lain ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `RP St ${RUN}` } })).id;
  ids.unit = (
    await prisma.department.create({ data: { name: `RP Unit ${RUN}`, companyId: ids.co } })
  ).id;
  ids.subUnit = (
    await prisma.department.create({
      data: { name: `RP Sub ${RUN}`, companyId: ids.co, parentId: ids.unit, unitType: "SECTION" },
    })
  ).id;
  ids.otherUnit = (
    await prisma.department.create({ data: { name: `RP Lain ${RUN}`, companyId: ids.co } })
  ).id;
  ids.posA = (
    await prisma.position.create({ data: { name: `RP JabA ${RUN}`, departmentId: ids.subUnit } })
  ).id;
  ids.posB = (
    await prisma.position.create({ data: { name: `RP JabB ${RUN}`, departmentId: ids.otherUnit } })
  ).id;
  // 2025: A aktif sejak 2024; B masuk Mar 2025; C keluar Mei 2025 (resign); D masuk & keluar 2025 (unit lain).
  ids.a = await employee("A", {
    workEmail: `rp-a-${RUN.toLowerCase()}@example.test`,
    emergencyPhone: "0812",
    emergencyContactName: "Ibu",
  });
  ids.b = await employee("B", { joinDate: date("2025-03-10") });
  ids.c = await employee("C", {
    endDate: date("2025-05-31"),
    isActive: false,
    exitReason: "RESIGNATION",
  });
  ids.d = await employee("D", {
    positionId: ids.posB,
    joinDate: date("2025-02-01"),
    endDate: date("2025-08-15"),
    isActive: false,
    exitReason: "CONTRACT_ENDED",
  });
  ids.x = (
    await prisma.employee.create({
      data: {
        companyId: ids.other,
        employeeNumber: `RP-${RUN}-X`,
        fullName: `Laporan ${RUN} X`,
        employmentStatusId: ids.status,
        positionId: ids.posA,
        joinDate: date("2024-01-02"),
      },
    })
  ).id;
  await prisma.employeePersonal.create({
    data: {
      employeeId: ids.a,
      ktpNumber: `3${RUN.replace(/\D/g, "1").padEnd(4, "1")}11111111111`.slice(0, 16),
      npwpAbsent: true,
      bpjsEmploymentAbsent: true,
      bpjsHealthAbsent: true,
    },
  });
  await prisma.employeeBankAccount.create({
    data: { employeeId: ids.a, bankName: "BRI", accountNumber: `9${RUN}` },
  });
  ids.sensitiveType = (await prisma.documentType.findUniqueOrThrow({ where: { code: "SKCK" } })).id;
  ids.plainType = (await prisma.documentType.findUniqueOrThrow({ where: { code: "CERT_K3" } })).id;
  sa = await auth.loginAs("SUPER_ADMIN");
  await doc(ids.a, ids.plainType, addDays(TODAY, -5)); // kedaluwarsa
  await doc(ids.b, ids.plainType, addDays(TODAY, 20)); // ≤ 30
  await doc(ids.a, ids.sensitiveType, addDays(TODAY, 45)); // 31–60, sensitif
  await doc(ids.b, ids.plainType, addDays(TODAY, 200)); // > 90 → tidak masuk
  ids.violation = (await prisma.violationType.findUniqueOrThrow({ where: { code: "TELAT" } })).id;
  const year = Number(TODAY.slice(0, 4));
  await prisma.warningLetter.create({
    data: {
      employeeId: ids.a,
      companyId: ids.co,
      level: "SP1",
      violationTypeId: ids.violation,
      description: `Laporan ${RUN} uji SP aktif.`,
      status: "ISSUED",
      number: `RP/${RUN}/1`,
      issuedAt: date(addDays(TODAY, -10)),
      effectiveUntil: date(addDays(TODAY, 170)),
      createdBy: sa.account.id,
    },
  });
  await prisma.warningLetter.create({
    data: {
      employeeId: ids.b,
      companyId: ids.co,
      level: "SP2",
      violationTypeId: ids.violation,
      description: `Laporan ${RUN} uji SP kedaluwarsa.`,
      status: "EXPIRED",
      number: `RP/${RUN}/2`,
      issuedAt: date(`${year}-01-05`),
      effectiveUntil: date(`${year}-01-06`),
      createdBy: sa.account.id,
    },
  });
  hr = await auth.loginAs("HR_ADMIN", { companies: [ids.co] });
  hrDocs = await auth.loginAs("HR_ADMIN", {
    companies: [ids.co],
    grants: [{ permission: "EMPLOYEE_DOCUMENTS_READ" }],
  });
  hrSp = await auth.loginAs("HR_ADMIN", {
    companies: [ids.co],
    grants: [{ permission: "EMPLOYEE_DISCIPLINE_READ" }],
  });
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.other] });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.a });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.b });
});

afterAll(async () => {
  const employees = [ids.a, ids.b, ids.c, ids.d, ids.x].filter(Boolean);
  await prisma.warningLetter.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.employeeDocument.deleteMany({ where: { employeeId: { in: employees } } });
  await auth.cleanup();
  await prisma.auditLog.deleteMany({
    where: { occurredAt: { gte: startedAt }, entityType: "report" },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  for (const id of [ids.posA, ids.posB]) if (id) await prisma.position.delete({ where: { id } });
  for (const id of [ids.subUnit, ids.unit, ids.otherUnit])
    if (id) await prisma.department.delete({ where: { id } });
  if (ids.status) await prisma.employmentStatus.delete({ where: { id: ids.status } });
  for (const id of [ids.co, ids.other]) if (id) await prisma.company.delete({ where: { id } });
  await disconnectPrisma();
});

const q = (extra = "") => `?companyId=${ids.co}${extra}`;

describe("akses (ARS-D16)", () => {
  test("SA & HR 200; MANAGER & karyawan 403; tanpa token 401; tahun tidak valid 400", async () => {
    expect((await call(`/reports/headcount${q("&year=2025")}`, sa.headers)).status).toBe(200);
    expect((await call(`/reports/headcount${q("&year=2025")}`, hr.headers)).status).toBe(200);
    expect((await call(`/reports/headcount${q("&year=2025")}`, mgr.headers)).status).toBe(403);
    expect((await call(`/reports/completeness${q()}`, emp.headers)).status).toBe(403);
    expect((await call(`/reports/headcount${q("&year=2025")}`, {})).status).toBe(401);
    const bad = await call(`/reports/headcount${q("&year=1999")}`, sa.headers);
    expect(bad.status).toBe(400);
    expect(await code(bad)).toBe("VALIDATION_ERROR");
  });

  test("HR PT lain: PT di luar cakupan → laporan kosong (bukan data PT lain)", async () => {
    const r = await data(await call(`/reports/headcount${q("&year=2025")}`, hrOther.headers));
    expect(r.summary).toMatchObject({ startActive: 0, endActive: 0, joined: 0, left: 0 });
  });
});

describe("headcount & turnover (ARS-D17)", () => {
  test("2025 per bulan + setahun + rincian keluar per alasan", async () => {
    const r = await data(await call(`/reports/headcount${q("&year=2025")}`, hr.headers));
    expect(r.months).toHaveLength(12);
    expect(r.months[0]).toMatchObject({ startActive: 2, endActive: 2, joined: 0, left: 0 }); // A, C
    expect(r.months[1]).toMatchObject({ joined: 1, endActive: 3 }); // + D
    expect(r.months[2]).toMatchObject({ joined: 1, endActive: 4 }); // + B
    expect(r.months[4]).toMatchObject({ left: 1, startActive: 4, endActive: 4, turnover: 25 }); // C keluar 31 Mei
    expect(r.months[7]).toMatchObject({ left: 1, endActive: 2 }); // D keluar Agu
    expect(r.summary).toMatchObject({
      startActive: 2,
      endActive: 2,
      joined: 2,
      left: 2,
      turnover: 100,
    });
    expect(r.exitReasons.map((e: { count: number }) => e.count)).toEqual([1, 1]);
    expect(r.leavers.map((l: { fullName: string }) => l.fullName).sort()).toEqual([
      `Laporan ${RUN} C`,
      `Laporan ${RUN} D`,
    ]);
    expect(r.byCompany).toEqual([expect.objectContaining({ active: 2, joined: 2, left: 2 })]);
    // Daftar masuk (klik bulan di layar) berurutan tanggal masuk: D (Feb) lalu B (Mar).
    expect(r.joiners.map((j: { fullName: string }) => j.fullName)).toEqual([
      `Laporan ${RUN} D`,
      `Laporan ${RUN} B`,
    ]);
  });

  test("filter unit memasukkan sub-unit: unit induk → A, B, C (tanpa D di unit lain)", async () => {
    const r = await data(
      await call(`/reports/headcount${q(`&year=2025&unitId=${ids.unit}`)}`, hr.headers),
    );
    expect(r.summary).toMatchObject({ startActive: 2, endActive: 2, joined: 1, left: 1 });
  });
});

describe("dokumen kedaluwarsa (ARS-D17)", () => {
  test("kelompok lewat / ≤30 / 31–60; > 90 tidak masuk; dokumen sensitif disembunyikan tanpa grant", async () => {
    const plain = await data(await call(`/reports/document-expiry${q()}`, hr.headers));
    expect(plain.counts).toEqual({ EXPIRED: 1, D30: 1, D60: 1, D90: 0 });
    expect(plain.rows).toHaveLength(2);
    expect(plain.hiddenSensitive).toBe(1);
    const granted = await data(await call(`/reports/document-expiry${q()}`, hrDocs.headers));
    expect(granted.rows).toHaveLength(3);
    expect(granted.hiddenSensitive).toBe(0);
  });
});

describe("kelengkapan data (ARS-D17)", () => {
  test("data inti terisi/kosong tanpa nilai; NPWP/BPJS 'tidak punya' dianggap lengkap", async () => {
    const r = await data(await call(`/reports/completeness${q()}`, hr.headers));
    expect(r.total).toBe(2); // A & B aktif
    const a = r.rows.find((x: { fullName: string }) => x.fullName === `Laporan ${RUN} A`);
    const b = r.rows.find((x: { fullName: string }) => x.fullName === `Laporan ${RUN} B`);
    for (const item of [
      "NIK KTP",
      "NPWP",
      "BPJS Ketenagakerjaan",
      "Rekening bank",
      "Kontak darurat",
      "Email kantor",
    ]) {
      expect(a?.missing ?? []).not.toContain(item);
      expect(b.missing).toContain(item);
    }
    // Kode item untuk saringan di layar, sejajar dengan label.
    expect(b.missingKeys).toEqual(expect.arrayContaining(["KTP", "NPWP", "BANK", "WORK_EMAIL"]));
    expect(b.missingKeys).toHaveLength(b.missing.length);
    const text = JSON.stringify(r);
    expect(text).not.toContain(`9${RUN}`); // nomor rekening tidak pernah ikut
  });
});

describe("SP aktif (ARS-D17)", () => {
  test("jumlah untuk semua HR; daftar per orang hanya ber-grant SP", async () => {
    const year = TODAY.slice(0, 4);
    const plain = await data(
      await call(`/reports/warning-letters${q(`&year=${year}`)}`, hr.headers),
    );
    expect(plain.activeTotal).toBe(1);
    expect(plain.activeByLevel).toMatchObject({ SP1: 1, SP2: 0, SP3: 0 });
    expect(plain.unconfirmed).toBe(1);
    expect(plain.canList).toBe(false);
    expect(plain.rows).toEqual([]);
    const totalIssued = plain.issuedByMonth.reduce(
      (s: number, m: { SP1: number; SP2: number }) => s + m.SP1 + m.SP2,
      0,
    );
    expect(totalIssued).toBe(2);
    const granted = await data(
      await call(`/reports/warning-letters${q(`&year=${year}`)}`, hrSp.headers),
    );
    expect(granted.rows).toHaveLength(1);
    expect(granted.rows[0]).toMatchObject({ level: "SP1", number: `RP/${RUN}/1` });
    expect(
      (await call(`/reports/warning-letters/export${q(`&year=${year}`)}`, hr.headers)).status,
    ).toBe(403);
  });
});

describe("ekspor Excel", () => {
  test("file xlsx + audit report.export; MANAGER 403", async () => {
    const res = await call(`/reports/completeness/export${q()}`, hr.headers);
    expect(res.status).toBe(200);
    const file = await data(res);
    expect(file.fileName).toMatch(/^laporan-completeness-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const bytes = Buffer.from(file.contentBase64, "base64");
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    // Tata letak laporan: Ringkasan + rincian, judul, filter terbaca, keterangan kerahasiaan.
    const files = unzipSync(new Uint8Array(bytes));
    const xml = (path: string) => strFromU8(files[path] as Uint8Array);
    expect(xml("xl/workbook.xml")).toContain('<sheet name="Ringkasan"');
    expect(xml("xl/workbook.xml")).toContain('<sheet name="Daftar belum lengkap"');
    const summary = xml("xl/worksheets/sheet1.xml");
    expect(summary).toContain("Laporan Kelengkapan Data Karyawan");
    expect(summary).toContain("Filter: PT ");
    expect(summary).toContain("RAHASIA");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "report.export", entityId: "completeness", actorAccountId: hr.account.id },
    });
    expect(audit).not.toBeNull();
    expect((await call(`/reports/headcount/export${q("&year=2025")}`, mgr.headers)).status).toBe(
      403,
    );
  });
});
