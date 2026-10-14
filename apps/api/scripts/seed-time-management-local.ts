// Data Time Management untuk DB LOKAL masing-masing pengembang. Ditolak bila DATABASE_URL bukan lokal;
// tidak pernah menyentuh database Supabase. Idempoten (aman dijalankan berulang). Semua nama FIKTIF.
//
//   bun run db:seed:time                     → libur resmi SKB 3 Menteri (2026–2027) + Master Cuti tahun ini
//   bun run db:seed:time -- --demo           → + data demo: site ber-geofence, shift D/N, pola 4D-4N-2OFF,
//                                              crew, 3 karyawan demo (manager, karyawan, SA), roster, saldo cuti
//   bun run db:seed:time -- --demo --accounts → + akun login demo (MEMBUAT user di Supabase Auth project
//                                              pada SUPABASE_URL — pakai hanya bila project Auth Anda sendiri)
//
//   DEMO_LAT / DEMO_LNG   titik site demo (bawaan Kantor Pusat Jakarta) supaya absen "di dalam radius"
//   DEV_ACCOUNT_PASSWORD  password akun demo baru (≥ 12 karakter); tanpa itu dibuat acak & dicetak sekali
//
// Syarat: `bun run db:migrate` (skema terbaru) dan `bun run db:seed` (PT ACP & master data) sudah jalan.
import { randomBytes } from "node:crypto";
import { DEFAULT_ANNUAL_QUOTA, OFFICIAL_HOLIDAYS_ID } from "@hris/shared";
import { writeAudit } from "../src/core/audit.ts";
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";
import { createSupabaseAdmin } from "../src/core/supabase-admin.ts";
import { extendAllRosters, readTimeSettings } from "../src/modules/attendance/index.ts";
import { provisionAccount } from "../src/modules/iam/index.ts";
import { hostOf, isRemoteUrl } from "./db-target.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
if (process.env.NODE_ENV === "production") throw new Error("Tidak untuk produksi");
if (isRemoteUrl(process.env.DATABASE_URL)) {
  out(`✘ Ditolak: DATABASE_URL bukan DB lokal (${hostOf(process.env.DATABASE_URL)}).`);
  process.exit(1);
}
const WITH_DEMO = process.argv.includes("--demo");
const WITH_ACCOUNTS = process.argv.includes("--accounts");

const SITE_NAME = "Site Demo Absen (Lokal)";
const LAT = Number(process.env.DEMO_LAT ?? -6.175392);
const LNG = Number(process.env.DEMO_LNG ?? 106.827153);
const PEOPLE = {
  mgr: {
    number: "TMDEMO-MGR",
    name: "Budi Santoso (Demo Manager)",
    email: "manager.lokal@arthasia.test",
    role: "MANAGER" as const,
  },
  emp: {
    number: "TMDEMO-EMP",
    name: "Rina Lestari (Demo Karyawan)",
    email: "karyawan.lokal@arthasia.test",
    role: "EMPLOYEE" as const,
  },
};
const SA_EMAIL = "superadmin.lokal@arthasia.test";
const SA_EMPLOYEE = { number: "TMDEMO-SA", name: "Super Admin Lokal (Demo)" };
const HR = { email: "hr.lokal@arthasia.test", role: "HR_ADMIN" as const };
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};

/** Libur resmi (tanggal yang sudah ada tidak ditimpa) & Master Cuti tahun berjalan. */
async function seedCalendar(year: number) {
  const prisma = getPrisma();
  for (const [y, list] of Object.entries(OFFICIAL_HOLIDAYS_ID)) {
    const r = await prisma.holiday.createMany({
      data: list.map((h) => ({ date: D(h.date), name: h.name, kind: h.kind })),
      skipDuplicates: true,
    });
    out(`  Libur resmi ${y}: ${r.count} ditambahkan (${list.length - r.count} sudah ada)`);
  }
  await prisma.leaveYear.upsert({
    where: { year },
    create: { year, quota: DEFAULT_ANNUAL_QUOTA, isActive: true },
    update: {},
  });
  out(`  Master Cuti ${year}: kuota ${DEFAULT_ANNUAL_QUOTA} hari (bila belum ada)`);
}

