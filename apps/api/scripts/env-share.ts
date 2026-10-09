// Berbagi profil DB Supabase (SUPABASE_DATABASE_URL dkk.) antar-kolaborator TANPA menaruh nilai polos di
// repo: nilai dienkripsi (scrypt + AES-256-GCM, node:crypto) ke `.env.supabase.enc` (di-commit); passphrase
// dibagikan terpisah lewat chat pribadi, tidak pernah di repo.
//
// Pakai (dari root repo):
//   HRIS_ENV_PASSPHRASE='...' bun run env:share   enkripsi SUPABASE_* dari .env Anda → .env.supabase.enc
//   HRIS_ENV_PASSPHRASE='...' bun run env:pull    dekripsi → isi SUPABASE_* di .env Anda (dibuat dari
//                                                .env.example bila belum ada); lalu tukar DB seperti biasa
// Passphrase juga bisa diketik saat diminta (terminal interaktif) bila env tidak diisi.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "..", "..");
const ENV_PATH = process.env.HRIS_ENV_FILE ?? path.join(ROOT, ".env");
const ENC_PATH = process.env.HRIS_ENV_ENC_FILE ?? path.join(ROOT, ".env.supabase.enc");
const EXAMPLE_PATH = path.join(ROOT, ".env.example");

/** Hanya profil DB Supabase — rahasia lain (service role, SMTP, Google) tidak ikut dibagikan. */
export const SHARED_KEYS = [
  "SUPABASE_DATABASE_URL",
  "SUPABASE_DIRECT_URL",
  "SUPABASE_STORAGE_PATH_PREFIX",
] as const;

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MIN_PASSPHRASE = 12;

interface Envelope {
  v: 1;
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  data: string;
  keys: string[];
  updatedAt: string;
}

const out = (line: string) => process.stdout.write(`${line}\n`);
const deriveKey = (passphrase: string, salt: Buffer) => scryptSync(passphrase, salt, 32, SCRYPT);

export function encrypt(values: Record<string, string>, passphrase: string): Envelope {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
  return {
    v: 1,
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
    keys: Object.keys(values),
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

export function decrypt(envelope: Envelope, passphrase: string): Record<string, string> {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(passphrase, Buffer.from(envelope.salt, "base64")),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as Record<string, string>;
}

/** Nilai `KEY=...` dari teks .env (tanpa interpolasi; kutip pembungkus dibuang). */
export function readKey(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return undefined;
  return (match[1] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
}

/** Tulis ulang satu baris `KEY=...` (atau tambahkan di akhir) tanpa mengubah baris lain. */
export function writeKey(text: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*`, "m");
  if (re.test(text)) return text.replace(re, () => `${key}=${value}`);
  const sep = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}${key}=${value}\n`;
}

async function askHidden(label: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new Error("Isi HRIS_ENV_PASSPHRASE (terminal tidak interaktif).");
  process.stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        value = ch === "\u007f" || ch === "\b" ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function passphrase(): Promise<string> {
  const value = process.env.HRIS_ENV_PASSPHRASE ?? (await askHidden("Passphrase: "));
  if (value.length < MIN_PASSPHRASE) throw new Error(`Passphrase minimal ${MIN_PASSPHRASE} karakter.`);
  return value;
}

async function share() {
  if (!existsSync(ENV_PATH)) throw new Error(".env tidak ditemukan.");
  const text = readFileSync(ENV_PATH, "utf8");
  const values: Record<string, string> = {};
  for (const key of SHARED_KEYS) values[key] = readKey(text, key) ?? "";
  if (!values.SUPABASE_DATABASE_URL) throw new Error("SUPABASE_DATABASE_URL kosong di .env Anda.");
  const envelope = encrypt(values, await passphrase());
  writeFileSync(ENC_PATH, `${JSON.stringify(envelope, null, 2)}\n`);
  out(`✔ ${path.basename(ENC_PATH)} diperbarui (${SHARED_KEYS.join(", ")}).`);
  out("  Commit file itu; bagikan passphrase lewat chat pribadi (jangan di repo/issue/PR).");
}

async function pull() {
  if (!existsSync(ENC_PATH)) throw new Error(`${path.basename(ENC_PATH)} tidak ada (git pull dulu).`);
  const envelope = JSON.parse(readFileSync(ENC_PATH, "utf8")) as Envelope;
  let values: Record<string, string>;
  try {
    values = decrypt(envelope, await passphrase());
  } catch {
    throw new Error("Passphrase salah atau file rusak.");
  }
  if (!existsSync(ENV_PATH)) {
    copyFileSync(EXAMPLE_PATH, ENV_PATH);
    out("• .env belum ada → dibuat dari .env.example (lengkapi nilai lain sesuai README).");
  }
  let text = readFileSync(ENV_PATH, "utf8");
  for (const key of SHARED_KEYS) if (values[key] !== undefined) text = writeKey(text, key, values[key]);
  writeFileSync(ENV_PATH, text);
  out(`✔ Profil Supabase dimasukkan ke .env (${envelope.updatedAt}).`);
  out("  Tukar DB: bun run db:use supabase, atau tombol DB (dev) di web saat API berjalan (restart API dulu).");
}

if (import.meta.main) {
  const command = process.argv[2];
  try {
    if (command === "share") await share();
    else if (command === "pull") await pull();
    else out("Gunakan: bun run env:share | bun run env:pull");
  } catch (error) {
    out(`✘ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
