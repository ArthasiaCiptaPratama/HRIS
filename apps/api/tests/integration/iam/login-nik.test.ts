import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeEmailSender } from "../../helpers/email.ts";
import { completeData } from "../../helpers/onboarding.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// D-048 (onboarding c2): login dengan NIK — disetujui → email Auth diganti alamat turunan NIK
// (`accounts.login_email`), ubah nomor induk → alamat ikut, gagal Supabase → semua batal; lupa password
// lewat API (tautan ke email pribadi, respons selalu sama, maks 3/jam per masukan).
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const DOMAIN = "test.login.akselerasi.invalid";
const auth = createAuthFixture(`nk${RUN.toLowerCase()}`);
const fakeAuth = createFakeAuthAdmin();
const email = createFakeEmailSender();
const prisma = getPrisma();
const baseDeps = {
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: fakeAuth.admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
  emailSender: email.sender,
};
const app = createApp({ ...baseDeps, loginEmailDomain: DOMAIN });
const appWithoutNik = createApp({ ...baseDeps, loginEmailDomain: undefined });
// createApp terakhir mengonfigurasi notifikasi global; keduanya memakai sender yang sama.

type Headers = Record<string, string>;
const call = (target: typeof app, method: string, path: string, headers: Headers, body?: unknown) =>
  target.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login;
const owners: Record<string, Login> = {};
const ids = { department: "", position: "", status: "" } as Record<string, string>;
const number = (key: string) => `NK.${RUN}.${key.toUpperCase()}`;
const personal = (key: string) => `nk-${RUN.toLowerCase()}-${key}@example.test`;

beforeAll(async () => {
  const company = await acpCompanyId();
  ids.department = (await prisma.department.create({ data: { name: `Dept NK ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `Jab NK ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `Status NK ${RUN}` } })).id;
  for (const key of ["ok", "fail", "off", "reset"]) {
    ids[key] = (
      await prisma.employee.create({
        data: {
          companyId: company,
          joinDate: new Date("2026-11-25T00:00:00.000Z"),
          employmentStatusId: ids.status as string,
          positionId: ids.position as string,
          employeeNumber: number(key),
          fullName: `Calon ${key} ${RUN}`,
          personalEmail: personal(key),
          onboardingStatus: key === "reset" ? "APPROVED" : "SUBMITTED",
        },
      })
    ).id;
    owners[key] = await auth.loginAs("EMPLOYEE", { employeeId: ids[key] as string });
    await completeData(ids[key] as string, (owners[key] as Login).account.id);
  }
  sa = await auth.loginAs("SUPER_ADMIN");
});

afterAll(async () => {
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { employeeNumber: { startsWith: `NK.${RUN}.` } } });
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

const approve = (target: typeof app, key: string) =>
  call(target, "POST", `/onboarding/${ids[key]}/decision`, sa.headers, {
    decision: "APPROVED",
    ptkpStatus: "TK0",
  });
const accountOf = (key: string) =>
  prisma.account.findUniqueOrThrow({ where: { id: (owners[key] as Login).account.id } });

describe("disetujui → login NIK", () => {
  test("email Auth diganti alamat turunan NIK; email kontak tetap; notifikasi menyebut NIK", async () => {
    const res = await approve(app, "ok");
    expect(res.status).toBe(200);
    const account = await accountOf("ok");
    const address = `${number("ok").toLowerCase()}@${DOMAIN}`;
    expect(account.loginEmail).toBe(address);
    expect(account.email).toBe((owners.ok as Login).account.email);
    expect(fakeAuth.emailChanges).toContainEqual({ userId: account.authUserId, email: address });
    const notif = await prisma.notification.findFirst({
      where: { recipientAccountId: account.id, type: "employee.onboarding_approved" },
    });
    expect(notif?.body).toContain(number("ok"));
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ids.ok, action: "employee.onboarding.decide" },
    });
    expect(audit?.after).toMatchObject({ loginByEmployeeNumber: true });
  });

  test("Supabase gagal mengganti email → seluruh keputusan dibatalkan", async () => {
    fakeAuth.setFailEmailUpdate(true);
    const res = await approve(app, "fail");
    fakeAuth.setFailEmailUpdate(false);
    expect(res.status).toBe(500);
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: ids.fail } });
    expect(row.onboardingStatus).toBe("SUBMITTED");
    expect((await accountOf("fail")).loginEmail).toBeNull();
    expect(await prisma.onboardingReview.count({ where: { employeeId: ids.fail } })).toBe(0);
  });

  test("tanpa LOGIN_EMAIL_DOMAIN → disetujui tanpa mengganti email Auth", async () => {
    const before = fakeAuth.emailChanges.length;
    expect((await approve(appWithoutNik, "off")).status).toBe(200);
    expect((await accountOf("off")).loginEmail).toBeNull();
    expect(fakeAuth.emailChanges.length).toBe(before);
  });

  test("ubah nomor induk → alamat login ikut diperbarui", async () => {
    const res = await call(app, "PATCH", `/employees/${ids.ok}`, sa.headers, {
      employeeNumber: `NK.${RUN}.BARU`,
    });
    expect(res.status).toBe(200);
    expect((await accountOf("ok")).loginEmail).toBe(`nk.${RUN.toLowerCase()}.baru@${DOMAIN}`);
  });
});

describe("lupa password (publik)", () => {
  const reset = (identifier: string) =>
    call(app, "POST", "/auth/password-reset", {}, { identifier });

  test("NIK → tautan ke email pribadi; respons sama untuk masukan tak dikenal", async () => {
    const ok = await reset(number("reset").toLowerCase());
    const unknown = await reset(`TIDAK.ADA.${RUN}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(await unknown.json());
    const mails = email.sent.filter((m) => m.to === personal("reset"));
    expect(mails).toHaveLength(1);
    expect(mails[0]?.text).toContain("https://auth.test/recover");
    expect(mails[0]?.text).not.toContain(number("reset"));
    expect(fakeAuth.recoveryLinks).toContain((owners.reset as Login).account.email);
  });

  test("email pribadi juga diterima; akun login NIK memakai alamat turunan untuk tautan", async () => {
    await reset(personal("ok"));
    expect(email.sent.some((m) => m.to === personal("ok"))).toBe(true);
    expect(fakeAuth.recoveryLinks).toContain(`nk.${RUN.toLowerCase()}.baru@${DOMAIN}`);
  });

  test("maks 3 permintaan per masukan per jam; masukan disimpan sebagai hash", async () => {
    const key = `nk-limit-${RUN.toLowerCase()}@example.test`;
    for (let i = 0; i < 4; i += 1) expect((await reset(key)).status).toBe(200);
    const target = personal("reset");
    const before = email.sent.filter((m) => m.to === target).length;
    for (let i = 0; i < 4; i += 1) await reset(number("reset"));
    // 1 permintaan sebelumnya + 2 di sini lolos (total 3), sisanya ditahan.
    expect(email.sent.filter((m) => m.to === target).length - before).toBe(2);
    const stored = await prisma.passwordResetAttempt.findMany({ take: 50 });
    expect(stored.every((a) => /^[a-f0-9]{64}$/.test(a.keyHash))).toBe(true);
  });

  test("masukan kosong → 400", async () => {
    expect((await reset("  ")).status).toBe(400);
  });
});
