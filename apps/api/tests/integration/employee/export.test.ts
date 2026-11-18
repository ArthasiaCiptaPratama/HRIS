import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const prisma = getPrisma();
const auth = createAuthFixture(`export-${RUN}`);
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login, hr: Login, granted: Login, manager: Login, employee: Login, personnel: Login;
let companyA = "",
  companyB = "",
  department = "",
  position = "",
  status = "",
  location = "",
  homebase = "";
let first = "",
  second = "";
const call = (headers: Record<string, string>, body: unknown) =>
  app.request("/api/v1/employees/export", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
async function exported(res: Response) {
  expect(res.status).toBe(200);
  const { data } = (await res.json()) as {
    data: { rows: number; fileName: string; contentBase64: string };
  };
  const files = unzipSync(Buffer.from(data.contentBase64, "base64"));
  const xml = (path: string) => strFromU8(files[path] ?? new Uint8Array());
  return { ...data, xml };
}

beforeAll(async () => {
  companyA = await createTestCompany(`EA${RUN.slice(0, 5)}`, `Ekspor A ${RUN}`);
  companyB = await createTestCompany(`EB${RUN.slice(0, 5)}`, `Ekspor B ${RUN}`);
  department = (await prisma.department.create({ data: { name: `Ekspor ${RUN}` } })).id;
  position = (
    await prisma.position.create({
      data: { name: `Jabatan ${RUN}`, departmentId: department, level: "L4" },
    })
  ).id;
  status = (await prisma.employmentStatus.create({ data: { name: `Status ${RUN}` } })).id;
  location = (await prisma.workLocation.create({ data: { name: `Lokasi ${RUN}` } })).id;
  homebase = (await prisma.homebase.create({ data: { name: `Homebase ${RUN}` } })).id;
  const create = async (name: string, companyId: string, extra = {}) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `EX-${RUN}-${name}`,
          fullName: `Ekspor ${RUN} ${name}`,
          companyId,
          positionId: position,
          employmentStatusId: status,
          joinDate: new Date("2025-01-02"),
          workLocationId: location,
          homebaseId: homebase,
          ...extra,
        },
      })
    ).id;
  first = await create("A", companyA, { gender: "MALE" });
  second = await create("B", companyB);
  await create("Nonaktif", companyA, { isActive: false });
  await create("Calon", companyA, { onboardingStatus: "FILLING" });
  await prisma.employeePersonal.create({
    data: {
      employeeId: first,
      birthPlace: "Tempat Rahasia",
      birthDate: new Date("1990-01-02"),
      maritalStatus: "MARRIED",
      religion: "PROTESTANT",
      ptkpStatus: "TK0",
      drivingLicenseTypes: ["A_UMUM", "B1_UMUM"],
      bloodType: "AB+",
      nationality: "WNI",
    },
  });
  await prisma.employeeBankAccount.create({
    data: { employeeId: first, bankName: "Bank Uji", accountNumber: "0012345678" },
  });
  await prisma.familyMember.create({
    data: {
      employeeId: first,
      name: "Keluarga Rahasia",
      relationship: "CHILD",
      gender: "FEMALE",
      isDeceased: true,
    },
  });
  await prisma.familyMember.create({
    data: { employeeId: first, name: "Keluarga Lain", relationship: "SIBLING", isDeceased: false },
  });
  await prisma.education.create({
    data: { employeeId: first, schoolName: "Sekolah Uji", level: "SMA" },
  });
  await prisma.training.create({
    data: { employeeId: first, trainingField: "Pelatihan Uji", type: "EXTERNAL" },
  });
  await prisma.workExperience.create({
    data: { employeeId: first, companyName: "PT Lama", position: "Staf", startYear: 2020 },
  });
  await prisma.employmentHistory.create({
    data: {
      employeeId: first,
      changeType: "HIRED",
      movementType: "PROMOTION",
      effectiveDate: new Date("2025-01-02"),
      toStatusId: status,
      toPositionId: position,
    },
  });
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { companies: [companyA] });
  granted = await auth.loginAs("HR_ADMIN", {
    companies: [companyA, companyB],
    grants: [{ permission: "EMPLOYEE_PERSONAL_READ" }, { permission: "EMPLOYEE_BANK_READ" }],
  });
  manager = await auth.loginAs("MANAGER", { employeeId: first });
  employee = await auth.loginAs("EMPLOYEE", { employeeId: second });
  personnel = await auth.loginAs("HR_PERSONNEL", { companies: [companyA] });
});
afterAll(async () => {
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { fullName: { startsWith: `Ekspor ${RUN}` } } });
  await prisma.position.delete({ where: { id: position } });
  await prisma.department.delete({ where: { id: department } });
  await prisma.employmentStatus.delete({ where: { id: status } });
  await prisma.workLocation.delete({ where: { id: location } });
  await prisma.homebase.delete({ where: { id: homebase } });
  await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await disconnectPrisma();
});

