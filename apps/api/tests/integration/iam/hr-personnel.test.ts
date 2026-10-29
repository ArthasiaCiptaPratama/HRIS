import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// IAM-D1: HR Kepegawaian (HR_PERSONNEL) — hanya melihat data kerja karyawan di PT yang ditugaskan.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
});
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(path.startsWith("/api/") ? path : `/api/v1${path}`, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data;

const ids = { status: "", department: "", position: "", employee: "", docType: "" };
let companyId = "";
let h: Record<"personnel" | "sa", Record<string, string>>;
let personnelAccountId = "";

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `HP ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `HP ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `HP ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.employee = (
    await prisma.employee.create({
      data: {
        employeeNumber: `HP-${RUN}`,
        fullName: `Kepegawaian ${RUN}`,
        joinDate: new Date("2024-01-01T00:00:00Z"),
        companyId,
        employmentStatusId: ids.status,
        positionId: ids.position,
        emergencyPhone: "081200000000",
        emergencyContactName: `Darurat ${RUN}`,
        educations: { create: { level: "S1", schoolName: `Kampus ${RUN}` } },
      },
    })
  ).id;
  // Dokumen non-sensitif (mis. sertifikat): sebelumnya terlihat oleh siapa pun yang boleh melihat karyawan.
  ids.docType = (
    await prisma.documentType.create({
      data: { code: `HP_${RUN}`, name: `Sertifikat ${RUN}`, category: "OTHER" },
    })
  ).id;
  await prisma.employeeDocument.create({
    data: {
      employeeId: ids.employee,
      type: "DIPLOMA",
      documentTypeId: ids.docType,
      storagePath: `test/${RUN}/sertifikat.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1000,
      uploadedBy: crypto.randomUUID(),
    },
  });
  const personnel = await auth.loginAs("HR_PERSONNEL", { companies: [companyId] });
  personnelAccountId = personnel.account.id;
  h = { personnel: personnel.headers, sa: (await auth.loginAs("SUPER_ADMIN")).headers };
});

