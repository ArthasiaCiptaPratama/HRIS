import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { EMPLOYEE_DOCUMENT_BUCKET } from "../../../src/core/storage.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// D-045 bagian b: wizard onboarding milik sendiri — kunci akses calon, simpan draf, dokumen, kirim;
// karyawan existing (lengkapi data) hanya mengisi field kosong & tidak dikunci.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(`wz${RUN.toLowerCase()}`);
const storage = createFakeStorage();
const prisma = getPrisma();
const PREFIX = `test/wz${RUN.toLowerCase()}/`;
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: storage.storage,
  storagePathPrefix: PREFIX,
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
let candidate: Login;
let existing: Login;
let sa: Login;
const ids = { department: "", position: "", status: "", candidate: "", existing: "" };

const PERSONAL = {
  fullName: `Calon Wizard ${RUN}`,
  gender: "FEMALE",
  birthPlace: "Palangka Raya",
  birthDate: "2001-02-03",
  ktpNumber: "6271010101000001",
  kkNumber: "6271010101000002",
  religion: "ISLAM",
  maritalStatus: "SINGLE",
  ktpAddress: "Jl. Contoh 1",
  domicileAddress: "Jl. Contoh 2",
  originCity: "Kuala Kapuas",
  phoneNumber: "081234567890",
  npwpAbsent: true,
  bpjsEmploymentAbsent: true,
  bpjsHealthAbsent: true,
};

async function uploadDoc(who: Login, type: string, contentType = "application/pdf", size = 1000) {
  const url = await data(
    await call("POST", "/onboarding/me/documents/upload-url", who.headers, { type, contentType }),
  );
  storage.putObject(EMPLOYEE_DOCUMENT_BUCKET, url.path, { size, contentType });
  return call("POST", "/onboarding/me/documents", who.headers, { type, path: url.path });
}

beforeAll(async () => {
  const acp = await acpCompanyId();
  ids.department = (await prisma.department.create({ data: { name: `Dept WZ ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `Jab WZ ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `Status WZ ${RUN}` } })).id;
  const base = {
    companyId: acp,
    joinDate: new Date("2026-11-25T00:00:00.000Z"),
    employmentStatusId: ids.status,
    positionId: ids.position,
  };
  ids.candidate = (
    await prisma.employee.create({
      data: {
        ...base,
        employeeNumber: `WZ-${RUN}-1`,
        fullName: `Calon Wizard ${RUN}`,
        onboardingStatus: "FILLING",
      },
    })
  ).id;
  ids.existing = (
    await prisma.employee.create({
      data: {
        ...base,
        employeeNumber: `WZ-${RUN}-2`,
        fullName: `Lama Wizard ${RUN}`,
        completionRequired: true,
        personal: { create: { ktpNumber: "6271010101000099" } },
        familyMembers: { create: [{ name: "Ibu Lama", relationship: "MOTHER" }] },
      },
    })
  ).id;
  candidate = await auth.loginAs("EMPLOYEE", { employeeId: ids.candidate });
  existing = await auth.loginAs("EMPLOYEE", { employeeId: ids.existing });
  sa = await auth.loginAs("SUPER_ADMIN");
});

afterAll(async () => {
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: [ids.candidate, ids.existing] } } });
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("kunci akses (design §12)", () => {
  test("calon: hanya endpoint wizard; existing (lengkapi data) tidak dikunci", async () => {
    expect(await code(await call("GET", "/org-structure", candidate.headers))).toBe("FORBIDDEN");
    expect((await call("GET", "/onboarding/me", candidate.headers)).status).toBe(200);
    expect((await call("GET", "/master-data", candidate.headers)).status).toBe(200);
    expect((await call("GET", "/notifications", candidate.headers)).status).toBe(200);
    expect((await call("GET", "/org-structure", existing.headers)).status).toBe(200);
    const me = await data(await call("GET", "/me", candidate.headers));
    expect(me.onboarding).toMatchObject({ status: "FILLING", locked: true, submitted: false });
    const meExisting = await data(await call("GET", "/me", existing.headers));
    expect(meExisting.onboarding).toMatchObject({ locked: false, completionRequired: true });
  });

  test("akun tanpa data karyawan → 404 di /onboarding/me", async () => {
    expect((await call("GET", "/onboarding/me", sa.headers)).status).toBe(404);
  });
});

