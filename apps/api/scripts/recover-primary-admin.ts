// Pemulihan status Super Admin Utama (PLAN §4.4): dipakai HANYA bila akun Utama hilang total.
// Dijalankan manual oleh developer di server; tidak bisa dari aplikasi. Tercatat di audit.
// Pakai: bun run recover:primary-admin -- --to-email sa@kantor.co.id --reason "..." [--dry-run]
import { parseArgs } from "node:util";
import { z } from "zod";
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";
import { recoverPrimarySuperAdmin } from "../src/modules/iam/index.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const { values } = parseArgs({
  options: {
    "to-email": { type: "string" },
    reason: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const input = z
  .object({ toEmail: z.email(), reason: z.string().trim().min(10, "alasan minimal 10 karakter") })
  .safeParse({ toEmail: values["to-email"]?.trim().toLowerCase(), reason: values.reason });
if (!input.success) {
  out(
    'Gunakan: bun run recover:primary-admin -- --to-email <email SUPER_ADMIN> --reason "<alasan>" [--dry-run]',
  );
  out(`Masalah: ${input.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  process.exit(1);
}

async function main() {
  const { toEmail, reason } = input.data as { toEmail: string; reason: string };
  const prisma = getPrisma();
  const [current, target] = await Promise.all([
    prisma.account.findFirst({ where: { isPrimarySuperAdmin: true }, select: { email: true } }),
    prisma.account.findUnique({
      where: { email: toEmail },
      select: { role: true, isActive: true },
    }),
  ]);
  out(`DB target      : ${new URL(process.env.DATABASE_URL ?? "postgresql://?").host}`);
  out(`Utama saat ini : ${current?.email ?? "(tidak ada)"}`);
  out(
    `Akun tujuan    : ${toEmail} ${target ? `(${target.role}, ${target.isActive ? "aktif" : "nonaktif"})` : "(tidak ditemukan)"}`,
  );
  if (values["dry-run"]) {
    const valid = target?.role === "SUPER_ADMIN" && target.isActive;
    out(
      `Rencana        : ${valid ? (current?.email === toEmail ? "tidak ada perubahan" : "pindahkan status Utama + audit") : "DITOLAK — tujuan harus SUPER_ADMIN aktif"}`,
    );
    out("Dry-run: tidak ada yang diubah.");
    return;
  }
  const result = await recoverPrimarySuperAdmin({ targetEmail: toEmail, reason });
  out(`Hasil          : ${result.outcome} (akun ${result.accountId})`);
}

try {
  await main();
} catch (error) {
  out(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
