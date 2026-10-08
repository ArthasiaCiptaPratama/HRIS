import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { bearer, createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// D-045 bagian a: penerimaan calon (pratinjau, simpan, antrean undangan, kirim ulang, undang karyawan
// existing, login pertama → "mengisi data") + calon tersembunyi dari fitur karyawan lain.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const run = RUN.toLowerCase();
const auth = createAuthFixture(`ob${run}`);
const fake = createFakeAuthAdmin();
const prisma = getPrisma();
const makeApp = (perHour: number) =>
  createApp({
    logger: createLogger("error", () => {}),
    tokenVerifier: testVerifier,
    authAdmin: fake.admin,
    appUrl: "http://localhost:5173",
    onboardingInvitesPerHour: perHour,
  });
const app = makeApp(1000);

type Headers = Record<string, string>;
const call = (method: string, path: string, headers: Headers, body?: unknown, target = app) =>
  target.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => ((await res.json()) as { data: any }).data;

type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login;
let hr: Login;
let hrOther: Login;
let mgr: Login;
const ids = {
  acp: "",
  acpCode: "ACP",
  other: "",
  department: "",
  position: "",
  archivedPosition: "",
  status: "",
  existing: "",
};
const email = (n: string) => `calon-${run}-${n}@example.test`;

const candidate = (n: string, extra: Record<string, unknown> = {}) => ({
  sourceRow: Number(n.replace(/\D/g, "")) || 1,
  fullName: `Calon ${RUN} ${n}`,
  personalEmail: email(n),
  companyId: ids.acp,
  employmentStatusId: ids.status,
  positionId: ids.position,
  joinDate: "2026-11-25",
  ...extra,
});

async function cleanupCandidates() {
  const employees = await prisma.employee.findMany({
    where: { fullName: { startsWith: `Calon ${RUN}` } },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);
  await prisma.account.deleteMany({
    where: { employeeId: { in: [...employeeIds, ids.existing] } },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
}

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.other = await createTestCompany(`O${RUN}`, `PT Onboarding ${RUN}`);
  ids.department = (await prisma.department.create({ data: { name: `Dept OB ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `Jab OB ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.archivedPosition = (
    await prisma.position.create({
      data: { name: `Jab Arsip OB ${RUN}`, departmentId: ids.department, deletedAt: new Date() },
    })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `Status OB ${RUN}` } })).id;
  ids.existing = (
    await prisma.employee.create({
      data: {
        companyId: ids.acp,
        employeeNumber: `OBX-${RUN}`,
        fullName: `Lama ${RUN}`,
        joinDate: new Date("2024-01-02T00:00:00.000Z"),
        employmentStatusId: ids.status,
        positionId: ids.position,
      },
    })
  ).id;
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN");
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.other] });
  mgr = await auth.loginAs("MANAGER");
});

afterAll(async () => {
  await cleanupCandidates();
  await prisma.account.deleteMany({ where: { email: { startsWith: `calon-${run}-` } } });
  await prisma.onboardingBatch.deleteMany({ where: { name: { startsWith: `Batch ${RUN}` } } });
  await prisma.employee.deleteMany({ where: { id: ids.existing } });
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await auth.cleanup();
  await prisma.company.delete({ where: { id: ids.other } });
  await disconnectPrisma();
});

describe("akses", () => {
  test("MANAGER 403, tanpa token 401; HR boleh pratinjau di PT-nya", async () => {
    const body = { candidates: [candidate("1")] };
    expect(await code(await call("POST", "/onboarding-batches/preview", mgr.headers, body))).toBe(
      "FORBIDDEN",
    );
    expect((await call("POST", "/onboarding-batches/preview", {}, body)).status).toBe(401);
    expect((await call("POST", "/onboarding-batches/preview", hr.headers, body)).status).toBe(200);
  });
});

describe("pratinjau", () => {
  test("nomor induk otomatis DD.MM.KODE.NNN berurutan; isian pengguna dipakai apa adanya", async () => {
    const res = await call("POST", "/onboarding-batches/preview", sa.headers, {
      candidates: [
        candidate("1"),
        candidate("2"),
        candidate("3", { employeeNumber: `MANUAL-${RUN}` }),
      ],
    });
    const preview = await data(res);
    expect(preview.valid).toBe(true);
    const [a, b, c] = preview.rows;
    expect(a.employeeNumber).toMatch(/^25\.11\.ACP\.\d{3,}$/);
    expect(a.suggested).toBe(true);
    const seq = (n: string) => Number(n.split(".").at(-1));
    expect(seq(b.employeeNumber)).toBe(seq(a.employeeNumber) + 1);
    expect(c).toMatchObject({ employeeNumber: `MANUAL-${RUN}`, suggested: false });
  });

  test("masalah per baris: email ganda, email dipakai akun, PT di luar cakupan, jabatan terarsip, email tidak valid", async () => {
    const preview = await data(
      await call("POST", "/onboarding-batches/preview", hrOther.headers, {
        candidates: [
          candidate("1"),
          candidate("2", { personalEmail: email("1") }),
          candidate("3", { personalEmail: hr.account.email, companyId: ids.other }),
          candidate("4", { companyId: ids.other, positionId: ids.archivedPosition }),
          candidate("5", { personalEmail: "bukan-email" }),
        ],
      }),
    );
    const codes = (i: number) => preview.rows[i].issues.map((x: { code: string }) => x.code);
    expect(preview.valid).toBe(false);
    expect(codes(0)).toEqual(
      expect.arrayContaining(["EMAIL_DUPLICATE_IN_BATCH", "COMPANY_OUT_OF_SCOPE"]),
    );
    expect(codes(2)).toContain("EMAIL_TAKEN");
    expect(codes(2)).not.toContain("COMPANY_OUT_OF_SCOPE");
    expect(codes(3)).toContain("POSITION_INVALID");
    expect(codes(4)).toContain("INVALID");
  });
});

