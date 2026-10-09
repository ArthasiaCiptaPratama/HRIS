import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

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
  acp: "",
  other: "",
  otherCode: `I${RUN}`,
  department: "",
  position: "",
  permanent: "",
  pkwt: "",
  createdStatuses: [] as string[],
  existing: "",
  otherEmp: "",
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
// PT bawaan ACP: SA melihat semua PT sehingga wajib memilih PT untuk baris tanpa kolom perusahaan.
const body = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  fileName: "uji.xlsx",
  fileSha256: SHA,
  mode: "UPSERT",
  companyId: ids.acp,
  rows,
  ...extra,
});

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.other = await createTestCompany(ids.otherCode, `PT Impor ${RUN}`);
  ids.department = (await prisma.department.create({ data: { name: DEPT } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: POS, departmentId: ids.department } })
  ).id;
  ids.permanent = await categoryStatus("PERMANENT");
  ids.pkwt = await categoryStatus("PKWT");
  ids.existing = (
    await prisma.employee.create({
      data: {
        companyId: ids.acp,
        employeeNumber: NUM("E1"),
        fullName: `Impor ${RUN} Lama`,
        phoneNumber: "081200001111",
        joinDate: new Date("2024-01-02T00:00:00.000Z"),
        employmentStatusId: ids.pkwt,
        positionId: ids.position,
      },
    })
  ).id;
  ids.otherEmp = (
    await prisma.employee.create({
      data: {
        companyId: ids.other,
        employeeNumber: NUM("O1"),
        fullName: `Impor ${RUN} PT Lain`,
        joinDate: new Date("2024-01-02T00:00:00.000Z"),
        employmentStatusId: ids.pkwt,
        positionId: ids.position,
      },
    })
  ).id;
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN"); // ACP, tanpa grant
  hrGranted = await auth.loginAs("HR_ADMIN", {
    grants: [{ permission: "EMPLOYEE_PERSONAL_WRITE" }, { permission: "EMPLOYEE_BANK_WRITE" }],
  });
  mgr = await auth.loginAs("MANAGER");
});

