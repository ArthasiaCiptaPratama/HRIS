// Skenario UAT Time Management untuk Rina (karyawan), Joko (jetty/JT), atasan Budi, & HR — HANYA lokal.
// Pakai: bun run db:seed:acceptance   (dijalankan ulang = reset + isi ulang relatif ke hari ini)
// Prasyarat: db:seed:time -- --demo --accounts & db:seed:qa (karyawan TMDEMO-*, akun lokal, lokasi demo).
// Reset: absen/punch/lembur/koreksi/pernyataan/tukar shift/cuti/saldo/roster/approval Rina, Budi, Joko;
//   notifikasi & layout dashboard akun karyawan.lokal, manager.lokal, hr.lokal, hr.biaya, jetty.lokal;
//   shift/pola/crew/tanggal merah bertanda "Uji QA"; usulan lembur & approval yatim (karyawannya sudah
//   dihapus, sisa test integrasi). Akun, data induk, grant, audit, karyawan lain tetap.
// Isi: tanggal merah H-3 & H+4; Rina shift UQA 08–17 (Mulai istirahat 12–13), riwayat H-8..H-1 (telat,
//   pulang darurat, lembur hari OFF, tanggal merah, hari kerja, istirahat lebih), hari ini OFF, cuti H+6..H+7;
//   Joko shift UJT 07–15 aturan JT (lembur rutin 60 mnt, istirahat dibayar, Mulai istirahat 11–12), kerja
//   H-5..H-1 pulang 15.00 (1 j lembur rutin/hari; H-3 tanggal merah), hari ini kerja. Semua approval menunggu.
// Akun jetty.lokal dibuat dengan password yang sama dengan karyawan.lokal (hash disalin di Auth lokal).
import { createClient } from "@supabase/supabase-js";
import { SQL } from "bun";
import { createApp } from "../src/app.ts";
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";
import { createSupabaseAdmin } from "../src/core/supabase-admin.ts";
import { createSelfieUpload, punch } from "../src/modules/attendance/attendance.service.ts";
import { offsetMinutes } from "../src/modules/attendance/attendance-engine.ts";
import { readTimeSettings } from "../src/modules/attendance/calendar.service.ts";
import { withEmployeeCompanyScope } from "../src/modules/employee/index.ts";
import { loadActor, provisionAccount } from "../src/modules/iam/index.ts";
import { createLeaveRequest } from "../src/modules/leave/leave.service.ts";
import { isRemoteUrl } from "./db-target.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const prisma = getPrisma();
const TAG = "(Uji QA)";
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const EMAILS = {
  rina: "karyawan.lokal@arthasia.test",
  budi: "manager.lokal@arthasia.test",
  joko: "jetty.lokal@arthasia.test",
  hr: "hr.lokal@arthasia.test",
  hrCost: "hr.biaya@arthasia.test",
};

function assertLocal() {
  if (process.env.NODE_ENV === "production") throw new Error("Tidak untuk produksi");
  for (const key of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_URL"] as const) {
    if (isRemoteUrl(process.env[key])) throw new Error(`${key} bukan lokal — dibatalkan.`);
  }
  const authDb =
    process.env.LOCAL_SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (isRemoteUrl(authDb)) throw new Error("LOCAL_SUPABASE_DB_URL bukan lokal — dibatalkan.");
  return authDb;
}

async function reset(employeeIds: string[], accountIds: string[]) {
  const where = { employeeId: { in: employeeIds } };
  await prisma.approvalRequest.deleteMany({ where: { requesterEmployeeId: { in: employeeIds } } });
  await prisma.overtimeRequest.deleteMany({ where });
  await prisma.attendanceStatement.deleteMany({ where });
  await prisma.attendanceCorrection.deleteMany({ where });
  await prisma.rosterChangeRequest.deleteMany({ where });
  await prisma.attendanceDay.deleteMany({ where });
  await prisma.leaveLedger.deleteMany({ where });
  await prisma.leaveRequest.deleteMany({ where });
  await prisma.rosterDay.deleteMany({ where });
  await prisma.crewMember.deleteMany({ where });
  await prisma.notification.deleteMany({ where: { recipientAccountId: { in: accountIds } } });
  await prisma.dashboardLayout.deleteMany({ where: { accountId: { in: accountIds } } });
  await prisma.crew.deleteMany({ where: { name: { endsWith: TAG } } });
  await prisma.rosterPattern.deleteMany({ where: { name: { endsWith: TAG } } });
  await prisma.shift.deleteMany({ where: { name: { endsWith: TAG } } });
  await prisma.holiday.deleteMany({ where: { name: { endsWith: TAG } } });
  // Sisa test integrasi yang karyawannya sudah dihapus tampil sebagai baris "—" di layar HR.
  await prisma.$executeRaw`delete from attendance.overtime_requests o
    where not exists (select 1 from employee.employees e where e.id = o.employee_id)`;
  await prisma.$executeRaw`delete from approval.approval_requests a
    where not exists (select 1 from employee.employees e where e.id = a.requester_employee_id)`;
}

