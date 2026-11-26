import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { EmploymentCategory } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// KTR-D12 (K3 poin 2): kolom kontrak di import karyawan → tabel kontrak dengan aturan aksi kontrak.
// Data FIKTIF berpenanda RUN; status kepegawaian dibuat bila DB kosong (CI tanpa seed) lalu dihapus.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const NUM = (n: string) => `IMK-${RUN}-${n}`;
const auth = createAuthFixture(`k${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});

type Login = Awaited<ReturnType<typeof auth.loginAs>>;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
type Any = any;
const call = (path: string, login: Login, payload: unknown) =>
  app.request(`/api/v1${path}`, {
    method: "POST",
    headers: { ...login.headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

const statuses = new Map<EmploymentCategory, string>();
const createdStatuses: string[] = [];
const ids = { acp: "", other: "", otherCode: `K${RUN}`, department: "", position: "" };
const DEPT = `Dept ImpK ${RUN}`;
const POS = `Jab ImpK ${RUN}`;
let sa: Login;
let hr: Login;
let hrNoGrant: Login;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

const newRow = (n: string, extra: Record<string, unknown> = {}) => ({
  employeeNumber: NUM(n),
  fullName: `ImporK ${RUN} ${n}`,
  joinDate: "2025-01-06",
  employmentStatusText: "PKWT",
  departmentName: DEPT,
  positionName: POS,
  ...extra,
});
const payload = (rows: Record<string, unknown>[], mode = "UPSERT") => ({
  fileName: "kontrak.xlsx",
  fileSha256: "b".repeat(64),
  mode,
  companyId: ids.acp,
  rows: rows.map((raw, i) => ({ sourceRow: i + 2, raw })),
});
async function preview(rows: Record<string, unknown>[], mode = "UPSERT", login = sa) {
  const res = await call("/employee-imports/preview", login, payload(rows, mode));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Any }).data;
}
async function commit(rows: Record<string, unknown>[], mode = "UPSERT", login = sa) {
  const p = await preview(rows, mode, login);
  const res = await call("/employee-imports", login, {
    ...payload(rows, mode),
    previewHash: p.previewHash,
  });
  expect(res.status).toBe(201);
  return p;
}
async function makeEmployee(n: string, category: EmploymentCategory, companyId = ids.acp) {
  const row = await prisma.employee.create({
    data: {
      companyId,
      employeeNumber: NUM(n),
      fullName: `ImporK ${RUN} ${n}`,
      joinDate: date("2024-01-01"),
      employmentStatusId: statuses.get(category) as string,
      positionId: ids.position,
    },
  });
  return row.id;
}
const contractsOf = (employeeId: string) =>
  prisma.employmentContract.findMany({ where: { employeeId }, orderBy: { startDate: "asc" } });
const byNumber = (n: string) =>
  prisma.employee.findUniqueOrThrow({ where: { employeeNumber: NUM(n) } });
/** Salinan `employees.contract_stage/contract_end_date` selalu sama dengan kontrak aktif. */
async function assertCopy(employeeId: string) {
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const current = await prisma.employmentContract.findFirst({
    where: { employeeId, status: "ACTIVE" },
  });
  expect(employee.contractStage).toBe(current?.kind === "PKWT" ? current.sequence : null);
  expect(employee.contractEndDate).toEqual(current?.endDate ?? null);
}

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.other = await createTestCompany(ids.otherCode, `PT ImporK ${RUN}`);
  ids.department = (await prisma.department.create({ data: { name: DEPT } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: POS, departmentId: ids.department } })
  ).id;
  for (const category of ["PKWT", "PROBATION", "PERMANENT", "DAILY_WORKER"] as const) {
    const existing = await prisma.employmentStatus.findFirst({ where: { category } });
    if (existing) statuses.set(category, existing.id);
    else {
      const created = await prisma.employmentStatus.create({
        data: { name: `ImporK ${category} ${RUN}`, category },
      });
      statuses.set(category, created.id);
      createdStatuses.push(created.id);
    }
  }
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { grants: [{ permission: "CONTRACT_MANAGE" }] });
  hrNoGrant = await auth.loginAs("HR_ADMIN");
});

afterAll(async () => {
  const employees = (
    await prisma.employee.findMany({
      where: { employeeNumber: { startsWith: `IMK-${RUN}-` } },
      select: { id: true },
    })
  ).map((e) => e.id);
  const accountIds = (
    await prisma.account.findMany({
      where: { email: { startsWith: `auth-k${RUN.toLowerCase()}-` } },
      select: { id: true },
    })
  ).map((a) => a.id);
  const jobs = (
    await prisma.importJob.findMany({
      where: { actorAccountId: { in: accountIds } },
      select: { id: true },
    })
  ).map((j) => j.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...employees, ...jobs] } } });
  await prisma.importJob.deleteMany({ where: { id: { in: jobs } } });
  await auth.cleanup();
  await prisma.employmentContract.updateMany({
    where: { employeeId: { in: employees } },
    data: { previousContractId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.deleteMany({ where: { id: { in: createdStatuses } } });
  await prisma.company.delete({ where: { id: ids.other } });
  await disconnectPrisma();
});

describe("import kolom kontrak — karyawan baru", () => {
  test("PKWT 1 baru: pratinjau menampilkan rencana, simpan membuat kontrak + salinan + riwayat + audit", async () => {
    const rows = [
      newRow("N1", {
        contractStage: "I",
        contractStartDate: "2025-01-06",
        contractEndDate: "05/07/2025",
      }),
    ];
    const p = await commit(rows);
    expect(p.rows[0]).toMatchObject({
      action: "CREATE",
      contract: {
        action: "CREATE",
        kind: "PKWT",
        sequence: 1,
        startDate: "2025-01-06",
        endDate: "2025-07-05",
        previous: null,
      },
    });
    const employee = await byNumber("N1");
    const contracts = await contractsOf(employee.id);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({ kind: "PKWT", sequence: 1, status: "ACTIVE" });
    await assertCopy(employee.id);
    expect(employee.contractStage).toBe(1);
    const history = await prisma.employmentHistory.findMany({
      where: { employeeId: employee.id, changeType: "CONTRACT_STAGE_CHANGED" },
    });
    expect(history).toHaveLength(1);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: employee.id, action: "contract.contract.create" },
    });
    expect(audit?.after).toMatchObject({ source: "import", contractId: contracts[0]?.id });
  });

  test("durasi (bulan) mengisi akhir; tahap dari teks status 'PKWT II' wajib Mulai PKWT 1", async () => {
    const missingFirst = await preview([
      newRow("N2", {
        employmentStatusText: "PKWT II",
        contractStartDate: "2025-01-06",
        contractDurationMonths: "6 bulan",
      }),
    ]);
    expect(missingFirst.rows[0].action).toBe("ERROR");
    expect(missingFirst.rows[0].issues).toContainEqual({
      field: "pkwtFirstStartDate",
      code: "CONTRACT_FIRST_PKWT_REQUIRED",
      severity: "ERROR",
    });
    const p = await commit([
      newRow("N2", {
        employmentStatusText: "PKWT II",
        contractStartDate: "2025-01-06",
        contractDurationMonths: 6,
        pkwtFirstStartDate: "2024-01-06",
      }),
    ]);
    expect(p.rows[0].contract).toMatchObject({
      action: "CREATE",
      sequence: 2,
      endDate: "2025-07-05",
      firstPkwtStartDate: "2024-01-06",
    });
    const employee = await byNumber("N2");
    const [contract] = await contractsOf(employee.id);
    expect(iso(contract?.pkwtFirstStartDate ?? null)).toBe("2024-01-06");
    await assertCopy(employee.id);
  });

  test("masa percobaan baru dari Mulai/Akhir percobaan", async () => {
    await commit([
      newRow("P1", {
        employmentStatusText: "Karyawan Percobaan",
        probationStartDate: "2025-01-06",
        probationEndDate: "2025-04-05",
      }),
    ]);
    const employee = await byNumber("P1");
    const contracts = await contractsOf(employee.id);
    expect(contracts.map((c) => [c.kind, c.sequence, iso(c.endDate)])).toEqual([
      ["PROBATION", null, "2025-04-05"],
    ]);
    await assertCopy(employee.id);
  });

  test("pelanggaran aturan = error baris dengan kode Indonesia; tidak ada yang tersimpan", async () => {
    const p = await preview([
      newRow("V1", { contractStartDate: "2025-01-06", contractEndDate: "2028-01-05" }),
      newRow("V2", {
        employmentStatusText: "Probation",
        probationStartDate: "2025-01-06",
        probationEndDate: "2025-06-05",
      }),
      newRow("V3", { contractStartDate: "2024-12-01", contractEndDate: "2025-05-31" }),
      newRow("V4", { contractStartDate: "2025-03-01", contractEndDate: "2025-02-01" }),
      newRow("V5", { contractStage: "IV", contractStartDate: "2025-01-06" }),
    ]);
    const codes = p.rows.map((r: Any) => [
      r.action,
      r.issues.map((i: Any) => `${i.field}:${i.code}`),
    ]);
    expect(codes[0]).toEqual(["ERROR", ["contractEndDate:CONTRACT_PKWT1_TOO_LONG"]]);
    expect(codes[1]).toEqual(["ERROR", ["probationEndDate:CONTRACT_PROBATION_TOO_LONG"]]);
    expect(codes[2]).toEqual(["ERROR", ["contractStartDate:CONTRACT_BEFORE_JOIN"]]);
    expect(codes[3][0]).toBe("ERROR");
    expect(codes[3][1]).toContain("contractEndDate:CONTRACT_END_BEFORE_START");
    expect(codes[4][1]).toContain("contractStage:UNKNOWN_CONTRACT_STAGE");
  });

  test("hash pratinjau berubah bila kolom kontrak berubah", async () => {
    const a = await preview([
      newRow("X1", { contractStartDate: "2025-01-06", contractEndDate: "2025-06-30" }),
    ]);
    const b = await preview([
      newRow("X1", { contractStartDate: "2025-01-06", contractEndDate: "2025-07-31" }),
    ]);
    expect(a.previewHash).not.toBe(b.previewHash);
  });

  test("kolom kontrak untuk Karyawan Tetap → peringatan diabaikan; tanpa mulai → belum lengkap", async () => {
    const p = await preview([
      newRow("T1", { employmentStatusText: "Karyawan Tetap", contractEndDate: "2025-12-31" }),
      newRow("T2", { contractEndDate: "2025-12-31" }),
    ]);
    expect(p.rows[0]).toMatchObject({ action: "CREATE", contract: null });
    expect(p.rows[0].issues).toContainEqual({
      field: "contractEndDate",
      code: "CONTRACT_FIELDS_IGNORED",
      severity: "WARNING",
    });
    expect(p.rows[1]).toMatchObject({ action: "CREATE", contract: null });
    expect(p.rows[1].issues).toContainEqual({
      field: "contractStartDate",
      code: "CONTRACT_INCOMPLETE",
      severity: "WARNING",
    });
  });
});

describe("import kolom kontrak — karyawan yang sudah ada", () => {
  let e1 = "";
  beforeAll(async () => {
    e1 = await makeEmployee("E1", "PKWT");
  });

  test("tanpa kontrak aktif → dibuat (UPSERT, baris hanya berisi kolom kontrak)", async () => {
    const p = await commit([
      { employeeNumber: NUM("E1"), contractStartDate: "2024-01-01", contractEndDate: "2024-12-31" },
    ]);
    expect(p.rows[0]).toMatchObject({
      action: "UPDATE",
      changes: ["contractStartDate", "contractEndDate"],
      contract: { action: "CREATE", sequence: 1 },
    });
    expect(await contractsOf(e1)).toHaveLength(1);
    await assertCopy(e1);
  });

  test("Isi yang kosong saja: tanggal beda pada kontrak aktif dibiarkan", async () => {
    const before = await contractsOf(e1);
    const p = await commit(
      [{ employeeNumber: NUM("E1"), contractEndDate: "2025-06-30" }],
      "FILL_EMPTY",
    );
    expect(p.rows[0]).toMatchObject({
      action: "SKIP",
      kept: ["contractEndDate"],
      contract: {
        action: "KEEP",
        endDate: "2025-06-30",
        previous: { startDate: "2024-01-01", endDate: "2024-12-31" },
      },
    });
    expect(await contractsOf(e1)).toEqual(before);
    await assertCopy(e1);
  });

  test("Perbarui: tahap sama & tanggal beda → koreksi + riwayat field + audit", async () => {
    const p = await commit([
      { employeeNumber: NUM("E1"), contractStage: 1, contractEndDate: "2025-06-30" },
    ]);
    expect(p.rows[0]).toMatchObject({
      action: "UPDATE",
      contract: {
        action: "CORRECT",
        startDate: "2024-01-01",
        endDate: "2025-06-30",
        previous: { startDate: "2024-01-01", endDate: "2024-12-31" },
      },
    });
    const [contract] = await contractsOf(e1);
    expect(iso(contract?.endDate ?? null)).toBe("2025-06-30");
    await assertCopy(e1);
    const changes = await prisma.employeeFieldChange.findMany({
      where: { employeeId: e1, source: "IMPORT", field: "contractEndDate" },
    });
    expect(changes.map((c) => [c.oldValue, c.newValue, c.refId])).toEqual([
      ["2024-12-31", "2025-06-30", contract?.id ?? null],
    ]);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: e1, action: "contract.contract.correct" },
    });
    expect(audit).toMatchObject({ reason: "Koreksi lewat import" });
    expect(audit?.after).toMatchObject({ source: "import", endDate: "2025-06-30" });
  });

  test("tanggal sama = tidak ada perubahan", async () => {
    const p = await preview([{ employeeNumber: NUM("E1"), contractEndDate: "2025-06-30" }]);
    expect(p.rows[0]).toMatchObject({ action: "SKIP", contract: null, issues: [] });
  });

  test("tanggal sama tetapi Mulai PKWT 1 ≠ awal tahap 1 → error (tidak diam-diam diabaikan)", async () => {
    const p = await preview([
      {
        employeeNumber: NUM("E1"),
        contractEndDate: "2025-06-30",
        pkwtFirstStartDate: "2023-01-01",
      },
    ]);
    expect(p.rows[0].action).toBe("ERROR");
    expect(p.rows[0].issues).toContainEqual({
      field: "pkwtFirstStartDate",
      code: "CONTRACT_FIRST_PKWT_MISMATCH",
      severity: "ERROR",
    });
  });

  test("tahap berbeda dengan kontrak aktif → error, ubah lewat tab Kepegawaian", async () => {
    const p = await preview([
      { employeeNumber: NUM("E1"), contractStage: "PKWT 2", contractEndDate: "2025-08-31" },
    ]);
    expect(p.rows[0].action).toBe("ERROR");
    expect(p.rows[0].issues).toContainEqual({
      field: "contractStage",
      code: "CONTRACT_STAGE_MISMATCH",
      severity: "ERROR",
    });
  });

  test("Tambah baru saja: karyawan yang ada dilewati tanpa membaca kontrak", async () => {
    const p = await preview(
      [{ employeeNumber: NUM("E1"), contractStage: 3, contractEndDate: "2025-08-31" }],
      "CREATE_ONLY",
    );
    expect(p.rows[0].action).toBe("SKIP");
    expect(p.rows[0].issues.map((i: Any) => i.code)).toEqual(["EXISTS_SKIPPED"]);
    expect(p.rows[0].contract).toBeNull();
  });

  test("koreksi dengan tahap sebelumnya: jeda antar-tahap = peringatan, tetap tersimpan", async () => {
    const id = await makeEmployee("G1", "PKWT");
    const first = await prisma.employmentContract.create({
      data: {
        employeeId: id,
        companyId: ids.acp,
        kind: "PKWT",
        sequence: 1,
        startDate: date("2024-01-01"),
        endDate: date("2024-12-31"),
        status: "EXTENDED",
        closedAt: new Date(),
      },
    });
    await prisma.employmentContract.create({
      data: {
        employeeId: id,
        companyId: ids.acp,
        kind: "PKWT",
        sequence: 2,
        startDate: date("2025-01-01"),
        endDate: date("2025-12-31"),
        previousContractId: first.id,
      },
    });
    const p = await commit([
      { employeeNumber: NUM("G1"), contractStartDate: "2025-01-10", contractEndDate: "2025-12-31" },
    ]);
    expect(p.rows[0].action).toBe("UPDATE");
    expect(p.rows[0].issues).toContainEqual({
      field: "contractEndDate",
      code: "CONTRACT_GAP",
      severity: "WARNING",
    });
    const active = (await contractsOf(id)).find((c) => c.status === "ACTIVE");
    expect(iso(active?.startDate ?? null)).toBe("2025-01-10");
    await assertCopy(id);
  });

  test("koreksi melewati batas PKWT 2 (1 tahun) → error", async () => {
    const p = await preview([{ employeeNumber: NUM("G1"), contractEndDate: "2026-03-31" }]);
    expect(p.rows[0].action).toBe("ERROR");
    expect(p.rows[0].issues).toContainEqual({
      field: "contractEndDate",
      code: "CONTRACT_PKWT_EXTENSION_TOO_LONG",
      severity: "ERROR",
    });
  });
});

describe("import kolom kontrak — akses", () => {
  test("HR dengan grant kontrak: PT sendiri ditulis; karyawan PT lain tetap di luar cakupan", async () => {
    const outsider = await makeEmployee("O1", "PKWT", ids.other);
    const p = await commit(
      [
        newRow("H1", { contractStartDate: "2025-01-06", contractEndDate: "2025-12-31" }),
        {
          employeeNumber: NUM("O1"),
          contractStartDate: "2024-01-01",
          contractEndDate: "2024-06-30",
        },
      ],
      "UPSERT",
      hr,
    );
    expect(p.rows[0]).toMatchObject({ action: "CREATE", contract: { action: "CREATE" } });
    expect(p.rows[1].action).toBe("ERROR");
    expect(p.rows[1].issues.map((i: Any) => i.code)).toEqual(["EXISTING_OUT_OF_SCOPE"]);
    expect(p.rows[1].contract).toBeNull();
    expect(await contractsOf(outsider)).toHaveLength(0);
    const created = await byNumber("H1");
    expect(await contractsOf(created.id)).toHaveLength(1);
    await assertCopy(created.id);
  });

  test("HR tanpa grant kontrak: karyawan tetap dibuat, kolom kontrak diabaikan (peringatan)", async () => {
    const p = await commit(
      [newRow("H2", { contractStartDate: "2025-01-06", contractEndDate: "2025-12-31" })],
      "UPSERT",
      hrNoGrant,
    );
    expect(p.rows[0]).toMatchObject({ action: "CREATE", contract: null });
    expect(p.rows[0].issues).toContainEqual({
      field: "contractStartDate",
      code: "CONTRACT_NO_PERMISSION",
      severity: "WARNING",
    });
    const created = await byNumber("H2");
    expect(await contractsOf(created.id)).toHaveLength(0);
    await assertCopy(created.id);
  });
});

describe("KTR-D4 (K3): import bukan jalan pintas status ke/dari PKWT/Percobaan", () => {
  test("PKWT → Karyawan Tetap & Tetap → Percobaan lewat import = error baris; tidak tersimpan", async () => {
    const pkwt = await makeEmployee("S1", "PKWT");
    const tetap = await makeEmployee("S2", "PERMANENT");
    const p = await preview([
      { employeeNumber: NUM("S1"), employmentStatusText: "Karyawan Tetap" },
      { employeeNumber: NUM("S2"), employmentStatusText: "Karyawan Percobaan" },
    ]);
    for (const row of p.rows) {
      expect(row.action).toBe("ERROR");
      expect(row.issues).toContainEqual(
        expect.objectContaining({ code: "STATUS_CONTRACT_CATEGORY", severity: "ERROR" }),
      );
    }
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: pkwt } })).employmentStatusId,
    ).toBe(statuses.get("PKWT") as string);
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: tetap } })).employmentStatusId,
    ).toBe(statuses.get("PERMANENT") as string);
  });
  test("THL → Karyawan Tetap lewat import boleh; masa kerja PKWTT mulai hari ini", async () => {
    const id = await makeEmployee("S3", "DAILY_WORKER");
    await commit([{ employeeNumber: NUM("S3"), employmentStatusText: "Karyawan Tetap" }]);
    const after = await prisma.employee.findUniqueOrThrow({ where: { id } });
    expect(after.employmentStatusId).toBe(statuses.get("PERMANENT") as string);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    expect(iso(after.pkwttStartDate)).toBe(today);
  });
  test("karyawan baru Karyawan Tetap lewat import: masa kerja PKWTT = tanggal masuk", async () => {
    await commit([newRow("S4", { employmentStatusText: "Karyawan Tetap" })]);
    expect(iso((await byNumber("S4")).pkwttStartDate)).toBe("2025-01-06");
    await commit([newRow("S5")]);
    expect((await byNumber("S5")).pkwttStartDate).toBeNull();
  });
});
