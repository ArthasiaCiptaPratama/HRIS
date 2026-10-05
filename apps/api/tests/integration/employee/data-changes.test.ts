import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { EMPLOYEE_DOCUMENT_BUCKET as BUCKET } from "../../../src/core/storage.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// D-054 / OD-6 (Arsip gelombang 1c): pengajuan perubahan data diri → antrean → setujui/tolak.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(`pd${RUN.toLowerCase()}`);
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
  self: "",
  hrSelf: "",
  otherPt: "",
};
const startedAt = new Date();
let emp: Login;
let empOther: Login;
let sa: Login;
let hrPlain: Login;
let hrReview: Login;
let hrFull: Login;
let hrBank: Login;
let hrOtherPt: Login;
let hrSelf: Login;
let noEmployee: Login;

async function employee(n: string, extra: Record<string, unknown> = {}) {
  const row = await prisma.employee.create({
    data: {
      companyId: ids.acp,
      employeeNumber: `PD-${RUN}-${n}`,
      fullName: `Pengaju ${RUN} ${n}`,
      joinDate: new Date("2023-02-01T00:00:00.000Z"),
      employmentStatusId: ids.status,
      positionId: ids.position,
      ...extra,
    },
  });
  return row.id;
}
const submit = (who: Login, section: string, data: unknown) =>
  call("POST", "/data-changes", who.headers, { section, data });
const decide = (who: Login, id: string, decision: "APPROVE" | "REJECT", note?: string) =>
  call("POST", `/data-changes/${id}/decision`, who.headers, { decision, note });
async function uploadMine(who: Login, purpose: "BANK" | "DOCUMENT", documentTypeId?: string) {
  const res = await call("POST", "/self/documents/upload-url", who.headers, {
    purpose,
    documentTypeId,
    contentType: "application/pdf",
  });
  if (res.status !== 200) return { res, path: "" };
  const { path } = (await body(res)).data as { path: string };
  fake.putObject(BUCKET, path, { size: 2000, contentType: "application/pdf" });
  return { res, path };
}
const typeId = async (code: string) =>
  (await prisma.documentType.findUniqueOrThrow({ where: { code } })).id;
const REVIEW = { permission: "EMPLOYEE_CHANGES_REVIEW" as const };

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.other = await createTestCompany(`P${RUN}`, `PT Pengajuan ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `PD St ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `PD Dept ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `PD Jab ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.self = await employee("E", {
    emergencyContactName: "Kontak Lama",
    personal: { create: { domicileAddress: "Jl. Lama 1" } },
    bankAccount: {
      create: { bankName: "BRI", accountNumber: "1111222233", accountHolder: "Lama" },
    },
    familyMembers: { create: [{ name: `Pasangan ${RUN}`, relationship: "SPOUSE" }] },
  });
  ids.hrSelf = await employee("H");
  ids.otherPt = await employee("P", { companyId: ids.other });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.self });
  empOther = await auth.loginAs("EMPLOYEE", { employeeId: ids.otherPt });
  sa = await auth.loginAs("SUPER_ADMIN");
  hrPlain = await auth.loginAs("HR_ADMIN", { companies: [ids.acp] });
  hrReview = await auth.loginAs("HR_ADMIN", { companies: [ids.acp], grants: [REVIEW] });
  hrFull = await auth.loginAs("HR_ADMIN", {
    companies: [ids.acp],
    grants: [
      REVIEW,
      { permission: "EMPLOYEE_PERSONAL_READ" },
      { permission: "EMPLOYEE_PERSONAL_WRITE" },
    ],
  });
  hrBank = await auth.loginAs("HR_ADMIN", {
    companies: [ids.acp],
    grants: [REVIEW, { permission: "EMPLOYEE_BANK_READ" }, { permission: "EMPLOYEE_BANK_WRITE" }],
  });
  hrOtherPt = await auth.loginAs("HR_ADMIN", { companies: [ids.other], grants: [REVIEW] });
  hrSelf = await auth.loginAs("HR_ADMIN", {
    companies: [ids.acp],
    employeeId: ids.hrSelf,
    grants: [REVIEW],
  });
  noEmployee = await auth.loginAs("EMPLOYEE", { employeeId: null });
});

