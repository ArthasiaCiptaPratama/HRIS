import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// D-051/D-052/D-053: pos jabatan, unit milik PT, penempatan karyawan, atasan otomatis, bagan & kartu.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const N = (text: string) => `OC-${RUN} ${text}`;
const NUM = (n: string) => `OC-${RUN}-${n}`;
const auth = createAuthFixture(`oc${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
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
const data = async (res: Response) => ((await res.json()) as { data: any }).data;

const ids = {
  acp: "",
  other: "",
  status: "",
  units: [] as string[],
  positions: [] as string[],
  posts: [] as string[],
  employees: [] as string[],
  unitAcp: "",
  unitOther: "",
  unitCorp: "",
  posDir: "",
  posMgr: "",
  posStaff: "",
  posOther: "",
  posCorp: "",
};
const people = { s1: "", s2: "", boss: "", mgr: "" };
let sa: Login;
let hr: Login;
let bossLogin: Login;
let emp: Login;
let empOther: Login;

async function unit(name: string, companyId: string | null) {
  const id = (await prisma.department.create({ data: { name: N(name), companyId } })).id;
  ids.units.push(id);
  return id;
}
async function position(name: string, departmentId: string) {
  const id = (await prisma.position.create({ data: { name: N(name), departmentId } })).id;
  ids.positions.push(id);
  return id;
}
async function post(body: Record<string, unknown>) {
  const res = await call("POST", "/org-posts", sa.headers, body);
  expect(res.status).toBe(201);
  const id = (await data(res)).id as string;
  ids.posts.push(id);
  return id;
}
async function employee(n: string, positionId: string, companyId = ids.acp) {
  const row = await prisma.employee.create({
    data: {
      companyId,
      employeeNumber: NUM(n),
      fullName: N(`Orang ${n}`),
      joinDate: new Date("2024-01-02T00:00:00.000Z"),
      employmentStatusId: ids.status,
      positionId,
    },
  });
  ids.employees.push(row.id);
  return row.id;
}
const place = (id: string, orgPostId: string | null, extra: Record<string, unknown> = {}) =>
  call("PATCH", `/employees/${id}`, sa.headers, { orgPostId, ...extra });
const managerOf = async (id: string) =>
  (await prisma.employee.findUniqueOrThrow({ where: { id }, select: { managerId: true } }))
    .managerId;

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.other = await createTestCompany(`O${RUN}`, `PT Lain ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: N("Status") } })).id;
  ids.unitAcp = await unit("Unit ACP", ids.acp);
  ids.unitOther = await unit("Unit Lain", ids.other);
  ids.unitCorp = await unit("Corporate", null);
  ids.posDir = await position("Direktur", ids.unitAcp);
  ids.posMgr = await position("Manajer", ids.unitAcp);
  ids.posStaff = await position("Staf", ids.unitAcp);
  ids.posOther = await position("Staf PT Lain", ids.unitOther);
  ids.posCorp = await position("HC Senior", ids.unitCorp);
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { companies: [ids.acp] });
});