afterAll(async () => {
  // D-063: karyawan tanpa NIP dikenali lewat nama berpenanda RUN.
  const employees = await prisma.employee.findMany({
    where: {
      OR: [
        { employeeNumber: { startsWith: `IMP-${RUN}-` } },
        { fullName: { startsWith: `Impor ${RUN}` } },
      ],
    },
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
  // D-064: unit baru bisa berjenjang (induk juga dari import) → lepas induk dulu.
  await prisma.department.updateMany({ where: { id: { in: deptIds } }, data: { parentId: null } });
  await prisma.department.deleteMany({ where: { id: { in: deptIds } } });
  await prisma.grade.deleteMany({ where: { id: { in: grades.map((g) => g.id) } } });
  await prisma.workLocation.deleteMany({ where: { id: { in: locations.map((l) => l.id) } } });
  await prisma.employmentStatus.deleteMany({ where: { id: { in: ids.createdStatuses } } });
  await prisma.company.delete({ where: { id: ids.other } });
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
    expect(preview.counts).toEqual({
      total: 5,
      create: 2,
      update: 1,
      skip: 0,
      error: 1,
      blank: 1,
      attachments: 0,
    });
    const byRow = Object.fromEntries(
      preview.rows.map((r: { sourceRow: number }) => [r.sourceRow, r]),
    );
    expect(byRow[6].action).toBe("CREATE");
    expect(byRow[7]).toMatchObject({ action: "UPDATE", changes: ["phoneNumber"] });
    // D-063: NIK KTP tidak valid = peringatan, baris tetap dibuat (NIK tidak disimpan).
    expect(byRow[8].action).toBe("CREATE");
    expect(byRow[8].issues).toContainEqual({
      field: "ktpNumber",
      code: "KTP_INVALID_SKIPPED",
      severity: "WARNING",
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

// D-062: status kepegawaian untuk baris yang belum ada di sistem (mis. Sheet Google Form tanpa kolom
// status) — per baris > kolom file > status bawaan; karyawan yang sudah ada tidak diubah statusnya.
describe("D-062 status bawaan & status per baris", () => {
  const noStatus = (n: string, extra: Record<string, unknown> = {}) =>
    baseRow(n, { employmentStatusText: null, ...extra });
  const preview = async (payload: unknown) =>
    data(await call("POST", "/employee-imports/preview", sa.headers, payload));
  const byRow = (p: { rows: { sourceRow: number }[] }) =>
    // biome-ignore lint/suspicious/noExplicitAny: bentuk baris pratinjau diperiksa per test
    Object.fromEntries(p.rows.map((r) => [r.sourceRow, r])) as Record<number, any>;

  test("bawaan untuk baris tanpa status, per baris diutamakan, kolom file mengalahkan bawaan", async () => {
    const p = byRow(
      await preview(
        body(
          [
            row(6, noStatus("S1")),
            row(7, noStatus("S2")),
            row(8, baseRow("S3")), // kolom file: PKWT
            row(9, { employeeNumber: NUM("E1"), phoneNumber: "081277770000" }),
          ],
          {
            defaultEmploymentStatusId: ids.permanent,
            employmentStatusOverrides: { "7": ids.pkwt },
          },
        ),
      ),
    );
    expect(p[6]).toMatchObject({
      action: "CREATE",
      newEmployee: true,
      employmentStatusId: ids.permanent,
    });
    expect(p[7]).toMatchObject({ action: "CREATE", employmentStatusId: ids.pkwt });
    expect(p[8]).toMatchObject({ action: "CREATE", employmentStatusId: ids.pkwt });
    // Karyawan yang sudah ada: status bawaan tidak berlaku.
    expect(p[9]).toMatchObject({ action: "UPDATE", newEmployee: false, employmentStatusId: null });
    expect(p[9].changes).not.toContain("employmentStatusText");
  });

  test("tanpa bawaan → CATEGORY_REQUIRED; status tidak dikenal → STATUS_INVALID; kunci baris salah 400", async () => {
    const missing = byRow(await preview(body([row(6, noStatus("S4"))])));
    expect(missing[6].issues.map((i: { code: string }) => i.code)).toEqual(["CATEGORY_REQUIRED"]);

    const unknown = byRow(
      await preview(
        body([row(6, noStatus("S5"))], { defaultEmploymentStatusId: crypto.randomUUID() }),
      ),
    );
    expect(unknown[6].issues).toEqual([
      { field: "employmentStatusText", code: "STATUS_INVALID", severity: "ERROR" },
    ]);
    expect(unknown[6].action).toBe("ERROR");

    expect(
      await code(
        await call(
          "POST",
          "/employee-imports/preview",
          sa.headers,
          body([row(6, noStatus("S6"))], { employmentStatusOverrides: { x: ids.pkwt } }),
        ),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  test("simpan: karyawan dibuat dengan status per baris / bawaan + riwayat HIRED", async () => {
    const payload = body([row(6, noStatus("S7")), row(7, noStatus("S8"))], {
      defaultEmploymentStatusId: ids.permanent,
      employmentStatusOverrides: { "7": ids.pkwt },
    });
    const p = await preview(payload);
    expect(p.counts.create).toBe(2);
    const res = await call("POST", "/employee-imports", sa.headers, {
      ...payload,
      previewHash: p.previewHash,
    });
    expect(res.status).toBe(201);
    const created = await prisma.employee.findMany({
      where: { employeeNumber: { in: [NUM("S7"), NUM("S8")] } },
      select: { employeeNumber: true, employmentStatusId: true, id: true },
      orderBy: { employeeNumber: "asc" },
    });
    expect(created.map((e) => e.employmentStatusId)).toEqual([ids.permanent, ids.pkwt]);
    const hired = await prisma.employmentHistory.findFirst({
      where: { employeeId: created[0]?.id, changeType: "HIRED" },
    });
    expect(hired?.toStatusId).toBe(ids.permanent);
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
    expect(c1.companyId).toBe(ids.acp);
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

  test("cakupan PT: HR ACP tidak bisa menulis ke PT lain atau mengubah karyawan PT lain", async () => {
    const preview = await data(
      await call(
        "POST",
        "/employee-imports/preview",
        hr.headers,
        body([
          row(6, baseRow("P1", { companyCode: ids.otherCode })),
          row(7, { employeeNumber: NUM("O1"), fullName: "Ganti" }),
          row(8, baseRow("P2", { companyCode: "ZZZ" })),
        ]),
      ),
    );
    const issuesOf = (r: number) =>
      preview.rows
        .find((x: { sourceRow: number }) => x.sourceRow === r)
        .issues.map((i: { code: string }) => i.code);
    expect(issuesOf(6)).toContain("COMPANY_OUT_OF_SCOPE");
    expect(issuesOf(7)).toContain("EXISTING_OUT_OF_SCOPE");
    expect(issuesOf(8)).toContain("COMPANY_UNKNOWN");
    expect(preview.counts.error).toBe(3);
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

describe("PT bawaan", () => {
  test("SA tanpa PT bawaan & tanpa kolom perusahaan → COMPANY_REQUIRED; HR 1 PT → otomatis PT-nya", async () => {
    const noCompany = { ...body([row(6, baseRow("D1"))]), companyId: undefined };
    const saPreview = await data(
      await call("POST", "/employee-imports/preview", sa.headers, noCompany),
    );
    expect(saPreview.rows[0].issues.map((i: { code: string }) => i.code)).toContain(
      "COMPANY_REQUIRED",
    );
    const hrPreview = await data(
      await call("POST", "/employee-imports/preview", hr.headers, noCompany),
    );
    expect(hrPreview.rows[0]).toMatchObject({ action: "CREATE", companyCode: "ACP" });
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

// D-059: Sheet respons Google Form "Formulir Data Karyawan" → Import (jalur utama pendataan existing).
describe("Field Formulir Data Karyawan (D-059)", () => {
  const formRow = (n: string, extra: Record<string, unknown> = {}) =>
    baseRow(n, {
      // 2 + 10 + 4 = 16 digit, unik per run.
      ktpNumber: `64${String(Number.parseInt(RUN, 36)).padStart(10, "0").slice(-10)}${n.slice(1).padStart(4, "0")}`,
      personalEmail: `form.${RUN.toLowerCase()}.${n.toLowerCase()}@Example.test`,
      nickname: "Dummy",
      nationality: "WNI",
      ethnicity: "Banjar",
      bloodType: "o positif",
      drivingLicenseTypes: "SIM A, C",
      drivingLicenseNumber: "0000-0000-0301",
      ...extra,
    });

  test("buat karyawan dengan email pribadi & data pribadi Form; ganda/terpakai ditolak; update jenis SIM", async () => {
    const preview = await data(
      await call(
        "POST",
        "/employee-imports/preview",
        sa.headers,
        body([
          row(2, formRow("F1")),
          row(3, formRow("F2", { personalEmail: `form.${RUN.toLowerCase()}.f1@example.test` })),
          row(4, formRow("F3", { bloodType: "Z", drivingLicenseTypes: "A, truk" })),
        ]),
      ),
    );
    expect(preview.rows[0].issues).toEqual([]);
    expect(preview.rows[1].issues).toContainEqual({
      field: "personalEmail",
      code: "DUPLICATE_PERSONAL_EMAIL_IN_FILE",
      severity: "ERROR",
    });
    expect(preview.rows[2].issues).toEqual([
      { field: "bloodType", code: "UNKNOWN_BLOOD_TYPE", severity: "WARNING" },
      { field: "drivingLicenseTypes", code: "UNKNOWN_DRIVING_LICENSE", severity: "WARNING" },
    ]);

    const ok = body([row(2, formRow("F1")), row(4, formRow("F3", { bloodType: "Z" }))]);
    const okPreview = await data(await call("POST", "/employee-imports/preview", sa.headers, ok));
    const saved = await call("POST", "/employee-imports", sa.headers, {
      ...ok,
      previewHash: okPreview.previewHash,
    });
    expect(saved.status).toBe(201);
    const f1 = await prisma.employee.findFirstOrThrow({
      where: { employeeNumber: NUM("F1") },
      include: { personal: true },
    });
    expect(f1.personalEmail).toBe(`form.${RUN.toLowerCase()}.f1@example.test`);
    expect(f1.personal).toMatchObject({
      nickname: "Dummy",
      nationality: "Indonesia",
      ethnicity: "Banjar",
      bloodType: "O+",
      drivingLicenseTypes: ["A", "C"],
      drivingLicenseNumber: "0000-0000-0301",
    });

    // Email pribadi milik karyawan lain → ditolak; jenis SIM berubah → hanya field itu yang berubah.
    const next = await data(
      await call(
        "POST",
        "/employee-imports/preview",
        sa.headers,
        body([
          row(2, {
            employeeNumber: NUM("F3"),
            personalEmail: `FORM.${RUN}.F1@example.test`,
          }),
          row(3, { employeeNumber: NUM("F1"), drivingLicenseTypes: "A, C, B1 Umum" }),
        ]),
      ),
    );
    expect(next.rows[0].issues).toContainEqual({
      field: "personalEmail",
      code: "PERSONAL_EMAIL_TAKEN",
      severity: "ERROR",
    });
    expect(next.rows[1].changes).toEqual(["drivingLicenseTypes"]);
    const same = await data(
      await call(
        "POST",
        "/employee-imports/preview",
        sa.headers,
        body([row(3, { employeeNumber: NUM("F1"), drivingLicenseTypes: "C, A" })]),
      ),
    );
    expect(same.rows[0].changes).toEqual([]);
  });
});

// D-059 lanjutan: bagian berulang Formulir Data Karyawan — keluarga, pendidikan 1–3, sertifikasi,
// alamat kontak darurat, No. SIM per jenis. Impor ulang = tambah yang belum ada.
describe("Bagian berulang Formulir Data Karyawan (D-059)", () => {
  const groupRow = (n: string, extra: Record<string, unknown> = {}) =>
    baseRow(n, {
      spouseName: "Pasangan Dummy",
      spouseOccupation: "Guru",
      spouseBirthDate: "01/01/1996",
      child1Name: "Anak Satu",
      child1Gender: "Perempuan",
      child1Education: "Belum Sekolah",
      fatherName: "Ayah Dummy",
      fatherAge: "60",
      fatherOccupation: "Pensiunan",
      education1Level: "S1",
      education1School: "Universitas Dummy",
      education1EntryYear: "2012",
      education1GraduationYear: "2016",
      education2Level: "SMA",
      education2School: "SMA Dummy",
      certK3UmumNumber: "K3-001",
      certK3UmumYear: "2022",
      emergencyContactName: "Kontak Dummy",
      emergencyContactRelationship: "Saudara",
      emergencyPhone: "081200000399",
      emergencyContactAddress: "Jl. Darurat 1",
      drivingLicenseTypes: "SIM A, C",
      simNumberA: "1111-2222",
      simNumberC: "3333-4444",
      ...extra,
    });
  const preview = async (who: Login, rows: unknown[]) =>
    data(await call("POST", "/employee-imports/preview", who.headers, body(rows)));
  const commit = async (who: Login, rows: unknown[]) => {
    const p = await preview(who, rows);
    const res = await call("POST", "/employee-imports", who.headers, {
      ...body(rows),
      previewHash: p.previewHash,
    });
    expect(res.status).toBe(201);
    return p;
  };
  const load = (n: string) =>
    prisma.employee.findFirstOrThrow({
      where: { employeeNumber: NUM(n) },
      include: { personal: true, familyMembers: true, educations: true, trainings: true },
    });

  test("buat karyawan: keluarga, pendidikan, sertifikasi → pelatihan, kontak darurat, SIM per jenis", async () => {
    await commit(sa, [row(2, groupRow("G1"))]);
    const e = await load("G1");
    expect(e.emergencyContactName).toBe("Kontak Dummy");
    expect(e.personal).toMatchObject({
      emergencyContactAddress: "Jl. Darurat 1",
      drivingLicenseNumbers: { A: "1111-2222", C: "3333-4444" },
      drivingLicenseNumber: "1111-2222",
      drivingLicenseTypes: ["A", "C"],
    });
    const family = e.familyMembers.map((f) => [
      f.relationship,
      f.name,
      f.gender,
      f.education,
      f.occupation,
      f.ageAtEntry,
    ]);
    expect(family).toEqual(
      expect.arrayContaining([
        ["SPOUSE", "Pasangan Dummy", null, null, "Guru", null],
        ["CHILD", "Anak Satu", "FEMALE", "Belum Sekolah", null, null],
        ["FATHER", "Ayah Dummy", null, null, "Pensiunan", 60],
      ]),
    );
    expect(e.familyMembers).toHaveLength(3);
    expect(e.educations.map((x) => [x.level, x.schoolName, x.entryYear, x.graduationYear])).toEqual(
      expect.arrayContaining([
        ["S1", "Universitas Dummy", 2012, 2016],
        ["SMA", "SMA Dummy", null, null],
      ]),
    );
    expect(e.trainings.map((t) => [t.trainingField, t.certificateNumber, t.trainingYear])).toEqual([
      ["Sertifikasi K3 Umum", "K3-001", 2022],
    ]);
    // Detail karyawan memuat field baru (bagian pribadi hanya untuk yang berhak).
    const detail = await data(await call("GET", `/employees/${e.id}?view=full`, sa.headers));
    expect(detail.personal).toMatchObject({
      emergencyContactAddress: "Jl. Darurat 1",
      drivingLicenseNumbers: { A: "1111-2222", C: "3333-4444" },
    });
    expect(
      detail.familyMembers.find((f: { relationship: string }) => f.relationship === "FATHER"),
    ).toMatchObject({
      ageAtEntry: 60,
      occupation: "Pensiunan",
    });
    expect(detail.educations.find((x: { level: string }) => x.level === "S1")).toMatchObject({
      entryYear: 2012,
    });
    expect(detail.trainings[0]).toMatchObject({ certificateNumber: "K3-001" });
    const work = await data(await call("GET", `/employees/${e.id}?view=work`, sa.headers));
    expect(work.personal).toBeUndefined();
  });

  test("impor ulang: hanya yang belum ada ditambah; yang sudah ada tidak diduplikasi", async () => {
    const same = await preview(sa, [row(2, groupRow("G1"))]);
    expect(same.rows[0].changes).toEqual([]);
    const more = groupRow("G1", {
      child2Name: "Anak Dua",
      certPopNumber: "POP-9",
      education3Level: "SMP",
      education3School: "SMP Dummy",
    });
    const p = await commit(sa, [row(2, more)]);
    expect(p.rows[0].changes).toEqual(
      expect.arrayContaining(["child2Name", "certPopNumber", "education3Level"]),
    );
    const e = await load("G1");
    expect(e.familyMembers).toHaveLength(4);
    expect(e.educations).toHaveLength(3);
    expect(e.trainings).toHaveLength(2);
  });

  test("HR tanpa grant data pribadi: keluarga & alamat darurat dilewati; pendidikan & sertifikasi tetap", async () => {
    const p = await commit(hr, [row(2, groupRow("G2"))]);
    expect(p.skippedFields).toEqual(
      expect.arrayContaining(["spouseName", "child1Name", "emergencyContactAddress"]),
    );
    const e = await load("G2");
    expect(e.familyMembers).toHaveLength(0);
    expect(e.personal?.emergencyContactAddress ?? null).toBeNull();
    expect(e.educations).toHaveLength(2);
    expect(e.trainings).toHaveLength(1);
  });
});

describe("Form versi baru (D-061): rincian alamat, kontak darurat 2, saudara, Divisi", () => {
  const DIV = `Divisi Imp ${RUN}`;
  const DEPT_UNDER = `Dept Bawah ${RUN}`;
  const DEPT_NEW = `Dept Baru Div ${RUN}`;
  let divisionId = "";
  beforeAll(async () => {
    const division = await prisma.department.create({
      data: { name: DIV, unitType: "DIVISION", companyId: ids.acp },
    });
    divisionId = division.id;
    const under = await prisma.department.create({
      data: { name: DEPT_UNDER, parentId: division.id, companyId: ids.acp },
    });
    await prisma.position.create({ data: { name: POS, departmentId: under.id } });
  });
  const preview = async (rows: unknown[]) =>
    data(await call("POST", "/employee-imports/preview", sa.headers, body(rows)));
  const commit = async (rows: unknown[]) => {
    const p = await preview(rows);
    const res = await call("POST", "/employee-imports", sa.headers, {
      ...body(rows),
      previewHash: p.previewHash,
    });
    expect(res.status).toBe(201);
    return p;
  };
  const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

  test("rincian alamat, kontak darurat 2, status saudara & pekerjaan anak tersimpan dan tampil", async () => {
    await commit([
      row(
        2,
        baseRow("V1", {
          domicileVillage: "Menteng Dalam",
          domicileDistrict: "Tebet",
          domicileCity: "Kota Jakarta Selatan",
          domicileProvince: "Daerah Khusus Ibukota Jakarta",
          ktpVillage: "Sukamaju",
          ktpDistrict: "Cibinong",
          ktpCity: "Kabupaten Bogor",
          ktpProvince: "Jawa Barat",
          emergency2Name: "Darurat Dua",
          emergency2Relationship: "Kakak",
          emergency2Phone: "081200000622",
          emergency2Address: "Jl. Darurat 2",
          sibling1Name: "Saudara Dummy",
          sibling1Relation: "Kakak",
          child1Name: "Anak Dummy",
          child1Occupation: "Pelajar",
        }),
      ),
    ]);
    const e = await prisma.employee.findFirstOrThrow({
      where: { employeeNumber: NUM("V1") },
      include: { personal: true, familyMembers: true },
    });
    expect(e.personal).toMatchObject({
      domicileCity: "Kota Jakarta Selatan",
      ktpProvince: "Jawa Barat",
      emergencyContact2Name: "Darurat Dua",
      emergencyContact2Phone: "081200000622",
      emergencyContact2Address: "Jl. Darurat 2",
    });
    expect(e.familyMembers.find((f) => f.relationship === "SIBLING")?.relationDetail).toBe("Kakak");
    expect(e.familyMembers.find((f) => f.relationship === "CHILD")?.occupation).toBe("Pelajar");
    const detail = await data(await call("GET", `/employees/${e.id}?view=full`, sa.headers));
    expect(detail.personal).toMatchObject({
      domicileVillage: "Menteng Dalam",
      emergencyContact2Relationship: "Kakak",
    });
    expect(
      detail.familyMembers.find((f: { relationship: string }) => f.relationship === "SIBLING"),
    ).toMatchObject({ relationDetail: "Kakak" });
  });

  test("HR tanpa grant data pribadi: rincian alamat & kontak darurat 2 dilewati", async () => {
    const p = data(
      await call(
        "POST",
        "/employee-imports/preview",
        hr.headers,
        body([row(2, baseRow("V2", { ktpCity: "Kota Dummy", emergency2Name: "Dummy" }))]),
      ),
    );
    expect((await p).skippedFields).toEqual(expect.arrayContaining(["ktpCity", "emergency2Name"]));
  });

  test("Divisi (D-064): nama persis dicocokkan, mirip = saran, tidak segaris = peringatan, departemen baru di bawah divisi", async () => {
    const p = await preview([
      row(2, baseRow("D1", { divisionName: `divisi  imp ${RUN.toLowerCase()}` })),
      row(3, baseRow("D2", { divisionName: `Divisi Imp ${RUN}x` })),
      row(4, baseRow("D3", { divisionName: DIV, departmentName: DEPT_UNDER })),
      row(5, baseRow("D4", { divisionName: DIV, departmentName: DEPT_NEW })),
    ]);
    // D1: nama cocok (huruf besar/spasi diabaikan); DEPT (tanpa induk) tidak segaris → peringatan, tetap dibuat.
    expect(codes(p.rows[0])).toContain("UNIT_NOT_IN_LINE");
    expect(p.rows[0].action).toBe("CREATE");
    // D2: mirip divisi yang ada → saran, baris error sampai HR memilih.
    expect(codes(p.rows[1])).toContain("UNIT_UNMATCHED");
    const d2 = p.units.find((u: { name: string }) => u.name === `Divisi Imp ${RUN}x`);
    expect(d2.status).toBe("NEEDS_REVIEW");
    expect(d2.suggestions[0].unitId).toBe(divisionId);
    expect(p.rows[2].action).toBe("CREATE");
    expect(p.rows[3].action).toBe("CREATE");

    await commit([
      row(4, baseRow("D3", { divisionName: DIV, departmentName: DEPT_UNDER })),
      row(5, baseRow("D4", { divisionName: DIV, departmentName: DEPT_NEW })),
    ]);
    const created = await prisma.department.findFirstOrThrow({ where: { name: DEPT_NEW } });
    expect(created.parentId).toBe(divisionId);
    expect(created.companyId).toBe(ids.acp);
    expect(created.unitType).toBe("DEPARTMENT");
  });
});

// D-063: NIP boleh kosong — karyawan dikenali lewat NIK KTP; NIK tidak valid = peringatan.
// D-064: Departemen/Divisi → unit organisasi (persis, saran, pilihan HR, unit baru berjenjang),
// normalisasi isian Form, PT per baris.
describe("Data Form asli (D-063/D-064)", () => {
  const KTP_BASE = `6271${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const KTP = (n: number) => `${KTP_BASE}${String(n).padStart(4, "0")}`;
  const UNIT = `Engineering Imp ${RUN}`;
  let unitId = "";
  beforeAll(async () => {
    unitId = (await prisma.department.create({ data: { name: UNIT, companyId: ids.acp } })).id;
  });
  const noNip = (n: string, extra: Record<string, unknown> = {}) => {
    const { employeeNumber: _skip, ...rest } = baseRow(n, extra);
    return rest;
  };
  const preview = async (rows: unknown[], extra: Record<string, unknown> = {}) =>
    data(await call("POST", "/employee-imports/preview", sa.headers, body(rows, extra)));
  const commit = async (rows: unknown[], extra: Record<string, unknown> = {}) => {
    const p = await preview(rows, extra);
    const res = await call("POST", "/employee-imports", sa.headers, {
      ...body(rows, extra),
      previewHash: p.previewHash,
    });
    expect(res.status).toBe(201);
    return p;
  };
  const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

  test("tanpa NIP + NIK valid → dibuat tanpa NIP; import ulang dengan NIP mengisi NIP lewat NIK", async () => {
    const first = await commit([row(2, noNip("K1", { ktpNumber: KTP(1) }))]);
    expect(first.rows[0]).toMatchObject({ action: "CREATE", employeeNumber: null });
    const created = await prisma.employee.findFirstOrThrow({
      where: { fullName: `Impor ${RUN} K1` },
    });
    expect(created.employeeNumber).toBeNull();

    const again = await commit([row(2, baseRow("K1", { ktpNumber: KTP(1) }))]);
    expect(again.rows[0].action).toBe("UPDATE");
    expect(again.rows[0].changes).toContain("employeeNumber");
    const updated = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.employeeNumber).toBe(NUM("K1"));
    // Tidak ada karyawan ganda.
    expect(await prisma.employee.count({ where: { fullName: `Impor ${RUN} K1` } })).toBe(1);
  });

  test("tanpa NIP & NIK tidak valid → NO_IDENTITY; NIP ada & NIK 15 digit → peringatan, NIK tidak disimpan", async () => {
    const p = await preview([
      row(2, noNip("K2", { ktpNumber: "620201030199003" })),
      row(3, baseRow("K3", { ktpNumber: "620201030199003" })),
    ]);
    expect(p.rows[0].action).toBe("ERROR");
    expect(codes(p.rows[0])).toContain("NO_IDENTITY");
    expect(p.rows[1].action).toBe("CREATE");
    expect(codes(p.rows[1])).toContain("KTP_INVALID_SKIPPED");
  });

  test("nilai mirip unit yang ada → saran (error) → pilih unit → dibuat di unit itu", async () => {
    const misspelled = `Enginering Imp ${RUN}`;
    const rows = [row(2, baseRow("U1", { departmentName: misspelled }))];
    const p = await preview(rows);
    const unit = p.units.find((u: { name: string }) => u.name === misspelled);
    expect(unit.status).toBe("NEEDS_REVIEW");
    expect(unit.suggestions[0]).toMatchObject({ unitId, reason: "SPELLING" });
    expect(codes(p.rows[0])).toContain("UNIT_UNMATCHED");

    await commit(rows, { unitMapping: { [unit.key]: { unitId } } });
    const emp = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: NUM("U1") },
      include: { position: true },
    });
    expect(emp.position.departmentId).toBe(unitId);
    expect(await prisma.department.count({ where: { name: misspelled } })).toBe(0);
  });

  test("HRGA = HR & GA (satu kunci); unit baru berjenjang: Departemen → Divisi sebagai Seksi di bawahnya", async () => {
    const dept = `Operasi Imp ${RUN}`;
    const sub = `Survei Imp ${RUN}`;
    const p = await commit([
      row(2, baseRow("U2", { departmentName: dept, divisionName: sub })),
      row(3, baseRow("U3", { departmentName: `HR & GA ${RUN}`, divisionName: `HRGA ${RUN}` })),
    ]);
    expect(p.units.filter((u: { name: string }) => u.name.includes("GA")).length).toBe(1);
    const parent = await prisma.department.findFirstOrThrow({ where: { name: dept } });
    const child = await prisma.department.findFirstOrThrow({ where: { name: sub } });
    expect(parent.unitType).toBe("DEPARTMENT");
    expect(child).toMatchObject({ unitType: "SECTION", parentId: parent.id });
    const emp = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: NUM("U2") },
      include: { position: true },
    });
    expect(emp.position.departmentId).toBe(child.id);
  });

  test("pilihan HR: buat unit baru dengan jenis & induk; induk tidak sah → UNIT_INVALID", async () => {
    const name = `Eksplorasi Imp ${RUN}`;
    // Kunci pilihan unit per PT (D-064): "<id PT>:<unitKey>".
    const key = `${ids.acp}:${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const ok = await commit(
      [row(2, baseRow("U4", { divisionName: name, departmentName: undefined }))],
      {
        unitMapping: { [key]: { create: { unitType: "DIVISION", parentUnitId: null } } },
      },
    );
    expect(ok.rows[0].action).toBe("CREATE");
    expect((await prisma.department.findFirstOrThrow({ where: { name } })).unitType).toBe(
      "DIVISION",
    );

    const bad = await preview([row(2, baseRow("U5", { divisionName: `Bor Imp ${RUN}` }))], {
      unitMapping: {
        [`${ids.acp}:borimp${RUN.toLowerCase()}`]: {
          create: { unitType: "DIRECTORATE", parentUnitId: unitId },
        },
      },
    });
    expect(codes(bad.rows[0])).toContain("UNIT_INVALID");
  });

  test("normalisasi Form: `_` kosong, gol. darah 0 → O, almarhum, hubungan & bank diseragamkan", async () => {
    const rows = [
      row(
        2,
        baseRow("F1", {
          bloodType: 0,
          emergencyContactRelationship: "ISTERI",
          bankName: "MANDIRI",
          bankAccountNumber: "1234567890",
          fatherName: "Ayah Impor",
          fatherAge: "Sudah meninggal dunia",
          motherName: "Ibu Impor",
          motherAge: "_",
          motherOccupation: "Irt",
        }),
      ),
    ];
    const p = data(await call("POST", "/employee-imports/preview", hrGranted.headers, body(rows)));
    const res = await call("POST", "/employee-imports", hrGranted.headers, {
      ...body(rows),
      previewHash: (await p).previewHash,
    });
    expect(res.status).toBe(201);
    expect(codes((await p).rows[0])).not.toContain("INVALID_AGE");
    const emp = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: NUM("F1") },
      include: { personal: true, bankAccount: true, familyMembers: true },
    });
    expect(emp.personal?.bloodType).toBe("O");
    expect(emp.emergencyContactRelationship).toBe("Istri");
    expect(emp.bankAccount?.bankName).toBe("Bank Mandiri");
    const father = emp.familyMembers.find((m) => m.relationship === "FATHER");
    const mother = emp.familyMembers.find((m) => m.relationship === "MOTHER");
    expect(father).toMatchObject({ isDeceased: true, ageAtEntry: null });
    expect(mother).toMatchObject({
      isDeceased: false,
      ageAtEntry: null,
      occupation: "Ibu Rumah Tangga",
    });
  });

  test("PT per baris mengalahkan PT bawaan; PT tidak dikenal → error", async () => {
    const p = await preview([row(2, baseRow("P1")), row(3, baseRow("P2"))], {
      companyOverrides: { "2": ids.other, "3": crypto.randomUUID() },
    });
    expect(p.rows[0].companyCode).toBe(ids.otherCode);
    expect(codes(p.rows[1])).toContain("COMPANY_UNKNOWN");
  });

  test("dua PT dengan nilai unit sama → dicocokkan terpisah; unit baru milik PT masing-masing", async () => {
    const shared = `Logistik Imp ${RUN}`;
    const p = await commit([
      row(2, baseRow("M1", { departmentName: shared })),
      row(3, baseRow("M2", { departmentName: shared, companyCode: ids.otherCode })),
    ]);
    const values = p.units.filter((u: { name: string }) => u.name === shared);
    expect(values.map((u: { companyCode: string }) => u.companyCode).sort()).toEqual(
      ["ACP", ids.otherCode].sort(),
    );
    // Nama unit unik se-grup → keduanya berakhiran kode PT.
    const acpUnit = await prisma.department.findFirstOrThrow({
      where: { name: `${shared} (ACP)` },
    });
    const otherUnit = await prisma.department.findFirstOrThrow({
      where: { name: `${shared} (${ids.otherCode})` },
    });
    expect(acpUnit.companyId).toBe(ids.acp);
    expect(otherUnit.companyId).toBe(ids.other);
    const m2 = await prisma.employee.findUniqueOrThrow({
      where: { employeeNumber: NUM("M2") },
      include: { position: true },
    });
    expect(m2.position.departmentId).toBe(otherUnit.id);
  });

  test("unit milik PT lain tidak disarankan dan tidak boleh dipilih", async () => {
    const misspelled = `Enginering Imp ${RUN}`;
    const p = await preview([
      row(2, baseRow("X1", { departmentName: misspelled, companyCode: ids.otherCode })),
    ]);
    const value = p.units.find((u: { name: string }) => u.name === misspelled);
    // UNIT (milik ACP) tidak disarankan untuk baris PT lain → nilai dibuat sebagai unit baru.
    expect(value.suggestions.map((s: { unitId: string }) => s.unitId)).not.toContain(unitId);
    const forced = await preview(
      [row(2, baseRow("X1", { departmentName: misspelled, companyCode: ids.otherCode }))],
      { unitMapping: { [value.key]: { unitId } } },
    );
    expect(codes(forced.rows[0])).toContain("UNIT_INVALID");
  });

  test("profil pemetaan mengingat pilihan unit; profil lama (kolom saja) tetap terbaca", async () => {
    const signature = "c".repeat(64);
    const unitChoices = {
      hrga: { unitId },
      survei: { create: { unitType: "SECTION", parentKey: "operasi" } },
    };
    await call("PUT", `/employee-imports/mappings/${signature}`, sa.headers, {
      mapping: { nama: "fullName" },
      unitChoices,
    });
    const got = await data(
      await call("GET", `/employee-imports/mappings/${signature}`, sa.headers),
    );
    expect(got.mapping).toEqual({ nama: "fullName" });
    expect(got.unitChoices).toEqual(unitChoices);
    // Simpan ulang tanpa pilihan unit → pilihan lama dipertahankan.
    await call("PUT", `/employee-imports/mappings/${signature}`, sa.headers, {
      mapping: { nama: "fullName", nip: "employeeNumber" },
    });
    expect(
      (await data(await call("GET", `/employee-imports/mappings/${signature}`, sa.headers)))
        .unitChoices,
    ).toEqual(unitChoices);
    // Bentuk lama di DB (peta kolom langsung).
    const legacy = "d".repeat(64);
    await prisma.importMapping.create({
      data: { signature: legacy, mapping: { nama: "fullName" }, updatedBy: sa.account.id },
    });
    const old = await data(await call("GET", `/employee-imports/mappings/${legacy}`, sa.headers));
    expect(old).toMatchObject({ mapping: { nama: "fullName" }, unitChoices: {} });
  });
});
