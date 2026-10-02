import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { EMPLOYEE_DOCUMENT_BUCKET, EMPLOYEE_PHOTO_BUCKET } from "../../../src/core/storage.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeEmailSender } from "../../helpers/email.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// D-045 d (design §11): pulihkan calon batal ≤ 30 hari; cron `onboarding-maintenance` menghapus
// permanen calon batal > 30 hari (data, akun, notifikasi, file; user Auth di-ban + email anonim) dan
// mengingatkan HR/SA sekali per calon yang belum aktivasi > 14 hari.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const DOMAIN = "test.login.akselerasi.invalid";
const CRON_SECRET = `cron-${RUN}-secret-value`;
const auth = createAuthFixture(`mt${RUN.toLowerCase()}`);
const fakeAuth = createFakeAuthAdmin();
const storage = createFakeStorage();
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: fakeAuth.admin,
  appUrl: "http://localhost:5173",
  storage: storage.storage,
  emailSender: createFakeEmailSender().sender,
  cronSecret: CRON_SECRET,
  loginEmailDomain: DOMAIN,
});

type Headers = Record<string, string>;
const call = (method: string, path: string, headers: Headers) =>
  app.request(`/api/v1${path}`, { method, headers });
const runCron = () =>
  app.request("/api/cron/onboarding-maintenance", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
const DAY = 24 * 60 * 60 * 1000;

type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login;
let hrGrant: Login;
let hrNoGrant: Login;
const owners: Record<string, Login> = {};
const ids: Record<string, string> = {};

async function candidate(key: string, status: "CANCELLED" | "INVITED", daysAgo: number) {
  const id = (
    await prisma.employee.create({
      data: {
        companyId: ids.company as string,
        joinDate: new Date("2026-11-25T00:00:00.000Z"),
        employmentStatusId: ids.status as string,
        positionId: ids.position as string,
        employeeNumber: `MT-${RUN}-${key}`,
        fullName: `Calon ${key} ${RUN}`,
        personalEmail: `mt-${RUN.toLowerCase()}-${key}@example.test`,
        onboardingStatus: status,
        photoPath: `employees/mt-${key}/photo.jpg`,
        documents: {
          create: [
            {
              type: "KTP",
              storagePath: `employees/mt-${key}/documents/ktp.pdf`,
              mimeType: "application/pdf",
              sizeBytes: 100,
              uploadedBy: sa.account.id,
            },
          ],
        },
      },
    })
  ).id;
  ids[key] = id;
  const at = new Date(Date.now() - daysAgo * DAY);
  if (status === "CANCELLED") {
    await prisma.onboardingEvent.create({
      data: { employeeId: id, fromStatus: "SUBMITTED", toStatus: "CANCELLED", occurredAt: at },
    });
  } else {
    await prisma.onboardingInvitation.create({
      data: {
        employeeId: id,
        email: `mt-${RUN.toLowerCase()}-${key}@example.test`,
        queuedBy: sa.account.id,
        status: "SENT",
        attempts: 1,
        sentAt: at,
      },
    });
  }
  owners[key] = await auth.loginAs("EMPLOYEE", {
    employeeId: id,
    isActive: status !== "CANCELLED",
  });
}

beforeAll(async () => {
  ids.company = await acpCompanyId();
  ids.department = (await prisma.department.create({ data: { name: `Dept MT ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `Jab MT ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `Status MT ${RUN}` } })).id;
  sa = await auth.loginAs("SUPER_ADMIN");
  hrGrant = await auth.loginAs("HR_ADMIN", {
    grants: [{ permission: "EMPLOYEE_ONBOARDING_REVIEW" }],
  });
  hrNoGrant = await auth.loginAs("HR_ADMIN");
  await candidate("baru", "CANCELLED", 5);
  await candidate("lama", "CANCELLED", 40);
  await candidate("undang", "INVITED", 20);
  await prisma.notification.create({
    data: {
      recipientAccountId: (owners.lama as Login).account.id,
      type: "employee.onboarding_cancelled",
      title: "Penerimaan Anda dibatalkan",
    },
  });
});

afterAll(async () => {
  // Pengingat juga sampai ke SA lokal lain (penerima sungguhan di DB lokal) — bersihkan.
  await prisma.notification.deleteMany({
    where: { dedupeKey: { startsWith: "onboarding-invite-stale:" }, body: { contains: RUN } },
  });
  await auth.cleanup();
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [ids.baru, ids.lama, ids.undang].filter(Boolean) as string[] } },
  });
  await prisma.employee.deleteMany({ where: { employeeNumber: { startsWith: `MT-${RUN}-` } } });
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("pulihkan calon batal (≤ 30 hari)", () => {
  test("daftar menampilkan kapan dibatalkan & batas pemulihan", async () => {
    const res = await call("GET", `/onboarding?status=CANCELLED&q=MT-${RUN}`, sa.headers);
    const body = (await res.json()) as {
      data: { id: string; cancellation: { restorableUntil: string } | null }[];
    };
    const row = body.data.find((r) => r.id === ids.baru);
    const until = new Date(row?.cancellation?.restorableUntil as string).getTime();
    expect(Math.round((until - Date.now()) / DAY)).toBe(25);
  });

  test("HR tanpa grant → 404; HR ber-grant → status sebelum batal, akun aktif & ban dibuka", async () => {
    expect((await call("POST", `/onboarding/${ids.baru}/restore`, hrNoGrant.headers)).status).toBe(
      404,
    );
    const res = await call("POST", `/onboarding/${ids.baru}/restore`, hrGrant.headers);
    expect(res.status).toBe(200);
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: ids.baru } });
    expect(row.onboardingStatus).toBe("SUBMITTED");
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: (owners.baru as Login).account.id },
    });
    expect(account.isActive).toBe(true);
    expect(fakeAuth.banned.get(account.authUserId)).toBe(false);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ids.baru, action: "employee.onboarding.restore" },
    });
    expect(audit?.after).toMatchObject({ status: "SUBMITTED" });
  });

  test("lewat 30 hari → 422", async () => {
    const res = await call("POST", `/onboarding/${ids.lama}/restore`, sa.headers);
    expect(res.status).toBe(422);
  });
});

