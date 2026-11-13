import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { getHomebasesOn } from "../../../src/modules/employee/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// EMP-D6: Homebase / Point of Hire — master (SA saja), riwayat berlaku per tanggal per karyawan, kolom
// turunan employees.homebase_id, pencatatan audit + EMP-D5, akses baca data kerja, adapter payroll.
const RUN = crypto.randomUUID().slice(0, 8);
const prisma = getPrisma();
const auth = createAuthFixture(`hb${RUN}`);
const app = createApp({ logger: createLogger("error", () => {}), tokenVerifier: testVerifier });

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
const N = (label: string) => `HB ${label} ${RUN}`;
/** Dua hari ke depan: pasti "masa depan" dalam WIB apa pun jam mesinnya. */
const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

const ids = {
  acp: "",
  otherCompany: "",
  department: "",
  position: "",
  status: "",
  employees: [] as string[],
  homebases: [] as string[],
};
let sa: Login;
let hr: Login;
let hrOther: Login;
let hrPersonnel: Login;
let mgr: Login;
let manager = "";
let target = "";

async function makeEmployee(n: string, extra: { managerId?: string; isActive?: boolean } = {}) {
  const id = (
    await prisma.employee.create({
      data: {
        employeeNumber: `HB-${RUN}-${n}`,
        fullName: `HB ${RUN} ${n}`,
        companyId: ids.acp,
        positionId: ids.position,
        employmentStatusId: ids.status,
        joinDate: new Date("2023-01-01"),
        ...extra,
      },
    })
  ).id;
  ids.employees.push(id);
  return id;
}

async function createHomebase(label: string, extra: Record<string, unknown> = {}) {
  const res = await call("POST", "/homebases", sa.headers, { name: N(label), ...extra });
  expect(res.status).toBe(201);
  const id = (await data(res)).id as string;
  ids.homebases.push(id);
  return id;
}

const currentOf = async (employeeId: string) =>
  (await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).homebaseId;

const addEntry = (who: Login, employeeId: string, body: Record<string, unknown>) =>
  call("POST", `/employees/${employeeId}/homebases`, who.headers, body);

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.otherCompany = await createTestCompany(`H${RUN.slice(0, 6)}`, `PT HB ${RUN}`);
  ids.department = (await prisma.department.create({ data: { name: `HB Dept ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `HB Jab ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `HB St ${RUN}` } })).id;
  manager = await makeEmployee("M");
  target = await makeEmployee("T", { managerId: manager });

  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN");
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.otherCompany] });
  hrPersonnel = await auth.loginAs("HR_PERSONNEL", { companies: [ids.acp] });
  mgr = await auth.loginAs("MANAGER", { employeeId: manager });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...ids.employees, ...ids.homebases] } },
  });
  await auth.cleanup();
  // Riwayat homebase & EMP-D5 ikut terhapus (cascade) bersama karyawan uji.
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.homebase.deleteMany({ where: { id: { in: ids.homebases } } });
  await prisma.position.deleteMany({ where: { id: ids.position } });
  await prisma.department.deleteMany({ where: { id: ids.department } });
  await prisma.employmentStatus.deleteMany({ where: { id: ids.status } });
  await prisma.accountCompany.deleteMany({ where: { companyId: ids.otherCompany } });
  await prisma.company.deleteMany({ where: { id: ids.otherCompany } });
});

