import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { completeData } from "../../helpers/onboarding.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// D-045 c / D-047: review isian onboarding — akses (SA / HR + grant di PT), keputusan setujui
// (PTKP + koreksi data kerja + riwayat HIRED), minta revisi (hanya bagian bertanda terbuka), batalkan
// (akun dinonaktifkan + ban), notifikasi tanpa data sensitif.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(`rv${RUN.toLowerCase()}`);
const storage = createFakeStorage();
const fakeAuth = createFakeAuthAdmin();
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: fakeAuth.admin,
  appUrl: "http://localhost:5173",
  storage: storage.storage,
  storagePathPrefix: `test/rv${RUN.toLowerCase()}/`,
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
let sa: Login;
let hrGrant: Login;
let hrNoGrant: Login;
let manager: Login;
const owners: Record<string, Login> = {};
const ids = {
  company: "",
  department: "",
  position: "",
  position2: "",
  status: "",
  approve: "",
  revise: "",
  cancel: "",
  filling: "",
  existing: "",
};

beforeAll(async () => {
  ids.company = await acpCompanyId();
  ids.department = (await prisma.department.create({ data: { name: `Dept RV ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `Jab RV ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.position2 = (
    await prisma.position.create({
      data: { name: `Jab RV2 ${RUN}`, departmentId: ids.department },
    })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `Status RV ${RUN}` } })).id;
  const base = {
    companyId: ids.company,
    joinDate: new Date("2026-11-25T00:00:00.000Z"),
    employmentStatusId: ids.status,
    positionId: ids.position,
  };
  const make = async (key: keyof typeof ids, status: "SUBMITTED" | "FILLING" | "APPROVED") => {
    ids[key] = (
      await prisma.employee.create({
        data: {
          ...base,
          employeeNumber: `RV-${RUN}-${key}`,
          fullName: `Calon ${key} ${RUN}`,
          personalEmail: `rv-${RUN.toLowerCase()}-${key}@example.test`,
          onboardingStatus: status,
          ...(status === "APPROVED" ? { completionRequired: true } : {}),
        },
      })
    ).id;
    // Karyawan existing dimiliki HR ber-grant (uji larangan me-review data sendiri).
    owners[key] = await auth.loginAs(status === "APPROVED" ? "HR_ADMIN" : "EMPLOYEE", {
      employeeId: ids[key],
      ...(status === "APPROVED" ? { grants: [{ permission: "EMPLOYEE_ONBOARDING_REVIEW" }] } : {}),
    });
    await completeData(ids[key], owners[key].account.id);
  };
  await make("approve", "SUBMITTED");
  await make("revise", "SUBMITTED");
  await make("cancel", "SUBMITTED");
  await make("filling", "FILLING");
  await make("existing", "APPROVED");
  await prisma.employee.update({
    where: { id: ids.existing },
    data: { completionSubmittedAt: new Date() },
  });
  sa = await auth.loginAs("SUPER_ADMIN");
  hrGrant = await auth.loginAs("HR_ADMIN", {
    grants: [{ permission: "EMPLOYEE_ONBOARDING_REVIEW" }],
  });
  hrNoGrant = await auth.loginAs("HR_ADMIN");
  manager = await auth.loginAs("MANAGER");
});

afterAll(async () => {
  // Notifikasi "menunggu review" juga sampai ke SA lokal lain — bersihkan.
  await prisma.notification.deleteMany({
    where: { type: { startsWith: "employee.onboarding_" }, body: { contains: RUN } },
  });
  const all = Object.values(ids).filter(Boolean);
  await auth.cleanup();
  await prisma.auditLog.deleteMany({ where: { entityId: { in: all } } });
  await prisma.employee.deleteMany({ where: { employeeNumber: { startsWith: `RV-${RUN}-` } } });
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("akses review (D-047)", () => {
  test("SA & HR ber-grant boleh; HR tanpa grant / Manager / HR PT lain → 404", async () => {
    expect((await call("GET", `/onboarding/${ids.approve}`, sa.headers)).status).toBe(200);
    const res = await call("GET", `/onboarding/${ids.approve}`, hrGrant.headers);
    expect(res.status).toBe(200);
    const body = await data(res);
    expect(body).toMatchObject({
      status: "SUBMITTED",
      reviewMode: "candidate",
      canDecide: true,
      editable: false,
      ptkpStatus: null,
    });
    expect(body.personal.ktpNumber).toMatch(/^62\d{14}$/);
    expect(body.documents).toHaveLength(4);
    expect(body.documents.every((d: { removable: boolean }) => !d.removable)).toBe(true);
    expect((await call("GET", `/onboarding/${ids.approve}`, hrNoGrant.headers)).status).toBe(404);
    expect((await call("GET", `/onboarding/${ids.approve}`, manager.headers)).status).toBe(404);
    const hrOther = await auth.loginAs("HR_ADMIN", {
      companies: [],
      grants: [{ permission: "EMPLOYEE_ONBOARDING_REVIEW" }],
    });
    expect((await call("GET", `/onboarding/${ids.approve}`, hrOther.headers)).status).toBe(404);
  });

  test("membuka review dicatat di audit (akses data sensitif, tanpa nilai)", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ids.approve, action: "employee.onboarding.review.read" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.after).toBeNull();
  });

  test("data milik sendiri tidak boleh di-review → 403", async () => {
    const self = owners.existing as Login;
    expect((await call("GET", `/onboarding/${ids.existing}`, self.headers)).status).toBe(403);
    expect((await call("GET", `/onboarding/${ids.existing}`, hrGrant.headers)).status).toBe(200);
  });

  test("belum dikirim → bisa dilihat, tidak bisa diputuskan (422)", async () => {
    const body = await data(await call("GET", `/onboarding/${ids.filling}`, sa.headers));
    expect(body.canDecide).toBe(false);
    const res = await call("POST", `/onboarding/${ids.filling}/decision`, sa.headers, {
      decision: "APPROVED",
      ptkpStatus: "TK0",
    });
    expect(await code(res)).toBe("BUSINESS_RULE_VIOLATION");
  });
});

describe("keputusan", () => {
  test("input divalidasi: revisi tanpa catatan / batal tanpa alasan → 400", async () => {
    const bad1 = await call("POST", `/onboarding/${ids.revise}/decision`, sa.headers, {
      decision: "REVISION_REQUESTED",
      sectionNotes: { bank: "  " },
    });
    expect(bad1.status).toBe(400);
    const bad2 = await call("POST", `/onboarding/${ids.cancel}/decision`, sa.headers, {
      decision: "CANCELLED",
    });
    expect(bad2.status).toBe(400);
  });

  test("setujui: PTKP + koreksi jabatan → APPROVED, riwayat HIRED, notifikasi ke calon", async () => {
    const res = await call("POST", `/onboarding/${ids.approve}/decision`, hrGrant.headers, {
      decision: "APPROVED",
      ptkpStatus: "K1",
      work: { positionId: ids.position2, joinDate: "2026-12-01" },
    });
    expect(res.status).toBe(200);
    const row = await prisma.employee.findUniqueOrThrow({
      where: { id: ids.approve },
      include: { personal: true, histories: true, onboardingReviews: true },
    });
    expect(row.onboardingStatus).toBe("APPROVED");
    expect(row.positionId).toBe(ids.position2);
    expect(row.joinDate.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(row.personal?.ptkpStatus).toBe("K1");
    expect(row.histories).toHaveLength(1);
    expect(row.histories[0]).toMatchObject({ changeType: "HIRED", toPositionId: ids.position2 });
    expect(row.onboardingReviews[0]).toMatchObject({ decision: "APPROVED", completion: false });
    const notif = await prisma.notification.findFirst({
      where: { recipientAccountId: owners.approve?.account.id },
    });
    expect(notif?.type).toBe("employee.onboarding_approved");
    expect(notif?.body).not.toMatch(/62\d{14}/);
    // Sudah diputuskan → tidak bisa diputuskan lagi; kini tampil di fitur karyawan.
    const again = await call("POST", `/onboarding/${ids.approve}/decision`, sa.headers, {
      decision: "APPROVED",
      ptkpStatus: "K1",
    });
    expect(again.status).toBe(404);
    expect((await call("GET", `/employees/${ids.approve}`, sa.headers)).status).toBe(200);
  });

  test("koreksi data kerja merujuk master data tidak valid → 422", async () => {
    const res = await call("POST", `/onboarding/${ids.revise}/decision`, sa.headers, {
      decision: "APPROVED",
      ptkpStatus: "TK0",
      work: { positionId: crypto.randomUUID() },
    });
    expect(await code(res)).toBe("BUSINESS_RULE_VIOLATION");
  });

  test("minta revisi → Perlu revisi; hanya bagian bertanda yang bisa diubah calon", async () => {
    const owner = owners.revise as Login;
    const res = await call("POST", `/onboarding/${ids.revise}/decision`, hrGrant.headers, {
      decision: "REVISION_REQUESTED",
      sectionNotes: { bank: "Nomor rekening tidak sesuai buku tabungan" },
    });
    expect(res.status).toBe(200);
    const mine = await data(await call("GET", "/onboarding/me", owner.headers));
    expect(mine).toMatchObject({ status: "REVISION_REQUESTED", editable: true });
    expect(mine.revision.notes).toEqual({ bank: "Nomor rekening tidak sesuai buku tabungan" });
    expect(mine.documents.every((d: { removable: boolean }) => !d.removable)).toBe(true);
    const blocked = await call("PUT", "/onboarding/me/emergency", owner.headers, {
      name: "Siti",
    });
    expect(await code(blocked)).toBe("BUSINESS_RULE_VIOLATION");
    const docBlocked = await call("POST", "/onboarding/me/documents/upload-url", owner.headers, {
      type: "KTP",
      contentType: "application/pdf",
    });
    expect(await code(docBlocked)).toBe("BUSINESS_RULE_VIOLATION");
    const allowed = await call("PUT", "/onboarding/me/bank", owner.headers, {
      bankName: "BRI",
      accountNumber: "9876543210",
      accountHolder: "Ani",
    });
    expect(allowed.status).toBe(200);
    expect((await call("POST", "/onboarding/me/submit", owner.headers)).status).toBe(200);
    const again = await data(await call("GET", `/onboarding/${ids.revise}`, sa.headers));
    expect(again).toMatchObject({ status: "SUBMITTED", canDecide: true });
    expect(again.reviews[0]).toMatchObject({ decision: "REVISION_REQUESTED" });
    const notif = await prisma.notification.findFirst({
      where: {
        recipientAccountId: owner.account.id,
        type: "employee.onboarding_revision_requested",
      },
    });
    expect(notif?.body).toContain("Rekening");
  });

  test("kirim calon → notifikasi ke SA & HR ber-grant (bukan HR tanpa grant)", async () => {
    const forHr = await prisma.notification.count({
      where: { recipientAccountId: hrGrant.account.id, type: "employee.onboarding_submitted" },
    });
    const forPlainHr = await prisma.notification.count({
      where: { recipientAccountId: hrNoGrant.account.id, type: "employee.onboarding_submitted" },
    });
    expect(forHr).toBeGreaterThan(0);
    expect(forPlainHr).toBe(0);
  });

  test("batalkan → CANCELLED, akun dinonaktifkan + ban, alasan di audit", async () => {
    const owner = owners.cancel as Login;
    const res = await call("POST", `/onboarding/${ids.cancel}/decision`, sa.headers, {
      decision: "CANCELLED",
      reason: "Calon mengundurkan diri",
    });
    expect(res.status).toBe(200);
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: ids.cancel } });
    expect(row.onboardingStatus).toBe("CANCELLED");
    const account = await prisma.account.findUniqueOrThrow({ where: { id: owner.account.id } });
    expect(account.isActive).toBe(false);
    expect(fakeAuth.banned.get(account.authUserId)).toBe(true);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ids.cancel, action: "employee.onboarding.decide" },
    });
    expect(audit?.reason).toBe("Calon mengundurkan diri");
  });

  test("karyawan existing: tidak bisa dibatalkan; revisi mengembalikan; setujui → selesai", async () => {
    const cancel = await call("POST", `/onboarding/${ids.existing}/decision`, sa.headers, {
      decision: "CANCELLED",
      reason: "x tidak",
    });
    expect(await code(cancel)).toBe("BUSINESS_RULE_VIOLATION");
    const work = await call("POST", `/onboarding/${ids.existing}/decision`, sa.headers, {
      decision: "APPROVED",
      ptkpStatus: "TK0",
      work: { positionId: ids.position2 },
    });
    expect(await code(work)).toBe("BUSINESS_RULE_VIOLATION");
    const revise = await call("POST", `/onboarding/${ids.existing}/decision`, sa.headers, {
      decision: "REVISION_REQUESTED",
      sectionNotes: { personal: "Tempat lahir salah ketik" },
    });
    expect(revise.status).toBe(200);
    let row = await prisma.employee.findUniqueOrThrow({ where: { id: ids.existing } });
    expect(row.completionSubmittedAt).toBeNull();
    expect(row.onboardingStatus).toBe("APPROVED");
    await prisma.employee.update({
      where: { id: ids.existing },
      data: { completionSubmittedAt: new Date() },
    });
    const approve = await call("POST", `/onboarding/${ids.existing}/decision`, sa.headers, {
      decision: "APPROVED",
      ptkpStatus: "TK0",
    });
    expect(approve.status).toBe(200);
    row = await prisma.employee.findUniqueOrThrow({ where: { id: ids.existing } });
    expect(row.completionRequired).toBe(false);
    const histories = await prisma.employmentHistory.count({ where: { employeeId: ids.existing } });
    expect(histories).toBe(0);
  });
});