async function seedDemo(today: string, hour: number) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({ where: { code: "ACP" } });
  if (!company) throw new Error("PT ACP tidak ada (jalankan bun run db:seed).");
  const template = await prisma.employee.findFirst({
    where: { companyId: company.id, isActive: true, onboardingStatus: "APPROVED" },
    select: { employmentStatusId: true, positionId: true },
  });
  if (!template) throw new Error("Belum ada karyawan contoh (jalankan bun run db:seed).");

  // Site ber-geofence (radius 300 m).
  const site =
    (await prisma.workLocation.findFirst({ where: { name: SITE_NAME } })) ??
    (await prisma.workLocation.create({
      data: { name: SITE_NAME, city: "Demo", latitude: LAT, longitude: LNG, radiusM: 300 },
    }));
  await prisma.workLocation.update({
    where: { id: site.id },
    data: { latitude: LAT, longitude: LNG, radiusM: 300 },
  });

  // Karyawan demo: manager & bawahannya (atasan = penentu langkah "Atasan"), plus data karyawan SA.
  const upsertEmployee = async (p: { number: string; name: string }, managerId: string | null) =>
    prisma.employee.upsert({
      where: { employeeNumber: p.number },
      create: {
        employeeNumber: p.number,
        fullName: p.name,
        joinDate: D("2024-03-01"),
        companyId: company.id,
        employmentStatusId: template.employmentStatusId,
        positionId: template.positionId,
        managerId,
        workLocationId: site.id,
      },
      update: { fullName: p.name, managerId, workLocationId: site.id, isActive: true },
    });
  const mgr = await upsertEmployee(PEOPLE.mgr, null);
  const emp = await upsertEmployee(PEOPLE.emp, mgr.id);
  const sa = await upsertEmployee({ number: SA_EMPLOYEE.number, name: SA_EMPLOYEE.name }, null);
  const everyone = [mgr.id, emp.id, sa.id];

  // Shift D (07–19) & N (19–07) di zona waktu pengaturan, pola 4D-4N-2OFF, crew demo.
  const shift = (code: string, name: string, start: number, end: number, color: string) =>
    prisma.shift.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      create: { companyId: company.id, code, name, startMinute: start, endMinute: end, color },
      update: { deletedAt: null },
    });
  const day = await shift("D", "Day", 7 * 60, 19 * 60, "#0f766e");
  const night = await shift("N", "Night", 19 * 60, 7 * 60, "#4338ca");
  const patternName = "Demo 4D-4N-2OFF";
  const pattern =
    (await prisma.rosterPattern.findFirst({
      where: { companyId: company.id, name: patternName },
    })) ??
    (await prisma.rosterPattern.create({
      data: {
        companyId: company.id,
        name: patternName,
        steps: ["D", "D", "D", "D", "N", "N", "N", "N", "OFF", "OFF"],
      },
    }));
  const crewName = "Crew Demo";
  const crew =
    (await prisma.crew.findFirst({ where: { companyId: company.id, name: crewName } })) ??
    (await prisma.crew.create({
      data: {
        companyId: company.id,
        workLocationId: site.id,
        name: crewName,
        patternId: pattern.id,
        cycleStartDate: D(today),
      },
    }));
  for (const employeeId of everyone) {
    const member = await prisma.crewMember.findFirst({ where: { crewId: crew.id, employeeId } });
    if (!member) {
      await prisma.crewMember.create({
        data: { crewId: crew.id, employeeId, startDate: D("2024-03-01") },
      });
    }
  }
  await extendAllRosters();
  // Hari ini mengikuti jam sekarang supaya bisa langsung Clock In (sumber: manual).
  const todayShift = hour >= 5 && hour < 17 ? day : night;
  for (const employeeId of everyone) {
    await prisma.rosterDay.upsert({
      where: { employeeId_workDate: { employeeId, workDate: D(today) } },
      create: {
        employeeId,
        workDate: D(today),
        shiftId: todayShift.id,
        crewId: crew.id,
        source: "MANUAL",
      },
      update: { shiftId: todayShift.id, source: "MANUAL" },
    });
  }

  // Saldo cuti demo tahun berjalan (12 hari) bila belum ada.
  const year = Number(today.slice(0, 4));
  for (const employeeId of everyone) {
    const has = await prisma.leaveLedger.count({
      where: { employeeId, year, kind: { in: ["GRANT", "ADJUST"] } },
    });
    if (!has) {
      await prisma.leaveLedger.create({
        data: {
          employeeId,
          companyId: company.id,
          year,
          kind: "ADJUST",
          days: 12,
          note: "Saldo demo lokal",
        },
      });
    }
  }

  // Tautkan akun Super Admin lokal (bila ada di DB lokal) ke data karyawannya supaya bisa absen.
  const saAccount = await prisma.account.findFirst({ where: { email: SA_EMAIL } });
  if (saAccount && saAccount.employeeId !== sa.id) {
    await prisma.account.update({ where: { id: saAccount.id }, data: { employeeId: sa.id } });
    await writeAudit({
      actorAccountId: null,
      action: "iam.account.provision_script",
      entityType: "iam.account",
      entityId: saAccount.id,
      before: { employeeId: saAccount.employeeId },
      after: { employeeId: sa.id },
      reason: "seed-time-management-local: SA lokal dapat absen",
      requestId: null,
      ip: null,
    });
  }

  out(`  Site      : ${SITE_NAME} @ ${LAT}, ${LNG} (radius 300 m)`);
  out(`  Shift     : D 07:00–19:00, N 19:00–07:00 · pola ${patternName} · ${crewName}`);
  out(`  Hari ini  : ${today} = shift ${todayShift.code}`);
  out(
    `  Karyawan  : ${PEOPLE.mgr.number} (manager), ${PEOPLE.emp.number} (atasan = manager), ${SA_EMPLOYEE.number}`,
  );
  if (!saAccount)
    out(`  Catatan   : akun ${SA_EMAIL} tidak ada di DB ini — SA lokal belum ditautkan.`);
  return { companyId: company.id, mgrId: mgr.id, empId: emp.id };
}

