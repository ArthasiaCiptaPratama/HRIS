import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// Modul employee & organization (D-035): daftar/ringkasan/detail/tulis + matriks akses PLAN §4.3.
const RUN = crypto.randomUUID().slice(0, 8);
const NUM = (n: string) => `T-${RUN}-${n}`;
const auth = createAuthFixture(RUN);
const fake = createFakeAuthAdmin();
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: fake.admin,
  appUrl: "http://localhost:5173",
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
  department: "",
  position: "",
  position2: "",
  status: "",
  status2: "",
  categoryStatus: "",
  createdStatuses: [] as string[],
  managerEmp: "",
  teamEmp: "",
  otherEmp: "",
  hrEmp: "",
  location: "",
  // D-039/D-040: ACP (dari migrasi) + PT uji kedua.
  acp: "",
  otherCompany: "",
  otherCompanyEmp: "",
};
let sa: Login;
let hr: Login;
let hrGranted: Login;
let mgr: Login;
let emp: Login;
let teamAccount: Login;
let hrOther: Login;
let hrNone: Login;

async function makeEmployee(
  n: string,
  extra: {
    managerId?: string;
    statusId?: string;
    workLocationId?: string;
    companyId?: string;
  } = {},
) {
  const row = await prisma.employee.create({
    data: {
      companyId: extra.companyId ?? ids.acp,
      employeeNumber: NUM(n),
      fullName: `Uji ${RUN} ${n}`,
      joinDate: new Date("2024-01-02T00:00:00.000Z"),
      employmentStatusId: extra.statusId ?? ids.status,
      positionId: ids.position,
      managerId: extra.managerId ?? null,
      workLocationId: extra.workLocationId ?? null,
    },
  });
  await prisma.employeePersonal.create({
    data: {
      employeeId: row.id,
      ktpNumber: `9${RUN.replace(/\D/g, "0").padEnd(8, "0")}${n.padStart(7, "0")}`.slice(0, 16),
    },
  });
  await prisma.employeeBankAccount.create({
    data: { employeeId: row.id, bankName: "Bank Uji", accountNumber: `999${n}` },
  });
  return row.id;
}

// Kategori unik: pakai milik seed bila ada (DB developer), buat sendiri bila DB kosong (CI).
async function categoryStatus(category: "OUTSOURCING" | "VENDOR") {
  const existing = await prisma.employmentStatus.findUnique({ where: { category } });
  if (existing) return existing.id;
  const created = await prisma.employmentStatus.create({
    data: { name: `${category} ${RUN}`, category },
  });
  ids.createdStatuses.push(created.id);
  return created.id;
}

beforeAll(async () => {
  const department = await prisma.department.create({ data: { name: `Dept ${RUN}` } });
  ids.department = department.id;
  ids.position = (
    await prisma.position.create({ data: { name: `Jab ${RUN}`, departmentId: department.id } })
  ).id;
  ids.position2 = (
    await prisma.position.create({ data: { name: `Jab2 ${RUN}`, departmentId: department.id } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `St ${RUN}` } })).id;
  ids.status2 = (await prisma.employmentStatus.create({ data: { name: `St2 ${RUN}` } })).id;
  ids.categoryStatus = await categoryStatus("OUTSOURCING");

  ids.location = (await prisma.workLocation.create({ data: { name: `Lok ${RUN}` } })).id;

  ids.acp = await acpCompanyId();
  ids.otherCompany = await createTestCompany(`T${RUN.slice(0, 6)}`, `PT Uji ${RUN}`);
  ids.managerEmp = await makeEmployee("M1");
  ids.teamEmp = await makeEmployee("T1", { managerId: ids.managerEmp });
  ids.otherEmp = await makeEmployee("O1", { statusId: ids.categoryStatus });
  ids.hrEmp = await makeEmployee("H1", { workLocationId: ids.location });
  ids.otherCompanyEmp = await makeEmployee("C1", { companyId: ids.otherCompany });

  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { employeeId: ids.hrEmp });
  hrGranted = await auth.loginAs("HR_ADMIN", {
    grants: [{ permission: "EMPLOYEE_PERSONAL_READ" }, { permission: "EMPLOYEE_BANK_READ" }],
  });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.managerEmp });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.otherEmp });
  teamAccount = await auth.loginAs("EMPLOYEE", { employeeId: ids.teamEmp });
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.otherCompany] });
  hrNone = await auth.loginAs("HR_ADMIN", { companies: [] });
});