describe("simpan, sembunyikan, antrean, login pertama", () => {
  let invitedId = "";
  let notInvitedId = "";
  let batchId = "";

  test("simpan: calon Diundang/Belum diundang, antrean hanya yang diundang, audit tanpa email", async () => {
    const preview = await data(
      await call("POST", "/onboarding-batches/preview", sa.headers, {
        candidates: [candidate("1"), candidate("2")],
      }),
    );
    const res = await call("POST", "/onboarding-batches", sa.headers, {
      name: `Batch ${RUN} A`,
      candidates: [
        candidate("1", { employeeNumber: preview.rows[0].employeeNumber }),
        candidate("2", { employeeNumber: preview.rows[1].employeeNumber, invite: false }),
      ],
    });
    expect(res.status).toBe(201);
    const batch = await data(res);
    batchId = batch.id;
    expect(batch).toMatchObject({ createdCount: 2, invitedCount: 1, invitations: { queued: 1 } });
    const rows = await prisma.employee.findMany({
      where: { onboardingBatchId: batchId },
      orderBy: { fullName: "asc" },
    });
    invitedId = rows[0]?.id as string;
    notInvitedId = rows[1]?.id as string;
    expect(rows.map((r) => r.onboardingStatus)).toEqual(["INVITED", "NOT_INVITED"]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: invitedId, action: "employee.onboarding.create" },
    });
    expect(JSON.stringify(audit.after)).not.toContain("@");
  });

  test("simpan ulang dengan nomor yang sudah dipakai → 422 berisi baris bermasalah", async () => {
    const taken = (await prisma.employee.findUniqueOrThrow({ where: { id: invitedId } }))
      .employeeNumber;
    const res = await call("POST", "/onboarding-batches", sa.headers, {
      name: `Batch ${RUN} B`,
      candidates: [candidate("7", { employeeNumber: taken })],
    });
    expect(res.status).toBe(422);
  });

  test("calon tersembunyi dari daftar, detail (404), struktur organisasi, pilihan atasan", async () => {
    const list = await data(await call("GET", `/employees?q=Calon%20${RUN}`, sa.headers));
    expect(list).toHaveLength(0);
    expect((await call("GET", `/employees/${invitedId}`, sa.headers)).status).toBe(404);
    const structure = await data(await call("GET", "/org-structure", sa.headers));
    const ids2 = structure.departments.flatMap(
      (d: { positions: { employees: { id: string }[] }[] }) =>
        d.positions.flatMap((p) => p.employees.map((e) => e.id)),
    );
    expect(ids2).not.toContain(invitedId);
    // Muncul di menu Penerimaan dengan hitungan per status.
    const res = await call("GET", `/onboarding?batchId=${batchId}`, sa.headers);
    const body = (await res.json()) as {
      data: { id: string }[];
      meta: { counts: Record<string, number> };
    };
    expect(body.data.map((r) => r.id).sort()).toEqual([invitedId, notInvitedId].sort());
    expect(body.meta.counts).toMatchObject({ INVITED: 1, NOT_INVITED: 1 });
    // HR PT lain tidak melihat calon ACP.
    const other = (await (
      await call("GET", `/onboarding?batchId=${batchId}`, hrOther.headers)
    ).json()) as {
      data: unknown[];
    };
    expect(other.data).toHaveLength(0);
  });

  test("import lama menolak nomor induk milik calon (ONBOARDING_IN_PROGRESS)", async () => {
    const number = (await prisma.employee.findUniqueOrThrow({ where: { id: invitedId } }))
      .employeeNumber;
    const res = await call("POST", "/employee-imports/preview", sa.headers, {
      fileName: "uji.xlsx",
      fileSha256: "c".repeat(64),
      mode: "UPSERT",
      companyId: ids.acp,
      rows: [{ sourceRow: 6, raw: { employeeNumber: number, fullName: "Timpa" } }],
    });
    const preview = await data(res);
    expect(preview.rows[0].issues.map((i: { code: string }) => i.code)).toContain(
      "ONBOARDING_IN_PROGRESS",
    );
  });

  test("proses antrean: undangan terkirim, akun EMPLOYEE tertaut, status SENT", async () => {
    const res = await call("POST", "/onboarding-invitations/process", sa.headers);
    const result = await data(res);
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(fake.invited).toContain(email("1"));
    const account = await prisma.account.findUniqueOrThrow({ where: { employeeId: invitedId } });
    expect(account).toMatchObject({ role: "EMPLOYEE", email: email("1") });
    const invitation = await prisma.onboardingInvitation.findFirstOrThrow({
      where: { employeeId: invitedId },
    });
    expect(invitation.status).toBe("SENT");
  });

  test("login pertama calon → status Mengisi data (+ jejak)", async () => {
    const account = await prisma.account.findUniqueOrThrow({ where: { employeeId: invitedId } });
    expect((await call("GET", "/me", bearer(account.authUserId))).status).toBe(200);
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: invitedId } });
    expect(employee.onboardingStatus).toBe("FILLING");
    expect(
      await prisma.onboardingEvent.count({ where: { employeeId: invitedId, toStatus: "FILLING" } }),
    ).toBe(1);
    // D-045 b: calon dikunci ke wizard (/onboarding/me); endpoint karyawan biasa 403 untuknya,
    // dan admin tetap 404 (calon belum menjadi karyawan).
    expect((await call("GET", `/employees/${invitedId}`, bearer(account.authUserId))).status).toBe(
      403,
    );
    expect((await call("GET", "/onboarding/me", bearer(account.authUserId))).status).toBe(200);
    expect((await call("GET", `/employees/${invitedId}`, hr.headers)).status).toBe(404);
  });

  test("kirim ulang: Belum diundang → antre & Diundang; antre ganda 409; sudah login 422", async () => {
    expect(
      (await call("POST", `/onboarding/${notInvitedId}/resend-invitation`, hr.headers)).status,
    ).toBe(200);
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: notInvitedId } })).onboardingStatus,
    ).toBe("INVITED");
    expect(
      await code(await call("POST", `/onboarding/${notInvitedId}/resend-invitation`, hr.headers)),
    ).toBe("CONFLICT");
    expect(
      await code(await call("POST", `/onboarding/${invitedId}/resend-invitation`, hr.headers)),
    ).toBe("BUSINESS_RULE_VIOLATION");
    // HR PT lain → 404.
    expect(
      (await call("POST", `/onboarding/${notInvitedId}/resend-invitation`, hrOther.headers)).status,
    ).toBe(404);
  });

  test("undangan gagal dicatat FAILED dengan kode, tanpa pesan mentah", async () => {
    fake.failInviteFor(email("2"));
    await call("POST", "/onboarding-invitations/process", sa.headers);
    const invitation = await prisma.onboardingInvitation.findFirstOrThrow({
      where: { employeeId: notInvitedId },
    });
    expect(invitation).toMatchObject({ status: "FAILED", lastErrorCode: "INVITE_FAILED" });
  });
});