afterAll(async () => {
  await auth.cleanup();
  if (ids.employee) {
    await prisma.employeeDocument.deleteMany({ where: { employeeId: ids.employee } });
    await prisma.employee.deleteMany({ where: { id: ids.employee } });
  }
  if (ids.docType) await prisma.documentType.delete({ where: { id: ids.docType } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("HR Kepegawaian: data kerja saja", () => {
  test("daftar karyawan PT yang ditugaskan terlihat", async () => {
    const res = await call("GET", `/employees?q=${RUN}`, h.personnel);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((e) => e.id)).toContain(ids.employee);
  });

  test("detail: data kerja ada; kontak darurat, pendidikan, data pribadi & aksi tidak", async () => {
    const res = await call("GET", `/employees/${ids.employee}`, h.personnel);
    expect(res.status).toBe(200);
    const d = await data<Record<string, unknown> & { access: Record<string, boolean> }>(res);
    expect(d.fullName).toBe(`Kepegawaian ${RUN}`);
    expect(d.position).toMatchObject({ id: ids.position });
    expect(d.emergencyPhone).toBeNull();
    expect(d.emergencyContactName).toBeNull();
    expect(d.educations).toEqual([]);
    expect(d.personal ?? null).toBeNull();
    expect(d.access).toMatchObject({ manage: false, personal: false, bank: false, print: false });
  });

  test("tidak bisa mengubah, menambah, mengekspor, membuka arsip/dokumen", async () => {
    const patch = await call("PATCH", `/employees/${ids.employee}`, h.personnel, {
      phoneNumber: "0812 0000 1111",
    });
    expect(patch.status).toBe(403);
    expect((await call("GET", "/archive/educations", h.personnel)).status).toBe(403);
    const saDocs = await data<{ documents: unknown[] }>(
      await call("GET", `/employees/${ids.employee}/documents`, h.sa),
    );
    expect(saDocs.documents.length).toBeGreaterThan(0);
    const docs = await call("GET", `/employees/${ids.employee}/documents`, h.personnel);
    expect(
      docs.status === 200 ? (await data<{ documents: unknown[] }>(docs)).documents : [],
    ).toEqual([]);
  });

  test("izin sensitif tidak bisa di-grant; ganti role HR_ADMIN → HR Kepegawaian mempertahankan PT", async () => {
    const grant = await call("POST", "/grants", h.sa, {
      accountId: personnelAccountId,
      permission: "employee.personal.read",
    });
    expect(grant.status).toBe(422);
    const hr = await auth.loginAs("HR_ADMIN", { companies: [companyId] });
    const changed = await call("PATCH", `/accounts/${hr.account.id}/role`, h.sa, {
      role: "HR_PERSONNEL",
    });
    expect(changed.status).toBe(200);
    const companies = await prisma.accountCompany.findMany({ where: { accountId: hr.account.id } });
    expect(companies.map((c) => c.companyId)).toEqual([companyId]);
  });
});

// Semua endpoint di spec OpenAPI: selain allowlist, HR Kepegawaian tidak boleh mendapat 2xx.
// Ditinjau 2026-10-23 (IAM-D1): selain kepegawaian, hanya data akun sendiri & referensi nama tanpa data karyawan.
const ALLOWED = new Set<string>([
  // Kepegawaian (data kerja, lihat saja)
  "GET /api/v1/employees",
  "GET /api/v1/employees/summary",
  "GET /api/v1/org-structure",
  "GET /api/v1/org-chart",
  // Akun sendiri & layanan diri (kosong bila akun tidak tertaut karyawan)
  "GET /api/v1/health",
  "GET /api/v1/me",
  "GET /api/v1/notifications",
  "POST /api/v1/notifications/read-all",
  "GET /api/v1/self/assets",
  "GET /api/v1/self/warning-letters",
  // Referensi/pengaturan yang dibaca semua akun (nama & konfigurasi, tanpa data karyawan)
  "GET /api/v1/master-data",
  "GET /api/v1/document-types",
  "GET /api/v1/asset-categories",
  "GET /api/v1/ppe-types",
  "GET /api/v1/time-settings",
  "GET /api/v1/holidays/official-years",
  "GET /api/v1/leave-types",
]);
// Kotak masuk keputusan: role ini bukan pemutus → wajib kosong.
const EMPTY_INBOXES = [
  "/roster-changes",
  "/roster-edits",
  "/attendance/corrections",
  "/leave-requests",
];

describe("HR Kepegawaian: modul lain tertutup (sweep OpenAPI)", () => {
  test("tidak ada endpoint di luar allowlist yang membalas 2xx", async () => {
    const spec = (await (await call("GET", "/api/v1/openapi.json", {})).json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const leaks: string[] = [];
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const method of Object.keys(ops)) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        const key = `${method.toUpperCase()} ${path}`;
        if (ALLOWED.has(key) || EMPTY_INBOXES.some((p) => key === `GET /api/v1${p}`)) continue;
        if (key === "GET /api/v1/time/queue") continue;
        const url = path.replace(/\{[^}]+\}/g, (m) =>
          m === "{id}" || m.endsWith("Id}") ? crypto.randomUUID() : "x",
        );
        const res = await call(
          method.toUpperCase(),
          url,
          h.personnel,
          method === "get" ? undefined : {},
        );
        if (res.status >= 200 && res.status < 300) leaks.push(`${key} → ${res.status}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  test("kotak masuk keputusan kosong; ringkasan antrean nol", async () => {
    for (const path of EMPTY_INBOXES) {
      const res = await call("GET", path, h.personnel);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(await data<unknown[]>(res)).toEqual([]);
    }
    const queue = await call("GET", "/time/queue", h.personnel);
    const counts = JSON.stringify(await data<unknown>(queue));
    expect(counts).not.toMatch(/:[1-9]/);
  });
});
