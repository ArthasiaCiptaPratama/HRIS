import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// EMP-D5: riwayat perubahan data per field (nilai lama → baru) + penyamaran sesuai hak baca.
const RUN = crypto.randomUUID().slice(0, 8);
const prisma = getPrisma();
const auth = createAuthFixture(RUN);
const app = createApp({ logger: createLogger("error", () => {}), tokenVerifier: testVerifier });

type Headers = Record<string, string>;
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
interface Change {
  source: string;
  section: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  valueHidden: boolean;
  groupId: string;
  changedBy: { name: string } | null;
}
const call = (method: string, path: string, headers: Headers, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const changesOf = async (who: Login, id: string, query = "") => {
  const res = await call("GET", `/employees/${id}/field-changes${query}`, who.headers);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Change[] }).data;
};
const nik = () =>
  `33${String(Date.now()).slice(-10)}${String(Math.floor(Math.random() * 1e4)).padStart(4, "0")}`;

const ids = {} as Record<
  | "acp"
  | "otherCompany"
  | "department"
  | "position"
  | "position2"
  | "status"
  | "location"
  | "manager"
  | "target",
  string
>;
let sa: Login;
let hrPlain: Login;
let hrWriter: Login;
let hrOther: Login;
let hrPersonnel: Login;
let mgr: Login;
let self: Login;

