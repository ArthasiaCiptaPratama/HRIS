import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";

// D-042: import karyawan CSV/Excel — pratinjau (tanpa tulis), simpan (satu transaksi), cakupan PT
// (D-040), grant kolom sensitif (§4.2), resign → nonaktif, UPSERT tanpa menimpa sel kosong.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const NUM = (n: string) => `IMP-${RUN}-${n}`;
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});

type Headers = Record<string, string>;
const call = (method: string, path: string, headers: Headers, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => ((await res.json()) as { data: any }).data;

type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const ids = {
  department: "",
  position: "",
  permanent: "",
  pkwt: "",
  createdStatuses: [] as string[],
  existing: "",
};
let sa: Login;
let hr: Login;
let hrGranted: Login;
let mgr: Login;
const DEPT = `Dept Imp ${RUN}`;
const POS = `Jab Imp ${RUN}`;
const SHA = "a".repeat(64);

async function categoryStatus(category: "PERMANENT" | "PKWT") {
  const existing = await prisma.employmentStatus.findUnique({ where: { category } });
  if (existing) return existing.id;
  const created = await prisma.employmentStatus.create({
    data: { name: `${category} ${RUN}`, category },
  });
  ids.createdStatuses.push(created.id);
  return created.id;
}

const row = (sourceRow: number, raw: Record<string, unknown>) => ({ sourceRow, raw });
const baseRow = (n: string, extra: Record<string, unknown> = {}) => ({
  employeeNumber: NUM(n),
  fullName: `Impor ${RUN} ${n}`,
  joinDate: "2025-01-06",
  employmentStatusText: "PKWT I - 6 Bulan",
  departmentName: DEPT,
  positionName: POS,
  ...extra,
});
const body = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  fileName: "uji.xlsx",
  fileSha256: SHA,
  mode: "UPSERT",
  rows,
  ...extra,
});

beforeAll(async () => {
  ids.department = (await prisma.department.create({ data: { name: DEPT } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: POS, departmentId: ids.department } })
  ).id;
  ids.permanent = await categoryStatus("PERMANENT");
  ids.pkwt = await categoryStatus("PKWT");
  ids.existing = (
    await prisma.employee.create({
      data: {
        employeeNumber: NUM("E1"),
        fullName: `Impor ${RUN} Lama`,
        phoneNumber: "081200001111",
        joinDate: new Date("2024-01-02T00:00:00.000Z"),
        employmentStatusId: ids.pkwt,
        positionId: ids.position,
      },
    })
  ).id;
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN"); // tanpa grant
  hrGranted = await auth.loginAs("HR_ADMIN", {
    grants: [{ permission: "EMPLOYEE_PERSONAL_WRITE" }, { permission: "EMPLOYEE_BANK_WRITE" }],
  });
  mgr = await auth.loginAs("MANAGER");
});

