import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { EMPLOYEE_DOCUMENT_BUCKET as BUCKET } from "../../../src/core/storage.ts";
import { remindExpiringDocuments } from "../../../src/modules/employee/document.service.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// D-055 (Arsip gelombang 1b): jenis dokumen (SA), dokumen berversi & bermasa berlaku, tautan baca,
// Data File, pengingat kedaluwarsa.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(`dc${RUN.toLowerCase()}`);
const prisma = getPrisma();
const fake = createFakeStorage();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: fake.storage,
  storagePathPrefix: "",
});

type Headers = Record<string, string>;
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const call = (method: string, path: string, headers: Headers, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const body = async (res: Response) => (await res.json()) as { data: any; meta?: any };

const ids = {
  acp: "",
  other: "",
  status: "",
  department: "",
  position: "",
  manager: "",
  team: "",
  otherPt: "",
};
const types = { simper: "", ktp: "", cert: "" };
const startedAt = new Date();
let sa: Login;
let hr: Login;
let hrRead: Login;
let hrWrite: Login;
let hrOther: Login;
let mgr: Login;
let emp: Login;

async function employee(n: string, extra: Record<string, unknown> = {}) {
  const row = await prisma.employee.create({
    data: {
      companyId: ids.acp,
      employeeNumber: `DC-${RUN}-${n}`,
      fullName: `Dokumen ${RUN} ${n}`,
      joinDate: new Date("2023-02-01T00:00:00.000Z"),
      employmentStatusId: ids.status,
      positionId: ids.position,
      ...extra,
    },
  });
  return row.id;
}

/** Alur browser: minta URL unggah → unggah (palsu) → simpan metadata. */
async function upload(
  who: Login,
  employeeId: string,
  documentTypeId: string,
  meta: Record<string, unknown> = {},
  file = { size: 1000, contentType: "application/pdf" },
) {
  const res = await call("POST", `/employees/${employeeId}/documents/upload-url`, who.headers, {
    documentTypeId,
    contentType: file.contentType,
  });
  if (res.status !== 200) return res;
  const { path } = (await body(res)).data as { path: string };
  fake.putObject(BUCKET, path, { size: file.size, contentType: file.contentType });
  return call("POST", `/employees/${employeeId}/documents`, who.headers, {
    documentTypeId,
    path,
    ...meta,
  });
}
const docsOf = async (who: Login, employeeId: string) =>
  (await body(await call("GET", `/employees/${employeeId}/documents`, who.headers))).data as {
    documents: {
      id: string;
      version: number;
      isCurrent: boolean;
      documentType: { code: string };
      expiryState: string;
    }[];
    access: { write: boolean; writeSensitive: boolean; writeBankBook: boolean };
  };
const typeId = async (code: string) =>
  (await prisma.documentType.findUniqueOrThrow({ where: { code } })).id;
const isoIn = (days: number) =>
  new Date(Date.now() + days * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.other = await createTestCompany(`D${RUN}`, `PT Dokumen ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `Dok St ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `Dok Dept ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `Dok Jab ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.manager = await employee("M");
  ids.team = await employee("T", { managerId: ids.manager });
  ids.otherPt = await employee("P", { companyId: ids.other });
  types.simper = await typeId("SIMPER");
  types.ktp = await typeId("KTP");
  types.cert = await typeId("CERT_OTHER");
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { companies: [ids.acp] });
  hrRead = await auth.loginAs("HR_ADMIN", {
    companies: [ids.acp],
    grants: [{ permission: "EMPLOYEE_DOCUMENTS_READ" }],
  });
  hrWrite = await auth.loginAs("HR_ADMIN", {
    companies: [ids.acp],
    grants: [{ permission: "EMPLOYEE_DOCUMENTS_READ" }, { permission: "EMPLOYEE_DOCUMENTS_WRITE" }],
  });
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.other] });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.manager });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.team });
});