afterAll(async () => {
  // D-063: karyawan tanpa NIP dikenali lewat nama berpenanda RUN.
  const employees = await prisma.employee.findMany({
    where: {
      OR: [
        { employeeNumber: { startsWith: `T-${RUN}-` } },
        { fullName: { startsWith: `Uji ${RUN} TanpaNIP` } },
      ],
    },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: employeeIds } } });
  await auth.cleanup();
  // Bawahan dulu (FK manager_id RESTRICT), lalu atasan.
  await prisma.employee.updateMany({
    where: { id: { in: employeeIds } },
    data: { managerId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.company.delete({ where: { id: ids.otherCompany } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.deleteMany({
    where: {
      id: {
        in: [ids.status, ids.status2, ...ids.createdStatuses],
      },
    },
  });
  await disconnectPrisma();
});

describe("GET /employees (daftar)", () => {
  test("SA 200 berpaginasi + nama jabatan/departemen dirakit; tanpa field sensitif", async () => {
    const res = await call("GET", `/employees?q=${RUN}&pageSize=10`, sa.headers);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const { data, meta } = await body(res);
    // SA melihat semua PT: 4 karyawan ACP + 1 karyawan PT uji (D-040).
    expect(meta.total).toBe(5);
    const row = data.find((r: { id: string }) => r.id === ids.teamEmp);
    expect(row.position.name).toBe(`Jab ${RUN}`);
    expect(row.department.name).toBe(`Dept ${RUN}`);
    expect(row.manager.id).toBe(ids.managerEmp);
    expect(row).not.toHaveProperty("personal");
    expect(row).not.toHaveProperty("ktpNumber");
  });

  test("filter kategori & departemen; urutan & paginasi", async () => {
    const byCategory = await body(
      await call("GET", `/employees?q=${RUN}&category=OUTSOURCING`, hr.headers),
    );
    expect(byCategory.data.map((r: { id: string }) => r.id)).toEqual([ids.otherEmp]);
    const byDept = await body(
      await call("GET", `/employees?departmentId=${ids.department}&pageSize=2&page=2`, hr.headers),
    );
    expect(byDept.meta).toEqual({ page: 2, pageSize: 2, total: 4 });
    expect(byDept.data).toHaveLength(2);
  });

  test("D-038 filter grup: EXTERNAL = Outsourcing + Vendor; INTERNAL tanpa keduanya; MANAGER tetap tim", async () => {
    const vendorEmp = await makeEmployee("V1", { statusId: await categoryStatus("VENDOR") });
    const external = await body(
      await call("GET", `/employees?q=${RUN}&group=EXTERNAL`, hr.headers),
    );
    expect(external.data.map((r: { id: string }) => r.id)).toEqual([ids.otherEmp, vendorEmp]);
    expect(external.meta.total).toBe(2);
    const internal = await body(
      await call("GET", `/employees?q=${RUN}&group=INTERNAL`, hr.headers),
    );
    expect(internal.data).toEqual([]);
    const vendorOnly = await body(
      await call("GET", `/employees?q=${RUN}&category=VENDOR`, sa.headers),
    );
    expect(vendorOnly.data.map((r: { id: string }) => r.id)).toEqual([vendorEmp]);
    const team = await body(await call("GET", `/employees?q=${RUN}&group=EXTERNAL`, mgr.headers));
    expect(team.data).toEqual([]);
    expect(await code(await call("GET", "/employees?group=PUSAT", sa.headers))).toBe(
      "VALIDATION_ERROR",
    );
    await prisma.employee.delete({ where: { id: vendorEmp } });
  });

  test("MANAGER hanya tim; EMPLOYEE 403; tanpa token 401; query tidak valid 400", async () => {
    const team = await body(await call("GET", `/employees?q=${RUN}`, mgr.headers));
    expect(team.data.map((r: { id: string }) => r.id)).toEqual([ids.teamEmp]);
    expect(await code(await call("GET", "/employees", emp.headers))).toBe("FORBIDDEN");
    expect((await call("GET", "/employees", {})).status).toBe(401);
    expect(await code(await call("GET", "/employees?category=RAJA", sa.headers))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(await call("GET", "/employees?pageSize=101", sa.headers))).toBe(
      "VALIDATION_ERROR",
    );
  });

  test("GET /employees/summary: MANAGER hanya menghitung tim", async () => {
    const res = await call("GET", "/employees/summary", mgr.headers);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data.active.total).toBe(1);
    expect(data.inactive).toBe(0);
    expect((await call("GET", "/employees/summary", emp.headers)).status).toBe(403);
  });
});

describe("GET /employees/:id (detail & data sensitif)", () => {
  test("HR tanpa grant: key personal/bankAccount/familyMembers TIDAK ada; tanpa audit baca", async () => {
    const { data } = await body(await call("GET", `/employees/${ids.teamEmp}`, hr.headers));
    expect(data.access).toMatchObject({
      manage: true,
      personal: false,
      bank: false,
      print: true,
    });
    expect(data).not.toHaveProperty("personal");
    expect(data).not.toHaveProperty("bankAccount");
    expect(data).not.toHaveProperty("familyMembers");
    expect(data.histories).toEqual([]);
  });

  test("HR dengan grant: data sensitif ada + audit employee.sensitive.read tertulis", async () => {
    const { data } = await body(await call("GET", `/employees/${ids.teamEmp}`, hrGranted.headers));
    expect(data.personal.ktpNumber).toHaveLength(16);
    expect(data.bankAccount.bankName).toBe("Bank Uji");
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "employee.sensitive.read",
        entityId: ids.teamEmp,
        actorAccountId: hrGranted.account.id,
      },
    });
    expect(audit?.after).toEqual({ sections: ["personal", "bank"] });
  });

  test("view=work: tanpa key sensitif & tanpa audit baca walau berhak (need-to-know)", async () => {
    const before = await prisma.auditLog.count({
      where: { action: "employee.sensitive.read", actorAccountId: sa.account.id },
    });
    const { data } = await body(
      await call("GET", `/employees/${ids.otherEmp}?view=work`, sa.headers),
    );
    expect(data.access.personal).toBe(true);
    expect(data).not.toHaveProperty("personal");
    expect(data).not.toHaveProperty("bankAccount");
    expect(
      await prisma.auditLog.count({
        where: { action: "employee.sensitive.read", actorAccountId: sa.account.id },
      }),
    ).toBe(before);
    expect(await code(await call("GET", `/employees/${ids.otherEmp}?view=semua`, sa.headers))).toBe(
      "VALIDATION_ERROR",
    );
  });

  test("MANAGER: tim 200 (tanpa grant → tanpa sensitif), di luar tim 404", async () => {
    const res = await call("GET", `/employees/${ids.teamEmp}`, mgr.headers);
    expect(res.status).toBe(200);
    expect((await body(res)).data).not.toHaveProperty("personal");
    expect(await code(await call("GET", `/employees/${ids.otherEmp}`, mgr.headers))).toBe(
      "NOT_FOUND",
    );
  });

  test("EMPLOYEE melihat data sendiri (termasuk sensitif, tanpa audit); orang lain 404", async () => {
    const { data } = await body(await call("GET", `/employees/${ids.otherEmp}`, emp.headers));
    expect(data.personal).not.toBeNull();
    expect(data.access.manage).toBe(false);
    expect(
      await prisma.auditLog.count({
        where: { action: "employee.sensitive.read", actorAccountId: emp.account.id },
      }),
    ).toBe(0);
    expect((await call("GET", `/employees/${ids.teamEmp}`, emp.headers)).status).toBe(404);
    expect((await call("GET", `/employees/${crypto.randomUUID()}`, sa.headers)).status).toBe(404);
    expect(await code(await call("GET", "/employees/bukan-uuid", sa.headers))).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("POST /employees & PATCH /employees/:id", () => {
  const payload = () => ({
    employeeNumber: NUM("N1"),
    fullName: `Uji ${RUN} Baru`,
    workEmail: `Baru-${RUN}@Example.Test`,
    joinDate: "2026-09-01",
    companyId: ids.acp,
    employmentStatusId: ids.status,
    positionId: ids.position,
  });

  test("HR membuat karyawan → 201, riwayat HIRED & audit; email disimpan huruf kecil", async () => {
    const res = await call("POST", "/employees", hr.headers, payload());
    expect(res.status).toBe(201);
    const { data } = await body(res);
    expect(data.workEmail).toBe(`baru-${RUN}@example.test`);
    const history = await prisma.employmentHistory.findMany({ where: { employeeId: data.id } });
    expect(history.map((h) => h.changeType)).toEqual(["HIRED"]);
    expect(
      await prisma.auditLog.count({
        where: { action: "employee.employee.create", entityId: data.id },
      }),
    ).toBe(1);
    // Audit log menampilkan label karyawan yang terbaca (audit UI 2026-09-30).
    const logs = await body(
      await call(
        "GET",
        `/audit-logs?entityId=${data.id}&action=employee.employee.create`,
        sa.headers,
      ),
    );
    expect(logs.data[0].entityLabel).toBe(`Uji ${RUN} Baru (${NUM("N1")})`);
  });

  test("nomor induk duplikat 409; atasan bukan akun MANAGER 422; MANAGER 403; body salah 400", async () => {
    expect(await code(await call("POST", "/employees", sa.headers, payload()))).toBe("CONFLICT");
    const notManager = { ...payload(), employeeNumber: NUM("N2"), workEmail: null };
    expect(
      await code(
        await call("POST", "/employees", sa.headers, { ...notManager, managerId: ids.hrEmp }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(await code(await call("POST", "/employees", mgr.headers, notManager))).toBe("FORBIDDEN");
    expect(
      await code(
        await call("POST", "/employees", sa.headers, { ...notManager, joinDate: "01-09-2026" }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  test("atasan ber-akun MANAGER diterima; ganti jabatan → riwayat POSITION_CHANGED", async () => {
    const created = await body(
      await call("POST", "/employees", sa.headers, {
        ...payload(),
        employeeNumber: NUM("N3"),
        workEmail: null,
        managerId: ids.managerEmp,
      }),
    );
    expect(created.data.manager.id).toBe(ids.managerEmp);
    const res = await call("PATCH", `/employees/${created.data.id}`, hr.headers, {
      positionId: ids.position2,
      phoneNumber: "0812 0000 1111",
    });
    expect(res.status).toBe(200);
    expect((await body(res)).data.position.id).toBe(ids.position2);
    const changes = await prisma.employmentHistory.findMany({
      where: { employeeId: created.data.id },
      orderBy: { createdAt: "asc" },
    });
    expect(changes.map((h) => h.changeType)).toEqual(["HIRED", "POSITION_CHANGED"]);
    expect(await code(await call("PATCH", `/employees/${created.data.id}`, hr.headers, {}))).toBe(
      "VALIDATION_ERROR",
    );
  });

  test("atasan melingkar ditolak 422", async () => {
    // managerEmp dibuat bawahan teamEmp → teamEmp (bawahan managerEmp) jadi atasannya: melingkar.
    // teamEmp tidak ber-akun MANAGER, jadi ditolak lebih dulu oleh aturan akun; cukup pastikan 422.
    expect(
      await code(
        await call("PATCH", `/employees/${ids.managerEmp}`, sa.headers, {
          managerId: ids.teamEmp,
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(
      await code(
        await call("PATCH", `/employees/${ids.managerEmp}`, sa.headers, {
          managerId: ids.managerEmp,
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
  });
});

describe("D-063 NIP boleh kosong", () => {
  test("buat tanpa NIP → 201 (NIP null); filter 'NIP belum ada'; isi NIP lalu tidak bisa dikosongkan", async () => {
    const res = await call("POST", "/employees", hr.headers, {
      employeeNumber: "",
      fullName: `Uji ${RUN} TanpaNIP`,
      joinDate: "2026-09-01",
      companyId: ids.acp,
      employmentStatusId: ids.status,
      positionId: ids.position,
    });
    expect(res.status).toBe(201);
    const created = (await body(res)).data;
    expect(created.employeeNumber).toBeNull();

    const missing = await body(
      await call(
        "GET",
        `/employees?missingNumber=true&q=${encodeURIComponent(`Uji ${RUN}`)}`,
        hr.headers,
      ),
    );
    expect(missing.data.map((e: { id: string }) => e.id)).toEqual([created.id]);

    const filled = await call("PATCH", `/employees/${created.id}`, hr.headers, {
      employeeNumber: NUM("NIP1"),
    });
    expect(filled.status).toBe(200);
    expect((await body(filled)).data.employeeNumber).toBe(NUM("NIP1"));
    expect(
      await code(
        await call("PATCH", `/employees/${created.id}`, hr.headers, { employeeNumber: "" }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
  });
});

describe("Ubah status, nonaktifkan, aktifkan kembali", () => {
  test("ubah status → riwayat STATUS_CHANGED; status sama 409; sebelum tanggal masuk 422", async () => {
    const res = await call("POST", `/employees/${ids.teamEmp}/status-change`, hr.headers, {
      employmentStatusId: ids.status2,
      effectiveDate: "2026-09-29",
      note: "Diangkat",
    });
    expect(res.status).toBe(200);
    expect((await body(res)).data.employmentStatus.id).toBe(ids.status2);
    expect(
      await code(
        await call("POST", `/employees/${ids.teamEmp}/status-change`, hr.headers, {
          employmentStatusId: ids.status2,
          effectiveDate: "2026-09-29",
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      await code(
        await call("POST", `/employees/${ids.teamEmp}/status-change`, hr.headers, {
          employmentStatusId: ids.status,
          effectiveDate: "2020-01-01",
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(
      (
        await call("POST", `/employees/${ids.teamEmp}/status-change`, mgr.headers, {
          employmentStatusId: ids.status,
          effectiveDate: "2026-09-29",
        })
      ).status,
    ).toBe(403);
  });

  test("HR tidak bisa menonaktifkan data karyawannya sendiri (403)", async () => {
    const res = await call("POST", `/employees/${ids.hrEmp}/deactivate`, hr.headers, {
      effectiveDate: "2026-09-29",
      exitReason: "RESIGNATION",
    });
    expect(res.status).toBe(403);
  });

  test("nonaktifkan → akun tertaut ikut nonaktif + di-ban; masuk daftar tidak aktif", async () => {
    const res = await call("POST", `/employees/${ids.teamEmp}/deactivate`, hr.headers, {
      effectiveDate: "2026-09-30",
      exitReason: "RESIGNATION",
      note: "Pindah kota",
    });
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data).toMatchObject({
      isActive: false,
      exitReason: "RESIGNATION",
      endDate: "2026-09-30",
    });
    const account = await prisma.account.findUnique({ where: { id: teamAccount.account.id } });
    expect(account?.isActive).toBe(false);
    expect(fake.banned.get(teamAccount.account.authUserId)).toBe(true);
    // Akun nonaktif tidak bisa memakai API lagi (PLAN §4.5).
    expect((await call("GET", `/employees/${ids.teamEmp}`, teamAccount.headers)).status).toBe(401);

    const inactive = await body(await call("GET", `/employees?active=false&q=${RUN}`, sa.headers));
    expect(inactive.data.map((r: { id: string }) => r.id)).toEqual([ids.teamEmp]);
    expect(
      await code(
        await call("POST", `/employees/${ids.teamEmp}/deactivate`, hr.headers, {
          effectiveDate: "2026-09-30",
          exitReason: "RESIGNATION",
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      await code(await call("PATCH", `/employees/${ids.teamEmp}`, hr.headers, { fullName: "X Y" })),
    ).toBe("BUSINESS_RULE_VIOLATION");
  });

  test("aktifkan kembali → aktif, alasan keluar kosong; akun login tetap nonaktif", async () => {
    const res = await call("POST", `/employees/${ids.teamEmp}/reactivate`, hr.headers, {
      effectiveDate: "2026-10-01",
      employmentStatusId: ids.status,
    });
    expect(res.status).toBe(200);
    expect((await body(res)).data).toMatchObject({
      isActive: true,
      exitReason: null,
      endDate: null,
    });
    const account = await prisma.account.findUnique({ where: { id: teamAccount.account.id } });
    expect(account?.isActive).toBe(false);
    const changes = await prisma.employmentHistory.findMany({
      where: { employeeId: ids.teamEmp },
      orderBy: { createdAt: "asc" },
    });
    expect(changes.map((h) => h.changeType)).toEqual([
      "STATUS_CHANGED",
      "DEACTIVATED",
      "REACTIVATED",
    ]);
  });
});

describe("Struktur organisasi, master data, pilihan atasan", () => {
  test("GET /org-structure: semua role 200, karyawan tersusun per jabatan", async () => {
    const res = await call("GET", "/org-structure", emp.headers);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    const dept = data.departments.find((d: { id: string }) => d.id === ids.department);
    const position = dept.positions.find((p: { id: string }) => p.id === ids.position);
    expect(position.employees.map((e: { id: string }) => e.id)).toContain(ids.managerEmp);
    expect((await call("GET", "/org-structure", {})).status).toBe(401);
  });

  test("GET /master-data: semua role 200", async () => {
    const { data } = await body(await call("GET", "/master-data", mgr.headers));
    expect(data.departments.some((d: { id: string }) => d.id === ids.department)).toBe(true);
    expect(data.employmentStatuses.some((s: { id: string }) => s.id === ids.status)).toBe(true);
  });

  test("GET /employees/manager-options: hanya karyawan ber-akun MANAGER/SA aktif; MANAGER 403", async () => {
    const { data } = await body(await call("GET", "/employees/manager-options", hr.headers));
    const optionIds = data.map((o: { id: string }) => o.id);
    expect(optionIds).toContain(ids.managerEmp);
    expect(optionIds).not.toContain(ids.hrEmp);
    expect((await call("GET", "/employees/manager-options", mgr.headers)).status).toBe(403);
  });
});

describe("Riwayat: pelaku perubahan (diubah oleh)", () => {
  test("nama pegawai + role + lokasi kerja pengubah; SA tanpa data pegawai → email; data awal → null", async () => {
    const created = await call("POST", "/employees", hr.headers, {
      employeeNumber: NUM("R1"),
      fullName: `Uji ${RUN} Riwayat`,
      joinDate: "2026-09-01",
      companyId: ids.acp,
      employmentStatusId: ids.status,
      positionId: ids.position,
    });
    expect(created.status).toBe(201);
    const id = (await body(created)).data.id as string;
    const changed = await call("POST", `/employees/${id}/status-change`, sa.headers, {
      employmentStatusId: ids.status2,
      effectiveDate: "2026-09-15",
    });
    expect(changed.status).toBe(200);
    // Riwayat hasil seed/impor tidak punya pelaku.
    await prisma.employmentHistory.create({
      data: {
        employeeId: id,
        changeType: "POSITION_CHANGED",
        effectiveDate: new Date("2026-09-02T00:00:00.000Z"),
        toPositionId: ids.position,
      },
    });

    const { data } = await body(await call("GET", `/employees/${id}?view=work`, sa.headers));
    const byType = Object.fromEntries(
      data.histories.map((h: { changeType: string; changedBy: unknown }) => [
        h.changeType,
        h.changedBy,
      ]),
    );
    expect(byType.HIRED).toEqual({
      name: `Uji ${RUN} H1`,
      role: "HR_ADMIN",
      workLocation: `Lok ${RUN}`,
    });
    expect(byType.STATUS_CHANGED).toEqual({
      name: sa.account.email,
      role: "SUPER_ADMIN",
      workLocation: null,
    });
    expect(byType.POSITION_CHANGED).toBeNull();
  });
});

describe("GET /employees/:id?view=print (formulir data pegawai .xlsx)", () => {
  const printed = (actorAccountId: string, entityId: string) =>
    prisma.auditLog.findMany({ where: { action: "employee.printed", actorAccountId, entityId } });

  test("HR tanpa grant: 200 tanpa data sensitif; audit employee.printed tanpa bagian sensitif", async () => {
    const res = await call("GET", `/employees/${ids.otherEmp}?view=print`, hr.headers);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data.access.print).toBe(true);
    expect(data).not.toHaveProperty("personal");
    expect(data).not.toHaveProperty("familyMembers");
    expect(data).not.toHaveProperty("bankAccount");
    const audits = await printed(hr.account.id, ids.otherEmp);
    expect(audits.map((a) => a.after)).toEqual([{ format: "xlsx", sections: [] }]);
  });

  test("HR dengan grant: data pribadi & keluarga ikut, rekening TIDAK dibaca; satu audit printed", async () => {
    await prisma.familyMember.create({
      data: {
        employeeId: ids.otherEmp,
        name: `Keluarga ${RUN}`,
        relationship: "MOTHER",
        address: "Jl. Uji No. 1",
        phoneNumber: "081234",
      },
    });
    const { data } = await body(
      await call("GET", `/employees/${ids.otherEmp}?view=print`, hrGranted.headers),
    );
    expect(data.personal.ktpNumber).toHaveLength(16);
    expect(data.familyMembers).toEqual([
      expect.objectContaining({ name: `Keluarga ${RUN}`, address: "Jl. Uji No. 1" }),
    ]);
    expect(data).not.toHaveProperty("bankAccount");
    const audits = await printed(hrGranted.account.id, ids.otherEmp);
    expect(audits.map((a) => a.after)).toEqual([{ format: "xlsx", sections: ["personal"] }]);
    // Tidak dicatat dua kali sebagai baca sensitif biasa.
    expect(
      await prisma.auditLog.count({
        where: {
          action: "employee.sensitive.read",
          actorAccountId: hrGranted.account.id,
          entityId: ids.otherEmp,
        },
      }),
    ).toBe(0);
  });

  test("MANAGER (tim) & EMPLOYEE (sendiri) 403; tanpa token 401; di luar jangkauan 404", async () => {
    const mgrRes = await call("GET", `/employees/${ids.teamEmp}?view=print`, mgr.headers);
    expect(await code(mgrRes)).toBe("FORBIDDEN");
    const empRes = await call("GET", `/employees/${ids.otherEmp}?view=print`, emp.headers);
    expect(await code(empRes)).toBe("FORBIDDEN");
    const own = await body(await call("GET", `/employees/${ids.otherEmp}?view=work`, emp.headers));
    expect(own.data.access.print).toBe(false);
    expect((await call("GET", `/employees/${ids.otherEmp}?view=print`, {})).status).toBe(401);
    expect(
      await code(await call("GET", `/employees/${ids.otherEmp}?view=print`, mgr.headers)),
    ).toBe("NOT_FOUND");
    expect(
      await prisma.auditLog.count({
        where: {
          action: "employee.printed",
          actorAccountId: { in: [mgr.account.id, emp.account.id] },
        },
      }),
    ).toBe(0);
  });
});

// D-039/D-040: cakupan perusahaan. HR hanya PT yang ditugaskan; di luar cakupan = 404 (PROMPT §5).
describe("D-040 cakupan perusahaan", () => {
  const listIds = async (headers: Record<string, string>, query = "") =>
    (await body(await call("GET", `/employees?q=${RUN}&pageSize=50${query}`, headers))).data.map(
      (r: { id: string }) => r.id,
    );

  test("daftar: HR ACP tanpa karyawan PT lain; HR PT lain hanya PT-nya; HR tanpa penugasan kosong; SA semua", async () => {
    expect(await listIds(hr.headers)).not.toContain(ids.otherCompanyEmp);
    expect(await listIds(hrOther.headers)).toEqual([ids.otherCompanyEmp]);
    expect(await listIds(hrNone.headers)).toEqual([]);
    expect(await listIds(sa.headers)).toContain(ids.otherCompanyEmp);
    expect(await listIds(sa.headers, `&companyId=${ids.otherCompany}`)).toEqual([
      ids.otherCompanyEmp,
    ]);
    // Filter PT lain oleh HR tetap dibatasi cakupannya.
    expect(await listIds(hr.headers, `&companyId=${ids.otherCompany}`)).toEqual([]);
    const row = (await body(await call("GET", `/employees?q=${RUN}-C1`, sa.headers))).data[0];
    expect(row.company).toEqual({
      id: ids.otherCompany,
      code: `T${RUN.slice(0, 6)}`,
      name: `PT Uji ${RUN}`,
    });
  });

  test("detail & aksi tulis untuk karyawan PT lain → 404 bagi HR ACP", async () => {
    const id = ids.otherCompanyEmp;
    expect((await call("GET", `/employees/${id}`, hr.headers)).status).toBe(404);
    expect((await call("PATCH", `/employees/${id}`, hr.headers, { fullName: "X Y" })).status).toBe(
      404,
    );
    expect(
      (
        await call("POST", `/employees/${id}/status-change`, hr.headers, {
          employmentStatusId: ids.status2,
          effectiveDate: "2026-09-01",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("POST", `/employees/${id}/deactivate`, hr.headers, {
          effectiveDate: "2026-09-01",
          exitReason: "RESIGNATION",
        })
      ).status,
    ).toBe(404);
    expect((await call("GET", `/employees/${id}?view=print`, hr.headers)).status).toBe(404);
    // HR yang ditugaskan ke PT itu boleh.
    expect((await call("GET", `/employees/${id}`, hrOther.headers)).status).toBe(200);
  });

  test("ringkasan per cakupan; SA bisa memfilter ?companyId=", async () => {
    const summary = async (headers: Record<string, string>, query = "") =>
      (await body(await call("GET", `/employees/summary${query}`, headers))).data;
    expect((await summary(hrOther.headers)).active.total).toBe(1);
    expect((await summary(hrNone.headers)).active.total).toBe(0);
    expect((await summary(sa.headers, `?companyId=${ids.otherCompany}`)).active.total).toBe(1);
  });

  test("tambah karyawan hanya di PT dalam cakupan (HR ACP → PT lain 403; HR PT lain 201)", async () => {
    const base = {
      fullName: `Uji ${RUN} Lintas`,
      joinDate: "2026-09-01",
      employmentStatusId: ids.status,
      positionId: ids.position,
    };
    expect(
      await code(
        await call("POST", "/employees", hr.headers, {
          ...base,
          employeeNumber: NUM("X1"),
          companyId: ids.otherCompany,
        }),
      ),
    ).toBe("FORBIDDEN");
    const res = await call("POST", "/employees", hrOther.headers, {
      ...base,
      employeeNumber: NUM("X2"),
      companyId: ids.otherCompany,
    });
    expect(res.status).toBe(201);
    const history = await prisma.employmentHistory.findFirst({
      where: { employeeId: (await body(res)).data.id, changeType: "HIRED" },
    });
    expect(history?.toCompanyId).toBe(ids.otherCompany);
    // companyId wajib.
    expect(
      await code(
        await call("POST", "/employees", sa.headers, { ...base, employeeNumber: NUM("X3") }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  test("pindah PT: SA → riwayat COMPANY_CHANGED + audit; HR ACP tidak bisa memindahkan ke PT lain", async () => {
    const created = await body(
      await call("POST", "/employees", sa.headers, {
        employeeNumber: NUM("X4"),
        fullName: `Uji ${RUN} Pindah`,
        joinDate: "2026-09-01",
        companyId: ids.acp,
        employmentStatusId: ids.status,
        positionId: ids.position,
      }),
    );
    const id = created.data.id;
    expect(
      await code(
        await call("PATCH", `/employees/${id}`, hr.headers, { companyId: ids.otherCompany }),
      ),
    ).toBe("FORBIDDEN");
    const moved = await call("PATCH", `/employees/${id}`, sa.headers, {
      companyId: ids.otherCompany,
    });
    expect(moved.status).toBe(200);
    expect((await body(moved)).data.company.id).toBe(ids.otherCompany);
    const history = await prisma.employmentHistory.findFirst({
      where: { employeeId: id, changeType: "COMPANY_CHANGED" },
    });
    expect(history).toMatchObject({ fromCompanyId: ids.acp, toCompanyId: ids.otherCompany });
    const audit = await prisma.auditLog.findFirst({
      where: { action: "employee.employee.update", entityId: id },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.before).toMatchObject({ companyId: ids.acp });
    // Setelah pindah, HR ACP tidak lagi melihatnya.
    expect((await call("GET", `/employees/${id}`, hr.headers)).status).toBe(404);
  });

  test("master data: HR hanya PT penugasan; SA semua", async () => {
    const companies = async (headers: Record<string, string>) =>
      (await body(await call("GET", "/master-data", headers))).data.companies.map(
        (c: { id: string }) => c.id,
      );
    expect(await companies(hr.headers)).toEqual([ids.acp]);
    expect(await companies(hrOther.headers)).toEqual([ids.otherCompany]);
    expect(await companies(sa.headers)).toEqual(
      expect.arrayContaining([ids.acp, ids.otherCompany]),
    );
  });

  test("direktori (struktur): EMPLOYEE & HR hanya PT sendiri", async () => {
    const structureIds = async (headers: Record<string, string>) =>
      (await body(await call("GET", "/org-structure", headers))).data.departments
        .flatMap((d: { positions: { employees: { id: string }[] }[] }) => d.positions)
        .flatMap((p: { employees: { id: string }[] }) => p.employees)
        .map((e: { id: string }) => e.id);
    expect(await structureIds(emp.headers)).not.toContain(ids.otherCompanyEmp);
    expect(await structureIds(emp.headers)).toContain(ids.teamEmp);
    const other = await structureIds(hrOther.headers);
    expect(other).toContain(ids.otherCompanyEmp);
    expect(other).not.toContain(ids.teamEmp);
    expect(await structureIds(sa.headers)).toContain(ids.otherCompanyEmp);
  });
});
