import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";

// D-049: kelola master data — SA kelola, HR lihat; arsip/pulihkan/hapus/gabungkan; aturan perusahaan,
// departemen (siklus), status berkategori; dampak ke karyawan (ubah karyawan berjabatan terarsip) &
// import (nama terarsip → error baris, bukan 500).
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(`md${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
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
const N = (label: string) => `${label} ${RUN}`;

type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login;
let hr: Login;
let mgr: Login;
let emp: Login;
const ids = {
  acp: "",
  status: "",
  employees: [] as string[],
  departments: [] as string[],
  positions: [] as string[],
  grades: [] as string[],
  locations: [] as string[],
  statuses: [] as string[],
  companies: [] as string[],
};

async function create(path: string, body: unknown, bucket: keyof typeof ids) {
  const res = await call("POST", path, sa.headers, body);
  expect(res.status).toBe(201);
  const id = (await data(res)).id as string;
  (ids[bucket] as string[]).push(id);
  return id;
}

async function makeEmployee(n: string, over: Record<string, unknown>) {
  const id = (
    await prisma.employee.create({
      data: {
        companyId: ids.acp,
        employeeNumber: `MD-${RUN}-${n}`,
        fullName: N(`Karyawan ${n}`),
        joinDate: new Date("2024-01-02T00:00:00.000Z"),
        employmentStatusId: ids.status,
        positionId: over.positionId as string,
        ...over,
      },
    })
  ).id;
  ids.employees.push(id);
  return id;
}

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN");
  mgr = await auth.loginAs("MANAGER");
  emp = await auth.loginAs("EMPLOYEE");
  ids.status = (await prisma.employmentStatus.create({ data: { name: N("Status Uji") } })).id;
  ids.statuses.push(ids.status);
});

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.deleteMany({ where: { id: { in: ids.positions } } });
  // Sub-departemen dulu (FK induk RESTRICT).
  await prisma.department.updateMany({
    where: { id: { in: ids.departments } },
    data: { parentId: null },
  });
  await prisma.department.deleteMany({ where: { id: { in: ids.departments } } });
  await prisma.grade.deleteMany({ where: { id: { in: ids.grades } } });
  await prisma.workLocation.deleteMany({ where: { id: { in: ids.locations } } });
  await prisma.employmentStatus.deleteMany({ where: { id: { in: ids.statuses } } });
  await prisma.company.deleteMany({ where: { id: { in: ids.companies } } });
  await auth.cleanup();
  await disconnectPrisma();
});

describe("akses (D-049)", () => {
  test("daftar admin: SA & HR 200; MANAGER/EMPLOYEE 403; tanpa token 401", async () => {
    expect((await call("GET", "/grades", sa.headers)).status).toBe(200);
    expect((await call("GET", "/grades", hr.headers)).status).toBe(200);
    expect(await code(await call("GET", "/grades", mgr.headers))).toBe("FORBIDDEN");
    expect(await code(await call("GET", "/grades", emp.headers))).toBe("FORBIDDEN");
    expect((await call("GET", "/grades", {})).status).toBe(401);
  });

  test("tulis: hanya SA; HR/MANAGER/EMPLOYEE 403", async () => {
    for (const who of [hr, mgr, emp]) {
      expect(await code(await call("POST", "/grades", who.headers, { name: N("X") }))).toBe(
        "FORBIDDEN",
      );
    }
  });

  test("HR hanya melihat perusahaan yang ditugaskan (D-040)", async () => {
    const other = await create("/companies", { code: `Z${RUN}`, name: N("PT Lain") }, "companies");
    const codes = (await data(await call("GET", "/companies", hr.headers))).map(
      (c: { id: string }) => c.id,
    );
    expect(codes).toContain(ids.acp);
    expect(codes).not.toContain(other);
  });
});

describe("validasi & konflik", () => {
  test("nama kosong 400; geofence tidak lengkap 400; kode PT tidak valid 400", async () => {
    expect(await code(await call("POST", "/grades", sa.headers, { name: " " }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(
      await code(
        await call("POST", "/work-locations", sa.headers, { name: N("Lok"), latitude: -2.2 }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      await code(await call("POST", "/companies", sa.headers, { code: "A.B", name: N("PT") })),
    ).toBe("VALIDATION_ERROR");
  });

  test("nama ganda 409 (termasuk yang diarsipkan)", async () => {
    await create("/grades", { name: N("Grade Ganda") }, "grades");
    expect(await code(await call("POST", "/grades", sa.headers, { name: N("Grade Ganda") }))).toBe(
      "CONFLICT",
    );
  });

  test("lokasi dengan geofence lengkap tersimpan sebagai angka", async () => {
    const id = await create(
      "/work-locations",
      { name: N("Site"), city: "Kapuas", latitude: -2.123456, longitude: 113.9, radiusM: 150 },
      "locations",
    );
    const list = await data(await call("GET", `/work-locations?q=${RUN}`, sa.headers));
    expect(list.find((l: { id: string }) => l.id === id)).toMatchObject({
      latitude: -2.123456,
      longitude: 113.9,
      radiusM: 150,
    });
    // PATCH sebagian yang membuat geofence tidak lengkap ditolak.
    expect(
      await code(await call("PATCH", `/work-locations/${id}`, sa.headers, { radiusM: null })),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("arsip, pulihkan, hapus", () => {
  test("arsip → hilang dari /master-data, ada di view=archived; ubah ditolak; pulihkan kembali", async () => {
    const id = await create("/grades", { name: N("Grade Arsip") }, "grades");
    expect((await call("POST", `/grades/${id}/archive`, sa.headers)).status).toBe(200);
    const master = await data(await call("GET", "/master-data", emp.headers));
    expect(master.grades.map((g: { id: string }) => g.id)).not.toContain(id);
    const archived = await data(await call("GET", "/grades?view=archived", sa.headers));
    expect(archived.find((g: { id: string }) => g.id === id)).toMatchObject({ archived: true });
    expect(await code(await call("POST", `/grades/${id}/archive`, sa.headers))).toBe("CONFLICT");
    expect(
      await code(await call("PATCH", `/grades/${id}`, sa.headers, { name: N("Grade Ubah") })),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect((await call("POST", `/grades/${id}/restore`, sa.headers)).status).toBe(200);
    const after = await data(await call("GET", "/master-data", emp.headers));
    expect(after.grades.map((g: { id: string }) => g.id)).toContain(id);
    const log = await prisma.auditLog.findFirst({
      where: { entityId: id, action: "organization.grade.archive" },
    });
    expect(log?.actorAccountId).toBe(sa.account.id);
  });

  test("hapus permanen: belum dipakai 200; sudah dipakai 409 dan data tetap ada", async () => {
    const unused = await create("/grades", { name: N("Grade Hapus") }, "grades");
    expect((await call("DELETE", `/grades/${unused}`, sa.headers)).status).toBe(200);
    expect(await prisma.grade.findUnique({ where: { id: unused } })).toBeNull();

    const dept = await create("/departments", { name: N("Dept Hapus") }, "departments");
    const pos = await create(
      "/positions",
      { name: N("Jab Hapus"), departmentId: dept },
      "positions",
    );
    await makeEmployee("H1", { positionId: pos });
    expect(await code(await call("DELETE", `/positions/${pos}`, sa.headers))).toBe("CONFLICT");
    expect(await prisma.position.findUnique({ where: { id: pos } })).not.toBeNull();
    // Audit hapus ikut batal bersama transaksinya.
    expect(
      await prisma.auditLog.count({
        where: { entityId: pos, action: "organization.position.delete" },
      }),
    ).toBe(0);
  });

  test("departemen dengan jabatan aktif tidak bisa diarsipkan", async () => {
    const dept = await create("/departments", { name: N("Dept Isi") }, "departments");
    await create("/positions", { name: N("Jab Isi"), departmentId: dept }, "positions");
    expect(await code(await call("POST", `/departments/${dept}/archive`, sa.headers))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
  });

  test("induk departemen tidak boleh membentuk siklus", async () => {
    const a = await create("/departments", { name: N("Dept A") }, "departments");
    const b = await create("/departments", { name: N("Dept B"), parentId: a }, "departments");
    expect(await code(await call("PATCH", `/departments/${a}`, sa.headers, { parentId: b }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    expect(await code(await call("PATCH", `/departments/${a}`, sa.headers, { parentId: a }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
  });

  test("status yang mewakili kategori tidak bisa diarsipkan", async () => {
    let categorized = await prisma.employmentStatus.findFirst({
      where: { category: { not: null } },
    });
    if (!categorized) {
      categorized = await prisma.employmentStatus.create({
        data: { name: N("Status Vendor"), category: "VENDOR" },
      });
      ids.statuses.push(categorized.id);
    }
    expect(
      await code(await call("POST", `/employment-statuses/${categorized.id}/archive`, sa.headers)),
    ).toBe("BUSINESS_RULE_VIOLATION");
  });
});

describe("perusahaan", () => {
  test("kode terkunci setelah dipakai karyawan; tidak bisa diarsipkan selama ada karyawan aktif; tidak bisa digabung", async () => {
    const company = await create(
      "/companies",
      { code: `C${RUN}`, name: N("PT Uji"), npwpNumber: "01.234.567.8-901.000" },
      "companies",
    );
    // Sebelum dipakai: kode boleh diubah.
    expect(
      (await call("PATCH", `/companies/${company}`, sa.headers, { code: `D${RUN}` })).status,
    ).toBe(200);
    const dept = await create("/departments", { name: N("Dept PT") }, "departments");
    const pos = await create("/positions", { name: N("Jab PT"), departmentId: dept }, "positions");
    await makeEmployee("PT1", { positionId: pos, companyId: company });
    expect(
      await code(await call("PATCH", `/companies/${company}`, sa.headers, { code: `E${RUN}` })),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(
      (await call("PATCH", `/companies/${company}`, sa.headers, { name: N("PT Uji Baru") })).status,
    ).toBe(200);
    expect(await code(await call("POST", `/companies/${company}/archive`, sa.headers))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    expect(
      (await call("POST", `/companies/${company}/merge`, sa.headers, { targetId: ids.acp })).status,
    ).toBe(404);
  });
});

describe("gabungkan", () => {
  test("jabatan: karyawan & riwayat pindah, sumber diarsipkan, audit tercatat", async () => {
    const dept = await create("/departments", { name: N("Dept Gab") }, "departments");
    const from = await create(
      "/positions",
      { name: N("Staf IT"), departmentId: dept },
      "positions",
    );
    const to = await create("/positions", { name: N("Staff IT"), departmentId: dept }, "positions");
    const e = await makeEmployee("G1", { positionId: from });
    await prisma.employmentHistory.create({
      data: {
        employeeId: e,
        changeType: "POSITION_CHANGED",
        effectiveDate: new Date("2024-06-01T00:00:00.000Z"),
        fromPositionId: from,
        toPositionId: from,
        changedBy: sa.account.id,
      },
    });
    const res = await call("POST", `/positions/${from}/merge`, sa.headers, { targetId: to });
    expect(res.status).toBe(200);
    expect(await data(res)).toMatchObject({ movedEmployees: 1, movedHistories: 2 });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e } })).positionId).toBe(to);
    const history = await prisma.employmentHistory.findFirstOrThrow({ where: { employeeId: e } });
    expect([history.fromPositionId, history.toPositionId]).toEqual([to, to]);
    expect(
      (await prisma.position.findUniqueOrThrow({ where: { id: from } })).deletedAt,
    ).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { entityId: from, action: "organization.position.merge" },
      }),
    ).toBe(1);
  });

  test("departemen: jabatan bernama sama digabung, lainnya dipindah, sub-departemen ikut pindah", async () => {
    const src = await create("/departments", { name: N("Dept Sumber") }, "departments");
    const dst = await create("/departments", { name: N("Dept Tujuan") }, "departments");
    const child = await create(
      "/departments",
      { name: N("Dept Anak"), parentId: src },
      "departments",
    );
    const same = await create(
      "/positions",
      { name: N("Operator"), departmentId: src },
      "positions",
    );
    const unique = await create("/positions", { name: N("Unik"), departmentId: src }, "positions");
    const dstSame = await create(
      "/positions",
      { name: N("Operator"), departmentId: dst },
      "positions",
    );
    const e = await makeEmployee("D1", { positionId: same });
    const res = await call("POST", `/departments/${src}/merge`, sa.headers, { targetId: dst });
    expect(res.status).toBe(200);
    expect(await data(res)).toMatchObject({ movedEmployees: 1, movedPositions: 1 });
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e } })).positionId).toBe(
      dstSame,
    );
    expect((await prisma.position.findUniqueOrThrow({ where: { id: unique } })).departmentId).toBe(
      dst,
    );
    expect((await prisma.department.findUniqueOrThrow({ where: { id: child } })).parentId).toBe(
      dst,
    );
    expect(
      (await prisma.department.findUniqueOrThrow({ where: { id: src } })).deletedAt,
    ).not.toBeNull();
  });

  test("tujuan terarsip atau sama dengan sumber ditolak", async () => {
    const a = await create("/grades", { name: N("Grade A") }, "grades");
    const b = await create("/grades", { name: N("Grade B") }, "grades");
    expect(await code(await call("POST", `/grades/${a}/merge`, sa.headers, { targetId: a }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    await call("POST", `/grades/${b}/archive`, sa.headers);
    expect(await code(await call("POST", `/grades/${a}/merge`, sa.headers, { targetId: b }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
  });
});

describe("dampak ke fitur lain", () => {
  test("karyawan berjabatan terarsip tetap bisa diubah; memilih jabatan terarsip lain ditolak", async () => {
    const dept = await create("/departments", { name: N("Dept Edit") }, "departments");
    const pos = await create(
      "/positions",
      { name: N("Jab Lama"), departmentId: dept },
      "positions",
    );
    const other = await create(
      "/positions",
      { name: N("Jab Arsip Lain"), departmentId: dept },
      "positions",
    );
    const e = await makeEmployee("E1", { positionId: pos });
    await call("POST", `/positions/${pos}/archive`, sa.headers);
    await call("POST", `/positions/${other}/archive`, sa.headers);
    const ok = await call("PATCH", `/employees/${e}`, sa.headers, {
      fullName: N("Nama Baru"),
      positionId: pos,
    });
    expect(ok.status).toBe(200);
    expect(
      await code(await call("PATCH", `/employees/${e}`, sa.headers, { positionId: other })),
    ).toBe("BUSINESS_RULE_VIOLATION");
  });

  test("import: nama jabatan terarsip → error baris MASTER_ARCHIVED (bukan 500)", async () => {
    // Baris "PKWT …" butuh status berkategori PKWT; DB CI kosong (tanpa seed), jadi dibuat sendiri.
    const pkwt = await prisma.employmentStatus.findFirst({
      where: { category: "PKWT", deletedAt: null },
    });
    if (!pkwt) {
      const created = await prisma.employmentStatus.create({
        data: { name: N("Status PKWT"), category: "PKWT" },
      });
      ids.statuses.push(created.id);
    }
    const dept = await create("/departments", { name: N("Dept Impor") }, "departments");
    const pos = await create(
      "/positions",
      { name: N("Jab Impor Arsip"), departmentId: dept },
      "positions",
    );
    await call("POST", `/positions/${pos}/archive`, sa.headers);
    const res = await call("POST", "/employee-imports/preview", sa.headers, {
      fileName: "uji.xlsx",
      fileSha256: "b".repeat(64),
      mode: "UPSERT",
      companyId: ids.acp,
      rows: [
        {
          sourceRow: 6,
          raw: {
            employeeNumber: `MD-${RUN}-IMP`,
            fullName: N("Impor Arsip"),
            joinDate: "2025-01-06",
            employmentStatusText: "PKWT I - 6 Bulan",
            departmentName: N("Dept Impor"),
            positionName: N("Jab Impor Arsip"),
          },
        },
      ],
    });
    expect(res.status).toBe(200);
    const preview = await data(res);
    expect(preview.rows[0].issues.map((i: { code: string }) => i.code)).toContain(
      "MASTER_ARCHIVED",
    );
    expect(preview.masterData.positions).toEqual([]);
  });
});
