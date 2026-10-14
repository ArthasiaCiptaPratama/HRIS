import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { runAssetDaily } from "../../../src/modules/asset/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// ARS-D1–D6 (Arsip gelombang 2a): aset per unit, serah-terima, BAST, APD, karyawan keluar, cron.
const RUN = crypto.randomUUID().slice(0, 4).toUpperCase();
const auth = createAuthFixture(`as${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
  storagePathPrefix: "",
});

type Headers = Record<string, string>;
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const call = (method: string, path: string, headers: Headers, payload?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: {
      ...headers,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => (await res.json()) as { data: any; meta?: any };
const MANAGE = { permission: "ASSET_MANAGE" as const };

const ids = {
  acp: "",
  acpCode: "",
  other: "",
  status: "",
  department: "",
  position: "",
  mgr: "",
  emp: "",
  emp2: "",
  mgr2: "",
  otherPt: "",
  category: "",
  serialCategory: "",
  helmet: "",
  shoes: "",
};
const startedAt = new Date();
let sa: Login;
let hr: Login;
let hrPlain: Login;
let hrOther: Login;
let mgr: Login;
let mgrOther: Login;
let emp: Login;
let emp2: Login;

async function employee(n: string, extra: Record<string, unknown> = {}) {
  const row = await prisma.employee.create({
    data: {
      companyId: ids.acp,
      employeeNumber: `AS-${RUN}-${n}`,
      fullName: `Aset ${RUN} ${n}`,
      joinDate: new Date("2024-01-02T00:00:00.000Z"),
      employmentStatusId: ids.status,
      positionId: ids.position,
      ...extra,
    },
  });
  return row.id;
}
async function bastDoc(employeeId: string, typeCode = "BAST_ASSET") {
  const type = await prisma.documentType.findUniqueOrThrow({ where: { code: typeCode } });
  const doc = await prisma.employeeDocument.create({
    data: {
      employeeId,
      type: "OTHER",
      documentTypeId: type.id,
      storagePath: `test/${RUN}/${crypto.randomUUID()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1000,
      uploadedBy: sa.account.id,
    },
  });
  return doc.id;
}
const asset = (extra: Record<string, unknown> = {}) => ({
  categoryId: ids.category,
  companyId: ids.acp,
  name: `Laptop ${RUN}`,
  brand: "Lenovo",
  condition: "GOOD",
  purchasePrice: "12500000.00",
  purchaseDate: "2026-01-05",
  ...extra,
});

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.acpCode = (await prisma.company.findUniqueOrThrow({ where: { id: ids.acp } })).code;
  ids.other = await createTestCompany(`A${RUN}`, `PT Aset ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `AS St ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `AS Dept ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `AS Jab ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.mgr = await employee("M");
  ids.emp = await employee("E", { managerId: ids.mgr });
  ids.emp2 = await employee("F");
  ids.otherPt = await employee("P", { companyId: ids.other });
  ids.mgr2 = await employee("N");
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { companies: [ids.acp], grants: [MANAGE] });
  hrPlain = await auth.loginAs("HR_ADMIN", { companies: [ids.acp] });
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.other], grants: [MANAGE] });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.mgr });
  mgrOther = await auth.loginAs("MANAGER", { employeeId: ids.mgr2 });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.emp });
  emp2 = await auth.loginAs("EMPLOYEE", { employeeId: ids.emp2 });
});