afterAll(async () => {
  const employees = [ids.self, ids.hrSelf, ids.otherPt];
  const accounts = [
    emp,
    empOther,
    sa,
    hrPlain,
    hrReview,
    hrFull,
    hrBank,
    hrOtherPt,
    hrSelf,
    noEmployee,
  ].map((a) => a.account.id);
  await prisma.notification.deleteMany({ where: { recipientAccountId: { in: accounts } } });
  await auth.cleanup();
  await prisma.auditLog.deleteMany({
    where: {
      occurredAt: { gte: startedAt },
      OR: [
        { entityType: "employee.data_change" },
        { entityType: "employee.archive" },
        { entityType: "employee.employee", entityId: { in: employees } },
      ],
    },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.company.delete({ where: { id: ids.other } });
  await disconnectPrisma();
});

describe("data diri (ESS)", () => {
  test("rekening tersamar; akun tanpa data karyawan 404; tanpa token 401", async () => {
    const mine = (await body(await call("GET", "/self/employee-data", emp.headers))).data;
    expect(mine.personal.domicileAddress).toBe("Jl. Lama 1");
    expect(mine.bank.accountNumber).toBe("••••••2233");
    expect(mine.family).toHaveLength(1);
    expect((await call("GET", "/self/employee-data", noEmployee.headers)).status).toBe(404);
    expect((await call("GET", "/self/employee-data", {})).status).toBe(401);
  });
});

describe("pengajuan data pribadi", () => {
  let requestId = "";
  test("validasi; tanpa perubahan 422; satu menunggu per bagian (409)", async () => {
    expect((await submit(emp, "PERSONAL", { fullName: "Ganti" })).status).toBe(400);
    expect((await submit(emp, "PERSONAL", { ktpNumber: "123" })).status).toBe(400);
    expect(await code(await submit(emp, "PERSONAL", { domicileAddress: "Jl. Lama 1" }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    const res = await submit(emp, "PERSONAL", {
      domicileAddress: "Jl. Baru 2",
      religion: null,
      originCity: "Samarinda",
    });
    expect(res.status).toBe(201);
    requestId = (await body(res)).data.id;
    expect((await submit(emp, "PERSONAL", { domicileAddress: "Jl. Baru 3" })).status).toBe(409);
    const notice = await prisma.notification.findFirst({
      where: { recipientAccountId: hrFull.account.id, type: "employee.data_change_submitted" },
    });
    expect(notice?.body).toContain("data pribadi");
    expect(notice?.body).not.toContain("Jl. Baru");
    // HR ber-grant review saja (tanpa personal) tidak diberi tahu bagian pribadi.
    expect(
      await prisma.notification.count({
        where: { recipientAccountId: hrReview.account.id, type: "employee.data_change_submitted" },
      }),
    ).toBe(0);
  });

  test("antrean: HR tanpa grant 403; HR PT lain tidak melihat; detail butuh grant bagian", async () => {
    expect((await call("GET", "/data-changes", hrPlain.headers)).status).toBe(403);
    const rows = async (who: Login) =>
      (
        (await body(await call("GET", `/data-changes?q=${RUN}`, who.headers))).data as {
          id: string;
          canReview: boolean;
          fields: string[];
        }[]
      ).filter((r) => r.id === requestId);
    expect(await rows(hrOtherPt)).toHaveLength(0);
    const [reviewOnly] = await rows(hrReview);
    expect(reviewOnly?.canReview).toBe(false);
    expect(reviewOnly?.fields.sort()).toEqual(["domicileAddress", "originCity"]);
    expect((await call("GET", `/data-changes/${requestId}`, hrReview.headers)).status).toBe(404);
    const detail = (await body(await call("GET", `/data-changes/${requestId}`, hrFull.headers)))
      .data;
    expect(detail.current).toEqual({ domicileAddress: "Jl. Lama 1", originCity: null });
    expect(detail.proposed).toEqual({ domicileAddress: "Jl. Baru 2", originCity: "Samarinda" });
    expect(detail.access).toEqual({ review: true, cancel: false });
    expect(
      await prisma.auditLog.count({
        where: {
          action: "employee.sensitive.read",
          actorAccountId: hrFull.account.id,
          entityId: ids.self,
        },
      }),
    ).toBe(1);
  });

  test("pemilik tidak memutuskan; HR tanpa grant bagian 403; setujui → data berlaku + notifikasi", async () => {
    expect((await decide(emp, requestId, "APPROVE")).status).toBe(403);
    expect((await decide(hrReview, requestId, "APPROVE")).status).toBe(403);
    expect((await decide(hrOtherPt, requestId, "APPROVE")).status).toBe(404);
    expect((await decide(hrFull, requestId, "APPROVE")).status).toBe(200);
    const personal = await prisma.employeePersonal.findUniqueOrThrow({
      where: { employeeId: ids.self },
    });
    expect([personal.domicileAddress, personal.originCity]).toEqual(["Jl. Baru 2", "Samarinda"]);
    const row = await prisma.dataChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.status).toBe("APPROVED");
    expect(row.previous).toEqual({ domicileAddress: "Jl. Lama 1", originCity: null });
    expect(await code(await decide(hrFull, requestId, "REJECT", "x"))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    const note = await prisma.notification.findFirstOrThrow({
      where: { recipientAccountId: emp.account.id, type: "employee.data_change_decided" },
    });
    expect(note.title).toContain("disetujui");
  });
});

describe("kontak darurat, keluarga, batal", () => {
  test("kontak darurat: HR ber-grant review saja boleh memutuskan; tolak wajib alasan", async () => {
    const id = (
      await body(await submit(emp, "EMERGENCY", { name: "Kontak Baru", phone: "081234567890" }))
    ).data.id;
    expect((await decide(hrReview, id, "REJECT")).status).toBe(400);
    expect((await decide(hrReview, id, "REJECT", "Nomor tidak aktif")).status).toBe(200);
    const mine = (await body(await call("GET", "/self/data-changes", emp.headers))).data as {
      id: string;
      status: string;
      reviewNote: string;
    }[];
    expect(mine.find((r) => r.id === id)).toMatchObject({
      status: "REJECTED",
      reviewNote: "Nomor tidak aktif",
    });
  });

  test("keluarga: pemilik membatalkan; orang lain tidak bisa", async () => {
    const id = (
      await body(
        await submit(emp, "FAMILY", {
          members: [
            { name: `Pasangan ${RUN}`, relationship: "SPOUSE" },
            { name: `Anak ${RUN}`, relationship: "CHILD", birthDate: "2020-01-01" },
          ],
        }),
      )
    ).data.id;
    expect((await call("POST", `/data-changes/${id}/cancel`, empOther.headers)).status).toBe(404);
    expect((await call("POST", `/data-changes/${id}/cancel`, emp.headers)).status).toBe(200);
    expect(await prisma.familyMember.count({ where: { employeeId: ids.self } })).toBe(1);
  });

  test("HR memeriksa pengajuannya sendiri → 403", async () => {
    const id = (await body(await submit(hrSelf, "EMERGENCY", { name: "Kontak HR" }))).data.id;
    expect((await decide(hrSelf, id, "APPROVE")).status).toBe(403);
    expect((await decide(sa, id, "APPROVE")).status).toBe(200);
  });
});

describe("rekening & dokumen", () => {
  test("rekening: buku tabungan wajib; menunggu = dokumen belum berlaku; setujui → rekening & dokumen aktif", async () => {
    expect(
      (
        await submit(emp, "BANK", {
          bankName: "BNI",
          accountNumber: "9999888877",
          accountHolder: "Baru",
        })
      ).status,
    ).toBe(400);
    const { path } = await uploadMine(emp, "BANK");
    const res = await submit(emp, "BANK", {
      bankName: "BNI",
      accountNumber: "9999888877",
      accountHolder: "Baru",
      bankBookPath: path,
    });
    expect(res.status).toBe(201);
    const id = (await body(res)).data.id;
    const pending = await prisma.employeeDocument.findFirstOrThrow({
      where: { storagePath: path },
    });
    expect([pending.status, pending.isCurrent]).toEqual(["PENDING_REVIEW", false]);
    const own = (await body(await call("GET", `/data-changes/${id}`, emp.headers))).data;
    expect(own.proposed.accountNumber).toBe("••••••8877");
    expect(own.access).toEqual({ review: false, cancel: true });
    expect((await decide(hrFull, id, "APPROVE")).status).toBe(403);
    const full = (await body(await call("GET", `/data-changes/${id}`, hrBank.headers))).data;
    expect(full.proposed.accountNumber).toBe("9999888877");
    expect(full.document.url).toContain("storage.test/sign");
    expect((await decide(hrBank, id, "APPROVE")).status).toBe(200);
    const bank = await prisma.employeeBankAccount.findUniqueOrThrow({
      where: { employeeId: ids.self },
    });
    expect(bank.accountNumber).toBe("9999888877");
    const active = await prisma.employeeDocument.findFirstOrThrow({ where: { storagePath: path } });
    expect([active.status, active.isCurrent, active.version]).toEqual(["VERIFIED", true, 1]);
  });

  test("dokumen: hanya jenis yang boleh diunggah karyawan; kedaluwarsa wajib; tolak → file dihapus", async () => {
    const simper = await uploadMine(emp, "DOCUMENT", await typeId("SIMPER"));
    expect(await code(simper.res)).toBe("BUSINESS_RULE_VIOLATION");
    const sim = await typeId("SIM");
    const { path } = await uploadMine(emp, "DOCUMENT", sim);
    expect((await submit(emp, "DOCUMENT", { documentTypeId: sim, path })).status).toBe(400);
    const res = await submit(emp, "DOCUMENT", {
      documentTypeId: sim,
      path,
      documentNumber: "SIM-QA",
      expiresAt: "2030-01-01",
    });
    expect(res.status).toBe(201);
    const id = (await body(res)).data.id;
    expect((await decide(hrReview, id, "REJECT", "Foto buram")).status).toBe(200);
    const doc = await prisma.employeeDocument.findFirstOrThrow({ where: { storagePath: path } });
    expect(doc.status).toBe("REJECTED");
    expect(doc.deletedAt).not.toBeNull();
    expect(fake.removed).toContain(`${BUCKET}/${path}`);
  });
});

describe("Arsip › Data Keluarga & Data Bank", () => {
  test("butuh grant baca; cakupan PT; dibaca diaudit", async () => {
    expect((await call("GET", "/archive/families", hrPlain.headers)).status).toBe(403);
    expect((await call("GET", "/archive/bank-accounts", hrFull.headers)).status).toBe(403);
    const families = (await body(await call("GET", `/archive/families?q=${RUN}`, hrFull.headers)))
      .data as {
      name: string;
    }[];
    expect(families.map((f) => f.name)).toEqual([`Pasangan ${RUN}`]);
    const banks = (await body(await call("GET", `/archive/bank-accounts?q=${RUN}`, hrBank.headers)))
      .data as {
      accountNumber: string;
    }[];
    expect(banks.map((b) => b.accountNumber)).toEqual(["9999888877"]);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "employee.sensitive.read",
          actorAccountId: hrBank.account.id,
          entityId: "bank-accounts",
        },
      }),
    ).toBe(1);
    expect((await call("GET", "/archive/families", emp.headers)).status).toBe(403);
  });
});