describe("master homebase (SA saja)", () => {
  test("SA: tambah 201, ubah, arsip, pulihkan, hapus 200; muncul di master-data & daftar admin", async () => {
    const id = await createHomebase("Kelola", { city: "Balikpapan", province: "Kalimantan Timur" });
    expect(
      (await call("PATCH", `/homebases/${id}`, sa.headers, { note: "Bandara SAMS" })).status,
    ).toBe(200);
    const row = await prisma.homebase.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      city: "Balikpapan",
      province: "Kalimantan Timur",
      note: "Bandara SAMS",
    });
    const master = await data(await call("GET", "/master-data", mgr.headers));
    expect(master.homebases).toContainEqual({
      id,
      name: N("Kelola"),
      city: "Balikpapan",
      province: "Kalimantan Timur",
    });
    const admin = await data(await call("GET", `/homebases?q=${RUN}`, hr.headers));
    expect(admin).toContainEqual(
      expect.objectContaining({ id, archived: false, employeeCount: 0, note: "Bandara SAMS" }),
    );
    expect((await call("POST", `/homebases/${id}/archive`, sa.headers)).status).toBe(200);
    const masterAfter = await data(await call("GET", "/master-data", sa.headers));
    expect(masterAfter.homebases.map((h: { id: string }) => h.id)).not.toContain(id);
    expect((await call("POST", `/homebases/${id}/restore`, sa.headers)).status).toBe(200);
    expect((await call("DELETE", `/homebases/${id}`, sa.headers)).status).toBe(200);
    expect(await prisma.homebase.count({ where: { id } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { entityId: id, action: { startsWith: "organization.homebase." } },
      }),
    ).toBe(5);
  });

  test("HR & MANAGER tidak boleh menulis (403); nama ganda 409", async () => {
    const id = await createHomebase("Ganda");
    for (const who of [hr, mgr]) {
      expect((await call("POST", "/homebases", who.headers, { name: N("Liar") })).status).toBe(403);
      expect((await call("PATCH", `/homebases/${id}`, who.headers, { city: "X" })).status).toBe(
        403,
      );
      expect((await call("POST", `/homebases/${id}/archive`, who.headers)).status).toBe(403);
    }
    expect((await call("GET", "/homebases", mgr.headers)).status).toBe(403);
    const dup = await call("POST", "/homebases", sa.headers, { name: N("Ganda") });
    expect(dup.status).toBe(409);
  });
});

