// Supabase LOKAL (Auth + Storage) untuk mode "local" terpisah penuh — tidak ada request ke Supabase asli.
// Butuh Docker (Mac: Colima/Docker Desktop; Windows/Linux: Docker Desktop/Engine) dan Supabase CLI.
// Skema HRIS TIDAK dikelola di sini (D-003): DB aplikasi tetap PostgreSQL lokal (port 5432) via Prisma;
// Postgres internal Supabase lokal (port 54322) hanya menampung skema auth/storage miliknya sendiri.
//
// Pakai (dari root repo):
//   bun run auth:local:up     nyalakan Supabase lokal + tulis profil LOCAL_SUPABASE_* ke .env
//   bun run auth:local:down   matikan (data Auth lokal tetap tersimpan di volume Docker)
// Lalu: bun run db:use local → bun run dev. Kunci tidak pernah dicetak.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "..", "..");
const ENV_PATH = process.env.HRIS_ENV_FILE ?? path.join(ROOT, ".env");
const SUPABASE = process.env.SUPABASE_CLI ?? "supabase";

// Hanya layanan yang dipakai HRIS: Postgres internal, Auth (GoTrue), Storage, gateway Kong.
const EXCLUDE = [
  "postgrest",
  "postgres-meta",
  "imgproxy",
  "studio",
  "realtime",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
  "mailpit",
];

const out = (line: string) => process.stdout.write(`${line}\n`);

function run(args: string[], quiet = false): string {
  const proc = Bun.spawnSync([SUPABASE, ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: quiet ? "pipe" : "inherit",
  });
  if (proc.exitCode !== 0) {
    out(
      `✘ '${SUPABASE} ${args[0]}' gagal (exit ${proc.exitCode}). Docker sudah jalan? Supabase CLI terpasang?`,
    );
    process.exit(1);
  }
  return proc.stdout.toString();
}

function replaceKey(text: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*`, "m");
  if (re.test(text)) return text.replace(re, () => `${key}=${value}`);
  const sep = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}${key}=${value}\n`;
}

/** `supabase status -o env` → map KEY="value". */
function parseStatus(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) map[m[1]] = m[2];
  }
  return map;
}

const command = process.argv[2];

if (command === "down") {
  run(["stop"]);
  out("✔ Supabase lokal dimatikan (data Auth lokal tetap tersimpan).");
} else if (command === "up") {
  run(["start", "-x", EXCLUDE.join(",")]);
  const status = parseStatus(run(["status", "-o", "env"], true));
  const apiUrl = status.API_URL;
  const anon = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const service = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  if (!apiUrl || !anon || !service) {
    out("✘ Tidak bisa membaca URL/kunci dari 'supabase status'.");
    process.exit(1);
  }
  // URL apa adanya: issuer JWT GoTrue lokal = `${API_URL}/auth/v1` (verifier API mencocokkan issuer persis).
  const url = apiUrl.replace(/\/+$/, "");
  let text = readFileSync(ENV_PATH, "utf8");
  for (const [key, value] of [
    ["LOCAL_SUPABASE_URL", url],
    ["LOCAL_VITE_SUPABASE_URL", url],
    ["LOCAL_SUPABASE_SERVICE_ROLE_KEY", service],
    ["LOCAL_VITE_SUPABASE_ANON_KEY", anon],
  ] as const) {
    text = replaceKey(text, key, value);
  }
  writeFileSync(ENV_PATH, text);
  out(
    `✔ Supabase lokal aktif di ${url}. Profil LOCAL_SUPABASE_* ditulis ke .env (kunci tidak dicetak).`,
  );
  out("  Berikutnya: bun run db:use local → bun run --cwd apps/api storage:setup → bun run dev");
} else {
  out("Pakai: bun run auth:local:up | bun run auth:local:down");
  process.exit(1);
}
