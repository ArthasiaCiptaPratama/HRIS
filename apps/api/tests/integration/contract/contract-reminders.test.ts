import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addContractDays } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { contractReminderThreshold } from "../../../src/modules/employee/contract-reminder.service.ts";
import { remindContracts } from "../../../src/modules/employee/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";

// KTR-D5/D6 (K2): cron `contract-daily` + daftar "Kontrak akan habis" (KTR-D11: SA + HR_ADMIN PT).
const RUN = crypto.randomUUID().slice(0, 8);
const prisma = getPrisma();
const auth = createAuthFixture(RUN);
const app = createApp({
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  logger: createLogger("error", () => {}),
});
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const JAKARTA = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
const now = new Date();
const today = JAKARTA.format(now);
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const tomorrow = new Date(now.getTime() + 86_400_000);

let company = "";
let otherCompany = "";
let department = "";
let position = "";
let sa: Login;
let hr: Login;
let hrOther: Login;
let manager: Login;
let manager2: Login;
const employees: string[] = [];
type Key =
  | "boss"
  | "boss2"
  | "h30"
  | "h7"
  | "today"
  | "lewat"
  | "coba"
  | "cobaLama"
  | "limaPuluh"
  | "tanpa"
  | "nonaktif"
  | "ptLain";
const ids = {} as Record<Key, string>;
const started = new Date();

