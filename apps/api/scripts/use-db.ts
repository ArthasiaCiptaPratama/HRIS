// Tukar target database aktif di .env antara profil "local" (PostgreSQL Docker) dan
// "supabase" (pooler Supabase). Menulis ulang DATABASE_URL, DIRECT_URL, dan
// STORAGE_PATH_PREFIX; kunci lain di .env tidak disentuh. Nilai profil dibaca dari
// LOCAL_* / SUPABASE_* yang Anda isi sekali di .env.
//
// Mode TERPISAH PENUH (opsional): bila LOCAL_SUPABASE_URL diisi (Supabase lokal, `bun run auth:local:up`),
// kunci Auth/Storage ikut ditukar — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY — dari LOCAL_<kunci> (profil local) atau STAGING_<kunci> (profil supabase).
// STAGING_<kunci> dicadangkan otomatis dari nilai aktif saat pertama kali pindah ke local.
// Tanpa LOCAL_SUPABASE_URL perilaku lama tetap: Auth & Storage selalu Supabase staging.
//
// Pakai (dari root repo):
//   bun run db:which            tampilkan target aktif (juga `bun run db:use` tanpa argumen)
//   bun run db:use local        pakai PostgreSQL lokal (Docker)
//   bun run db:use supabase     pakai Supabase (pooler)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { classifyUrl, hostOf, isRemoteUrl } from "./db-target.ts";

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

// Mode terpisah penuh: kunci Auth/Storage per profil (LOCAL_<kunci> / STAGING_<kunci>).
export const AUTH_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
] as const;
const AUTH_PREFIX: Record<ProfileName, string> = { local: "LOCAL_", supabase: "STAGING_" };
const SECRET_KEYS = new Set(["SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY"]);

const filled = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

const out = (line: string) => process.stdout.write(`${line}\n`);

function showAuth(): void {
  const url = process.env.SUPABASE_URL;
  const mode = filled(process.env.LOCAL_SUPABASE_URL) ? "terpisah penuh" : "DB saja";
  out(
    `Auth & Storage      : ${isRemoteUrl(url) ? "Supabase staging" : "Supabase LOKAL"} → ${hostOf(url)}`,
  );
  out(`Mode switch         : ${mode}`);
}

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
  showAuth();
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
  const auth = filled(process.env.LOCAL_SUPABASE_URL) ? switchAuth(name, text) : undefined;
  if (auth) text = auth.text;
  writeFileSync(ENV_PATH, text);

  out(`✔ Target DB → ${name} (${label}). Ditulis ke .env:`);
  for (const { key, value } of applied) {
    const shown = key === "STORAGE_PATH_PREFIX" ? value || "(kosong)" : hostOf(value);
    out(`  ${key.padEnd(19)} → ${shown}`);
  }
  if (auth) {
    for (const { key, value } of auth.applied) {
      const shown = SECRET_KEYS.has(key) ? "(terisi)" : hostOf(value);
      out(`  ${key.padEnd(25)} → ${shown}`);
    }
    for (const key of auth.backedUp)
      out(`  (cadangan ${AUTH_PREFIX.supabase}${key} dibuat dari nilai aktif)`);
  } else {
    out(
      "  Auth & Storage tetap Supabase staging (isi LOCAL_SUPABASE_URL untuk mode terpisah penuh).",
    );
  }
  out("");
  out("Jalankan ulang 'bun run dev' agar API, Prisma & web (VITE_*) membaca target baru.");
}

/** Mode terpisah penuh: tukar kunci Auth/Storage. Cadangkan nilai staging aktif sebelum ditimpa. */
function switchAuth(
  name: ProfileName,
  input: string,
): { text: string; applied: Array<{ key: string; value: string }>; backedUp: string[] } {
  let text = input;
  const backedUp: string[] = [];
  if (name === "local") {
    for (const key of AUTH_KEYS) {
      const current = process.env[key];
      const backup = `${AUTH_PREFIX.supabase}${key}`;
      // Hanya cadangkan nilai yang benar-benar staging (URL non-lokal / kunci dari project staging).
      if (
        filled(current) &&
        !filled(process.env[backup]) &&
        isRemoteUrl(process.env.SUPABASE_URL)
      ) {
        text = replaceKey(text, backup, current);
        backedUp.push(key);
      }
    }
  }
  const missing = AUTH_KEYS.filter((key) => !filled(process.env[`${AUTH_PREFIX[name]}${key}`]));
  if (missing.length > 0) {
    out(
      `✘ Profil Auth "${name}" belum lengkap: ${missing.map((k) => AUTH_PREFIX[name] + k).join(", ")}.`,
    );
    out(
      name === "local"
        ? "  Jalankan 'bun run auth:local:up' lalu ulangi."
        : "  Isi nilai staging di .env lalu ulangi.",
    );
    process.exit(1);
  }
  const applied = AUTH_KEYS.map((key) => {
    const value = process.env[`${AUTH_PREFIX[name]}${key}`] as string;
    text = replaceKey(text, key, value);
    return { key, value };
  });
  return { text, applied, backedUp };
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