afterAll(async () => {
  const employees = [ids.manager, ids.team, ids.otherPt];
  const accounts = [sa, hr, hrRead, hrWrite, hrOther, mgr, emp].map((a) => a.account.id);
  await prisma.notification.deleteMany({ where: { recipientAccountId: { in: accounts } } });
  await auth.cleanup();
  await prisma.auditLog.deleteMany({
    where: {
      occurredAt: { gte: startedAt },
      OR: [
        { entityType: "employee.document_type" },
        { entityType: "employee.employee", entityId: { in: employees } },
      ],
    },
  });
  await prisma.documentType.deleteMany({ where: { code: { startsWith: `QA_${RUN}` } } });
  await prisma.employee.updateMany({ where: { id: { in: employees } }, data: { managerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.company.delete({ where: { id: ids.other } });
  await disconnectPrisma();
});

describe("jenis dokumen (master data SA)", () => {
  const input = {
    code: `qa_${RUN}_lic`,
    name: `Lisensi QA ${RUN}`,
    category: "COMPETENCY",
    hasExpiry: true,
    defaultValidityMonths: 24,
    reminderDays: [14, 90],
    requiredScope: "NONE",
    multiple: false,
    employeeCanUpload: false,
    sensitive: false,
    maxSizeMb: 2,
    allowedMimeTypes: ["application/pdf"],
  };

  test("katalog awal tersedia untuk semua akun; tulis hanya SA; kode unik; arsip/pulihkan/hapus", async () => {
    const list = (await body(await call("GET", "/document-types", emp.headers))).data as {
      code: string;
    }[];
    expect(list.map((t) => t.code)).toEqual(expect.arrayContaining(["KTP", "SIMPER", "MCU"]));
    expect((await call("POST", "/document-types", hr.headers, input)).status).toBe(403);
    expect(
      (await call("POST", "/document-types", sa.headers, { ...input, maxSizeMb: 9 })).status,
    ).toBe(400);
    const created = await call("POST", "/document-types", sa.headers, input);
    expect(created.status).toBe(201);
    const type = (await body(created)).data;
    expect(type.code).toBe(`QA_${RUN}_LIC`);
    expect(type.reminderDays).toEqual([90, 14]);
    expect((await call("POST", "/document-types", sa.headers, input)).status).toBe(409);
    expect((await call("POST", `/document-types/${type.id}/archive`, sa.headers)).status).toBe(200);
    const visible = (await body(await call("GET", "/document-types", sa.headers))).data as {
      id: string;
    }[];
    expect(visible.some((t) => t.id === type.id)).toBe(false);
    const all = (await body(await call("GET", "/document-types?archived=include", sa.headers)))
      .data as { id: string; archived: boolean }[];
    expect(all.find((t) => t.id === type.id)?.archived).toBe(true);
    expect((await call("POST", `/document-types/${type.id}/restore`, sa.headers)).status).toBe(200);
    expect((await call("DELETE", `/document-types/${type.id}`, sa.headers)).status).toBe(200);
    expect(await code(await call("DELETE", `/document-types/${types.ktp}`, sa.headers))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
  });
});

describe("dokumen per karyawan", () => {
  test("SIMPER: kedaluwarsa wajib; versi baru menggantikan versi aktif; hapus mengaktifkan versi lama", async () => {
    expect((await upload(hr, ids.team, types.simper, {})).status).toBe(400);
    const first = await upload(hr, ids.team, types.simper, {
      documentNumber: "SMP-1",
      issuedAt: isoIn(-300),
      expiresAt: isoIn(20),
    });
    expect(first.status).toBe(201);
    const second = await upload(hr, ids.team, types.simper, {
      documentNumber: "SMP-2",
      issuedAt: isoIn(-1),
      expiresAt: isoIn(364),
    });
    expect(second.status).toBe(201);
    let docs = (await docsOf(hr, ids.team)).documents.filter(
      (d) => d.documentType.code === "SIMPER",
    );
    expect(docs.map((d) => [d.version, d.isCurrent, d.expiryState])).toEqual([
      [2, true, "VALID"],
      [1, false, "EXPIRING"],
    ]);
    const secondId = (await body(second)).data.id;
    expect(
      (await call("DELETE", `/employees/${ids.team}/documents/${secondId}`, hr.headers)).status,
    ).toBe(200);
    docs = (await docsOf(hr, ids.team)).documents.filter((d) => d.documentType.code === "SIMPER");
    expect(docs.map((d) => [d.version, d.isCurrent])).toEqual([[1, true]]);
    const removed = await prisma.employeeDocument.findUniqueOrThrow({ where: { id: secondId } });
    expect(removed.deletedAt).not.toBeNull();
    expect(fake.removed).toContain(`${BUCKET}/${removed.storagePath}`);
  });

  test("format & ukuran dicek server; file tidak sah dihapus dari Storage", async () => {
    const before = fake.removed.length;
    const big = await upload(
      hr,
      ids.team,
      types.cert,
      {},
      { size: 6 * 1024 * 1024, contentType: "application/pdf" },
    );
    expect(await code(big)).toBe("BUSINESS_RULE_VIOLATION");
    expect(fake.removed.length).toBe(before + 1);
    // SIMPER hanya PDF/JPG/PNG — semua diizinkan; jenis uji PDF saja ditolak saat minta URL.
    const pdfOnly = await prisma.documentType.create({
      data: {
        code: `QA_${RUN}_PDF`,
        name: "PDF saja",
        category: "OTHER",
        allowedMimeTypes: ["application/pdf"],
      },
    });
    const png = await call("POST", `/employees/${ids.team}/documents/upload-url`, hr.headers, {
      documentTypeId: pdfOnly.id,
      contentType: "image/png",
    });
    expect(await code(png)).toBe("BUSINESS_RULE_VIOLATION");
  });

  test("jenis sensitif (KTP): HR tanpa grant tidak melihat/menulis; grant baca & tulis; audit baca", async () => {
    expect((await upload(hr, ids.team, types.ktp)).status).toBe(403);
    expect((await upload(hrRead, ids.team, types.ktp)).status).toBe(403);
    const ktp = await upload(hrWrite, ids.team, types.ktp, { documentNumber: "3201000000000001" });
    expect(ktp.status).toBe(201);
    const ktpId = (await body(ktp)).data.id;
    const codes = async (who: Login) =>
      (await docsOf(who, ids.team)).documents.map((d) => d.documentType.code);
    expect(await codes(hr)).not.toContain("KTP");
    expect(await codes(hrRead)).toContain("KTP");
    expect(await codes(mgr)).not.toContain("KTP");
    expect(await codes(emp)).toContain("KTP"); // pemilik dokumen
    expect((await docsOf(hr, ids.team)).access).toEqual({
      write: true,
      writeSensitive: false,
      writeBankBook: false,
    });
    expect((await docsOf(mgr, ids.team)).access).toEqual({
      write: false,
      writeSensitive: false,
      writeBankBook: false,
    });
    expect(
      (await call("GET", `/employees/${ids.team}/documents/${ktpId}/url`, hr.headers)).status,
    ).toBe(404);
    const url = await call("GET", `/employees/${ids.team}/documents/${ktpId}/url`, hrRead.headers);
    expect(url.status).toBe(200);
    expect((await body(url)).data.url).toContain("storage.test/sign");
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "employee.sensitive.read",
        actorAccountId: hrRead.account.id,
        entityId: ids.team,
      },
    });
    expect(audit?.after).toMatchObject({ section: "documents", type: "KTP" });
    expect(JSON.stringify(audit?.after)).not.toContain("3201000000000001");
  });

  test("cakupan: HR PT lain & karyawan lain 404; MANAGER & EMPLOYEE tidak bisa unggah", async () => {
    expect((await call("GET", `/employees/${ids.team}/documents`, hrOther.headers)).status).toBe(
      404,
    );
    expect((await call("GET", `/employees/${ids.otherPt}/documents`, emp.headers)).status).toBe(
      404,
    );
    expect((await upload(mgr, ids.team, types.cert)).status).toBe(403);
    expect((await upload(emp, ids.team, types.cert)).status).toBe(403);
    expect((await call("GET", `/employees/${ids.team}/documents`, {})).status).toBe(401);
  });

  test("lampiran pelatihan; ubah metadata; jenis tidak bisa diganti", async () => {
    const training = await prisma.training.create({
      data: { employeeId: ids.team, trainingField: `K3 ${RUN}` },
    });
    const other = await prisma.training.create({
      data: { employeeId: ids.otherPt, trainingField: `K3 ${RUN}` },
    });
    expect((await upload(sa, ids.team, types.cert, { trainingId: other.id })).status).toBe(404);
    const cert = await upload(sa, ids.team, types.cert, { trainingId: training.id });
    expect(cert.status).toBe(201);
    const certId = (await body(cert)).data.id;
    const row = await prisma.employeeDocument.findUniqueOrThrow({ where: { id: certId } });
    expect(row.trainingId).toBe(training.id);
    expect(row.type).toBe("CERTIFICATE");
    const patch = (payload: unknown) =>
      call("PATCH", `/employees/${ids.team}/documents/${certId}`, sa.headers, payload);
    expect((await patch({ documentTypeId: types.cert, documentNumber: "C-9" })).status).toBe(200);
    expect(await code(await patch({ documentTypeId: types.simper }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    // Jenis jamak: unggahan kedua tidak menggantikan yang pertama.
    expect((await upload(sa, ids.team, types.cert)).status).toBe(201);
    const certs = (await docsOf(sa, ids.team)).documents.filter(
      (d) => d.documentType.code === "CERT_OTHER",
    );
    expect(certs.filter((d) => d.isCurrent)).toHaveLength(2);
  });
});

describe("Data File (tabel lintas karyawan)", () => {
  test("cakupan per role; jenis sensitif hanya ber-grant; filter kedaluwarsa", async () => {
    await upload(sa, ids.otherPt, types.simper, { expiresAt: isoIn(-3) });
    const rows = async (who: Login, extra = "") =>
      (
        (await body(await call("GET", `/archive/documents?q=${RUN}${extra}`, who.headers)))
          .data as { employee: { id: string }; documentType: { code: string } }[]
      ).map((r) => `${r.employee.id === ids.team ? "T" : "P"}:${r.documentType.code}`);
    expect((await rows(sa)).sort()).toEqual([
      "P:SIMPER",
      "T:CERT_OTHER",
      "T:CERT_OTHER",
      "T:KTP",
      "T:SIMPER",
    ]);
    expect((await rows(hr)).sort()).toEqual(["T:CERT_OTHER", "T:CERT_OTHER", "T:SIMPER"]);
    expect(await rows(hrRead)).toContain("T:KTP");
    expect((await rows(mgr)).sort()).toEqual(["T:CERT_OTHER", "T:CERT_OTHER", "T:SIMPER"]);
    expect(await rows(sa, "&expiry=EXPIRED")).toEqual(["P:SIMPER"]);
    expect(await rows(sa, "&expiry=EXPIRING")).toEqual(["T:SIMPER"]);
    expect((await call("GET", "/archive/documents", emp.headers)).status).toBe(403);
  });
});

describe("cron document-expiry", () => {
  test("karyawan & HR PT diberi pengingat sekali per ambang; tanpa nilai sensitif", async () => {
    await prisma.employee.update({
      where: { id: ids.team },
      data: { managerId: ids.manager },
    });
    const first = await remindExpiringDocuments();
    expect(first.notified).toBeGreaterThan(0);
    const count = (accountId: string) =>
      prisma.notification.count({
        where: { recipientAccountId: accountId, type: "employee.document_expiring" },
      });
    // SIMPER tim 20 hari lagi → ambang 30 (karyawan + HR ACP); jenis biasa → HR tanpa grant pun.
    expect(await count(emp.account.id)).toBe(1);
    expect(await count(hr.account.id)).toBeGreaterThanOrEqual(1);
    const note = await prisma.notification.findFirstOrThrow({
      where: { recipientAccountId: emp.account.id, type: "employee.document_expiring" },
    });
    expect(note.title).toBe("Dokumen akan kedaluwarsa");
    expect(note.body).toContain("SIMPER");
    await remindExpiringDocuments();
    expect(await count(emp.account.id)).toBe(1);
  });
});
