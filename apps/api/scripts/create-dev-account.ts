// Membuat akun UJI (staging/lokal) untuk verifikasi tampilan per role. BUKAN untuk produksi.
// Pakai (password lewat env, bukan argumen):
//   DEV_ACCOUNT_PASSWORD='...' bun run dev:account -- --email hr@x --role HR_ADMIN [--employee-number ACP-2022-0006]
// 1. Cari/buat user Supabase Auth (terkonfirmasi, tanpa email) dengan password tersebut.
// 2. Buat/perbarui akun HRIS di DB target (DATABASE_URL) + tautan karyawan + audit. Idempoten.
import { parseArgs } from "node:util";
import { z } from "zod";
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";
import { createSupabaseAdmin } from "../src/core/supabase-admin.ts";
import { provisionAccount } from "../src/modules/iam/index.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    role: { type: "string" },
    "employee-number": { type: "string" },
  },
});

const input = z
  .object({
    email: z.email(),
    role: z.enum(["HR_ADMIN", "MANAGER", "EMPLOYEE"]),
    employeeNumber: z.string().optional(),
    password: z.string().min(12, "DEV_ACCOUNT_PASSWORD minimal 12 karakter"),
    supabaseUrl: z.url(),
    serviceRoleKey: z.string().min(20),
  })
  .safeParse({
    email: values.email?.trim().toLowerCase(),
    role: values.role,
    employeeNumber: values["employee-number"],
    password: process.env.DEV_ACCOUNT_PASSWORD,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

if (!input.success) {
  out(
    "Gunakan: DEV_ACCOUNT_PASSWORD='...' bun run dev:account -- --email <e> --role HR_ADMIN|MANAGER|EMPLOYEE [--employee-number <no>]",
  );
  out(`Masalah: ${input.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  process.exit(1);
}

async function main() {
  const { email, role, employeeNumber, password, supabaseUrl, serviceRoleKey } = input.data as {
    email: string;
    role: "HR_ADMIN" | "MANAGER" | "EMPLOYEE";
    employeeNumber?: string;
    password: string;
    supabaseUrl: string;
    serviceRoleKey: string;
  };
  if (process.env.NODE_ENV === "production") throw new Error("Tidak untuk produksi");
  // Script dev (seperti seed): membaca karyawan dummy langsung untuk menautkan akun.
  const employee = employeeNumber
    ? await getPrisma().employee.findUnique({
        where: { employeeNumber },
        select: { id: true, fullName: true },
      })
    : null;
  if (employeeNumber && !employee)
    throw new Error(`Karyawan ${employeeNumber} tidak ditemukan (jalankan db:seed?)`);

  const admin = createSupabaseAdmin(supabaseUrl, serviceRoleKey);
  const existing = await admin.findUserByEmail(email);
  const user = existing ?? (await admin.createConfirmedUser(email, password));
  const result = await provisionAccount({
    authUserId: user.id,
    email,
    role,
    employeeId: employee?.id ?? null,
  });
  out(
    `${email}: user Auth ${existing ? "sudah ada" : "dibuat"}; akun HRIS ${result.outcome} (${role}${employee ? `, ${employee.fullName}` : ""})`,
  );
  if (existing) out("  catatan: user Auth sudah ada → password TIDAK diubah oleh script ini.");
}

try {
  await main();
} catch (error) {
  out(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