/** Akun login demo — MEMBUAT user di Supabase Auth project (hanya dengan --accounts). */
async function seedAccounts(ids: { companyId: string; mgrId: string; empId: string }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey)
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi.");
  const admin = createSupabaseAdmin(supabaseUrl, serviceKey);
  const password =
    process.env.DEV_ACCOUNT_PASSWORD ?? `Demo-${randomBytes(9).toString("base64url")}`;
  if (password.length < 12) throw new Error("DEV_ACCOUNT_PASSWORD minimal 12 karakter.");
  const created: string[] = [];
  const ensure = async (email: string) => {
    const existing = await admin.findUserByEmail(email);
    if (!existing) created.push(email);
    return existing ?? (await admin.createConfirmedUser(email, password));
  };
  for (const [key, p] of Object.entries(PEOPLE)) {
    const user = await ensure(p.email);
    await provisionAccount({
      authUserId: user.id,
      email: p.email,
      role: p.role,
      employeeId: key === "mgr" ? ids.mgrId : ids.empId,
    });
  }
  // HR_ADMIN demo (PT ACP): langkah HR, dan langkah atasan untuk pengaju tanpa atasan (SA).
  const hrUser = await ensure(HR.email);
  const hr = await provisionAccount({
    authUserId: hrUser.id,
    email: HR.email,
    role: HR.role,
    employeeId: null,
  });
  await getPrisma().accountCompany.upsert({
    where: { accountId_companyId: { accountId: hr.accountId, companyId: ids.companyId } },
    create: { accountId: hr.accountId, companyId: ids.companyId },
    update: {},
  });
  out(`  Akun      : ${PEOPLE.mgr.email}, ${PEOPLE.emp.email}, ${HR.email}`);
  if (created.length) out(`  Password (akun baru: ${created.join(", ")}): ${password}`);
  else out("  Akun sudah ada sebelumnya — password tidak diubah.");
}

async function main() {
  const { timezone } = await readTimeSettings();
  const local = new Date(Date.now() + (OFFSET_H[timezone] ?? 7) * 3600_000);
  const today = local.toISOString().slice(0, 10);
  out(`Time Management lokal (zona waktu ${timezone}, DB ${hostOf(process.env.DATABASE_URL)})`);
  await seedCalendar(Number(today.slice(0, 4)));
  if (WITH_DEMO) {
    const ids = await seedDemo(today, local.getUTCHours());
    if (WITH_ACCOUNTS) await seedAccounts(ids);
    else out("  Akun login demo tidak dibuat (tambahkan --accounts bila perlu).");
  }
  out("✔ Selesai.");
}

try {
  await main();
} catch (error) {
  out(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
