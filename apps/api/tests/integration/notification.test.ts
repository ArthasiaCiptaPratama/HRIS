import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../src/core/db.ts";
import { createLogger } from "../../src/core/logger.ts";
import {
  configureNotification,
  MAX_EMAIL_ATTEMPTS,
  notify,
  retryEmailOutbox,
} from "../../src/modules/notification/index.ts";
import { createAuthFixture, testVerifier } from "../helpers/auth.ts";
import { createFakeAuthAdmin } from "../helpers/auth-admin.ts";
import { createFakeEmailSender } from "../helpers/email.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(RUN);
const prisma = getPrisma();
const email = createFakeEmailSender();
const logger = createLogger("error", () => {});
const CRON_SECRET = `cron-${RUN}-secret-value`;
const app = createApp({
  logger,
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  emailSender: email.sender,
  cronSecret: CRON_SECRET,
});
const outboxTo = (s: string) => `outbox-${RUN}-${s}@example.test`;

type Headers = Record<string, string>;
const call = (method: string, path: string, headers: Headers, body?: unknown) =>
  app.request(path.startsWith("/api/") ? path : `/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

let a: Awaited<ReturnType<typeof auth.loginAs>>;
let b: Awaited<ReturnType<typeof auth.loginAs>>;

beforeAll(async () => {
  a = await auth.loginAs("EMPLOYEE");
  b = await auth.loginAs("EMPLOYEE");
});
beforeEach(() => {
  email.setFail(false);
  email.sent.length = 0;
  configureNotification({ sender: email.sender, appUrl: "http://localhost:5173", logger });
});
afterAll(async () => {
  await prisma.emailOutbox.deleteMany({ where: { toEmail: { startsWith: `outbox-${RUN}-` } } });
  await auth.cleanup();
  await disconnectPrisma();
});

describe("notify()", () => {
  test("in-app per penerima (tanpa ganda) + email berisi link, tanpa data selain yang diberikan", async () => {
    const result = await notify({
      recipients: [
        { accountId: a.account.id, email: a.account.email },
        { accountId: a.account.id, email: a.account.email },
        { accountId: b.account.id, email: b.account.email },
      ],
      type: "test.hello",
      title: "Halo",
      body: "Isi uji",
      link: "/profil",
      email: true,
    });
    expect(result).toMatchObject({ created: 2, emailed: 2, queued: 0, failed: 0 });
    expect(email.sent[0]?.subject).toBe("[Akselerasi Arthasia] Halo");
    expect(email.sent[0]?.text).toContain("http://localhost:5173/profil");
  });

  test("dedupeKey: notifikasi yang sama tidak dibuat & tidak di-email dua kali", async () => {
    const input = {
      recipients: [{ accountId: a.account.id, email: a.account.email }],
      type: "test.dedupe",
      title: "Sekali saja",
      dedupeKey: `dedupe-${RUN}`,
      email: true,
    };
    expect((await notify(input)).created).toBe(1);
    expect(await notify(input)).toMatchObject({ created: 0, skippedDuplicates: 1, emailed: 0 });
    expect(email.sent).toHaveLength(1);
  });

  test("SMTP gagal → notifikasi tetap dibuat, email masuk outbox (tidak melempar)", async () => {
    email.setFail(true);
    const result = await notify({
      recipients: [{ accountId: b.account.id, email: outboxTo("gagal") }],
      type: "test.fail",
      title: "Gagal kirim",
      email: true,
    });
    expect(result).toMatchObject({ created: 1, emailed: 0, queued: 1 });
    const row = await prisma.emailOutbox.findFirstOrThrow({
      where: { toEmail: outboxTo("gagal") },
    });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(row.lastError).toContain("fake SMTP failure");
  });
});

describe("retryEmailOutbox() (cron email-retry)", () => {
  test("jatuh tempo & berhasil → SENT; gagal terus → FAILED setelah batas percobaan", async () => {
    const past = new Date(Date.now() - 60_000);
    const ok = await prisma.emailOutbox.create({
      data: {
        toEmail: outboxTo("ok"),
        subject: "s",
        textBody: "t",
        attempts: 1,
        nextAttemptAt: past,
      },
    });
    const last = await prisma.emailOutbox.create({
      data: {
        toEmail: outboxTo("last"),
        subject: "s",
        textBody: "t",
        attempts: MAX_EMAIL_ATTEMPTS - 1,
        nextAttemptAt: past,
      },
    });
    const later = await prisma.emailOutbox.create({
      data: {
        toEmail: outboxTo("later"),
        subject: "s",
        textBody: "t",
        attempts: 1,
        nextAttemptAt: new Date(Date.now() + 3_600_000),
      },
    });

    await retryEmailOutbox();
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe(
      "SENT",
    );
    expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: later.id } })).status).toBe(
      "PENDING",
    );

    await prisma.emailOutbox.update({ where: { id: ok.id }, data: { status: "SENT" } });
    await prisma.emailOutbox.update({
      where: { id: last.id },
      data: { status: "PENDING", attempts: MAX_EMAIL_ATTEMPTS - 1, nextAttemptAt: past },
    });
    email.setFail(true);
    await retryEmailOutbox();
    const failed = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: last.id } });
    expect(failed).toMatchObject({
      status: "FAILED",
      attempts: MAX_EMAIL_ATTEMPTS,
      nextAttemptAt: null,
    });
  });
});

describe("GET/POST /notifications (milik sendiri)", () => {
  test("hanya notifikasi sendiri + unreadCount; tandai baca; milik orang lain 404; read-all", async () => {
    await notify({
      recipients: [{ accountId: a.account.id, email: a.account.email }],
      type: "test.inbox",
      title: "Inbox A",
      email: false,
    });
    const other = await prisma.notification.findFirstOrThrow({
      where: { recipientAccountId: b.account.id },
    });

    const res = await call("GET", "/notifications?unreadOnly=true", a.headers);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; title: string }[];
      meta: { unreadCount: number };
    };
    expect(body.data.every((n) => n.id !== other.id)).toBe(true);
    const unreadBefore = body.meta.unreadCount;
    expect(unreadBefore).toBeGreaterThan(0);

    const first = body.data[0] as { id: string };
    expect((await call("POST", `/notifications/${first.id}/read`, a.headers)).status).toBe(200);
    const res404 = await call("POST", `/notifications/${other.id}/read`, a.headers);
    expect(res404.status).toBe(404);
    expect(((await res404.json()) as ErrorBody).error.code).toBe("NOT_FOUND");

    expect((await call("POST", "/notifications/read-all", a.headers)).status).toBe(200);
    const after = (await (await call("GET", "/notifications", a.headers)).json()) as {
      meta: { unreadCount: number };
    };
    expect(after.meta.unreadCount).toBe(0);
    expect((await call("GET", "/notifications", {})).status).toBe(401);
  });
});

describe("pemicu dari IAM (PLAN §5.6)", () => {
  test("grant diberikan & dicabut → notifikasi + email ke penerima grant", async () => {
    const sa = await auth.loginAs("SUPER_ADMIN");
    const hr = await auth.loginAs("HR_ADMIN");
    const grant = (await (
      await call("POST", "/grants", sa.headers, {
        accountId: hr.account.id,
        permission: "employee.bank.read",
      })
    ).json()) as { data: { id: string } };
    await call("POST", `/grants/${grant.data.id}/revoke`, sa.headers, {});
    const types = (
      await prisma.notification.findMany({
        where: { recipientAccountId: hr.account.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((n) => n.type);
    expect(types).toEqual(["iam.grant_created", "iam.grant_revoked"]);
    expect(email.sent.filter((m) => m.to === hr.account.email)).toHaveLength(2);
    expect(email.sent.map((m) => m.text).join(" ")).not.toMatch(/\d{16}/);
  });
});

describe("cron /api/cron/* (CRON_SECRET)", () => {
  test("tanpa/salah secret 401; secret benar 200; grant-expiry tidak mengirim ganda", async () => {
    expect((await call("GET", "/api/cron/grant-expiry", {})).status).toBe(401);
    expect(
      (await call("GET", "/api/cron/grant-expiry", { Authorization: "Bearer salah" })).status,
    ).toBe(401);

    const hr = await auth.loginAs("HR_ADMIN", {
      grants: [
        { permission: "EMPLOYEE_PERSONAL_READ", expiresAt: new Date(Date.now() + 86_400_000) },
      ],
    });
    const headers = { Authorization: `Bearer ${CRON_SECRET}` };
    const first = await call("GET", "/api/cron/grant-expiry", headers);
    expect(first.status).toBe(200);
    expect(
      await prisma.notification.count({
        where: { recipientAccountId: hr.account.id, type: "iam.grant_expiring" },
      }),
    ).toBe(1);
    await call("GET", "/api/cron/grant-expiry", headers);
    expect(
      await prisma.notification.count({
        where: { recipientAccountId: hr.account.id, type: "iam.grant_expiring" },
      }),
    ).toBe(1);
    expect((await call("GET", "/api/cron/email-retry", headers)).status).toBe(200);
  });

  test("CRON_SECRET kosong → endpoint cron selalu ditolak", async () => {
    const closed = createApp({
      logger,
      tokenVerifier: testVerifier,
      emailSender: email.sender,
      cronSecret: undefined,
    });
    expect(
      (
        await closed.request("/api/cron/email-retry", {
          headers: { Authorization: "Bearer apa-saja" },
        })
      ).status,
    ).toBe(401);
  });
});