describe("riwayat homebase karyawan", () => {
  const hb = { a: "", b: "", c: "", archived: "" };
  const entryIds: Record<string, string> = {};

  beforeAll(async () => {
    hb.a = await createHomebase("Alfa");
    hb.b = await createHomebase("Bravo");
    hb.c = await createHomebase("Charlie");
    hb.archived = await createHomebase("Arsip");
    expect((await call("POST", `/homebases/${hb.archived}/archive`, sa.headers)).status).toBe(200);
  });

  test("tulis: SA 201, HR PT sendiri 201, HR PT lain 404, MANAGER 403, tanpa login 401", async () => {
    const first = await addEntry(sa, target, {
      homebaseId: hb.a,
      effectiveFrom: "2024-01-01",
      decreeNumber: "SK-001",
    });
    expect(first.status).toBe(201);
    const created = await data(first);
    expect(created).toMatchObject({
      homebase: { id: hb.a, name: N("Alfa") },
      effectiveFrom: "2024-01-01",
      decreeNumber: "SK-001",
      note: null,
    });
    entryIds.a = created.id;
    expect(await currentOf(target)).toBe(hb.a);

    const second = await addEntry(hr, target, { homebaseId: hb.b, effectiveFrom: "2025-01-01" });
    expect(second.status).toBe(201);
    entryIds.b = (await data(second)).id;
    expect(await currentOf(target)).toBe(hb.b);

    const body = { homebaseId: hb.c, effectiveFrom: "2022-01-01" };
    expect((await addEntry(hrOther, target, body)).status).toBe(404);
    expect((await addEntry(mgr, target, body)).status).toBe(403);
    expect((await addEntry(hrPersonnel, target, body)).status).toBe(403);
    expect((await call("POST", `/employees/${target}/homebases`, {}, body)).status).toBe(401);
    expect(await currentOf(target)).toBe(hb.b);
  });

  test("validasi: tanggal masa depan 400, tanggal kembar 409, homebase terarsip 422", async () => {
    const tomorrow = await addEntry(sa, target, { homebaseId: hb.c, effectiveFrom: future });
    expect(tomorrow.status).toBe(400);
    expect(await code(tomorrow)).toBe("VALIDATION_ERROR");
    const twin = await addEntry(sa, target, { homebaseId: hb.c, effectiveFrom: "2025-01-01" });
    expect(twin.status).toBe(409);
    const archived = await addEntry(sa, target, {
      homebaseId: hb.archived,
      effectiveFrom: "2022-01-01",
    });
    expect(archived.status).toBe(422);
    expect(await code(archived)).toBe("BUSINESS_RULE_VIOLATION");
    expect(
      (
        await call("PATCH", `/employees/${target}/homebases/${entryIds.a}`, sa.headers, {
          effectiveFrom: future,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("PATCH", `/employees/${target}/homebases/${entryIds.a}`, sa.headers, {
          effectiveFrom: "2025-01-01",
        })
      ).status,
    ).toBe(409);
  });

  test("riwayat mundur tidak mengubah nilai sekarang; PATCH tanggal menghitung ulang urutan", async () => {
    const back = await addEntry(sa, target, { homebaseId: hb.c, effectiveFrom: "2023-06-01" });
    expect(back.status).toBe(201);
    entryIds.c = (await data(back)).id;
    expect(await currentOf(target)).toBe(hb.b);

    const moved = await call("PATCH", `/employees/${target}/homebases/${entryIds.c}`, sa.headers, {
      effectiveFrom: "2025-06-01",
      note: "Koreksi tanggal SK",
    });
    expect(moved.status).toBe(200);
    expect(await data(moved)).toMatchObject({
      effectiveFrom: "2025-06-01",
      note: "Koreksi tanggal SK",
    });
    expect(await currentOf(target)).toBe(hb.c);

    const list = await data(await call("GET", `/employees/${target}/homebases`, sa.headers));
    expect(list.map((e: { effectiveFrom: string }) => e.effectiveFrom)).toEqual([
      "2025-06-01",
      "2025-01-01",
      "2024-01-01",
    ]);
    expect(list[0].changedBy).toMatchObject({ role: "SUPER_ADMIN" });
  });

  test("PATCH boleh mempertahankan homebase yang sudah diarsipkan", async () => {
    expect((await call("POST", `/homebases/${hb.b}/archive`, sa.headers)).status).toBe(200);
    const res = await call("PATCH", `/employees/${target}/homebases/${entryIds.b}`, sa.headers, {
      homebaseId: hb.b,
      note: "Tetap Bravo",
    });
    expect(res.status).toBe(200);
    expect(
      (
        await call("PATCH", `/employees/${target}/homebases/${entryIds.a}`, sa.headers, {
          homebaseId: hb.b,
        })
      ).status,
    ).toBe(422);
    expect((await call("POST", `/homebases/${hb.b}/restore`, sa.headers)).status).toBe(200);
  });

  test("akses baca: atasan tim & HR Kepegawaian melihat homebase di detail (data kerja)", async () => {
    for (const who of [mgr, hrPersonnel]) {
      const detail = await data(await call("GET", `/employees/${target}?view=work`, who.headers));
      expect(detail.homebase).toEqual({ id: hb.c, name: N("Charlie") });
      expect(detail.homebases).toHaveLength(3);
      expect(detail.homebases[0]).toMatchObject({ homebase: { id: hb.c } });
      expect((await call("GET", `/employees/${target}/homebases`, who.headers)).status).toBe(200);
    }
    expect((await call("GET", `/employees/${target}/homebases`, hrOther.headers)).status).toBe(404);
  });

  test("hapus baris: terbaru dihapus → kembali ke baris sebelumnya; semua dihapus → null", async () => {
    const del = await call("DELETE", `/employees/${target}/homebases/${entryIds.c}`, sa.headers);
    expect(del.status).toBe(200);
    expect(await currentOf(target)).toBe(hb.b);
    expect(
      (await call("DELETE", `/employees/${target}/homebases/${entryIds.c}`, sa.headers)).status,
    ).toBe(404);
    expect(
      (await call("DELETE", `/employees/${target}/homebases/${entryIds.a}`, mgr.headers)).status,
    ).toBe(403);
    for (const entry of [entryIds.b, entryIds.a]) {
      expect(
        (await call("DELETE", `/employees/${target}/homebases/${entry}`, hr.headers)).status,
      ).toBe(200);
    }
    expect(await currentOf(target)).toBeNull();
    const detail = await data(await call("GET", `/employees/${target}`, sa.headers));
    expect(detail.homebase).toBeNull();
    expect(detail.homebases).toEqual([]);
  });

  test("pencatatan: EMP-D5 field homebase berisi teks lama/baru; audit employee.homebase.*", async () => {
    const rows = await prisma.employeeFieldChange.findMany({
      where: { employeeId: target, field: "homebase" },
      orderBy: { occurredAt: "asc" },
      select: { source: true, section: true, oldValue: true, newValue: true },
    });
    expect(rows.every((r) => r.source === "HR_FORM" && r.section === "WORK")).toBe(true);
    // Nilai lama/baru = homebase yang BERLAKU sebelum → sesudah simpan (temuan staging 2026-11-13: dulu
    // tambah baris selalu "— → baru"). Baris mundur (2023-06-01) & koreksi baris lama tidak mengubah nilai
    // sekarang → tidak dicatat.
    const text = (name: string, from: string) => `${N(name)} (berlaku ${from})`;
    expect(rows.map((r) => [r.oldValue, r.newValue])).toEqual([
      [null, text("Alfa", "2024-01-01")],
      [text("Alfa", "2024-01-01"), text("Bravo", "2025-01-01")],
      // PATCH baris mundur Charlie → 2025-06-01 menjadikannya yang terbaru.
      [text("Bravo", "2025-01-01"), text("Charlie", "2025-06-01")],
      // Hapus terbaru → kembali ke baris sebelumnya; lalu sisa dihapus sampai kosong.
      [text("Charlie", "2025-06-01"), text("Bravo", "2025-01-01")],
      [text("Bravo", "2025-01-01"), text("Alfa", "2024-01-01")],
      [text("Alfa", "2024-01-01"), null],
    ]);
    // Lewat endpoint EMP-D5 juga terbaca (data kerja, tanpa disamarkan).
    const changes = await data(
      await call("GET", `/employees/${target}/field-changes?section=WORK`, sa.headers),
    );
    expect(changes.some((c: { field: string }) => c.field === "homebase")).toBe(true);

    const audits = await prisma.auditLog.groupBy({
      by: ["action"],
      where: { entityId: target, action: { startsWith: "employee.homebase." } },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(audits.map((a) => [a.action, a._count._all]));
    expect(counts).toEqual({
      "employee.homebase.create": 3,
      "employee.homebase.update": 2,
      "employee.homebase.delete": 3,
    });
    const sample = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target, action: "employee.homebase.create" },
    });
    expect(Object.keys(sample.after as object).sort()).toEqual([
      "effectiveFrom",
      "entryId",
      "homebaseId",
    ]);
  });

  test("karyawan nonaktif: tulis riwayat 422", async () => {
    const inactive = await makeEmployee("I", { isActive: false });
    const res = await addEntry(sa, inactive, { homebaseId: hb.a, effectiveFrom: "2024-01-01" });
    expect(res.status).toBe(422);
  });
});

describe("tambah karyawan, daftar, hapus & gabung master", () => {
  test("POST /employees dengan homebaseId → baris riwayat mulai tanggal masuk + kolom turunan; filter daftar", async () => {
    const hb = await createHomebase("Rekrut");
    const res = await call("POST", "/employees", sa.headers, {
      employeeNumber: `HB-${RUN}-NEW`,
      fullName: `HB ${RUN} Baru`,
      joinDate: "2024-03-01",
      companyId: ids.acp,
      employmentStatusId: ids.status,
      positionId: ids.position,
      homebaseId: hb,
    });
    expect(res.status).toBe(201);
    const created = await data(res);
    ids.employees.push(created.id);
    expect(created.homebase).toEqual({ id: hb, name: N("Rekrut") });
    const entries = await prisma.employeeHomebase.findMany({ where: { employeeId: created.id } });
    expect(entries.map((e) => [e.homebaseId, e.effectiveFrom.toISOString().slice(0, 10)])).toEqual([
      [hb, "2024-03-01"],
    ]);
    expect(await currentOf(created.id)).toBe(hb);

    const future2 = await call("POST", "/employees", sa.headers, {
      employeeNumber: `HB-${RUN}-FUT`,
      fullName: `HB ${RUN} Nanti`,
      joinDate: future,
      companyId: ids.acp,
      employmentStatusId: ids.status,
      positionId: ids.position,
      homebaseId: hb,
    });
    expect(future2.status).toBe(201);
    const later = await data(future2);
    ids.employees.push(later.id);
    const laterEntry = await prisma.employeeHomebase.findFirstOrThrow({
      where: { employeeId: later.id },
    });
    // Tanggal masuk di masa depan → berlaku mulai hari ini (tidak boleh di masa depan).
    expect(laterEntry.effectiveFrom.toISOString().slice(0, 10) < future).toBe(true);

    const listed = await call("GET", `/employees?homebaseId=${hb}&pageSize=100`, sa.headers);
    expect(listed.status).toBe(200);
    const items = (await listed.json()) as { data: { id: string; homebase: unknown }[] };
    expect(items.data.map((e) => e.id).sort()).toEqual([created.id, later.id].sort());
    expect(items.data[0]?.homebase).toEqual({ id: hb, name: N("Rekrut") });
    const none = (await (
      await call("GET", `/employees?homebaseId=${ids.position}`, sa.headers)
    ).json()) as { data: unknown[] };
    expect(none.data).toEqual([]);

    // Homebase yang sudah dipakai tidak bisa dihapus permanen.
    const del = await call("DELETE", `/homebases/${hb}`, sa.headers);
    expect(del.status).toBe(409);
  });

  test("homebase yang hanya tersisa di riwayat tetap dianggap dipakai (hapus 409)", async () => {
    const old = await createHomebase("Lama");
    const now = await createHomebase("Kini");
    const e = await makeEmployee("R");
    expect((await addEntry(sa, e, { homebaseId: old, effectiveFrom: "2023-02-01" })).status).toBe(
      201,
    );
    expect((await addEntry(sa, e, { homebaseId: now, effectiveFrom: "2024-02-01" })).status).toBe(
      201,
    );
    expect(await currentOf(e)).toBe(now);
    expect((await call("DELETE", `/homebases/${old}`, sa.headers)).status).toBe(409);
  });

  test("gabung: employees.homebase_id + riwayat pindah, MASTER_MERGE tercatat, sumber diarsipkan", async () => {
    const from = await createHomebase("Sumber");
    const to = await createHomebase("Tujuan");
    const e = await makeEmployee("G");
    expect((await addEntry(sa, e, { homebaseId: from, effectiveFrom: "2024-05-01" })).status).toBe(
      201,
    );
    const res = await call("POST", `/homebases/${from}/merge`, sa.headers, { targetId: to });
    expect(res.status).toBe(200);
    expect(await data(res)).toMatchObject({ movedEmployees: 1, movedHistories: 1 });
    expect(await currentOf(e)).toBe(to);
    const entries = await prisma.employeeHomebase.findMany({ where: { employeeId: e } });
    expect(entries.map((x) => x.homebaseId)).toEqual([to]);
    expect(
      await prisma.employeeFieldChange.findFirst({
        where: { employeeId: e, source: "MASTER_MERGE" },
        select: { section: true, field: true, oldValue: true, newValue: true, changedBy: true },
      }),
    ).toEqual({
      section: "WORK",
      field: "homebase",
      oldValue: `${N("Sumber")} (berlaku 2024-05-01)`,
      newValue: `${N("Tujuan")} (berlaku 2024-05-01)`,
      changedBy: sa.account.id,
    });
    expect(
      (await prisma.homebase.findUniqueOrThrow({ where: { id: from } })).deletedAt,
    ).not.toBeNull();
  });
});

describe("adapter payroll getHomebasesOn", () => {
  test("sebelum baris pertama null, tepat di tanggal efektif, dan di antara dua baris", async () => {
    const first = await createHomebase("Payroll 1");
    const second = await createHomebase("Payroll 2");
    const e = await makeEmployee("P");
    const empty = await makeEmployee("P0");
    await prisma.employeeHomebase.createMany({
      data: [
        { employeeId: e, homebaseId: first, effectiveFrom: new Date("2024-01-01T00:00:00Z") },
        { employeeId: e, homebaseId: second, effectiveFrom: new Date("2025-01-01T00:00:00Z") },
      ],
    });
    const on = async (date: Date | string) => (await getHomebasesOn([e, empty], date)).get(e);

    expect(await on("2023-12-31")).toBeNull();
    expect(await on("2024-01-01")).toEqual({
      homebaseId: first,
      name: N("Payroll 1"),
      effectiveFrom: "2024-01-01",
    });
    expect(await on("2024-12-31")).toMatchObject({ homebaseId: first });
    expect(await on(new Date("2024-06-15T00:00:00Z"))).toMatchObject({ homebaseId: first });
    expect(await on("2025-01-01")).toMatchObject({
      homebaseId: second,
      effectiveFrom: "2025-01-01",
    });
    expect(await on("2026-01-01")).toMatchObject({ homebaseId: second });
    const both = await getHomebasesOn([e, empty], "2025-02-01");
    expect(both.get(empty)).toBeNull();
    expect(both.size).toBe(2);
  });
});