afterAll(async () => {
  const employees = await prisma.employee.findMany({
    where: { employeeNumber: { startsWith: `IMP-${RUN}-` } },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);
  const accountIds = [sa, hr, hrGranted, mgr].map((l) => l.account.id);
  const jobs = await prisma.importJob.findMany({
    where: { actorAccountId: { in: accountIds } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...employeeIds, ...jobs.map((j) => j.id)] } },
  });
  await prisma.importJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
  await prisma.importMapping.deleteMany({ where: { updatedBy: { in: accountIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  // Master data yang dibuat import (nama berpenanda RUN) + auditnya.
  const createdDepts = await prisma.department.findMany({
    where: { name: { contains: RUN } },
    select: { id: true },
  });
  const deptIds = createdDepts.map((d) => d.id);
  const createdPositions = await prisma.position.findMany({
    where: { departmentId: { in: deptIds } },
    select: { id: true },
  });
  const grades = await prisma.grade.findMany({
    where: { name: { contains: RUN } },
    select: { id: true },
  });
  const locations = await prisma.workLocation.findMany({
    where: { name: { contains: RUN } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      entityId: {
        in: [
          ...deptIds,
          ...createdPositions.map((p) => p.id),
          ...grades.map((g) => g.id),
          ...locations.map((l) => l.id),
        ],
      },
    },
  });
  await auth.cleanup();
  await prisma.position.deleteMany({ where: { departmentId: { in: deptIds } } });
  await prisma.department.deleteMany({ where: { id: { in: deptIds } } });
  await prisma.grade.deleteMany({ where: { id: { in: grades.map((g) => g.id) } } });
  await prisma.workLocation.deleteMany({ where: { id: { in: locations.map((l) => l.id) } } });
  await prisma.employmentStatus.deleteMany({ where: { id: { in: ids.createdStatuses } } });
  await disconnectPrisma();
});

const countEmployees = () =>
  prisma.employee.count({ where: { employeeNumber: { startsWith: `IMP-${RUN}-` } } });

describe("POST /employee-imports/preview", () => {
  test("tidak menulis apa pun; aksi & masalah per baris; baris kosong dihitung terpisah", async () => {
    const before = await countEmployees();
    const res = await call(
      "POST",
      "/employee-imports/preview",
      sa.headers,
      body([
        row(6, baseRow("N1", { ktpNumber: "6271011205800901", gradeName: `3A ${RUN}` })),
        row(7, { employeeNumber: NUM("E1"), phoneNumber: "081299990000" }),
        row(8, baseRow("N2", { ktpNumber: "620201030199003" })),
        row(9, baseRow("N1")),
        row(10, { workLocationName: "0" }),
      ]),
    );
    expect(res.status).toBe(200);
    const preview = await data(res);
    expect(await countEmployees()).toBe(before);
    expect(preview.counts).toEqual({ total: 5, create: 1, update: 1, skip: 0, error: 2, blank: 1 });
    const byRow = Object.fromEntries(
      preview.rows.map((r: { sourceRow: number }) => [r.sourceRow, r]),
    );
    expect(byRow[6].action).toBe("CREATE");
    expect(byRow[7]).toMatchObject({ action: "UPDATE", changes: ["phoneNumber"] });
    expect(byRow[8].issues).toContainEqual({
      field: "ktpNumber",
      code: "INVALID_LENGTH_16",
      severity: "ERROR",
    });
    expect(byRow[9].issues).toContainEqual({
      field: "employeeNumber",
      code: "DUPLICATE_IN_FILE",
      severity: "ERROR",
    });
    expect(preview.masterData.grades).toEqual([`3A ${RUN}`]);
    // Tanpa nilai sensitif di respons.
    expect(JSON.stringify(preview)).not.toContain("6271011205800901");
    expect(preview.previewHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("karyawan baru wajib nama, status, tanggal masuk, jabatan & departemen", async () => {
    const preview = await data(
      await call(
        "POST",
        "/employee-imports/preview",
        sa.headers,
        body([row(6, { employeeNumber: NUM("W1") })]),
      ),
    );
    expect(preview.rows[0].issues.map((i: { code: string }) => i.code)).toEqual([
      "REQUIRED",
      "CATEGORY_REQUIRED",
      "JOIN_DATE_REQUIRED",
      "POSITION_REQUIRED",
    ]);
  });

  test("akses: MANAGER 403, tanpa token 401, body tidak valid 400", async () => {
    const b = body([row(6, baseRow("X1"))]);
    expect(await code(await call("POST", "/employee-imports/preview", mgr.headers, b))).toBe(
      "FORBIDDEN",
    );
    expect((await call("POST", "/employee-imports/preview", {}, b)).status).toBe(401);
    expect(
      await code(await call("POST", "/employee-imports/preview", sa.headers, { ...b, rows: [] })),
    ).toBe("VALIDATION_ERROR");
    expect(
      await code(
        await call("POST", "/employee-imports/preview", sa.headers, {
          ...b,
          rows: Array.from({ length: 2001 }, (_, i) => row(i + 1, baseRow(`M${i}`))),
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("POST /employee-imports (simpan)", () => {
  test("SA: buat karyawan + data pribadi + master data baru + resign nonaktif + jejak & audit", async () => {
    const payload = body([
      row(
        6,
        baseRow("C1", {
          ktpNumber: "6271011205800911",
          ptkpStatus: "K/2",
          bpjsEmploymentNumber: "Terdaftar 99000000011",
          bankName: "Mandiri",
          bankAccountNumber: "9990000000011",
          educationText: "S1",
          positionName: `Jab Baru ${RUN}`,
          departmentName: `Dept Baru ${RUN}`,
          workLocationName: `Site ${RUN}`,
        }),
      ),
      row(
        7,
        baseRow("C2", {
          exitMarker: "RESIGN",
          exitDate: "2026-05-31",
          joinDate: "2024-02-24",
          contractEndDate: "Permanent",
          employmentStatusText: null,
        }),
      ),
    ]);
    const preview = await data(
      await call("POST", "/employee-imports/preview", sa.headers, payload),
    );
    expect(preview.counts.create).toBe(2);
    const res = await call("POST", "/employee-imports", sa.headers, {
      ...payload,
      previewHash: preview.previewHash,
    });
    expect(res.status).toBe(201);
    const result = await data(res);
    expect(result.counts.create).toBe(2);

    const c1 = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: NUM("C1") },
      include: { personal: true, bankAccount: true, educations: true, histories: true },
    });
    expect(c1.employmentStatusId).toBe(ids.pkwt);
    expect(c1.personal).toMatchObject({
      ktpNumber: "6271011205800911",
      ptkpStatus: "K2",
      maritalStatus: "MARRIED",
      bpjsEmploymentNumber: "99000000011",
    });
    expect(c1.bankAccount?.accountNumber).toBe("9990000000011");
    expect(c1.educations[0]?.level).toBe("S1");
    expect(c1.histories.map((h) => h.changeType)).toEqual(["HIRED"]);
    const newDept = await prisma.department.findFirst({ where: { name: `Dept Baru ${RUN}` } });
    expect(newDept).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { action: "organization.department.create", entityId: newDept?.id },
      }),
    ).toBe(1);

    const c2 = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: NUM("C2") },
      include: { histories: { orderBy: { effectiveDate: "asc" } } },
    });
    expect(c2).toMatchObject({
      isActive: false,
      exitReason: "RESIGNATION",
      employmentStatusId: ids.permanent,
    });
    expect(c2.histories.map((h) => h.changeType)).toEqual(["HIRED", "DEACTIVATED"]);

    const job = await prisma.importJob.findUniqueOrThrow({
      where: { id: result.jobId },
      include: { issues: true },
    });
    expect(job).toMatchObject({ createdCount: 2, errorCount: 0, mode: "UPSERT" });
    expect(
      await prisma.auditLog.count({
        where: { action: "employee.import.completed", entityId: job.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: "employee.sensitive.write", entityId: c1.id },
      }),
    ).toBe(1);
  });

  test("UPSERT: sel kosong tidak menimpa; CREATE_ONLY melewati yang sudah ada", async () => {
    const payload = body([
      row(6, { employeeNumber: NUM("E1"), fullName: `Impor ${RUN} Lama Baru` }),
    ]);
    const preview = await data(
      await call("POST", "/employee-imports/preview", sa.headers, payload),
    );
    expect(preview.rows[0].changes).toEqual(["fullName"]);
    await call("POST", "/employee-imports", sa.headers, {
      ...payload,
      previewHash: preview.previewHash,
    });
    const e1 = await prisma.employee.findUniqueOrThrow({ where: { id: ids.existing } });
    expect(e1.fullName).toBe(`Impor ${RUN} Lama Baru`);
    expect(e1.phoneNumber).toBe("081200001111"); // tidak ada di file → tidak berubah

    const createOnly = await data(
      await call(
        "POST",
        "/employee-imports/preview",
        sa.headers,
        body([row(6, { employeeNumber: NUM("E1"), fullName: "X Y" })], { mode: "CREATE_ONLY" }),
      ),
    );
    expect(createOnly.rows[0]).toMatchObject({
      action: "SKIP",
      issues: [{ field: "employeeNumber", code: "EXISTS_SKIPPED", severity: "WARNING" }],
    });
  });

  test("HR tanpa grant: kolom sensitif dilewati & tidak tertulis; HR ber-grant menulisnya", async () => {
    const make = (n: string, ktp: string) =>
      body([
        row(6, baseRow(n, { ktpNumber: ktp, bankName: "BRI", bankAccountNumber: "9990000000077" })),
      ]);
    const p1 = await data(
      await call("POST", "/employee-imports/preview", hr.headers, make("H1", "6271011205800981")),
    );
    expect(p1.skippedFields).toEqual(["ktpNumber", "bankName", "bankAccountNumber"]);
    await call("POST", "/employee-imports", hr.headers, {
      ...make("H1", "6271011205800981"),
      previewHash: p1.previewHash,
    });
    const h1 = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: NUM("H1") },
      include: { personal: true, bankAccount: true },
    });
    expect(h1.personal).toBeNull();
    expect(h1.bankAccount).toBeNull();

    const p2 = await data(
      await call(
        "POST",
        "/employee-imports/preview",
        hrGranted.headers,
        make("H2", "6271011205800982"),
      ),
    );
    expect(p2.skippedFields).toEqual([]);
    await call("POST", "/employee-imports", hrGranted.headers, {
      ...make("H2", "6271011205800982"),
      previewHash: p2.previewHash,
    });
    const h2 = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: NUM("H2") },
      include: { personal: true, bankAccount: true },
    });
    expect(h2.personal?.ktpNumber).toBe("6271011205800982");
    expect(h2.bankAccount?.bankName).toBe("BRI");
  });

  test("kolom perusahaan dikenali tetapi belum disimpan (multi-perusahaan belum dirilis)", async () => {
    const preview = await data(
      await call(
        "POST",
        "/employee-imports/preview",
        hr.headers,
        body([row(6, baseRow("P1", { companyCode: "ZZZ" }))]),
      ),
    );
    expect(preview.rows[0]).toMatchObject({ action: "CREATE", issues: [] });
  });

  test("previewHash basi (data berubah sejak pratinjau) → 409", async () => {
    const payload = body([row(6, { employeeNumber: NUM("E1"), phoneNumber: "081277778888" })]);
    const preview = await data(
      await call("POST", "/employee-imports/preview", sa.headers, payload),
    );
    await prisma.employee.update({
      where: { id: ids.existing },
      data: { emergencyPhone: "081300000000" },
    });
    expect(
      await code(
        await call("POST", "/employee-imports", sa.headers, {
          ...payload,
          previewHash: preview.previewHash,
        }),
      ),
    ).toBe("CONFLICT");
  });
});