async function main() {
  const authDbUrl = assertLocal();
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY kosong.");
  createApp(); // memasang storage, handler approval, & integrasi lembur seperti server API

  const settings = await readTimeSettings();
  const offset = offsetMinutes(settings.timezone);
  const today = new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10);
  const at = (date: string, hhmm: string) =>
    new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - offset * 60_000);
  const day = (n: number) => addDays(today, n);

  const rina = await prisma.employee.findUnique({ where: { employeeNumber: "TMDEMO-EMP" } });
  const budi = await prisma.employee.findUnique({ where: { employeeNumber: "TMDEMO-MGR" } });
  if (!rina || !budi || !rina.workLocationId) {
    throw new Error(
      "Data demo belum ada — jalankan db:seed:time -- --demo --accounts lalu db:seed:qa.",
    );
  }
  const location = await prisma.workLocation.findUniqueOrThrow({
    where: { id: rina.workLocationId },
  });
  if (location.latitude === null || location.longitude === null)
    throw new Error("Lokasi demo tanpa koordinat.");
  const SITE = { latitude: Number(location.latitude), longitude: Number(location.longitude) };

  // Joko (jetty) — tim Budi, data induk seperti Rina.
  const joko =
    (await prisma.employee.findUnique({ where: { employeeNumber: "TMDEMO-JT" } })) ??
    (await prisma.employee.create({
      data: {
        companyId: rina.companyId,
        positionId: rina.positionId,
        employmentStatusId: rina.employmentStatusId,
        workLocationId: rina.workLocationId,
        gradeId: rina.gradeId,
        employeeNumber: "TMDEMO-JT",
        fullName: "Joko Jetty (Demo)",
        joinDate: D("2024-03-04"),
        gender: "MALE",
        managerId: budi.id,
      },
    }));

  // Akun jetty.lokal: password sama dengan karyawan.lokal (hash disalin di Auth lokal, tanpa membaca password).
  const admin = createSupabaseAdmin(supabaseUrl, serviceRoleKey);
  const existing = await admin.findUserByEmail(EMAILS.joko);
  const user =
    existing ??
    (await admin.createConfirmedUser(EMAILS.joko, crypto.randomUUID() + crypto.randomUUID()));
  const authDb = new SQL(authDbUrl);
  const copied = await authDb`
    update auth.users set encrypted_password = src.encrypted_password
    from auth.users src where src.email = ${EMAILS.rina} and auth.users.id = ${user.id}
    returning auth.users.id`;
  await authDb.close();
  if (copied.length !== 1)
    throw new Error(
      "Gagal menyamakan password jetty.lokal (karyawan.lokal tidak ada di Auth lokal).",
    );
  await provisionAccount({
    authUserId: user.id,
    email: EMAILS.joko,
    role: "EMPLOYEE",
    employeeId: joko.id,
  });

  const accounts = await prisma.account.findMany({
    where: { email: { in: Object.values(EMAILS) } },
  });
  const accountOf = (email: string) => {
    const a = accounts.find((x) => x.email === email);
    if (!a) throw new Error(`Akun ${email} tidak ada — jalankan db:seed:qa.`);
    return a;
  };
  await reset(
    [rina.id, budi.id, joko.id],
    accounts.map((a) => a.id),
  );
  out("Reset: data Rina, Budi, Joko + notifikasi & dashboard 5 akun dihapus.");

  // Upah grade mengikuti kisaran umum industri tambang (pokok + tunjangan tetap per bulan); di atas UMSP
  // batubara Kalsel 2026 Rp3,77 jt. Lalu jabatan & grade karyawan demo disesuaikan dengan pekerjaannya.
  const sa = await prisma.account.findFirst({ where: { role: "SUPER_ADMIN", isActive: true } });
  if (!sa) throw new Error("Belum ada akun SUPER_ADMIN.");
  const WAGES: [grade: string, basePay: number, fixedAllowance: number][] = [
    ["Staf", 5_700_000, 1_500_000],
    ["Staf Senior", 8_000_000, 2_000_000],
    ["Supervisor", 14_000_000, 4_000_000],
    ["Manajer", 30_000_000, 8_000_000],
    ["Direktur", 100_000_000, 25_000_000],
  ];
  const grades = new Map<string, string>();
  for (const [name, basePay, fixedAllowance] of WAGES) {
    const grade =
      (await prisma.grade.findFirst({ where: { name, deletedAt: null } })) ??
      (await prisma.grade.create({ data: { name } }));
    grades.set(name, grade.id);
    await prisma.gradeWage.upsert({
      where: { gradeId: grade.id },
      create: { gradeId: grade.id, basePay, fixedAllowance, updatedByAccountId: sa.id },
      update: { basePay, fixedAllowance, updatedByAccountId: sa.id },
    });
  }
  const JOBS: [employeeNumber: string, position: string, grade: string][] = [
    ["TMDEMO-EMP", "Administrasi", "Staf"],
    ["TMDEMO-JT", "Checker Jetty", "Staf"],
    ["TMDEMO-LAP", "Helper Bor", "Staf"],
    ["TMDEMO-EXIT", "GA Staff", "Staf"],
    ["TMDEMO-MGR", "Operations Manager", "Manajer"],
  ];
  for (const [employeeNumber, positionName, gradeName] of JOBS) {
    const position = await prisma.position.findFirst({
      where: { name: positionName, deletedAt: null },
    });
    if (!position) throw new Error(`Jabatan "${positionName}" tidak ada.`);
    await prisma.employee.updateMany({
      where: { employeeNumber },
      data: { positionId: position.id, gradeId: grades.get(gradeName) as string },
    });
  }
  out("Upah grade & jabatan karyawan demo disesuaikan.");

  // Tanggal merah uji & shift.
  await prisma.holiday.createMany({
    data: [
      { date: D(day(-3)), kind: "NATIONAL", name: `Tanggal Merah ${TAG}` },
      { date: D(day(4)), kind: "NATIONAL", name: `Tanggal Merah ${TAG}` },
    ],
  });
  const uqa = await prisma.shift.create({
    data: {
      companyId: rina.companyId,
      code: "UQA",
      name: `Kantor 08–17 ${TAG}`,
      startMinute: 480,
      endMinute: 1020,
      breakMin: 60,
      breakPaid: false,
      breakStartMinute: 720,
      breakEndMinute: 780,
      color: "#0ea5e9",
    },
  });
  const ujt = await prisma.shift.create({
    data: {
      companyId: rina.companyId,
      code: "UJT",
      name: `Jetty Pagi 07–15 ${TAG}`,
      startMinute: 420,
      endMinute: 900,
      breakMin: 60,
      breakPaid: true,
      regularOvertimeMin: 60,
      breakStartMinute: 660,
      breakEndMinute: 720,
      color: "#f59e0b",
    },
  });
  // Pola menentukan rumus lembur (5 hari / 6 hari); hari roster MANUAL tidak ditimpa pola.
  const crewOf = async (name: string, steps: string[]) => {
    const pattern = await prisma.rosterPattern.create({
      data: { companyId: rina.companyId, name: `${name} ${TAG}`, steps },
    });
    return prisma.crew.create({
      data: {
        companyId: rina.companyId,
        workLocationId: location.id,
        name: `${name} ${TAG}`,
        patternId: pattern.id,
        cycleStartDate: D(day(-8)),
      },
    });
  };
  const rinaCrew = await crewOf("Kantor 5+2", ["UQA", "UQA", "UQA", "UQA", "UQA", "OFF", "OFF"]);
  const jokoCrew = await crewOf("Jetty 6+1", ["UJT", "UJT", "UJT", "UJT", "UJT", "UJT", "OFF"]);

  // Roster: Rina OFF H-5, H-4, hari ini, H+2, H+3; Joko kerja H-5..hari ini, OFF H+1.
  const rinaOff = new Set([-5, -4, 0, 2, 3, 9, 10]);
  const jokoOff = new Set([-8, -7, -6, 1, 8]);
  const roster = [];
  for (let n = -8; n <= 14; n++) {
    roster.push(
      {
        employeeId: rina.id,
        workDate: D(day(n)),
        shiftId: rinaOff.has(n) ? null : uqa.id,
        crewId: rinaCrew.id,
        source: "MANUAL" as const,
      },
      {
        employeeId: joko.id,
        workDate: D(day(n)),
        shiftId: jokoOff.has(n) ? null : ujt.id,
        crewId: jokoCrew.id,
        source: "MANUAL" as const,
      },
    );
  }
  await prisma.rosterDay.createMany({ data: roster });

  // Saldo cuti Rina & Joko tahun ini.
  const year = Number(today.slice(0, 4));
  await prisma.leaveLedger.createMany({
    data: [rina, joko].map((e) => ({
      employeeId: e.id,
      companyId: e.companyId,
      year,
      kind: "GRANT" as const,
      days: 12,
      note: `Jatah uji ${TAG}`,
    })),
  });

  // Riwayat absen lewat service asli (approval & usulan lembur terbentuk seperti dari HP).
  const ctxOf = async (email: string) => {
    const account = accountOf(email);
    const actor = await loadActor(account.authUserId);
    if (!actor) throw new Error(`Aktor ${email} tidak termuat.`);
    return { actor: await withEmployeeCompanyScope(actor), userAgent: "seed-qa-acceptance" };
  };
  const storage = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const selfie = await Bun.file(new URL("./assets/qa-selfie.jpg", import.meta.url)).arrayBuffer();
  type Ctx = Awaited<ReturnType<typeof ctxOf>>;
  const punchAt = async (
    ctx: Ctx,
    kind: "IN" | "OUT" | "BREAK_START" | "BREAK_END",
    when: Date,
    extra = {},
  ) => {
    const upload = await createSelfieUpload(ctx, "image/jpeg");
    const { error } = await storage.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, selfie, { contentType: "image/jpeg" });
    if (error) throw new Error(`Unggah selfie gagal: ${error.message}`);
    await punch(
      ctx,
      { kind, ...SITE, accuracyM: 12, selfiePath: upload.path, confirmed: true, ...extra },
      when,
    );
  };
  const workday = async (
    ctx: Ctx,
    date: string,
    times: { in: string; out: string; breakStart?: string; breakEnd?: string },
    reasons: { in?: string; out?: string; offDay?: boolean } = {},
  ) => {
    await punchAt(ctx, "IN", at(date, times.in), {
      ...(reasons.in ? { reason: reasons.in } : {}),
      ...(reasons.offDay ? { offDayOvertime: true } : {}),
    });
    if (times.breakStart) await punchAt(ctx, "BREAK_START", at(date, times.breakStart));
    if (times.breakEnd) await punchAt(ctx, "BREAK_END", at(date, times.breakEnd));
    await punchAt(ctx, "OUT", at(date, times.out), reasons.out ? { reason: reasons.out } : {});
  };

  const rinaCtx = await ctxOf(EMAILS.rina);
  const normal = { breakStart: "12:00", breakEnd: "13:00" };
  await workday(rinaCtx, day(-8), { in: "07:55", out: "17:05", ...normal });
  await workday(
    rinaCtx,
    day(-7),
    { in: "08:40", out: "17:05", ...normal },
    { in: "Ban motor bocor di jalan" },
  );
  await workday(
    rinaCtx,
    day(-6),
    { in: "07:58", out: "14:00", ...normal },
    { out: "Anak sakit, dijemput dari sekolah" },
  );
  await workday(
    rinaCtx,
    day(-5),
    { in: "08:00", out: "13:00" },
    { in: "Lembur hari libur: stok opname gudang", offDay: true },
  );
  await workday(rinaCtx, day(-3), { in: "07:57", out: "17:02", ...normal }, {});
  await workday(rinaCtx, day(-2), { in: "07:56", out: "19:10", ...normal });
  await workday(rinaCtx, day(-1), {
    in: "07:59",
    out: "17:03",
    breakStart: "12:00",
    breakEnd: "13:30",
  });

  // Tepat 07.00–15.00: menit lebih di luar jadwal ikut dibulatkan ke atas per 30 mnt bersama lembur rutin.
  const jokoCtx = await ctxOf(EMAILS.joko);
  for (const n of [-5, -4, -3, -2, -1]) {
    await workday(jokoCtx, day(n), {
      in: "07:00",
      out: "15:00",
      breakStart: "11:00",
      breakEnd: "12:00",
    });
  }

  // Cuti tahunan Rina 2 hari ke depan (menunggu Atasan & HR).
  const annual = await prisma.leaveType.findUniqueOrThrow({ where: { code: "CUTI_TAHUNAN" } });
  await createLeaveRequest(rinaCtx, {
    leaveTypeId: annual.id,
    startDate: day(6),
    endDate: day(7),
    reason: "Acara keluarga di luar kota",
  });

  const overtime = await prisma.overtimeRequest.findMany({
    where: { employeeId: { in: [rina.id, joko.id] } },
    orderBy: [{ employeeId: "asc" }, { workDate: "asc" }],
  });
  out(
    `Selesai (hari ini ${today}, zona ${settings.timezone}). Tanggal merah uji: ${day(-3)}, ${day(4)}.`,
  );
  for (const o of overtime) {
    out(
      `  lembur ${o.employeeId === rina.id ? "Rina" : "Joko"} ${o.workDate.toISOString().slice(0, 10)} ${o.dayType} rutin ${o.regularMin} mnt, usulan ${o.proposedMin} mnt (${Number(o.equivalentHours)} j setara)`,
    );
  }
  out(
    `  Akun jetty.lokal@arthasia.test ${existing ? "sudah ada" : "dibuat"} (password = karyawan.lokal).`,
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