afterAll(async () => {
  await auth.cleanup();
  await prisma.employee.updateMany({
    where: { id: { in: ids.employees } },
    data: { managerId: null, orgPostId: null },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...ids.employees, ...ids.posts, ...ids.units] } },
  });
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.orgPost.updateMany({
    where: { id: { in: ids.posts } },
    data: { reportsToId: null, functionalReportsToId: null },
  });
  await prisma.orgPost.deleteMany({ where: { id: { in: ids.posts } } });
  await prisma.position.deleteMany({ where: { id: { in: ids.positions } } });
  await prisma.department.updateMany({
    where: { id: { in: ids.units } },
    data: { parentId: null },
  });
  await prisma.department.deleteMany({ where: { id: { in: ids.units } } });
  await prisma.company.delete({ where: { id: ids.other } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("unit organisasi milik PT (D-052)", () => {
  test("unit di bawah induk ber-PT harus PT yang sama; daftar membawa kode PT", async () => {
    expect(
      await code(
        await call("POST", "/departments", sa.headers, {
          name: N("Anak salah"),
          parentId: ids.unitAcp,
          companyId: ids.other,
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    const res = await call("POST", "/departments", sa.headers, {
      name: N("Anak ikut induk"),
      unitType: "SECTION",
      parentId: ids.unitAcp,
    });
    expect(res.status).toBe(201);
    const child = (await data(res)).id as string;
    ids.units.push(child);
    const list = await data(await call("GET", `/departments?q=${RUN}`, sa.headers));
    expect(list.find((u: { id: string }) => u.id === child)).toMatchObject({
      companyId: ids.acp,
      companyCode: "ACP",
    });
  });
});

describe("pos jabatan (D-051)", () => {
  test("SA kelola; HR hanya lihat; EMPLOYEE 403; input salah 400", async () => {
    const dir = await post({ positionId: ids.posDir, code: `oc-${RUN}-dir` });
    expect((await call("POST", "/org-posts", hr.headers, { positionId: ids.posMgr })).status).toBe(
      403,
    );
    const list = await call("GET", "/org-posts?view=all", hr.headers);
    expect(list.status).toBe(200);
    expect((await data(list)).find((p: { id: string }) => p.id === dir)).toMatchObject({
      code: `OC-${RUN}-DIR`,
      companyCode: "ACP",
      headcount: 1,
      holderCount: 0,
    });
    emp = await auth.loginAs("EMPLOYEE");
    expect((await call("GET", "/org-posts", emp.headers)).status).toBe(403);
    expect(
      (await call("POST", "/org-posts", sa.headers, { positionId: ids.posMgr, headcount: 0 }))
        .status,
    ).toBe(400);
  });

  test("garis tegas lintas PT/ke korporat ditolak; garis fungsional ke korporat boleh; siklus ditolak", async () => {
    const [dir] = ids.posts as [string];
    const corp = await post({ positionId: ids.posCorp });
    expect(
      await code(
        await call("POST", "/org-posts", sa.headers, {
          positionId: ids.posOther,
          reportsToId: dir,
        }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(
      await code(
        await call("POST", "/org-posts", sa.headers, { positionId: ids.posMgr, reportsToId: corp }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    const mgr = await post({
      positionId: ids.posMgr,
      reportsToId: dir,
      functionalReportsToId: corp,
    });
    const staff = await post({ positionId: ids.posStaff, reportsToId: mgr, headcount: 2 });
    expect(
      await code(await call("PATCH", `/org-posts/${dir}`, sa.headers, { reportsToId: staff })),
    ).toBe("BUSINESS_RULE_VIOLATION");
    // Kode unik → 409.
    expect(
      (
        await call("POST", "/org-posts", sa.headers, {
          positionId: ids.posDir,
          code: `OC-${RUN}-DIR`,
        })
      ).status,
    ).toBe(409);
  });
});

describe("penempatan karyawan & atasan otomatis (D-053)", () => {
  test("slot penuh, jabatan tidak cocok, jabatan PT lain ditolak", async () => {
    const [, , mgrPost, staffPost] = ids.posts as [string, string, string, string];
    const s1 = await employee("S1", ids.posStaff);
    const s2 = await employee("S2", ids.posStaff);
    people.s1 = s1;
    people.s2 = s2;
    const s3 = await employee("S3", ids.posStaff);
    expect((await place(s1, staffPost)).status).toBe(200);
    expect((await place(s2, staffPost)).status).toBe(200);
    expect(await code(await place(s3, staffPost))).toBe("BUSINESS_RULE_VIOLATION");
    expect(await code(await place(s3, mgrPost, { positionId: ids.posStaff }))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    expect(
      await code(await call("PATCH", `/employees/${s3}`, sa.headers, { positionId: ids.posOther })),
    ).toBe("BUSINESS_RULE_VIOLATION");
    const list = await data(await call("GET", "/org-posts?view=all", sa.headers));
    expect(list.find((p: { id: string }) => p.id === staffPost).holderCount).toBe(2);
  });

  test("atasan = pemegang pos atasan terdekat ber-akun Manager; pos kosong dilewati; manual tidak disentuh", async () => {
    const [dirPost, , mgrPost] = ids.posts as [string, string, string];
    const { s1, s2 } = people;
    const boss = await employee("B1", ids.posDir);
    people.boss = boss;
    bossLogin = await auth.loginAs("MANAGER", { employeeId: boss });
    // Pos Manajer kosong → staf naik ke Direktur.
    expect((await place(boss, dirPost)).status).toBe(200);
    expect(await managerOf(s1)).toBe(boss);
    // Manajer ditempatkan & ber-akun MANAGER → staf pindah ke Manajer.
    const m = await employee("M1", ids.posMgr);
    people.mgr = m;
    await auth.loginAs("MANAGER", { employeeId: m });
    expect((await place(m, mgrPost)).status).toBe(200);
    // Akun Manager baru dibuat SETELAH penempatan → perlu sinkron ulang (tombol SA).
    const sync = await call("POST", "/org-posts/sync-managers", sa.headers);
    expect(sync.status).toBe(200);
    expect(await managerOf(s1)).toBe(m);
    expect(await managerOf(m)).toBe(boss);
    // Atasan manual pada s2 tidak diubah sinkron.
    expect((await call("PATCH", `/employees/${s2}`, sa.headers, { managerId: boss })).status).toBe(
      200,
    );
    await call("POST", "/org-posts/sync-managers", sa.headers);
    expect(await managerOf(s2)).toBe(boss);
    // Kembali otomatis.
    expect(
      (await call("PATCH", `/employees/${s2}`, sa.headers, { managerOverride: false })).status,
    ).toBe(200);
    expect(await managerOf(s2)).toBe(m);
    expect((await call("POST", "/org-posts/sync-managers", hr.headers)).status).toBe(403);
  });

  test("nonaktifkan pemegang → slot kosong & bawahan naik ke atasan berikutnya", async () => {
    const { s1, mgr: m, boss } = people;
    const res = await call("POST", `/employees/${m}/deactivate`, sa.headers, {
      effectiveDate: "2026-10-05",
      exitReason: "RESIGNATION",
    });
    expect(res.status).toBe(200);
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: m } });
    expect(row.orgPostId).toBeNull();
    expect(await managerOf(s1)).toBe(boss);
  });

  test("pos berisi pemegang tidak bisa diarsipkan / diganti jabatannya; slot tidak bisa < pemegang", async () => {
    const [, , , staffPost] = ids.posts as [string, string, string, string];
    expect(await code(await call("POST", `/org-posts/${staffPost}/archive`, sa.headers))).toBe(
      "BUSINESS_RULE_VIOLATION",
    );
    expect(
      await code(
        await call("PATCH", `/org-posts/${staffPost}`, sa.headers, { positionId: ids.posMgr }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(
      await code(await call("PATCH", `/org-posts/${staffPost}`, sa.headers, { headcount: 1 })),
    ).toBe("BUSINESS_RULE_VIOLATION");
  });
});

describe("bagan & kartu profil (D-051)", () => {
  test("bagan PT: pos PT + panel korporat, garis fungsional, pemegang; semua role di PT-nya", async () => {
    const [dirPost, corpPost, mgrPost] = ids.posts as [string, string, string];
    const res = await call("GET", `/org-chart?companyId=${ids.acp}`, bossLogin.headers);
    expect(res.status).toBe(200);
    const chart = await data(res);
    expect(chart.company.code).toBe("ACP");
    const byId = new Map(chart.posts.map((p: { id: string }) => [p.id, p]));
    expect(byId.get(corpPost)).toMatchObject({ corporate: true });
    expect(byId.get(mgrPost)).toMatchObject({
      reportsToId: dirPost,
      functionalReportsToId: corpPost,
    });
    expect((byId.get(dirPost) as { holders: unknown[] }).holders).toHaveLength(1);
    expect(chart.canOpenDetail).toBe(false);
    // Tidak ada data pribadi di respons.
    expect(JSON.stringify(chart)).not.toContain("ktp");
    // PT di luar cakupan HR → 404; EMPLOYEE PT lain tidak melihat bagan ACP.
    expect((await call("GET", `/org-chart?companyId=${ids.other}`, hr.headers)).status).toBe(404);
    const otherEmp = await employee("X1", ids.posOther, ids.other);
    empOther = await auth.loginAs("EMPLOYEE", { employeeId: otherEmp });
    const own = await data(await call("GET", "/org-chart", empOther.headers));
    expect(own.company.id).toBe(ids.other);
    expect(own.posts.some((p: { id: string }) => p.id === dirPost)).toBe(false);
    expect((await call("GET", "/org-chart", {})).status).toBe(401);
  });

  test("kartu profil: kolom direktori saja; orang PT lain 404 kecuali pemegang pos korporat", async () => {
    const { boss } = people;
    const card = await call("GET", `/org-chart/people/${boss}`, bossLogin.headers);
    expect(card.status).toBe(200);
    const body = await data(card);
    expect(Object.keys(body).sort()).toEqual(
      [
        "company",
        "department",
        "fullName",
        "id",
        "photoUrl",
        "position",
        "workEmail",
        "workLocation",
      ].sort(),
    );
    expect((await call("GET", `/org-chart/people/${boss}`, empOther.headers)).status).toBe(404);
    // Pemegang pos korporat terlihat lintas PT.
    const [, corpPost] = ids.posts as [string, string];
    const corpPerson = await employee("C1", ids.posCorp, ids.other);
    expect((await place(corpPerson, corpPost)).status).toBe(200);
    expect((await call("GET", `/org-chart/people/${corpPerson}`, bossLogin.headers)).status).toBe(
      200,
    );
  });
});