async function makeEmployee(n: string, extra: { managerId?: string } = {}) {
  return (
    await prisma.employee.create({
      data: {
        employeeNumber: `FC-${RUN}-${n}`,
        fullName: `FC ${RUN} ${n}`,
        companyId: ids.acp,
        positionId: ids.position,
        employmentStatusId: ids.status,
        joinDate: new Date("2024-01-01"),
        emergencyContactName: "Kontak Lama",
        ...extra,
      },
    })
  ).id;
}

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.otherCompany = await createTestCompany(`F${RUN.slice(0, 6)}`, `PT FC ${RUN}`);
  ids.department = (await prisma.department.create({ data: { name: `FC Dept ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `FC Jab ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.position2 = (
    await prisma.position.create({ data: { name: `FC Jab2 ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `FC St ${RUN}` } })).id;
  ids.location = (await prisma.workLocation.create({ data: { name: `FC Lok ${RUN}` } })).id;
  ids.manager = await makeEmployee("M");
  ids.target = await makeEmployee("T", { managerId: ids.manager });
  await prisma.employeePersonal.create({
    data: { employeeId: ids.target, birthPlace: "Bandung", ktpNumber: nik() },
  });

  sa = await auth.loginAs("SUPER_ADMIN");
  hrPlain = await auth.loginAs("HR_ADMIN");
  hrWriter = await auth.loginAs("HR_ADMIN", {
    grants: [
      { permission: "EMPLOYEE_PERSONAL_READ" },
      { permission: "EMPLOYEE_PERSONAL_WRITE" },
      { permission: "EMPLOYEE_BANK_READ" },
      { permission: "EMPLOYEE_BANK_WRITE" },
    ],
  });
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.otherCompany] });
  hrPersonnel = await auth.loginAs("HR_PERSONNEL", { companies: [ids.acp] });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.manager });
  self = await auth.loginAs("EMPLOYEE", { employeeId: ids.target });
});

afterAll(async () => {
  const employeeIds = [ids.target, ids.manager].filter(Boolean);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: employeeIds } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.position.deleteMany({ where: { id: { in: [ids.position, ids.position2] } } });
  await prisma.department.deleteMany({ where: { id: ids.department } });
  await prisma.employmentStatus.deleteMany({ where: { id: ids.status } });
  await prisma.workLocation.deleteMany({ where: { id: ids.location } });
  await prisma.accountCompany.deleteMany({ where: { companyId: ids.otherCompany } });
  await prisma.company.deleteMany({ where: { id: ids.otherCompany } });
});

describe("pencatatan per jalur", () => {
  test("form HR: data kerja + kontak darurat tercatat nama lama → baru dalam satu kelompok", async () => {
    const res = await call("PATCH", `/employees/${ids.target}`, sa.headers, {
      fullName: `FC ${RUN} T Baru`,
      positionId: ids.position2,
      workLocationId: ids.location,
      emergencyContactName: "Kontak Baru",
    });
    expect(res.status).toBe(200);
    const rows = (await changesOf(sa, ids.target)).filter((r) => r.source === "HR_FORM");
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(byField.fullName).toMatchObject({
      section: "WORK",
      oldValue: `FC ${RUN} T`,
      newValue: `FC ${RUN} T Baru`,
    });
    expect(byField.position).toMatchObject({
      oldValue: `FC Jab ${RUN}`,
      newValue: `FC Jab2 ${RUN}`,
    });
    expect(byField.workLocation).toMatchObject({ oldValue: null, newValue: `FC Lok ${RUN}` });
    expect(byField.emergencyContactName).toMatchObject({
      section: "EMERGENCY",
      oldValue: "Kontak Lama",
      newValue: "Kontak Baru",
    });
    expect(new Set(rows.map((r) => r.groupId)).size).toBe(1);
    expect(rows[0]?.changedBy).not.toBeNull();
  });

  test("profil HR: data pribadi, keluarga, rekening tercatat; audit tetap tanpa nilai", async () => {
    const ktp = nik();
    const res = await call("PATCH", `/employees/${ids.target}/profile`, hrWriter.headers, {
      personal: { birthPlace: "Garut", ktpNumber: ktp },
      family: [{ relationship: "SPOUSE", name: "Siti" }],
      bank: { bankName: "Bank Contoh", accountNumber: "1234567890", accountHolder: "Uji" },
    });
    expect(res.status).toBe(200);
    const rows = (await changesOf(sa, ids.target)).filter((r) => r.source === "HR_PROFILE");
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "PERSONAL",
          field: "birthPlace",
          oldValue: "Bandung",
          newValue: "Garut",
        }),
        expect.objectContaining({ section: "PERSONAL", field: "ktpNumber", newValue: ktp }),
        expect.objectContaining({ section: "FAMILY", field: "member", oldValue: null }),
        expect.objectContaining({
          section: "BANK",
          field: "accountNumber",
          oldValue: null,
          newValue: "1234567890",
        }),
      ]),
    );
    // PLAN §4.5: nilai sensitif tidak pernah masuk audit log.
    const audits = await prisma.auditLog.findMany({ where: { entityId: ids.target } });
    const dump = JSON.stringify(audits);
    expect(dump).not.toContain(ktp);
    expect(dump).not.toContain("1234567890");
  });

  test("profil HR: nomor yang hanya beda format (NPWP/rekening) tidak tercatat; hanya kota asal", async () => {
    // Data lama berformat (impor/seed); simpan profil menormalkan jadi angka saja (EMP-D4).
    await prisma.employeePersonal.create({
      data: {
        employeeId: ids.manager,
        npwpNumber: "09.009.009.9-017.000",
      },
    });
    await prisma.employeeBankAccount.create({
      data: {
        employeeId: ids.manager,
        bankName: "Bank Contoh",
        accountNumber: "123-456-7890",
        accountHolder: "Uji",
      },
    });
    const res = await call("PATCH", `/employees/${ids.manager}/profile`, hrWriter.headers, {
      personal: {
        npwpNumber: "09.009.009.9-017.000",
        originCity: "Palopo",
      },
      bank: { bankName: "Bank Contoh", accountNumber: "123-456-7890", accountHolder: "Uji" },
    });
    expect(res.status).toBe(200);
    const stored = await prisma.employeePersonal.findUniqueOrThrow({
      where: { employeeId: ids.manager },
    });
    expect(stored.npwpNumber).toBe("090090099017000"); // penyimpanan EMP-D4 tidak berubah
    const rows = await prisma.employeeFieldChange.findMany({
      where: { employeeId: ids.manager, source: "HR_PROFILE" },
      select: { section: true, field: true, oldValue: true, newValue: true },
    });
    expect(rows).toEqual([
      { section: "PERSONAL", field: "originCity", oldValue: null, newValue: "Palopo" },
    ]);
    await prisma.employeeFieldChange.deleteMany({ where: { employeeId: ids.manager } });
    await prisma.employeeBankAccount.deleteMany({ where: { employeeId: ids.manager } });
    await prisma.employeePersonal.deleteMany({ where: { employeeId: ids.manager } });
  });

  test("gagal di tengah transaksi (NIK dipakai karyawan lain) → tidak ada baris riwayat", async () => {
    const taken = (await prisma.employeePersonal.findUnique({ where: { employeeId: ids.target } }))
      ?.ktpNumber as string;
    await prisma.employeePersonal.upsert({
      where: { employeeId: ids.manager },
      create: { employeeId: ids.manager, ktpNumber: nik() },
      update: {},
    });
    const before = await prisma.employeeFieldChange.count({ where: { employeeId: ids.manager } });
    const res = await call("PATCH", `/employees/${ids.manager}/profile`, hrWriter.headers, {
      personal: { birthPlace: "Bogor", ktpNumber: taken },
    });
    expect(res.status).toBe(409);
    expect(await prisma.employeeFieldChange.count({ where: { employeeId: ids.manager } })).toBe(
      before,
    );
  });

  test("arsip pendidikan: tambah, ubah, hapus tercatat per item", async () => {
    const created = await call("POST", `/employees/${ids.target}/educations`, sa.headers, {
      level: "S1",
      schoolName: "Universitas Uji",
      graduationYear: 2020,
    });
    expect(created.status).toBe(201);
    const itemId = ((await created.json()) as { data: { id: string } }).data.id;
    expect(
      (
        await call("PATCH", `/employees/${ids.target}/educations/${itemId}`, sa.headers, {
          level: "S1",
          schoolName: "Universitas Uji Ubah",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("DELETE", `/employees/${ids.target}/educations/${itemId}`, sa.headers)).status,
    ).toBe(200);
    const rows = (await changesOf(sa, ids.target, "?section=EDUCATION")).filter(
      (r) => r.source === "ARCHIVE",
    );
    // PATCH mengganti item utuh: tahun lulus yang tidak dikirim ikut kosong (tercatat juga).
    expect(rows.map((r) => r.field).sort()).toEqual([
      "graduationYear",
      "item",
      "item",
      "schoolName",
    ]);
    expect(rows.find((r) => r.field === "schoolName")).toMatchObject({
      oldValue: "Universitas Uji",
      newValue: "Universitas Uji Ubah",
    });
  });
});

describe("akses & penyamaran", () => {
  test("401 tanpa login; 404 HR PT lain", async () => {
    expect((await call("GET", `/employees/${ids.target}/field-changes`, {})).status).toBe(401);
    expect(
      (await call("GET", `/employees/${ids.target}/field-changes`, hrOther.headers)).status,
    ).toBe(404);
  });

  test("HR tanpa grant baca: baris pribadi/keluarga/rekening tampil tanpa nilai", async () => {
    const rows = await changesOf(hrPlain, ids.target);
    const sensitive = rows.filter((r) => ["PERSONAL", "FAMILY", "BANK"].includes(r.section));
    expect(sensitive.length).toBeGreaterThan(0);
    for (const row of sensitive) {
      expect(row).toMatchObject({ valueHidden: true, oldValue: null, newValue: null });
    }
    expect(rows.find((r) => r.field === "fullName")).toMatchObject({ valueHidden: false });
  });

  test("HR ber-grant & karyawan sendiri melihat nilai; atasan tidak", async () => {
    for (const who of [hrWriter, self]) {
      const bank = (await changesOf(who, ids.target)).find((r) => r.field === "accountNumber");
      expect(bank).toMatchObject({ valueHidden: false, newValue: "1234567890" });
    }
    const forManager = await changesOf(mgr, ids.target);
    expect(forManager.find((r) => r.field === "accountNumber")).toMatchObject({
      valueHidden: true,
      newValue: null,
    });
    expect(forManager.find((r) => r.field === "fullName")).toMatchObject({ valueHidden: false });
  });

  test("HR Kepegawaian: kontak darurat & pendidikan disembunyikan, data kerja terlihat", async () => {
    const rows = await changesOf(hrPersonnel, ids.target);
    expect(rows.find((r) => r.field === "emergencyContactName")).toMatchObject({
      valueHidden: true,
    });
    for (const row of rows.filter((r) => r.section === "EDUCATION")) {
      expect(row.valueHidden).toBe(true);
    }
    expect(rows.find((r) => r.field === "position")).toMatchObject({ valueHidden: false });
  });

  test("membaca nilai sensitif milik orang lain tercatat di audit tanpa nilai", async () => {
    await changesOf(hrWriter, ids.target);
    const audit = await prisma.auditLog.findFirst({
      where: {
        actorAccountId: hrWriter.account.id,
        action: "employee.sensitive.read",
        entityId: ids.target,
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.after)).not.toContain("1234567890");
  });
});
