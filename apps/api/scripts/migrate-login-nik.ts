// D-048: pindahkan akun yang tertaut karyawan APPROVED ke login NIK (email Auth → alamat turunan).
// SEKALI JALAN per lingkungan, dengan izin pemilik projek. Default DRY-RUN (tidak mengubah apa pun).
//
//   bun run auth:migrate-login-nik                                   # dry-run: daftar yang akan diubah
//   bun run auth:migrate-login-nik -- --apply --domain=<LOGIN_EMAIL_DOMAIN> [--only=a@x.com,b@y.com]
//
// --domain wajib SAMA dengan LOGIN_EMAIL_DOMAIN di .env (konfirmasi lingkungan). Auth staging dipakai
// bersama DB lokal (D-023): JANGAN dijalankan di lokal untuk akun uji bersama (hr/mgr/emp) sebelum
// staging ikut dirilis — login mereka di staging akan berubah juga.
import { loginEmailFor } from "@hris/shared";
import { z } from "zod";
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";
import { createSupabaseAdmin } from "../src/core/supabase-admin.ts";
import { applyNikLogin } from "../src/modules/iam/index.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes("--apply");

const env = z
  .object({
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    LOGIN_EMAIL_DOMAIN: z.string().min(3),
  })
  .safeParse(process.env);
if (!env.success) {
  out("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, dan LOGIN_EMAIL_DOMAIN wajib diisi di .env.");
  process.exit(1);
}
const domain = env.data.LOGIN_EMAIL_DOMAIN;
if (apply && arg("domain") !== domain) {
  out(`--apply butuh --domain=${domain} (konfirmasi lingkungan; harus sama dengan .env).`);
  process.exit(1);
}
const only = arg("only")
  ?.split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const prisma = getPrisma();
const accounts = await prisma.account.findMany({
  where: {
    loginEmail: null,
    isActive: true,
    employeeId: { not: null },
    employee: { onboardingStatus: "APPROVED", isActive: true },
    ...(only ? { email: { in: only } } : {}),
  },
  select: {
    id: true,
    email: true,
    employeeId: true,
    employee: { select: { employeeNumber: true } },
  },
  orderBy: { email: "asc" },
});

out(`${apply ? "APPLY" : "DRY-RUN"} — domain ${domain} — ${accounts.length} akun`);
const authAdmin = createSupabaseAdmin(env.data.SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY);
let switched = 0;
let failed = 0;
for (const account of accounts) {
  const employeeNumber = account.employee?.employeeNumber as string;
  const target = loginEmailFor(employeeNumber, domain);
  if (!apply) {
    out(`  ${account.email} → ${target}`);
    continue;
  }
  try {
    const outcome = await prisma.$transaction((tx) =>
      applyNikLogin(account.employeeId as string, employeeNumber, { authAdmin, domain }, tx),
    );
    if (outcome === "switched") switched += 1;
    out(`  ${account.email} → ${target}: ${outcome}`);
  } catch (error) {
    failed += 1;
    out(`  ${account.email}: GAGAL (${error instanceof Error ? error.message : String(error)})`);
  }
}
if (apply) out(`Selesai: ${switched} dipindah, ${failed} gagal.`);
else out("Tidak ada yang diubah. Jalankan dengan --apply --domain=<domain> setelah izin.");
await disconnectPrisma();