describe("POST /employees/export (EMP-D7)", () => {
  test("SA memakai seluruh filter daftar, hanya aktif/disetujui; identitas selalu ikut dan tanggal Excel", async () => {
    const file = await exported(
      await call(sa.headers, {
        filter: {
          q: `Ekspor ${RUN}`,
          departmentId: department,
          workLocationId: location,
          homebaseId: homebase,
          statusId: status,
          positionId: position,
        },
        sections: [],
      }),
    );
    expect(file.rows).toBe(2);
    expect(file.fileName).toMatch(/^data-karyawan-.*\.xlsx$/);
    expect(file.xml("xl/workbook.xml")).toContain('name="Karyawan"');
    expect(file.xml("xl/workbook.xml")).not.toContain('name="Keluarga"');
    const main = file.xml("xl/worksheets/sheet1.xml");
    expect(main).toContain("NIP");
    expect(main).toContain("Homebase");
    expect(main.indexOf(`EX-${RUN}-A`)).toBeLessThan(main.indexOf(`EX-${RUN}-B`));
    expect(main).toContain("<v>45659</v>");
    expect(main).not.toContain("Tempat Rahasia");
    expect(main).not.toContain("Nomor rekening");
    expect(file.xml("docProps/core.xml")).toContain("Data Karyawan");
  });
  test("HR filter & employeeIds dibatasi PT; ID luar cakupan, nonaktif & calon tidak ikut", async () => {
    expect((await exported(await call(hr.headers, { filter: { q: `Ekspor ${RUN}` } }))).rows).toBe(
      1,
    );
    const file = await exported(
      await call(hr.headers, { employeeIds: [first, second], sections: ["identity", "contact"] }),
    );
    expect(file.rows).toBe(1);
    expect(file.xml("xl/worksheets/sheet1.xml")).not.toContain(`EX-${RUN}-B`);
    expect(file.xml("xl/worksheets/sheet1.xml")).toContain("Email kantor");
    expect((await exported(await call(hr.headers, { filter: { companyId: companyB } }))).rows).toBe(
      0,
    );
  });
  test("grant personal/bank mencakup semua PT yang ditugaskan; sheet berulang hanya bila dipilih", async () => {
    const file = await exported(
      await call(granted.headers, {
        employeeIds: [first, second],
        sections: [
          "personal",
          "bank",
          "family",
          "education",
          "training",
          "experience",
          "employment",
        ],
      }),
    );
    expect(file.rows).toBe(2);
    for (const name of [
      "Karyawan",
      "Keluarga",
      "Pendidikan",
      "Pelatihan",
      "Pengalaman Kerja",
      "Riwayat Jabatan",
    ])
      expect(file.xml("xl/workbook.xml")).toContain(`name="${name}"`);
    expect(file.xml("xl/worksheets/sheet1.xml")).toContain("0012345678");
    expect(file.xml("xl/worksheets/sheet1.xml")).toContain("Tempat Rahasia");
    expect(file.xml("xl/worksheets/sheet2.xml")).toContain("Keluarga Rahasia");
    expect(file.xml("xl/worksheets/sheet3.xml")).toContain("Sekolah Uji");
    expect(file.xml("xl/worksheets/sheet4.xml")).toContain("Pelatihan Uji");
    expect(file.xml("xl/worksheets/sheet5.xml")).toContain("PT Lama");
    expect(file.xml("xl/worksheets/sheet6.xml")).toContain(`Jabatan ${RUN}`);
    const justEducation = await exported(
      await call(sa.headers, { employeeIds: [first], sections: ["education"] }),
    );
    expect(justEducation.xml("xl/workbook.xml").match(/<sheet /g)).toHaveLength(2);
    expect(justEducation.xml("xl/workbook.xml")).not.toContain('name="Keluarga"');
  });
  test("nilai enum di Excel memakai label Indonesia, nilai tanpa peta tetap utuh", async () => {
    const file = await exported(
      await call(sa.headers, {
        employeeIds: [first, second],
        sections: ["personal", "family", "education", "training", "employment"],
      }),
    );
    const values = (sheet: number) =>
      [...file.xml(`xl/worksheets/sheet${sheet}.xml`).matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(
        (match) => match[1],
      );
    const main = values(1);
    for (const label of [
      "Laki-laki",
      "L4 · Superintendent",
      "Menikah",
      "Kristen Protestan",
      "TK/0",
      "A Umum, B1 Umum",
      "AB+",
      "WNI",
    ])
      expect(main).toContain(label);
    for (const code of ["MALE", "L4", "MARRIED", "PROTESTANT", "TK0", "A_UMUM, B1_UMUM"])
      expect(main).not.toContain(code);
    const family = values(2);
    for (const label of ["Anak", "Saudara kandung", "Perempuan", "Ya", "Tidak"])
      expect(family).toContain(label);
    for (const code of ["CHILD", "SIBLING", "FEMALE", "true", "false"])
      expect(family).not.toContain(code);
    expect(values(3)).toContain("SMA/SMK");
    expect(values(3)).not.toContain("SMA");
    expect(values(4)).toContain("Eksternal");
    expect(values(4)).not.toContain("EXTERNAL");
    expect(values(5)).toContain("Mulai bekerja");
    expect(values(5)).not.toContain("HIRED");
    expect(values(5)).toContain("Promosi");
    expect(values(5)).not.toContain("PROMOTION");
  });
  test.each(["personal", "bank", "family"])("HR tanpa grant %s → 403", async (section) => {
    const res = await call(hr.headers, { employeeIds: [first], sections: [section] });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("izin baca");
  });
  test("MANAGER, EMPLOYEE, HR_PERSONNEL → 403; tanpa token → 401", async () => {
    for (const login of [manager, employee, personnel])
      expect((await call(login.headers, { employeeIds: [first] })).status).toBe(403);
    expect((await call({}, { filter: {} })).status).toBe(401);
  });
  test.each([
    {},
    { filter: {}, employeeIds: ["bad"] },
    { filter: {}, employeeIds: [crypto.randomUUID()] },
    { employeeIds: [] },
    { employeeIds: ["bad"] },
    { filter: { active: false } },
    { filter: { page: 1 } },
    { filter: {}, sections: ["secret"] },
    { employeeIds: Array.from({ length: 5001 }, () => crypto.randomUUID()) },
  ])("body salah → 400 (%j)", async (body) => {
    expect((await call(sa.headers, body)).status).toBe(400);
  });
  test("audit hanya metadata tanpa nilai data atau ID karyawan", async () => {
    const requestId = crypto.randomUUID();
    await exported(
      await call(
        { ...sa.headers, "X-Request-Id": requestId },
        { employeeIds: [first], sections: ["personal", "bank"] },
      ),
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { requestId, action: "employee.export" },
    });
    expect(audit.entityType).toBe("employee");
    expect(audit.after).toEqual({
      employeeIdsCount: 1,
      sections: ["identity", "personal", "bank"],
      rows: 1,
    });
    const text = JSON.stringify(audit.after);
    for (const value of [first, "Tempat Rahasia", "0012345678", `Ekspor ${RUN} A`])
      expect(text).not.toContain(value);
  });
  test("hasil filter >5000 → 422 sebelum membaca relasi", async () => {
    await prisma.employee.createMany({
      data: Array.from({ length: 5001 }, (_, n) => ({
        fullName: `Ekspor ${RUN} Limit ${n}`,
        companyId: companyA,
        positionId: position,
        employmentStatusId: status,
        joinDate: new Date("2025-01-02"),
      })),
    });
    try {
      const res = await call(sa.headers, { filter: { q: `Ekspor ${RUN} Limit` } });
      expect(res.status).toBe(422);
      expect(await res.text()).toContain("persempit filter");
    } finally {
      await prisma.employee.deleteMany({
        where: { fullName: { startsWith: `Ekspor ${RUN} Limit` } },
      });
    }
  }, 30000);
});
