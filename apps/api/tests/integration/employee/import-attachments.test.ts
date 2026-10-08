import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { ErrorBody } from "@hris/shared";
import { Jimp } from "jimp";
import { PDFDocument } from "pdf-lib";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import type { GoogleDriveReader } from "../../../src/core/google-drive.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// D-060: lampiran Google Drive di Import — antrean saat simpan, proses bertahap lewat service account
// (Drive palsu), hak tulis dokumen sensitif, sidik jari (sama → lewati, beda → versi baru), coba ulang.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const NUM = (n: string) => `IMPA-${RUN}-${n}`;
const auth = createAuthFixture(`a${RUN.toLowerCase()}`);
const prisma = getPrisma();

const driveFiles = new Map<string, { bytes: Uint8Array; mimeType: string }>();
const drive: GoogleDriveReader = {
  configured: true,
  async getMeta(id) {
    const file = driveFiles.get(id);
    if (!file) return null;
    return {
      id,
      name: `${id}.bin`,
      mimeType: file.mimeType,
      size: file.bytes.byteLength,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
    };
  },
  async download(id) {
    const file = driveFiles.get(id);
    if (!file) throw new Error("not found");
    return file.bytes;
  },
};
const fake = createFakeStorage();
const base = {
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: fake.storage,
};
const app = createApp({ ...base, googleDrive: drive });
const appNoDrive = createApp(base);

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
let acp = "";
let positionId = "";
const employees: Record<string, string> = {};

/** ID Drive palsu (≥ 20 karakter seperti aslinya). */
const fileId = (name: string) => `drv${RUN}${name}`.padEnd(28, "x");
const link = (name: string) => `https://drive.google.com/open?id=${fileId(name)}`;
const jpeg = async (color: number) =>
  new Uint8Array(await new Jimp({ width: 64, height: 48, color }).getBuffer("image/jpeg"));
const put = async (name: string, color: number) =>
  driveFiles.set(fileId(name), { bytes: await jpeg(color), mimeType: "image/jpeg" });

const importBody = (rows: Record<string, unknown>[]) => ({
  fileName: "form.xlsx",
  fileSha256: "b".repeat(64),
  mode: "UPSERT",
  companyId: acp,
  rows: rows.map((raw, i) => ({ sourceRow: i + 2, raw })),
});

async function importAs(login: Login, rows: Record<string, unknown>[]) {
  const preview = await data(
    await call("POST", "/employee-imports/preview", login.headers, importBody(rows)),
  );
  const res = await call("POST", "/employee-imports", login.headers, {
    ...importBody(rows),
    previewHash: preview.previewHash,
  });
  expect(res.status).toBe(201);
  return { preview, saved: await data(res) };
}

async function processAll(login: Login, jobId: string) {
  let result = await data(
    await call("POST", `/employee-imports/${jobId}/attachments/process`, login.headers),
  );
  for (let i = 0; i < 5 && result.counts.pending > 0; i++) {
    result = await data(
      await call("POST", `/employee-imports/${jobId}/attachments/process`, login.headers),
    );
  }
  return result;
}

const docsOf = (employeeId: string) =>
  prisma.employeeDocument.findMany({
    where: { employeeId, deletedAt: null },
    include: { documentType: { select: { code: true } } },
    orderBy: { createdAt: "asc" },
  });

beforeAll(async () => {
  acp = await acpCompanyId();
  const status = await prisma.employmentStatus.findFirstOrThrow({ select: { id: true } });
  const department = await prisma.department.create({ data: { name: `Dept Lamp ${RUN}` } });
  positionId = (
    await prisma.position.create({ data: { name: `Jab Lamp ${RUN}`, departmentId: department.id } })
  ).id;
  for (const n of ["A", "B", "C"]) {
    employees[n] = (
      await prisma.employee.create({
        data: {
          companyId: acp,
          employeeNumber: NUM(n),
          fullName: `Lampiran ${RUN} ${n}`,
          joinDate: new Date("2024-01-02T00:00:00.000Z"),
          employmentStatusId: status.id,
          positionId,
        },
      })
    ).id;
  }
  await put("photo", 0x3366ccff);
  await put("ktp1", 0xcc3333ff);
  await put("ktp2", 0x33cc33ff);
  await put("iso", 0x999999ff);
  await put("pop", 0x666666ff);
  await put("diploma", 0x123456ff);
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  driveFiles.set(fileId("bank"), { bytes: await pdf.save(), mimeType: "application/pdf" });
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN"); // ACP, tanpa grant dokumen sensitif
  hrOther = await auth.loginAs("HR_ADMIN");
});

