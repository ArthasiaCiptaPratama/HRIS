// Membuat akun SUPER_ADMIN Utama pertama (PLAN §4.4, CODEMAP §2).
// Pakai: bun run bootstrap:super-admin -- --email nama@kantor.co.id [--dry-run]
// 1. Cari user Supabase Auth berdasarkan email; bila belum ada, buat (password diketik tersembunyi).
// 2. Buat/promosikan akun di DB target (DATABASE_URL) sebagai Super Admin Utama + audit.
// Idempoten: aman diulang ke DB mana pun (PLAN §3.3).
import { parseArgs } from "node:util";
import { z } from "zod";
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";
import { createSupabaseAdmin } from "../src/core/supabase-admin.ts";
import { bootstrapPrimarySuperAdmin } from "../src/modules/iam/index.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);

const { values } = parseArgs({
  options: { email: { type: "string" }, "dry-run": { type: "boolean", default: false } },
});

const email = z.email().safeParse(values.email?.trim().toLowerCase());
if (!email.success) {
  out("Gunakan: bun run bootstrap:super-admin -- --email nama@kantor.co.id [--dry-run]");
  process.exit(1);
}

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  })
  .safeParse(process.env);

async function readHiddenLine(label: string): Promise<string> {
  process.stdout.write(label);
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new Error("Password must be typed interactively (TTY required)");
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          stdin.setRawMode(false);
          reject(new Error("Cancelled"));
          return;
        }
        value = char === "\u007f" ? value.slice(0, -1) : value + char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const target = email.data as string;
  const primary = await getPrisma().account.findFirst({
    where: { isPrimarySuperAdmin: true },
    select: { email: true },
  });
  out(`DB target      : ${new URL(process.env.DATABASE_URL ?? "postgresql://?").host}`);
  out(`Email          : ${target}`);
  out(`Utama saat ini : ${primary ? primary.email : "(belum ada)"}`);

  if (values["dry-run"]) {
    out(
      env.success
        ? "Env Supabase   : lengkap"
        : `Env Supabase   : KURANG (${env.error.issues.map((i) => i.path.join(".")).join(", ")})`,
    );
    out(
      primary && primary.email !== target
        ? "Rencana        : DITOLAK — sudah ada Utama lain (pakai recover-primary-admin)"
        : primary
          ? "Rencana        : tidak ada perubahan (sudah Utama)"
          : "Rencana        : cari/buat user Auth, lalu buat akun Utama + audit",
    );
    out("Dry-run: tidak ada yang diubah, Supabase tidak dihubungi.");
    return;
  }

  if (!env.success) {
    throw new Error(
      `Env kurang: ${env.error.issues.map((i) => i.path.join(".")).join(", ")} (isi di .env root, jangan di-commit)`,
    );
  }
  const admin = createSupabaseAdmin(env.data.SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY);
  let user = await admin.findUserByEmail(target);
  if (user) {
    out(`User Auth      : ditemukan (${user.id})`);
  } else {
    const password = await readHiddenLine("Password baru untuk user Auth (min. 12 karakter): ");
    if (password.length < 12) throw new Error("Password terlalu pendek (min. 12 karakter)");
    user = await admin.createConfirmedUser(target, password);
    out(`User Auth      : dibuat (${user.id})`);
  }

  const result = await bootstrapPrimarySuperAdmin({ authUserId: user.id, email: target });
  out(`Akun HRIS      : ${result.outcome} (${result.accountId})`);
}

try {
  await main();
} catch (error) {
  // Pesan saja; tidak mencetak env/kunci.
  out(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