const createdStatuses: string[] = [];
const statusIds = new Map<string, string>();
// DB CI kosong (tanpa seed): buat status berkategori bila belum ada; kategori unik, jadi pakai yang ada bila ada.
async function status(category: "PKWT" | "PROBATION" | "PERMANENT") {
  const cached = statusIds.get(category);
  if (cached) return cached;
  const existing = await prisma.employmentStatus.findFirst({ where: { category } });
  const id =
    existing?.id ??
    (await prisma.employmentStatus.create({ data: { name: `KTRK2 ${category} ${RUN}`, category } }))
      .id;
  if (!existing) createdStatuses.push(id);
  statusIds.set(category, id);
  return id;
}
async function makeEmployee(
  key: Key,
  category: "PKWT" | "PROBATION" | "PERMANENT",
  extra: {
    endIn?: number;
    stage?: number | null;
    managerId?: string;
    isActive?: boolean;
    companyId?: string;
  } = {},
) {
  const row = await prisma.employee.create({
    data: {
      fullName: `KTRK2 ${RUN} ${key}`,
      employeeNumber: `KTRK2-${RUN}-${key}`,
      companyId: extra.companyId ?? company,
      positionId: position,
      employmentStatusId: await status(category),
      joinDate: date("2024-01-01"),
      managerId: extra.managerId ?? null,
      isActive: extra.isActive ?? true,
      contractStage: category === "PKWT" ? (extra.stage === undefined ? 1 : extra.stage) : null,
      contractEndDate: extra.endIn === undefined ? null : date(addContractDays(today, extra.endIn)),
    },
  });
  employees.push(row.id);
  ids[key] = row.id;
  return row.id;
}
const notes = (accountId: string, key: Key) =>
  prisma.notification.findMany({
    where: {
      recipientAccountId: accountId,
      type: { in: ["contract.expiring", "contract.overdue"] },
      OR: [
        { body: { contains: `KTRK2 ${RUN} ${key} ` } },
        { body: { contains: `KTRK2 ${RUN} ${key},` } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

beforeAll(async () => {
  company = await createTestCompany(`R${RUN.slice(0, 7)}`, `KTRK2 ${RUN}`);
  otherCompany = await createTestCompany(`S${RUN.slice(0, 7)}`, `KTRK2 other ${RUN}`);
  department = (await prisma.department.create({ data: { name: `KTRK2 ${RUN}` } })).id;
  position = (
    await prisma.position.create({ data: { departmentId: department, name: `KTRK2 ${RUN}` } })
  ).id;
  const boss = await makeEmployee("boss", "PERMANENT");
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { companies: [company] });
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [otherCompany] });
  manager = await auth.loginAs("MANAGER", { employeeId: boss });
  const boss2 = await makeEmployee("boss2", "PERMANENT");
  manager2 = await auth.loginAs("MANAGER", { employeeId: boss2 });
  await makeEmployee("h30", "PKWT", { endIn: 20, stage: 2, managerId: boss });
  await makeEmployee("h7", "PKWT", { endIn: 5, managerId: boss2 });
  await makeEmployee("today", "PKWT", { endIn: 0 });
  await makeEmployee("lewat", "PKWT", { endIn: -3, stage: 3, managerId: boss });
  await makeEmployee("coba", "PROBATION", { endIn: 10 });
  await makeEmployee("cobaLama", "PROBATION", { endIn: 25 });
  await makeEmployee("limaPuluh", "PKWT", { endIn: 45 });
  await makeEmployee("tanpa", "PKWT", { stage: null });
  await makeEmployee("nonaktif", "PKWT", { endIn: -3, isActive: false });
  await makeEmployee("ptLain", "PKWT", { endIn: 5, companyId: otherCompany });
});
afterAll(async () => {
  // Cron memindai seluruh DB: hapus semua notifikasi kontrak yang dibuat selama test ini.
  await prisma.notification.deleteMany({
    where: { type: { in: ["contract.expiring", "contract.overdue"] }, createdAt: { gte: started } },
  });
  await auth.cleanup();
  await prisma.employee.updateMany({ where: { id: { in: employees } }, data: { managerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.delete({ where: { id: position } });
  await prisma.department.delete({ where: { id: department } });
  await prisma.company.deleteMany({ where: { id: { in: [company, otherCompany] } } });
  await prisma.employmentStatus.deleteMany({ where: { id: { in: createdStatuses } } });
  await disconnectPrisma();
});

describe("ambang pengingat (KTR-D5/D6)", () => {
  test.each([
    ["PKWT", 31, null],
    ["PKWT", 30, 30],
    ["PKWT", 8, 30],
    ["PKWT", 7, 7],
    ["PKWT", 0, 7],
    ["PKWT", -1, "overdue"],
    ["PROBATION", 15, null],
    ["PROBATION", 14, 14],
    ["PROBATION", 0, 14],
    ["PROBATION", -2, "overdue"],
  ] as const)("%s sisa %i hari → %p", (category, left, expected) => {
    expect(contractReminderThreshold(category, addContractDays(today, left), today)).toBe(expected);
  });
});

describe("cron contract-daily", () => {
  test("HR PT + atasan diberi pengingat; dedupe per ambang; lewat = harian; tanpa nonaktif otomatis", async () => {
    await remindContracts(now);
    const hrNotes = async (key: Key) => notes(hr.account.id, key);
    const h30 = await hrNotes("h30");
    expect(h30).toHaveLength(1);
    expect(h30[0]).toMatchObject({ type: "contract.expiring", title: "Kontrak akan berakhir" });
    expect(h30[0]?.body).toContain("Kontrak PKWT 2");
    expect(h30[0]?.body).toContain("20 hari lagi");
    expect(h30[0]?.body).toContain("Jadikan Karyawan Tetap");
    expect(h30[0]?.link).toBe(`/personal/pegawai-aktif/semua?pegawai=${ids.h30}&tab=work`);
    expect(await hrNotes("h7")).toHaveLength(1);
    expect((await hrNotes("today"))[0]?.body).toContain("berakhir hari ini");
    const lewat = await hrNotes("lewat");
    expect(lewat).toHaveLength(1);
    expect(lewat[0]).toMatchObject({ type: "contract.overdue", title: "Kontrak lewat" });
    expect(lewat[0]?.body).toContain("lewat 3 hari");
    const coba = await hrNotes("coba");
    expect(coba[0]).toMatchObject({ title: "Masa percobaan akan berakhir" });
    expect(coba[0]?.body).toContain("Lulus");
    // Di luar ambang / tanpa tanggal / nonaktif / PT lain → tidak ada notifikasi untuk HR PT ini.
    for (const key of ["cobaLama", "limaPuluh", "tanpa", "nonaktif", "ptLain"] as const)
      expect(await hrNotes(key)).toHaveLength(0);
    // HR PT lain hanya menerima karyawan PT-nya.
    expect(await notes(hrOther.account.id, "ptLain")).toHaveLength(1);
    expect(await notes(hrOther.account.id, "h30")).toHaveLength(0);
    // Atasan langsung ikut menerima untuk bawahannya saja.
    expect(await notes(manager.account.id, "h30")).toHaveLength(1);
    expect(await notes(manager.account.id, "lewat")).toHaveLength(1);
    // Atasan lain (manager2) hanya untuk bawahannya; notifikasi atasan tanpa tautan (bisa berakun Karyawan).
    expect(await notes(manager.account.id, "h7")).toHaveLength(0);
    const m2 = await notes(manager2.account.id, "h7");
    expect(m2).toHaveLength(1);
    expect(m2[0]?.link).toBeNull();
    expect(m2[0]?.body).toContain("bawahan Anda");
    expect(await notes(manager2.account.id, "h30")).toHaveLength(0);

    // Jalan ulang di hari yang sama → tidak dobel.
    await remindContracts(now);
    expect(await hrNotes("h30")).toHaveLength(1);
    expect(await hrNotes("lewat")).toHaveLength(1);

    // Besok: yang lewat diingatkan lagi (harian); ambang yang sama tidak diulang.
    await remindContracts(tomorrow);
    expect(await hrNotes("lewat")).toHaveLength(2);
    expect(await hrNotes("h30")).toHaveLength(1);

    // KTR-D5: tidak ada nonaktif / perubahan status otomatis.
    const after = await prisma.employee.findUniqueOrThrow({ where: { id: ids.lewat } });
    expect(after.isActive).toBe(true);
    expect(after.contractStage).toBe(3);
  });
});

describe("daftar Kontrak akan habis (KTR-D11)", () => {
  const list = async (login: Login, query: string) => {
    const res = await app.request(`/api/v1/employees?${query}`, { headers: login.headers });
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: { id: string }[] }).data.map((r) => r.id);
  };
  const q = `contractEndsWithin=60&sort=contractEndDate:asc&pageSize=100&q=${encodeURIComponent(`KTRK2 ${RUN}`)}`;
  test("SA & HR_ADMIN PT tanpa grant melihat daftar; urut akhir terdekat; cakupan PT dijaga", async () => {
    const hrRows = await list(hr, q);
    expect(hrRows).toEqual([
      ids.lewat,
      ids.today,
      ids.h7,
      ids.coba,
      ids.h30,
      ids.cobaLama,
      ids.limaPuluh,
    ]);
    expect(hrRows).not.toContain(ids.tanpa);
    expect(hrRows).not.toContain(ids.ptLain);
    expect(await list(hrOther, q)).toEqual([ids.ptLain]);
    expect(await list(sa, q)).toContain(ids.ptLain);
    const pkwtOnly = await list(hr, `${q}&category=PROBATION`);
    expect(pkwtOnly).toEqual([ids.coba, ids.cobaLama]);
    // MANAGER tetap hanya timnya (cakupan daftar karyawan yang sudah ada).
    expect((await list(manager, q)).sort()).toEqual([ids.h30, ids.lewat].sort());
    const bad = await app.request("/api/v1/employees?contractEndsWithin=0", {
      headers: sa.headers,
    });
    expect(bad.status).toBe(400);
  });
  test("summary.contractsEnding: segera (≤ 60 hari) & lewat, dalam cakupan PT", async () => {
    const res = await app.request(`/api/v1/employees/summary?companyId=${company}`, {
      headers: hr.headers,
    });
    const body = (await res.json()) as {
      data: { active: { contractsEnding: { soon: number; overdue: number } } };
    };
    expect(body.data.active.contractsEnding).toEqual({ soon: 6, overdue: 1 });
    // Tanpa companyId: cakupan HR tetap PT-nya (karyawan PT lain tidak terhitung).
    const scoped = await app.request("/api/v1/employees/summary", { headers: hrOther.headers });
    const other = (await scoped.json()) as {
      data: { active: { contractsEnding: { soon: number; overdue: number } } };
    };
    expect(other.data.active.contractsEnding).toEqual({ soon: 1, overdue: 0 });
  });
});