describe("batas per jam & karyawan existing", () => {
  test("batas per jam: tidak ada yang dikirim bila kuota jam ini habis", async () => {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const sentLastHour = await prisma.onboardingInvitation.count({
      where: { sentAt: { gte: since } },
    });
    const limited = makeApp(Math.max(1, sentLastHour));
    const preview = await data(
      await call("POST", "/onboarding-batches/preview", sa.headers, {
        candidates: [candidate("8")],
      }),
    );
    await call("POST", "/onboarding-batches", sa.headers, {
      name: `Batch ${RUN} C`,
      candidates: [candidate("8", { employeeNumber: preview.rows[0].employeeNumber })],
    });
    const result = await data(
      await call("POST", "/onboarding-invitations/process", sa.headers, undefined, limited),
    );
    expect(result.sent).toBe(0);
    expect(result.remaining).toBeGreaterThanOrEqual(1);
    expect(result.rateLimited).toBe(true);
  });

  test("undang karyawan existing: antre + wajib lengkapi data; yang sudah punya akun dilewati", async () => {
    const res = await call("POST", "/onboarding/invite-existing", hr.headers, {
      employees: [
        { employeeId: ids.existing, email: email("lama") },
        { employeeId: hr.account.id, email: email("x") },
      ],
    });
    const result = await data(res);
    expect(result.queued).toBe(1);
    expect(result.skipped[0]).toMatchObject({ code: "NOT_FOUND" });
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: ids.existing } });
    expect(employee).toMatchObject({
      onboardingStatus: "APPROVED",
      completionRequired: true,
      personalEmail: email("lama"),
    });
    // Tetap tampil sebagai karyawan aktif.
    expect((await call("GET", `/employees/${ids.existing}`, sa.headers)).status).toBe(200);
  });
});