describe("cron onboarding-maintenance", () => {
  test("tanpa secret → 401", async () => {
    expect((await app.request("/api/cron/onboarding-maintenance")).status).toBe(401);
  });

  test("hapus permanen calon batal > 30 hari: data, akun, notifikasi, file; Auth di-ban + email anonim", async () => {
    const owner = owners.lama as Login;
    const res = await runCron();
    expect(res.status).toBe(200);
    expect(await prisma.employee.findUnique({ where: { id: ids.lama } })).toBeNull();
    expect(await prisma.employeeDocument.count({ where: { employeeId: ids.lama } })).toBe(0);
    expect(await prisma.account.findUnique({ where: { id: owner.account.id } })).toBeNull();
    expect(
      await prisma.notification.count({ where: { recipientAccountId: owner.account.id } }),
    ).toBe(0);
    expect(fakeAuth.banned.get(owner.account.authUserId)).toBe(true);
    const change = fakeAuth.emailChanges.find((c) => c.userId === owner.account.authUserId);
    expect(change?.email).toMatch(new RegExp(`^deleted-[0-9a-f-]{36}@${DOMAIN}$`));
    expect(storage.removed).toContain(
      `${EMPLOYEE_DOCUMENT_BUCKET}/employees/mt-lama/documents/ktp.pdf`,
    );
    expect(storage.removed).toContain(`${EMPLOYEE_PHOTO_BUCKET}/employees/mt-lama/photo.jpg`);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ids.lama, action: "employee.onboarding.purge" },
    });
    expect(audit?.actorAccountId).toBeNull();
    // Calon yang baru dipulihkan tidak tersentuh.
    expect(await prisma.employee.findUnique({ where: { id: ids.baru } })).not.toBeNull();
  });

  test("pengingat undangan > 14 hari: ke SA & HR ber-grant, sekali saja per calon", async () => {
    const count = (accountId: string) =>
      prisma.notification.count({
        where: {
          recipientAccountId: accountId,
          dedupeKey: `onboarding-invite-stale:${ids.undang}`,
        },
      });
    expect(await count(hrGrant.account.id)).toBe(1);
    expect(await count(sa.account.id)).toBe(1);
    expect(await count(hrNoGrant.account.id)).toBe(0);
    await runCron();
    expect(await count(hrGrant.account.id)).toBe(1);
  });
});
