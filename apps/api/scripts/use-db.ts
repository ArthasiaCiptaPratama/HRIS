// Tukar target database aktif di .env antara profil "local" (PostgreSQL Docker) dan
// "supabase" (pooler Supabase). Hanya menulis ulang DATABASE_URL, DIRECT_URL, dan
// STORAGE_PATH_PREFIX; kunci lain di .env tidak disentuh. Nilai profil dibaca dari
// LOCAL_* / SUPABASE_* yang Anda isi sekali di .env.
//
// Pakai (dari root repo):
//   bun run db:which            tampilkan target aktif (juga `bun run db:use` tanpa argumen)
//   bun run db:use local        pakai PostgreSQL lokal (Docker)
//   bun run db:use supabase     pakai Supabase (pooler)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { classifyUrl, hostOf } from "./db-target.ts";

// ENV_PATH bisa ditimpa untuk pengujian; default = .env di root monorepo (../../ dari apps/api).
const ENV_PATH =
  process.env.HRIS_ENV_FILE ?? path.join(import.meta.dirname, "..", "..", "..", ".env");

// Kunci aktif yang ikut ditukar saat berpindah profil.
const SWITCHED_KEYS = ["DATABASE_URL", "DIRECT_URL", "STORAGE_PATH_PREFIX"] as const;
type SwitchedKey = (typeof SWITCHED_KEYS)[number];

const PROFILES = {
  local: { label: "PostgreSQL lokal (Docker)", prefix: "LOCAL_" },
  supabase: { label: "Supabase (pooler)", prefix: "SUPABASE_" },
} as const;
type ProfileName = keyof typeof PROFILES;

const out = (line: string) => process.stdout.write(`${line}\n`);

function showCurrent(): void {
  const db = process.env.DATABASE_URL;
  const kind = classifyUrl(db);
  const label =
    kind === "local"
      ? "local — PostgreSQL lokal"
      : kind === "remote"
        ? "non-lokal (mis. Supabase)"
        : "(DATABASE_URL kosong)";
  out(`Target DB aktif     : ${label}`);
  out(`DATABASE_URL        → ${hostOf(db)}`);
  out(`DIRECT_URL          → ${hostOf(process.env.DIRECT_URL)}`);
  out(`STORAGE_PATH_PREFIX : ${process.env.STORAGE_PATH_PREFIX || "(kosong)"}`);
  out("");
  out("Tukar: bun run db:use local  |  bun run db:use supabase");
}

// Menulis ulang satu baris `KEY=...` tanpa `$`-interpolasi dan tanpa menyentuh akhir baris (CRLF/LF).
function replaceKey(text: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*`, "m");
  if (re.test(text)) return text.replace(re, () => `${key}=${value}`);
  const sep = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}${key}=${value}\n`;
}

function applyProfile(name: ProfileName): void {
  const { prefix, label } = PROFILES[name];
  const requiredVar = `${prefix}DATABASE_URL`;
  if (!process.env[requiredVar] || process.env[requiredVar]?.trim() === "") {
    out(`✘ Profil "${name}" belum dikonfigurasi: ${requiredVar} kosong di .env.`);
    out(`  Isi ${prefix}DATABASE_URL (dan ${prefix}DIRECT_URL) di .env lalu ulangi.`);
    process.exit(1);
  }

  let text = readFileSync(ENV_PATH, "utf8");
  const applied: Array<{ key: SwitchedKey; value: string }> = [];
  for (const key of SWITCHED_KEYS) {
    let value = process.env[`${prefix}${key}`];
    // DIRECT_URL opsional: bila profil tak mendefinisikannya, pakai DATABASE_URL (benar untuk lokal).
    if (key === "DIRECT_URL" && (value === undefined || value.trim() === "")) {
      value = process.env[`${prefix}DATABASE_URL`];
    }
    // STORAGE_PATH_PREFIX boleh "" (didefinisikan, mis. staging) atau absen (dilewati).
    if (value === undefined) continue;
    text = replaceKey(text, key, value);
    applied.push({ key, value });
  }
  writeFileSync(ENV_PATH, text);

  out(`✔ Target DB → ${name} (${label}). Ditulis ke .env:`);
  for (const { key, value } of applied) {
    const shown = key === "STORAGE_PATH_PREFIX" ? value || "(kosong)" : hostOf(value);
    out(`  ${key.padEnd(19)} → ${shown}`);
  }
  out("");
  out("Jalankan ulang 'bun run dev' agar API & Prisma membaca target baru.");
}

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
const target = positionals[0];

if (target === undefined) {
  showCurrent();
} else if (target === "local" || target === "supabase") {
  applyProfile(target);
} else {
  out(`✘ Target tidak dikenal: "${target}". Pilih salah satu: local | supabase.`);
  process.exit(1);
}
