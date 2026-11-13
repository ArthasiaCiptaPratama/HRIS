import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { todayInJakarta } from "../../../src/modules/employee/employee.service.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";

// EMP-D6 tahap C: kolom HOMEBASE / HOMEBASE BERLAKU MULAI di import karyawan — master baru, riwayat
// berlaku per tanggal (CREATE = tanggal masuk, UPDATE = kolom/hari ini), EMP-D5 `IMPORT`, validasi.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const NUM = (n: string) => `IHB-${RUN}-${n}`;
const HB = (label: string) => `HBI ${label} ${RUN}`;
const auth = createAuthFixture(`ihb${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
/** Dua hari ke depan: pasti "masa depan" dalam WIB apa pun jam mesinnya. */
const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => ((await res.json()) as { data: any }).data;

const ids = {
  acp: "",
  department: "",
  position: "",
  status: "",
  homebaseA: "",
  homebaseB: "",
  archived: "",
  existing: "",
};
let sa: Awaited<ReturnType<typeof auth.loginAs>>;
const DEPT = `Dept IHB ${RUN}`;
const POS = `Jab IHB ${RUN}`;

const row = (sourceRow: number, raw: Record<string, unknown>) => ({ sourceRow, raw });
const newRow = (n: string, extra: Record<string, unknown> = {}) => ({
  employeeNumber: NUM(n),
  fullName: `IHB ${RUN} ${n}`,
  joinDate: "2025-01-06",
  departmentName: DEPT,
  positionName: POS,
  ...extra,
});
const body = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  fileName: "homebase.xlsx",
  fileSha256: "b".repeat(64),
  mode: "UPSERT",
  companyId: ids.acp,
  defaultEmploymentStatusId: ids.status,
  rows,
  ...extra,
});
const preview = async (rows: unknown[], extra: Record<string, unknown> = {}) => {
  const res = await call("POST", "/employee-imports/preview", sa.headers, body(rows, extra));
  expect(res.status).toBe(200);
  return data(res);
};
const commit = async (rows: unknown[], extra: Record<string, unknown> = {}) => {
  const p = await preview(rows, extra);
  const res = await call("POST", "/employee-imports", sa.headers, {
    ...body(rows, extra),
    previewHash: p.previewHash,
  });
  expect(res.status).toBe(201);
  return { preview: p, jobId: (await data(res)).jobId as string };
};
const entriesOf = (employeeId: string) =>
  prisma.employeeHomebase.findMany({
    where: { employeeId },
    select: { homebaseId: true, effectiveFrom: true, changedBy: true },
    orderBy: { effectiveFrom: "asc" },
  });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const currentOf = async (employeeId: string) =>
  (await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).homebaseId;

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.department = (await prisma.department.create({ data: { name: DEPT } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: POS, departmentId: ids.department } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `IHB St ${RUN}` } })).id;
  ids.homebaseA = (await prisma.homebase.create({ data: { name: HB("A") } })).id;
  ids.homebaseB = (await prisma.homebase.create({ data: { name: HB("B") } })).id;
  ids.archived = (
    await prisma.homebase.create({ data: { name: HB("Arsip"), deletedAt: new Date() } })
  ).id;
  // Karyawan lama dengan homebase A berlaku 2024-01-02 (riwayat + kolom turunan).
  ids.existing = (
    await prisma.employee.create({
      data: {
        companyId: ids.acp,
        employeeNumber: NUM("E1"),
        fullName: `IHB ${RUN} Lama`,
        joinDate: new Date("2024-01-02T00:00:00.000Z"),
        employmentStatusId: ids.status,
        positionId: ids.position,
        homebaseId: ids.homebaseA,
      },
    })
  ).id;
  await prisma.employeeHomebase.create({
    data: {
      employeeId: ids.existing,
      homebaseId: ids.homebaseA,
      effectiveFrom: new Date("2024-01-02T00:00:00.000Z"),
    },
  });
  sa = await auth.loginAs("SUPER_ADMIN");
});

afterAll(async () => {
  const employees = await prisma.employee.findMany({
    where: { employeeNumber: { startsWith: `IHB-${RUN}-` } },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);
  const accountIds = (
    await prisma.account.findMany({
      where: { email: { startsWith: `auth-ihb${RUN.toLowerCase()}-` } },
      select: { id: true },
    })
  ).map((a) => a.id);
  const jobs = await prisma.importJob.findMany({
    where: { actorAccountId: { in: accountIds } },
    select: { id: true },
  });
  const homebases = await prisma.homebase.findMany({
    where: { name: { endsWith: ` ${RUN}` }, AND: { name: { startsWith: "HBI " } } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      entityId: {
        in: [...employeeIds, ...jobs.map((j) => j.id), ...homebases.map((h) => h.id)],
      },
    },
  });
  await prisma.importJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
  await auth.cleanup();
  // Riwayat homebase & EMP-D5 ikut terhapus (cascade) bersama karyawan uji.
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.homebase.deleteMany({ where: { id: { in: homebases.map((h) => h.id) } } });
  await prisma.position.deleteMany({ where: { id: ids.position } });
  await prisma.department.deleteMany({ where: { id: ids.department } });
  await prisma.employmentStatus.deleteMany({ where: { id: ids.status } });
});

describe("import homebase (EMP-D6)", () => {
  test("CREATE + homebase baru → master dibuat, riwayat berlaku = tanggal masuk, kolom turunan terisi", async () => {
    const { preview: p, jobId } = await commit([
      row(2, newRow("C1", { homebaseName: HB("Baru") })),
    ]);
    expect(p.rows[0].action).toBe("CREATE");
    expect(p.masterData.homebases).toEqual([HB("Baru")]);
    const created = await prisma.homebase.findFirstOrThrow({ where: { name: HB("Baru") } });
    const employee = await prisma.employee.findFirstOrThrow({
      where: { employeeNumber: NUM("C1") },
    });
    expect(employee.homebaseId).toBe(created.id);
    const entries = await entriesOf(employee.id);
    expect(entries.map((e) => [e.homebaseId, iso(e.effectiveFrom)])).toEqual([
      [created.id, "2025-01-06"],
    ]);
    expect(entries[0]?.changedBy).toBe(sa.account.id);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: jobId, action: "employee.import.completed" },
    });
    expect((audit.after as { newMasterData: { homebases: number } }).newMasterData.homebases).toBe(
      1,
    );
    expect(
      await prisma.auditLog.count({
        where: { entityId: created.id, action: "organization.homebase.create" },
      }),
    ).toBe(1);
  });

  test("CREATE + homebase lama + tanggal berlaku dari kolom", async () => {
    await commit([
      row(2, newRow("C2", { homebaseName: HB("a"), homebaseEffectiveFrom: "2025-02-01" })),
    ]);
    const employee = await prisma.employee.findFirstOrThrow({
      where: { employeeNumber: NUM("C2") },
    });
    expect(employee.homebaseId).toBe(ids.homebaseA);
    expect((await entriesOf(employee.id)).map((e) => iso(e.effectiveFrom))).toEqual(["2025-02-01"]);
  });

  test("UPDATE ganti homebase dengan tanggal → baris baru + EMP-D5 IMPORT/WORK/homebase", async () => {
    const { preview: p, jobId } = await commit([
      row(2, {
        employeeNumber: NUM("E1"),
        homebaseName: HB("B"),
        homebaseEffectiveFrom: "2025-03-01",
      }),
    ]);
    expect(p.rows[0]).toMatchObject({ action: "UPDATE", changes: ["homebaseName"] });
    expect(
      (await entriesOf(ids.existing)).map((e) => [e.homebaseId, iso(e.effectiveFrom)]),
    ).toEqual([
      [ids.homebaseA, "2024-01-02"],
      [ids.homebaseB, "2025-03-01"],
    ]);
    expect(await currentOf(ids.existing)).toBe(ids.homebaseB);
    const changes = await prisma.employeeFieldChange.findMany({
      where: { employeeId: ids.existing, field: "homebase" },
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      source: "IMPORT",
      section: "WORK",
      oldValue: HB("A"),
      newValue: HB("B"),
      refId: jobId,
    });
  });

  test("UPDATE dengan homebase sama (tanpa tanggal / tanggal yang sudah ada) → tidak ada baris baru", async () => {
    const before = await entriesOf(ids.existing);
    for (const raw of [
      { employeeNumber: NUM("E1"), homebaseName: HB("B") },
      {
        employeeNumber: NUM("E1"),
        homebaseName: ` ${HB("b")} `,
        homebaseEffectiveFrom: "2025-03-01",
      },
    ]) {
      const p = await preview([row(2, raw)]);
      expect(p.rows[0]).toMatchObject({ action: "SKIP", changes: [] });
    }
    expect(await entriesOf(ids.existing)).toEqual(before);
  });

  test("UPDATE homebase tanpa tanggal → berlaku hari ini (WIB)", async () => {
    const employee = (
      await prisma.employee.create({
        data: {
          companyId: ids.acp,
          employeeNumber: NUM("E2"),
          fullName: `IHB ${RUN} Lama 2`,
          joinDate: new Date("2024-01-02T00:00:00.000Z"),
          employmentStatusId: ids.status,
          positionId: ids.position,
        },
      })
    ).id;
    await commit([row(2, { employeeNumber: NUM("E2"), homebaseName: HB("A") })]);
    expect((await entriesOf(employee)).map((e) => [e.homebaseId, iso(e.effectiveFrom)])).toEqual([
      [ids.homebaseA, todayInJakarta()],
    ]);
    expect(await currentOf(employee)).toBe(ids.homebaseA);
    // Kolom kosong sebelumnya → EMP-D5 dari "kosong" ke nama homebase.
    const change = await prisma.employeeFieldChange.findFirstOrThrow({
      where: { employeeId: employee, field: "homebase" },
    });
    expect(change).toMatchObject({ source: "IMPORT", oldValue: null, newValue: HB("A") });
  });

  test("pemetaan HR: nama di file → homebase yang sudah ada (tanpa master baru)", async () => {
    const mapping = {
      masterDataMapping: { homebases: { [HB("alias").toLowerCase()]: ids.homebaseB } },
    };
    const { preview: p } = await commit(
      [row(2, newRow("C3", { homebaseName: HB("Alias") }))],
      mapping,
    );
    expect(p.masterData.homebases).toEqual([]);
    const employee = await prisma.employee.findFirstOrThrow({
      where: { employeeNumber: NUM("C3") },
    });
    expect(employee.homebaseId).toBe(ids.homebaseB);
    expect(await prisma.homebase.count({ where: { name: HB("Alias") } })).toBe(0);
  });

  test("tanggal berlaku di masa depan → HOMEBASE_FUTURE_DATE, baris tidak diimpor", async () => {
    const rows = [
      row(2, newRow("F1", { homebaseName: HB("A"), homebaseEffectiveFrom: future })),
      row(3, { employeeNumber: NUM("E1"), homebaseName: HB("A"), homebaseEffectiveFrom: future }),
    ];
    const before = await entriesOf(ids.existing);
    const { preview: p } = await commit(rows);
    for (const r of p.rows) {
      expect(r.action).toBe("ERROR");
      expect(r.issues).toContainEqual({
        field: "homebaseEffectiveFrom",
        code: "HOMEBASE_FUTURE_DATE",
        severity: "ERROR",
      });
    }
    expect(await prisma.employee.count({ where: { employeeNumber: NUM("F1") } })).toBe(0);
    expect(await entriesOf(ids.existing)).toEqual(before);
  });

  test("tanggal berlaku tanpa nama homebase → peringatan diabaikan", async () => {
    const p = await preview([row(2, newRow("W1", { homebaseEffectiveFrom: "2025-01-10" }))]);
    expect(p.rows[0].action).toBe("CREATE");
    expect(p.rows[0].issues).toContainEqual({
      field: "homebaseEffectiveFrom",
      code: "HOMEBASE_DATE_IGNORED",
      severity: "WARNING",
    });
  });

  test("homebase terarsip → MASTER_ARCHIVED (tidak membuat master kembar)", async () => {
    const p = await preview([
      row(2, newRow("R1", { homebaseName: HB("Arsip") })),
      row(3, { employeeNumber: NUM("E1"), homebaseName: HB("Arsip") }),
    ]);
    for (const r of p.rows) {
      expect(r.action).toBe("ERROR");
      expect(r.issues).toContainEqual({
        field: "homebaseName",
        code: "MASTER_ARCHIVED",
        severity: "ERROR",
      });
    }
    expect(p.masterData.homebases).toEqual([]);
  });
});
