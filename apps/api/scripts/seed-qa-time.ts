// Data & akun UJI untuk pengujian Paket 1–3 Time Management + dashboard analitik (TM-D6–TM-D11, DSB-D1).
// HANYA DB & Auth lokal (dijaga guard-local-db). Idempoten: aman dijalankan berulang.
// Prasyarat: `bun run db:seed:time -- --demo --accounts` (karyawan TMDEMO-*, shift D/N, lokasi demo).
// Pakai (password lewat env, bukan argumen):
//   DEV_ACCOUNT_PASSWORD='...' bun run db:seed:qa
// Membuat / memastikan:
//   - upah grade "Staf" 5,7 jt + 1,5 jt; Rina & karyawan uji ber-grade Staf
//   - lokasi "Site Demo Absen (Lokal)" wajib absen istirahat
//   - karyawan TMDEMO-LAP (Dimas, tim Budi, lokasi demo) + roster shift QA (08–17) 14 hari ke depan
//   - karyawan keluar TMDEMO-EXIT (resign 30 Sep 2026, sisa cuti 9 hari) untuk tab "Karyawan keluar"
//   - akun hr.biaya@arthasia.test (HR + grant Biaya & data pribadi) dan lapangan.lokal@arthasia.test
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";
import { createSupabaseAdmin } from "../src/core/supabase-admin.ts";
import { provisionAccount } from "../src/modules/iam/index.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const prisma = getPrisma();
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Tidak untuk produksi");
  const password = process.env.DEV_ACCOUNT_PASSWORD ?? "";
  if (password.length < 12) throw new Error("DEV_ACCOUNT_PASSWORD minimal 12 karakter.");
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY kosong.");

  const rina = await prisma.employee.findUnique({ where: { employeeNumber: "TMDEMO-EMP" } });
  const budi = await prisma.employee.findUnique({ where: { employeeNumber: "TMDEMO-MGR" } });
  if (!rina || !budi)
    throw new Error("Data demo belum ada — jalankan db:seed:time -- --demo --accounts.");
  const sa = await prisma.account.findFirst({ where: { role: "SUPER_ADMIN", isActive: true } });
  if (!sa) throw new Error("Belum ada akun SUPER_ADMIN.");

  // Upah grade Staf.
  const grade =
    (await prisma.grade.findFirst({ where: { name: "Staf", deletedAt: null } })) ??
    (await prisma.grade.create({ data: { name: "Staf" } }));
  await prisma.gradeWage.upsert({
    where: { gradeId: grade.id },
    create: {
      gradeId: grade.id,
      basePay: 5_700_000,
      fixedAllowance: 1_500_000,
      updatedByAccountId: sa.id,
    },
    update: {},
  });
  if (!rina.gradeId)
    await prisma.employee.update({ where: { id: rina.id }, data: { gradeId: grade.id } });

  // Lokasi demo wajib absen istirahat.
  const location = rina.workLocationId
    ? await prisma.workLocation.findUnique({ where: { id: rina.workLocationId } })
    : null;
  if (location) {
    const row = await prisma.timeSetting.findUnique({ where: { key: "breakLocations" } });
    const ids = new Set(
      (row?.value as { workLocationIds?: string[] } | null)?.workLocationIds ?? [],
    );
    ids.add(location.id);
    await prisma.timeSetting.upsert({
      where: { key: "breakLocations" },
      create: {
        key: "breakLocations",
        value: { workLocationIds: [...ids] },
        updatedByAccountId: sa.id,
      },
      update: { value: { workLocationIds: [...ids] } },
    });
  }

  // Karyawan lapangan (tim Budi) + roster shift D 14 hari ke depan.
  const base = {
    companyId: rina.companyId,
    positionId: rina.positionId,
    employmentStatusId: rina.employmentStatusId,
    workLocationId: rina.workLocationId,
    gradeId: grade.id,
  };
  const dimas =
    (await prisma.employee.findUnique({ where: { employeeNumber: "TMDEMO-LAP" } })) ??
    (await prisma.employee.create({
      data: {
        ...base,
        employeeNumber: "TMDEMO-LAP",
        fullName: "Dimas Lapangan (Demo)",
        joinDate: D("2023-01-09"),
        gender: "MALE",
        managerId: budi.id,
      },
    }));
  // Shift uji kantor 08.00–17.00, istirahat 60 menit tidak dibayar (alur absen istirahat & lembur TM-D6/D7).
  const shift = await prisma.shift.upsert({
    where: { companyId_code: { companyId: rina.companyId, code: "QA" } },
    create: {
      companyId: rina.companyId,
      code: "QA",
      name: "Kantor Uji QA 08.00–17.00",
      startMinute: 480,
      endMinute: 1020,
      breakMin: 60,
      breakPaid: false,
      color: "#0ea5e9",
    },
    update: {},
  });
  for (let i = 0; i < 14; i++) {
    const workDate = D(addDays(today, i));
    await prisma.rosterDay.upsert({
      where: { employeeId_workDate: { employeeId: dimas.id, workDate } },
      create: { employeeId: dimas.id, workDate, shiftId: shift.id, source: "MANUAL" },
      update: { shiftId: shift.id },
    });
  }

  // Karyawan keluar (resign) dengan sisa cuti → tab Saldo Cuti › Karyawan keluar.
  const exit =
    (await prisma.employee.findUnique({ where: { employeeNumber: "TMDEMO-EXIT" } })) ??
    (await prisma.employee.create({
      data: {
        ...base,
        employeeNumber: "TMDEMO-EXIT",
        fullName: "Sari Keluar (Demo)",
        joinDate: D("2021-03-01"),
        gender: "FEMALE",
        managerId: budi.id,
        isActive: false,
        endDate: D("2026-09-30"),
        exitReason: "RESIGNATION",
      },
    }));
  if ((await prisma.leaveLedger.count({ where: { employeeId: exit.id, year: 2026 } })) === 0) {
    await prisma.leaveLedger.createMany({
      data: [
        {
          employeeId: exit.id,
          companyId: exit.companyId,
          year: 2026,
          kind: "GRANT",
          days: 12,
          note: "Jatah penuh",
        },
        {
          employeeId: exit.id,
          companyId: exit.companyId,
          year: 2026,
          kind: "USE",
          days: -3,
          note: "Data uji",
        },
      ],
    });
  }

  // Akun uji.
  const admin = createSupabaseAdmin(supabaseUrl, serviceRoleKey);
  const account = async (
    email: string,
    role: "HR_ADMIN" | "EMPLOYEE",
    employeeId: string | null,
  ) => {
    const existing = await admin.findUserByEmail(email);
    const user = existing ?? (await admin.createConfirmedUser(email, password));
    const result = await provisionAccount({ authUserId: user.id, email, role, employeeId });
    out(
      `  ${email}: Auth ${existing ? "sudah ada (password tidak diubah)" : "dibuat"} · akun ${result.outcome}`,
    );
    return prisma.account.findUniqueOrThrow({ where: { email } });
  };
  const hr = await account("hr.biaya@arthasia.test", "HR_ADMIN", null);
  await prisma.accountCompany.upsert({
    where: { accountId_companyId: { accountId: hr.id, companyId: rina.companyId } },
    create: { accountId: hr.id, companyId: rina.companyId },
    update: {},
  });
  for (const permission of ["LABOR_COST_READ", "EMPLOYEE_PERSONAL_READ"] as const) {
    const has = await prisma.permissionGrant.findFirst({
      where: { accountId: hr.id, permission, revokedAt: null },
    });
    if (!has) {
      await prisma.permissionGrant.create({
        data: {
          accountId: hr.id,
          permission,
          grantedBy: sa.id,
          reason: "Akun uji QA Time Management",
        },
      });
    }
  }
  await account("lapangan.lokal@arthasia.test", "EMPLOYEE", dimas.id);

  out("Selesai. Data uji QA Time Management siap (DB & Auth lokal).");
  out(
    `  Lokasi wajib istirahat: ${location?.name ?? "—"} · Dimas: shift QA 08.00–17.00, 14 hari mulai ${today}`,
  );
}

try {
  await main();
} catch (error) {
  out(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
