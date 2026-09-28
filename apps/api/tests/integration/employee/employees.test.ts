import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";

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
  createdCategoryStatus: false,
  managerEmp: "",
  teamEmp: "",
  otherEmp: "",
  hrEmp: "",
};
let sa: Login;
let hr: Login;
let hrGranted: Login;
let mgr: Login;
let emp: Login;
let teamAccount: Login;

async function makeEmployee(n: string, extra: { managerId?: string; statusId?: string } = {}) {
  const row = await prisma.employee.create({
    data: {
      employeeNumber: NUM(n),
      fullName: `Uji ${RUN} ${n}`,
      joinDate: new Date("2024-01-02T00:00:00.000Z"),
      employmentStatusId: extra.statusId ?? ids.status,
      positionId: ids.position,
      managerId: extra.managerId ?? null,
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
  // Kategori unik: pakai milik seed bila ada (DB developer), buat sendiri bila DB kosong (CI).
  const existing = await prisma.employmentStatus.findUnique({ where: { category: "OUTSOURCING" } });
  if (existing) ids.categoryStatus = existing.id;
  else {
    ids.categoryStatus = (
      await prisma.employmentStatus.create({
        data: { name: `Outs ${RUN}`, category: "OUTSOURCING" },
      })
    ).id;
    ids.createdCategoryStatus = true;
  }

  ids.managerEmp = await makeEmployee("M1");
  ids.teamEmp = await makeEmployee("T1", { managerId: ids.managerEmp });
  ids.otherEmp = await makeEmployee("O1", { statusId: ids.categoryStatus });
  ids.hrEmp = await makeEmployee("H1");

  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { employeeId: ids.hrEmp });
  hrGranted = await auth.loginAs("HR_ADMIN", {
    grants: [{ permission: "EMPLOYEE_PERSONAL_READ" }, { permission: "EMPLOYEE_BANK_READ" }],
  });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.managerEmp });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.otherEmp });
  teamAccount = await auth.loginAs("EMPLOYEE", { employeeId: ids.teamEmp });
});

afterAll(async () => {
  const employees = await prisma.employee.findMany({
    where: { employeeNumber: { startsWith: `T-${RUN}-` } },
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
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.deleteMany({
    where: {
      id: {
        in: [ids.status, ids.status2, ...(ids.createdCategoryStatus ? [ids.categoryStatus] : [])],
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
    expect(meta.total).toBe(4);
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
    expect(data.access).toMatchObject({ manage: true, personal: false, bank: false });
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