afterAll(async () => {
  const accountIds = [sa, hr, hrOther].map((l) => l.account.id);
  const jobs = await prisma.importJob.findMany({
    where: { actorAccountId: { in: accountIds } },
    select: { id: true },
  });
  const ids = Object.values(employees);
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...ids, ...jobs.map((j) => j.id)] } },
  });
  await prisma.importJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  await prisma.position.deleteMany({ where: { id: positionId } });
  await prisma.department.deleteMany({ where: { name: `Dept Lamp ${RUN}` } });
  await auth.cleanup();
  await disconnectPrisma();
});

describe("Lampiran Google Drive di Import (D-060)", () => {
  let jobA = "";

  test("pratinjau menghitung lampiran; simpan mencatat antrean tanpa tautan di respons", async () => {
    const { preview, saved } = await importAs(sa, [
      {
        employeeNumber: NUM("A"),
        attachPhoto: link("photo"),
        attachKtp: `${link("ktp1")}, ${link("ktp2")}`,
        attachBankBook: link("bank"),
        attachCertIso45001: link("iso"),
        certIso45001Number: "ISO-001",
        attachCertPop: link("pop"),
        attachDiploma: link("missing"),
      },
    ]);
    expect(preview.counts.attachments).toBe(6);
    expect(preview.rows[0].attachments).toBe(6);
    expect(saved.counts.attachments).toBe(6);
    jobA = saved.jobId;
    const res = await call("GET", `/employee-imports/${jobA}/attachments`, sa.headers);
    expect(res.status).toBe(200);
    const list = await data(res);
    expect(list.driveConfigured).toBe(true);
    expect(list.counts).toEqual({ total: 6, pending: 6, done: 0, skipped: 0, failed: 0 });
    expect(list.items.find((i: { field: string }) => i.field === "attachKtp").fileCount).toBe(2);
    expect(JSON.stringify(list)).not.toContain(fileId("ktp1"));
    // Sertifikasi yang hanya ada filenya tetap tercatat di Pelatihan.
    const training = await prisma.training.findFirst({
      where: { employeeId: employees.A, trainingField: "ISO 45001" },
    });
    expect(training?.certificateNumber).toBe("ISO-001");
  });

  test("Drive belum dikonfigurasi → 422, antrean tetap", async () => {
    const res = await call(
      "POST",
      `/employee-imports/${jobA}/attachments/process`,
      sa.headers,
      undefined,
      appNoDrive,
    );
    expect(res.status).toBe(422);
    const list = await data(
      await call("GET", `/employee-imports/${jobA}/attachments`, sa.headers, undefined, appNoDrive),
    );
    expect(list.driveConfigured).toBe(false);
    expect(list.counts.pending).toBe(6);
  });

  test("SA: foto, KTP (2 gambar → PDF), buku rekening, sertifikat lain masuk; POP dilewati; file hilang gagal", async () => {
    const result = await processAll(sa, jobA);
    const status = Object.fromEntries(
      result.items.map((i: { field: string; status: string }) => [i.field, i.status]),
    );
    expect(status).toEqual({
      attachPhoto: "DONE",
      attachKtp: "DONE",
      attachDiploma: "FAILED",
      attachBankBook: "DONE",
      attachCertPop: "SKIPPED",
      attachCertIso45001: "DONE",
    });
    const reason = (field: string) =>
      result.items.find((i: { field: string }) => i.field === field).reason;
    expect(reason("attachCertPop")).toContain("wajib tanggal kedaluwarsa");
    expect(reason("attachDiploma")).toContain("dibagikan ke service account");

    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employees.A } });
    expect(employee.photoPath).toContain(`employees/${employees.A}/`);
    const docs = await docsOf(employees.A as string);
    const byCode = Object.fromEntries(docs.map((d) => [d.documentType?.code, d]));
    expect(byCode.KTP?.mimeType).toBe("application/pdf");
    expect(byCode.BANK_BOOK?.mimeType).toBe("application/pdf");
    expect(byCode.CERT_OTHER?.documentNumber).toBe("ISO-001");
    expect(byCode.CERT_OTHER?.note).toBe("ISO 45001");
    expect(byCode.CERT_OTHER?.trainingId).not.toBeNull();
    expect(fake.uploaded.some((u) => u.contentType === "image/jpeg")).toBe(true);
  });

  test("impor ulang: file sama dilewati; file berbeda jadi versi baru", async () => {
    await put("ktp3", 0x00ffffff);
    const { saved } = await importAs(sa, [
      {
        employeeNumber: NUM("A"),
        attachPhoto: link("photo"),
        attachKtp: link("ktp3"),
        attachBankBook: link("bank"),
      },
    ]);
    const result = await processAll(sa, saved.jobId);
    const status = Object.fromEntries(
      result.items.map((i: { field: string; status: string }) => [i.field, i.status]),
    );
    expect(status).toEqual({
      attachPhoto: "SKIPPED",
      attachKtp: "DONE",
      attachBankBook: "SKIPPED",
    });
    const ktp = (await docsOf(employees.A as string)).filter((d) => d.documentType?.code === "KTP");
    expect(ktp.map((d) => [d.version, d.isCurrent])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  test("HR tanpa grant dokumen: KTP dilewati (tidak berhak), ijazah masuk; daftar terbuka; HR lain 404", async () => {
    const { saved } = await importAs(hr, [
      { employeeNumber: NUM("B"), attachKtp: link("ktp1"), attachDiploma: link("diploma") },
    ]);
    const open = await data(await call("GET", "/employee-imports/attachments/open", hr.headers));
    expect(open.map((j: { jobId: string }) => j.jobId)).toContain(saved.jobId);
    expect(
      (await call("GET", `/employee-imports/${saved.jobId}/attachments`, hrOther.headers)).status,
    ).toBe(404);
    expect(
      await code(
        await call("POST", `/employee-imports/${saved.jobId}/attachments/process`, hrOther.headers),
      ),
    ).toBe("NOT_FOUND");

    const result = await processAll(hr, saved.jobId);
    const ktp = result.items.find((i: { field: string }) => i.field === "attachKtp");
    expect(ktp.status).toBe("SKIPPED");
    expect(ktp.reason).toContain("Tidak berhak");
    expect(result.items.find((i: { field: string }) => i.field === "attachDiploma").status).toBe(
      "DONE",
    );
    const after = await data(await call("GET", "/employee-imports/attachments/open", hr.headers));
    expect(after.map((j: { jobId: string }) => j.jobId)).not.toContain(saved.jobId);
  });

  test("coba ulang: lampiran gagal kembali ke antrean lalu masuk setelah file tersedia", async () => {
    await put("missing", 0x55555555);
    const retried = await data(
      await call("POST", `/employee-imports/${jobA}/attachments/retry`, sa.headers),
    );
    expect(retried.counts.failed).toBe(0);
    expect(retried.counts.pending).toBe(1);
    const result = await processAll(sa, jobA);
    expect(result.items.find((i: { field: string }) => i.field === "attachDiploma").status).toBe(
      "DONE",
    );
  });

  test("bukan tautan Drive = peringatan, tidak masuk antrean", async () => {
    const { preview } = await importAs(sa, [
      { employeeNumber: NUM("C"), attachKk: "ada di map biru" },
    ]);
    expect(preview.counts.attachments).toBe(0);
    expect(preview.rows[0].issues).toContainEqual({
      field: "attachKk",
      code: "INVALID_DRIVE_LINK",
      severity: "WARNING",
    });
  });
});