describe("calon: draf, dokumen, kirim", () => {
  test("simpan draf: format divalidasi (400), tersimpan, kekurangan berkurang", async () => {
    const before = await data(await call("GET", "/onboarding/me", candidate.headers));
    expect(before).toMatchObject({ mode: "candidate", editable: true });
    expect(
      await code(
        await call("PUT", "/onboarding/me/personal", candidate.headers, { ktpNumber: "123" }),
      ),
    ).toBe("VALIDATION_ERROR");
    const after = await data(
      await call("PUT", "/onboarding/me/personal", candidate.headers, PERSONAL),
    );
    expect(after.personal).toMatchObject({ ktpNumber: "6271010101000001", npwpAbsent: true });
    expect(after.missing.length).toBeLessThan(before.missing.length);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: ids.candidate, action: "employee.onboarding.self_update" },
    });
    expect(JSON.stringify(audit.after)).not.toContain("6271010101000001");
  });

  test("kirim saat belum lengkap → 422 berisi daftar kekurangan", async () => {
    const res = await call("POST", "/onboarding/me/submit", candidate.headers);
    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(JSON.stringify(body.error.details)).toContain("BANK_BOOK");
  });

  test("dokumen: path lain ditolak; tipe salah dihapus; KTP baru menggantikan KTP lama", async () => {
    expect(
      await code(
        await call("POST", "/onboarding/me/documents", candidate.headers, {
          type: "KTP",
          path: `${PREFIX}employees/${ids.existing}/documents/x.pdf`,
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    const bad = await data(
      await call("POST", "/onboarding/me/documents/upload-url", candidate.headers, {
        type: "KK",
        contentType: "application/pdf",
      }),
    );
    storage.putObject(EMPLOYEE_DOCUMENT_BUCKET, bad.path, { size: 10, contentType: "text/html" });
    expect(
      await code(
        await call("POST", "/onboarding/me/documents", candidate.headers, {
          type: "KK",
          path: bad.path,
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(storage.has(EMPLOYEE_DOCUMENT_BUCKET, bad.path)).toBe(false);

    expect((await uploadDoc(candidate, "KTP")).status).toBe(201);
    expect((await uploadDoc(candidate, "KTP", "image/jpeg")).status).toBe(201);
    const active = await prisma.employeeDocument.count({
      where: { employeeId: ids.candidate, type: "KTP", deletedAt: null },
    });
    expect(active).toBe(1);
  });

  test("lengkap → kirim → Menunggu review; setelah itu draf terkunci", async () => {
    await call("PUT", "/onboarding/me/emergency", candidate.headers, {
      name: "Budi",
      relationship: "Ayah",
      phone: "081298765432",
    });
    await call("PUT", "/onboarding/me/bank", candidate.headers, {
      bankName: "BRI",
      accountNumber: "1234567890",
      accountHolder: PERSONAL.fullName,
    });
    await call("PUT", "/onboarding/me/professional", candidate.headers, {
      educations: [{ level: "S1", schoolName: "Universitas Contoh" }],
      trainings: [],
      workExperiences: [{ companyName: "PT Lama", position: "Staf", startYear: 2022 }],
    });
    for (const type of ["KK", "DIPLOMA", "BANK_BOOK"]) {
      expect((await uploadDoc(candidate, type)).status).toBe(201);
    }
    await prisma.employee.update({
      where: { id: ids.candidate },
      data: { photoPath: `${PREFIX}employees/${ids.candidate}/foto.webp` },
    });
    const me = await data(await call("GET", "/onboarding/me", candidate.headers));
    expect(me.missing).toEqual([]);
    const submitted = await data(await call("POST", "/onboarding/me/submit", candidate.headers));
    expect(submitted).toMatchObject({ status: "SUBMITTED", editable: false });
    expect(
      await prisma.onboardingEvent.count({
        where: { employeeId: ids.candidate, toStatus: "SUBMITTED" },
      }),
    ).toBe(1);
    expect(
      await code(await call("PUT", "/onboarding/me/emergency", candidate.headers, { name: "X" })),
    ).toBe("BUSINESS_RULE_VIOLATION");
    const meAuth = await data(await call("GET", "/me", candidate.headers));
    expect(meAuth.onboarding).toMatchObject({ submitted: true, locked: true });
  });
});

describe("karyawan existing: hanya mengisi field kosong", () => {
  test("field terisi tidak bisa diubah; field kosong boleh; keluarga terisi terkunci", async () => {
    expect(
      await code(
        await call("PUT", "/onboarding/me/personal", existing.headers, {
          ktpNumber: "6271010101000011",
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    const ok = await data(
      await call("PUT", "/onboarding/me/personal", existing.headers, {
        kkNumber: "6271010101000012",
      }),
    );
    expect(ok.personal).toMatchObject({
      ktpNumber: "6271010101000099",
      kkNumber: "6271010101000012",
    });
    expect(ok.mode).toBe("completion");
    expect(
      await code(
        await call("PUT", "/onboarding/me/family", existing.headers, {
          members: [{ name: "Ayah Baru", relationship: "FATHER" }],
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
  });

  test("kirim (lengkapi data) mencatat waktu kirim; status tetap Disetujui & tetap tampil", async () => {
    await prisma.employeePersonal.update({
      where: { employeeId: ids.existing },
      data: {
        birthPlace: "Palangka Raya",
        birthDate: new Date("1990-01-01T00:00:00.000Z"),
        religion: "ISLAM",
        maritalStatus: "SINGLE",
        ktpAddress: "Jl. A",
        domicileAddress: "Jl. B",
        originCity: "Sampit",
        npwpAbsent: true,
        bpjsEmploymentAbsent: true,
        bpjsHealthAbsent: true,
      },
    });
    await prisma.employee.update({
      where: { id: ids.existing },
      data: {
        gender: "MALE",
        phoneNumber: "081200000000",
        emergencyContactName: "X",
        emergencyContactRelationship: "Istri",
        emergencyPhone: "081211111111",
        photoPath: `${PREFIX}employees/${ids.existing}/foto.webp`,
        bankAccount: {
          create: { bankName: "BCA", accountNumber: "123456789", accountHolder: "Lama Wizard" },
        },
        educations: { create: [{ level: "SMA", schoolName: "SMA Contoh" }] },
      },
    });
    for (const type of ["KTP", "KK", "DIPLOMA", "BANK_BOOK"]) await uploadDoc(existing, type);
    const res = await data(await call("POST", "/onboarding/me/submit", existing.headers));
    expect(res).toMatchObject({ status: "APPROVED", editable: false });
    expect(res.submittedAt).not.toBeNull();
    expect((await call("GET", `/employees/${ids.existing}`, sa.headers)).status).toBe(200);
  });
});