afterAll(async () => {
  // Tahan beforeAll yang gagal di tengah: pembersihan tetap berjalan untuk yang sudah dibuat.
  const employees = [ids.mgr, ids.emp, ids.emp2, ids.otherPt, ids.mgr2].filter(Boolean);
  const accounts = [sa, hr, hrPlain, hrOther, mgr, mgrOther, emp, emp2]
    .filter((a): a is Login => a !== undefined)
    .map((a) => a.account.id);
  await prisma.assetAssignment.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.asset.deleteMany({
    where: { categoryId: { in: [ids.category, ids.serialCategory].filter(Boolean) } },
  });
  await prisma.ppeIssue.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.assetCategory.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.ppeType.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.employeeDocument.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.notification.deleteMany({ where: { recipientAccountId: { in: accounts } } });
  await auth.cleanup();
  await prisma.auditLog.deleteMany({
    where: {
      occurredAt: { gte: startedAt },
      entityType: { in: ["asset", "asset_assignment", "asset_category", "ppe_type", "ppe_issue"] },
    },
  });
  await prisma.employee.updateMany({ where: { id: { in: employees } }, data: { managerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  if (ids.position) await prisma.position.delete({ where: { id: ids.position } });
  if (ids.department) await prisma.department.delete({ where: { id: ids.department } });
  if (ids.status) await prisma.employmentStatus.delete({ where: { id: ids.status } });
  if (ids.other) await prisma.company.delete({ where: { id: ids.other } });
  await disconnectPrisma();
});

describe("master kategori aset & jenis APD", () => {
  test("SA / HR ber-grant boleh; HR tanpa grant & MANAGER 403; validasi 400; duplikat 409; tanpa token 401", async () => {
    const cat = { code: `L${RUN}`, name: `Laptop ${RUN}`, requiresSerial: false };
    expect((await call("POST", "/asset-categories", hrPlain.headers, cat)).status).toBe(403);
    expect((await call("POST", "/asset-categories", mgr.headers, cat)).status).toBe(403);
    expect((await call("POST", "/asset-categories", {}, cat)).status).toBe(401);
    const bad = await call("POST", "/asset-categories", sa.headers, { code: "a b", name: "x" });
    expect(bad.status).toBe(400);
    expect(await code(bad)).toBe("VALIDATION_ERROR");
    const created = await call("POST", "/asset-categories", sa.headers, cat);
    expect(created.status).toBe(201);
    ids.category = (await data(created)).data.id;
    expect(
      (await call("POST", "/asset-categories", hr.headers, { ...cat, name: `Lain ${RUN}` })).status,
    ).toBe(409);
    const serial = await call("POST", "/asset-categories", hr.headers, {
      code: `H${RUN}`,
      name: `Radio HT ${RUN}`,
      requiresSerial: true,
    });
    expect(serial.status).toBe(201);
    ids.serialCategory = (await data(serial)).data.id;

    const helmet = await call("POST", "/ppe-types", hr.headers, {
      code: `M${RUN}`,
      name: `Helm ${RUN}`,
      mustReturn: true,
    });
    const shoes = await call("POST", "/ppe-types", sa.headers, {
      code: `S${RUN}`,
      name: `Sepatu ${RUN}`,
      replaceAfterMonths: 12,
    });
    expect([helmet.status, shoes.status]).toEqual([201, 201]);
    ids.helmet = (await data(helmet)).data.id;
    ids.shoes = (await data(shoes)).data.id;
    expect((await call("GET", "/asset-categories", emp.headers)).status).toBe(403);
    expect(
      (await data(await call("GET", "/ppe-types", mgr.headers))).data.some(
        (t: { id: string }) => t.id === ids.shoes,
      ),
    ).toBe(true);
  });
});

let assetId = "";
let assignmentId = "";
describe("aset per unit (ARS-D4)", () => {
  test("kode otomatis berurutan per PT + kategori; manual duplikat 409; seri wajib bila kategori meminta", async () => {
    const a1 = await call("POST", "/assets", hr.headers, asset());
    expect(a1.status).toBe(201);
    const first = (await data(a1)).data;
    expect(first.code).toBe(`${ids.acpCode}-L${RUN}-0001`);
    expect(first.purchasePrice).toBe("12500000.00");
    assetId = first.id;
    const next = await data(
      await call(
        "GET",
        `/assets/next-code?companyId=${ids.acp}&categoryId=${ids.category}`,
        hr.headers,
      ),
    );
    expect(next.data.code).toBe(`${ids.acpCode}-L${RUN}-0002`);
    expect((await call("POST", "/assets", hr.headers, asset({ code: first.code }))).status).toBe(
      409,
    );
    const noSerial = await call(
      "POST",
      "/assets",
      hr.headers,
      asset({ categoryId: ids.serialCategory }),
    );
    expect(noSerial.status).toBe(400);
    expect(
      (
        await call(
          "POST",
          "/assets",
          hr.headers,
          asset({ categoryId: ids.serialCategory, serialNumber: `SN-${RUN}` }),
        )
      ).status,
    ).toBe(201);
    expect((await call("POST", "/assets", hr.headers, asset({ purchasePrice: "-5" }))).status).toBe(
      400,
    );
  });

  test("akses kelola: HR PT lain & HR tanpa grant 403; harga hanya untuk pengelola", async () => {
    expect((await call("POST", "/assets", hrOther.headers, asset())).status).toBe(403);
    expect((await call("POST", "/assets", hrPlain.headers, asset())).status).toBe(403);
    const plain = (await data(await call("GET", `/assets/${assetId}`, hrPlain.headers))).data;
    expect(plain.purchasePrice).toBeNull();
    expect(plain.canSeePrice).toBe(false);
    expect((await call("GET", `/assets/${assetId}`, hrOther.headers)).status).toBe(404);
    expect((await call("GET", "/assets", emp.headers)).status).toBe(403);
  });
});

describe("serah-terima, konfirmasi, BAST (ARS-D2, ARS-D3)", () => {
  test("hanya ke karyawan aktif PT pemilik aset; aset terpegang tidak bisa diserahkan lagi", async () => {
    const assign = (to: string, extra: Record<string, unknown> = {}) =>
      call("POST", `/assets/${assetId}/assign`, hr.headers, {
        employeeId: to,
        assignedAt: "2026-10-01",
        conditionOut: "GOOD",
        ...extra,
      });
    expect((await assign(ids.otherPt)).status).toBe(422);
    expect((await assign(ids.emp, { dueBackAt: "2026-09-30" })).status).toBe(400);
    const ok = await assign(ids.emp, { dueBackAt: "2026-10-05" });
    expect(ok.status).toBe(201);
    assignmentId = (await data(ok)).data.id;
    expect((await assign(ids.emp2)).status).toBe(422);
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    expect(row.status).toBe("ASSIGNED");
    // Index unik parsial: satu pemegang aktif per aset, juga bila service dilewati.
    await expect(
      (async () =>
        prisma.assetAssignment.create({
          data: {
            assetId,
            employeeId: ids.emp2,
            assignedAt: new Date("2026-10-02T00:00:00Z"),
            conditionOut: "GOOD",
            assignedBy: sa.account.id,
          },
        }))(),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  test("MANAGER melihat aset tim tanpa harga; MANAGER lain tidak; karyawan melihat milik sendiri", async () => {
    const team = await data(await call("GET", "/assets", mgr.headers));
    expect(team.data.map((a: { id: string }) => a.id)).toContain(assetId);
    expect(team.data.find((a: { id: string }) => a.id === assetId).purchasePrice).toBeNull();
    const other = await data(await call("GET", "/assets", mgrOther.headers));
    expect(other.data.map((a: { id: string }) => a.id)).not.toContain(assetId);
    expect((await call("GET", `/assets/${assetId}`, mgrOther.headers)).status).toBe(404);
    const mine = (await data(await call("GET", "/self/assets", emp.headers))).data;
    expect(mine.assets.map((a: { id: string }) => a.id)).toContain(assignmentId);
    expect((await call("GET", `/asset-holdings/${ids.emp}`, emp2.headers)).status).toBe(404);
    expect((await call("GET", `/asset-holdings/${ids.emp}`, mgr.headers)).status).toBe(200);
  });

  test("konfirmasi terima hanya pemegang; idempoten", async () => {
    expect(
      (await call("POST", `/self/asset-assignments/${assignmentId}/acknowledge`, emp2.headers))
        .status,
    ).toBe(404);
    const ack = await call(
      "POST",
      `/self/asset-assignments/${assignmentId}/acknowledge`,
      emp.headers,
    );
    expect(ack.status).toBe(200);
    const at = (await data(ack)).data.acknowledgedAt;
    expect(at).toBeTruthy();
    const again = (
      await data(
        await call("POST", `/self/asset-assignments/${assignmentId}/acknowledge`, emp.headers),
      )
    ).data;
    expect(again.acknowledgedAt).toBe(at);
  });

  test("PDF BAST + lampiran scan: jenis & pemilik dokumen dicek", async () => {
    const pdf = (
      await data(
        await call("GET", `/asset-assignments/${assignmentId}/bast-pdf?kind=HANDOVER`, hr.headers),
      )
    ).data;
    expect(Buffer.from(pdf.contentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(
      (await call("GET", `/asset-assignments/${assignmentId}/bast-pdf?kind=RETURN`, hr.headers))
        .status,
    ).toBe(422);
    const wrongType = await bastDoc(ids.emp, "KTP");
    const otherOwner = await bastDoc(ids.emp2);
    const right = await bastDoc(ids.emp);
    const attach = (documentId: string) =>
      call("POST", `/asset-assignments/${assignmentId}/bast`, hr.headers, {
        kind: "HANDOVER",
        documentId,
      });
    expect((await attach(wrongType)).status).toBe(422);
    expect((await attach(otherOwner)).status).toBe(422);
    expect(
      (
        await call("POST", `/asset-assignments/${assignmentId}/bast`, hrPlain.headers, {
          kind: "HANDOVER",
          documentId: right,
        })
      ).status,
    ).toBe(403);
    const ok = await attach(right);
    expect(ok.status).toBe(200);
    expect((await data(ok)).data.handoverDocumentId).toBe(right);
  });
});

describe("pengembalian, hilang, status", () => {
  test("kembali rusak → Perbaikan; status manual; tidak bisa ubah status aset terpegang", async () => {
    expect(
      (await call("POST", `/assets/${assetId}/status`, hr.headers, { status: "RETIRED" })).status,
    ).toBe(422);
    const early = await call("POST", `/asset-assignments/${assignmentId}/return`, hr.headers, {
      returnedAt: "2026-09-01",
      conditionIn: "GOOD",
    });
    expect(early.status).toBe(422);
    const back = await call("POST", `/asset-assignments/${assignmentId}/return`, hr.headers, {
      returnedAt: "2026-10-06",
      conditionIn: "DAMAGED",
    });
    expect(back.status).toBe(200);
    expect((await data(back)).data.outcome).toBe("RETURNED");
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).status).toBe(
      "MAINTENANCE",
    );
    expect(
      (
        await call("POST", `/asset-assignments/${assignmentId}/return`, hr.headers, {
          returnedAt: "2026-10-07",
          conditionIn: "GOOD",
        })
      ).status,
    ).toBe(422);
    expect(
      (await call("POST", `/assets/${assetId}/status`, hr.headers, { status: "AVAILABLE" })).status,
    ).toBe(200);
    const pdf = await call(
      "GET",
      `/asset-assignments/${assignmentId}/bast-pdf?kind=RETURN`,
      hr.headers,
    );
    expect(pdf.status).toBe(200);
  });

  test("tandai hilang: keterangan wajib; aset jadi Hilang; riwayat 2 pemegang", async () => {
    const again = await call("POST", `/assets/${assetId}/assign`, hr.headers, {
      employeeId: ids.emp,
      assignedAt: "2026-10-08",
      conditionOut: "FAIR",
    });
    const id = (await data(again)).data.id;
    expect(
      (
        await call("POST", `/asset-assignments/${id}/lost`, hr.headers, {
          lostAt: "2026-10-09",
          note: "x",
        })
      ).status,
    ).toBe(400);
    const lost = await call("POST", `/asset-assignments/${id}/lost`, hr.headers, {
      lostAt: "2026-10-09",
      note: "Tertinggal di lokasi proyek",
    });
    expect(lost.status).toBe(200);
    const detail = (await data(await call("GET", `/assets/${assetId}`, sa.headers))).data;
    expect(detail.status).toBe("LOST");
    expect(detail.history).toHaveLength(2);
    expect(
      await prisma.auditLog.count({ where: { action: "asset.assignment.lost", entityId: id } }),
    ).toBe(1);
  });
});

let helmetIssue = "";
describe("pembagian APD (ARS-D1, ARS-D5)", () => {
  test("catat pembagian; jumlah tidak valid 400; HR tanpa grant 403; karyawan PT lain 403", async () => {
    const issue = (who: Login, extra: Record<string, unknown>) =>
      call("POST", "/ppe-issues", who.headers, {
        employeeId: ids.emp,
        quantity: 1,
        issuedAt: "2026-10-01",
        ...extra,
      });
    expect((await issue(hr, { ppeTypeId: ids.helmet, quantity: 0 })).status).toBe(400);
    expect((await issue(hrPlain, { ppeTypeId: ids.helmet })).status).toBe(403);
    expect(
      (
        await call("POST", "/ppe-issues", hrOther.headers, {
          employeeId: ids.emp,
          ppeTypeId: ids.helmet,
          quantity: 1,
          issuedAt: "2026-10-01",
        })
      ).status,
    ).toBe(403);
    const helmet = await issue(hr, { ppeTypeId: ids.helmet, size: "L" });
    expect(helmet.status).toBe(201);
    helmetIssue = (await data(helmet)).data.id;
    const old = await issue(hr, { ppeTypeId: ids.shoes, size: "42", issuedAt: "2025-01-10" });
    expect((await data(old)).data.replacementState).toBe("DUE");
  });

  test("jatuh tempo ganti: pembagian lebih baru membuat yang lama 'sudah diganti'", async () => {
    const due = await data(
      await call("GET", `/ppe-issues?employeeId=${ids.emp}&replacement=DUE`, hr.headers),
    );
    expect(due.data).toHaveLength(1);
    await call("POST", "/ppe-issues", hr.headers, {
      employeeId: ids.emp,
      ppeTypeId: ids.shoes,
      quantity: 1,
      issuedAt: "2026-10-10",
    });
    const all = (
      await data(
        await call("GET", `/ppe-issues?employeeId=${ids.emp}&ppeTypeId=${ids.shoes}`, hr.headers),
      )
    ).data;
    expect(all.map((r: { replacementState: string }) => r.replacementState).sort()).toEqual([
      "OK",
      "REPLACED",
    ]);
    expect(
      (
        await data(
          await call("GET", `/ppe-issues?employeeId=${ids.emp}&replacement=DUE`, hr.headers),
        )
      ).data,
    ).toHaveLength(0);
  });

  test("kembali hanya untuk jenis wajib kembali; hapus hanya yang belum dikonfirmasi", async () => {
    const shoes = (
      await data(
        await call("GET", `/ppe-issues?employeeId=${ids.emp}&ppeTypeId=${ids.shoes}`, hr.headers),
      )
    ).data[0];
    expect(
      (
        await call("POST", `/ppe-issues/${shoes.id}/return`, hr.headers, {
          returnedAt: "2026-10-11",
        })
      ).status,
    ).toBe(422);
    expect(
      (await call("POST", `/self/ppe-issues/${shoes.id}/acknowledge`, emp.headers)).status,
    ).toBe(200);
    expect((await call("DELETE", `/ppe-issues/${shoes.id}`, hr.headers)).status).toBe(422);
    const temp = await call("POST", "/ppe-issues", hr.headers, {
      employeeId: ids.emp,
      ppeTypeId: ids.helmet,
      quantity: 2,
      issuedAt: "2026-10-12",
    });
    expect(
      (await call("DELETE", `/ppe-issues/${(await data(temp)).data.id}`, hr.headers)).status,
    ).toBe(204);
    const pdf = (await data(await call("GET", `/ppe-issues/${helmetIssue}/bast-pdf`, mgr.headers)))
      .data;
    expect(Buffer.from(pdf.contentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("karyawan keluar & cron asset-daily (ARS-D5, ARS-D6)", () => {
  test("aset & APD wajib kembali milik karyawan nonaktif muncul di daftar belum kembali; cron memberi notifikasi sekali", async () => {
    const other = await call("POST", "/assets", hr.headers, asset({ name: `Tablet ${RUN}` }));
    const otherId = (await data(other)).data.id;
    await call("POST", `/assets/${otherId}/assign`, hr.headers, {
      employeeId: ids.emp,
      assignedAt: "2026-10-01",
      dueBackAt: "2026-10-03",
      conditionOut: "GOOD",
    });
    const open = (
      await data(await call("GET", `/asset-holdings/${ids.emp}?openOnly=true`, hr.headers))
    ).data;
    expect(open.assets).toHaveLength(1);
    expect(open.ppe.map((p: { id: string }) => p.id)).toEqual([helmetIssue]);

    const first = await runAssetDaily(new Date("2026-10-13T03:00:00Z"));
    expect(first.overdue).toBeGreaterThan(0);
    expect(first.replacementDue).toBe(0); // sepatu lama sudah diganti
    await prisma.employee.update({ where: { id: ids.emp }, data: { isActive: false } });
    const pending = (await data(await call("GET", "/asset-returns/pending", hr.headers))).data;
    const row = pending.find(
      (p: { employee: { employeeId: string } }) => p.employee.employeeId === ids.emp,
    );
    expect(row.assets).toHaveLength(1);
    expect(row.ppe).toHaveLength(1);
    expect((await call("GET", "/asset-returns/pending", mgr.headers)).status).toBe(403);
    const exit = await runAssetDaily(new Date("2026-10-13T03:00:00Z"));
    expect(exit.exitPending).toBeGreaterThan(0);
    const repeat = await runAssetDaily(new Date("2026-10-14T03:00:00Z"));
    expect(repeat.exitPending).toBe(0);
    const notes = await prisma.notification.findMany({
      where: { recipientAccountId: hr.account.id, type: "asset.exit_pending" },
    });
    expect(notes.length).toBeGreaterThan(0);
    // PROMPT §3.7: notifikasi tanpa harga.
    expect(notes.some((n) => (n.body ?? "").includes("12500000"))).toBe(false);
    await prisma.employee.update({ where: { id: ids.emp }, data: { isActive: true } });
  });
});

// --- Audit 2026-10-14: temuan F1–F4 (test ditulis gagal dulu) ---

/** Teks PDF pdf-lib: stream Flate di-inflate, ambil string hex `<…> Tj` (font standar). */
function pdfText(base64: string): string {
  const bin = Buffer.from(base64, "base64");
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const s = bin.indexOf("stream", at);
    if (s < 0) break;
    const start = bin[s + 6] === 0x0d ? s + 8 : s + 7;
    const end = bin.indexOf("endstream", start);
    if (end < 0) break;
    try {
      const text = inflateSync(bin.subarray(start, end)).toString("latin1");
      for (const m of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        out.push(Buffer.from(m[1] as string, "hex").toString("latin1"));
      }
    } catch {}
    at = end + 9;
  }
  return out.join("\n");
}

describe("audit aset (F1–F4)", () => {
  let fresh = "";
  let open = "";
  test("F1: Pihak Pertama BAST = pelaku serah-terima, bukan yang mengunduh (MANAGER)", async () => {
    fresh = (
      await data(await call("POST", "/assets", hr.headers, asset({ name: `Kamera ${RUN}` })))
    ).data.id;
    const assigned = await call("POST", `/assets/${fresh}/assign`, hr.headers, {
      employeeId: ids.emp,
      assignedAt: "2026-10-02",
      conditionOut: "GOOD",
    });
    open = (await data(assigned)).data.id;
    const pdf = (
      await data(
        await call("GET", `/asset-assignments/${open}/bast-pdf?kind=HANDOVER`, mgr.headers),
      )
    ).data;
    const text = pdfText(pdf.contentBase64);
    expect(text).toContain(hr.account.email);
    expect(text).not.toContain(`Aset ${RUN} M`); // nama MANAGER pengunduh
  });

  test("F2: kembalikan & tandai hilang bersamaan → hanya satu yang berhasil, data konsisten", async () => {
    const [back, lost] = await Promise.all([
      call("POST", `/asset-assignments/${open}/return`, hr.headers, {
        returnedAt: "2026-10-03",
        conditionIn: "GOOD",
      }),
      call("POST", `/asset-assignments/${open}/lost`, hr.headers, {
        lostAt: "2026-10-03",
        note: "Uji balapan aksi",
      }),
    ]);
    expect([back.status, lost.status].sort()).toEqual([200, 422]);
    const row = await prisma.assetAssignment.findUniqueOrThrow({ where: { id: open } });
    const assetRow = await prisma.asset.findUniqueOrThrow({ where: { id: fresh } });
    expect(assetRow.status).toBe(row.outcome === "LOST" ? "LOST" : "AVAILABLE");
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: open,
          action: { in: ["asset.assignment.return", "asset.assignment.lost"] },
        },
      }),
    ).toBe(1);
  });

  test("F3: tanggal di masa depan ditolak (serah, kembali, APD)", async () => {
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const other = (
      await data(await call("POST", "/assets", hr.headers, asset({ name: `Proyektor ${RUN}` })))
    ).data.id;
    const future = await call("POST", `/assets/${other}/assign`, hr.headers, {
      employeeId: ids.emp,
      assignedAt: tomorrow,
      conditionOut: "GOOD",
    });
    expect(future.status).toBe(422);
    const ok = await call("POST", `/assets/${other}/assign`, hr.headers, {
      employeeId: ids.emp,
      assignedAt: "2026-10-02",
      conditionOut: "GOOD",
    });
    const id = (await data(ok)).data.id;
    expect(
      (
        await call("POST", `/asset-assignments/${id}/return`, hr.headers, {
          returnedAt: tomorrow,
          conditionIn: "GOOD",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("POST", `/asset-assignments/${id}/lost`, hr.headers, {
          lostAt: tomorrow,
          note: "Belum terjadi",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("POST", "/ppe-issues", hr.headers, {
          employeeId: ids.emp,
          ppeTypeId: ids.helmet,
          quantity: 1,
          issuedAt: tomorrow,
        })
      ).status,
    ).toBe(422);
    await call("POST", `/asset-assignments/${id}/return`, hr.headers, {
      returnedAt: "2026-10-03",
      conditionIn: "GOOD",
    });
  });

  test("F4: dua pembagian sejenis bertanggal sama → yang dibuat terakhir tidak dianggap sudah diganti", async () => {
    const base = {
      employeeId: ids.emp2,
      ppeTypeId: ids.shoes,
      quantity: 1,
      issuedAt: new Date("2026-05-01T00:00:00Z"),
      issuedBy: sa.account.id,
    };
    const older = await prisma.ppeIssue.create({
      data: { ...base, createdAt: new Date("2026-05-01T10:00:00.900Z") },
    });
    const newer = await prisma.ppeIssue.create({
      data: { ...base, createdAt: new Date("2026-05-01T10:00:01.100Z") },
    });
    const rows = (
      await data(
        await call("GET", `/ppe-issues?employeeId=${ids.emp2}&ppeTypeId=${ids.shoes}`, hr.headers),
      )
    ).data as { id: string; replacementState: string }[];
    expect(rows.find((r) => r.id === newer.id)?.replacementState).not.toBe("REPLACED");
    expect(rows.find((r) => r.id === older.id)?.replacementState).toBe("REPLACED");
  });
});
