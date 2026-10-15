import { readFileSync } from "node:fs";
import path from "node:path";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { currentDatabaseHost, overrideDatabaseUrl } from "./db.ts";
import { parseEnvText, setSupabaseTarget } from "./dev-runtime.ts";
import type { Logger } from "./logger.ts";

// DEV-ONLY: tombol switch DB lokal ⇄ Supabase dari web. Didaftarkan HANYA saat
// NODE_ENV=development (app.ts) → 404 di staging/produksi. Tidak masuk OpenAPI.
// Satu klik = pindah penuh tanpa terminal/restart: menjalankan `scripts/use-db.ts` (logika & pengaman sama
// dengan `bun run db:use`, .env tetap sumber kebenaran), lalu menerapkan DB + Auth/Storage (mode terpisah
// penuh) ke proses yang berjalan. Connection string & service role key TIDAK PERNAH dikirim ke browser:
// browser hanya mengirim "local"/"supabase" dan menerima host + URL Auth & publishable key (publik).

type Target = "local" | "supabase";

const ROOT = path.join(import.meta.dirname, "..", "..", "..", "..");
const ENV_FILE = path.join(ROOT, ".env");
const USE_DB = path.join(ROOT, "apps", "api", "scripts", "use-db.ts");

const PROFILE_VAR: Record<Target, string> = {
  local: "LOCAL_DATABASE_URL",
  supabase: "SUPABASE_DATABASE_URL",
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function targetOfHost(host: string): Target {
  const bare = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return LOCAL_HOSTNAMES.has(bare) || bare.endsWith(".localhost") ? "local" : "supabase";
}

const switchBody = z.object({ target: z.enum(["local", "supabase"]) });

const filled = (value: string | undefined) => value !== undefined && value.trim() !== "";

// Apakah profil sudah diisi di .env (hanya boolean — nilai/kredensial tak pernah dibocorkan).
function profileAvailable(target: Target): boolean {
  return filled(process.env[PROFILE_VAR[target]]);
}

function authTarget(): Target {
  try {
    return targetOfHost(new URL(process.env.SUPABASE_URL ?? "").host);
  } catch {
    return "supabase";
  }
}

/** Konfigurasi Auth PUBLIK untuk client Supabase di browser (URL + publishable/anon key, bukan rahasia). */
function publicAuth() {
  return {
    target: authTarget(),
    url: process.env.VITE_SUPABASE_URL ?? "",
    anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? "",
  };
}

function snapshot() {
  const host = currentDatabaseHost();
  return {
    target: targetOfHost(host),
    host,
    auth: publicAuth(),
    /** Mode terpisah penuh: Auth & Storage ikut ditukar (LOCAL_SUPABASE_URL terisi). */
    separated: filled(process.env.LOCAL_SUPABASE_URL),
    profiles: { local: profileAvailable("local"), supabase: profileAvailable("supabase") },
  };
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

export function registerDevRoutes(app: OpenAPIHono, deps: { logger: Logger }): void {
  app.get("/api/v1/dev/db", (c) => c.json({ data: snapshot() }));

  app.post("/api/v1/dev/db", async (c) => {
    const parsed = switchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(errorBody("VALIDATION_ERROR", "target harus 'local' atau 'supabase'."), 400);
    }
    const { target } = parsed.data;

    // 1. Tulis .env lewat use-db (env bersih + --env-file: membaca .env TERKINI, bukan salinan saat start).
    const run = Bun.spawnSync([process.execPath, `--env-file=${ENV_FILE}`, USE_DB, target], {
      cwd: path.dirname(path.dirname(USE_DB)),
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", HRIS_ENV_FILE: ENV_FILE },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (run.exitCode !== 0) {
      // Pesan use-db hanya memuat nama variabel & host (tanpa kredensial).
      const reason =
        run.stdout
          .toString()
          .split("\n")
          .find((line) => line.startsWith("✘"))
          ?.replace(/^✘\s*/, "") ?? `Profil "${target}" belum lengkap di .env.`;
      return c.json(errorBody("BUSINESS_RULE_VIOLATION", reason), 422);
    }

    // 2. Terapkan ke proses berjalan: process.env (dibaca endpoint ini & guard), DB, Auth/Storage.
    const env = parseEnvText(readFileSync(ENV_FILE, "utf8"));
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl)
      return c.json(errorBody("BUSINESS_RULE_VIOLATION", "DATABASE_URL kosong."), 422);
    await overrideDatabaseUrl(databaseUrl);
    setSupabaseTarget({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });

    const data = snapshot();
    deps.logger.info("dev db switched", {
      target,
      dbHost: data.host,
      authHost: (() => {
        try {
          return new URL(env.SUPABASE_URL ?? "").host;
        } catch {
          return "(kosong)";
        }
      })(),
    });
    return c.json({ data });
  });
}