describe("Riwayat & profil pemetaan", () => {
  test("HR hanya melihat import miliknya; detail memuat masalah tanpa nilai", async () => {
    const list = (await (await call("GET", "/employee-imports", hr.headers)).json()) as {
      data: { actorAccountId: string; id: string }[];
    };
    expect(list.data.length).toBeGreaterThan(0);
    expect(list.data.every((j) => j.actorAccountId === hr.account.id)).toBe(true);
    const saJobs = (await (await call("GET", "/employee-imports", sa.headers)).json()) as {
      data: { id: string }[];
    };
    const saJob = saJobs.data.find((j) => !list.data.some((h) => h.id === j.id));
    if (saJob)
      expect((await call("GET", `/employee-imports/${saJob.id}`, hr.headers)).status).toBe(404);
    expect((await call("GET", "/employee-imports", mgr.headers)).status).toBe(403);
  });

  test("simpan & ambil profil pemetaan", async () => {
    const signature = "b".repeat(64);
    expect((await call("GET", `/employee-imports/mappings/${signature}`, sa.headers)).status).toBe(
      404,
    );
    const saved = await call("PUT", `/employee-imports/mappings/${signature}`, sa.headers, {
      mapping: { nama: "fullName", nik: "employeeNumber", no: null },
    });
    expect(saved.status).toBe(200);
    const got = await data(
      await call("GET", `/employee-imports/mappings/${signature}`, sa.headers),
    );
    expect(got.mapping).toEqual({ nama: "fullName", nik: "employeeNumber", no: null });
    expect(
      await code(
        await call("PUT", `/employee-imports/mappings/${signature}`, sa.headers, {
          mapping: { nama: "bukanField" },
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});
