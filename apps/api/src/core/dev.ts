import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { currentDatabaseHost, overrideDatabaseUrl } from "./db.ts";
import type { Logger } from "./logger.ts";

// DEV-ONLY: tombol switch DB lokal ⇄ Supabase dari web. Didaftarkan HANYA saat
// NODE_ENV=development (app.ts) → 404 di staging/produksi. Tidak masuk OpenAPI.
// Connection string tidak pernah dikirim/diterima browser: frontend hanya mengirim
// "local"/"supabase"; URL diresolusi di server dari profil .env (sama dengan `db:use`).
// Respons hanya memuat host (tanpa password).

const PROFILE_VAR: Record<"local" | "supabase", string> = {
  local: "LOCAL_DATABASE_URL",
  supabase: "SUPABASE_DATABASE_URL",
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function targetOfHost(host: string): "local" | "supabase" {
  const bare = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return LOCAL_HOSTNAMES.has(bare) || bare.endsWith(".localhost") ? "local" : "supabase";
}

const switchBody = z.object({ target: z.enum(["local", "supabase"]) });

// Apakah profil sudah diisi di .env (hanya boolean — nilai/kredensial tak pernah dibocorkan).
function profileAvailable(target: "local" | "supabase"): boolean {
  const value = process.env[PROFILE_VAR[target]];
  return value !== undefined && value.trim() !== "";
}

// Target Auth/Storage aktif (SUPABASE_URL dibaca saat start; tidak bisa ditukar saat runtime).
function authTarget(): "local" | "supabase" {
  try {
    return targetOfHost(new URL(process.env.SUPABASE_URL ?? "").host);
  } catch {
    return "supabase";
  }
}

// Mode terpisah penuh (LOCAL_SUPABASE_URL diisi): DB harus sepasang dengan Auth → tombol web hanya boleh
// ke target yang sama dengan Auth aktif; pindah penuh lewat `bun run db:use` + restart.
function separatedMode(): boolean {
  return (process.env.LOCAL_SUPABASE_URL ?? "").trim() !== "";
}

export function registerDevRoutes(app: OpenAPIHono, deps: { logger: Logger }): void {
  app.get("/api/v1/dev/db", (c) => {
    const host = currentDatabaseHost();
    const auth = authTarget();
    const lock = separatedMode();
    return c.json({
      data: {
        target: targetOfHost(host),
        host,
        auth,
        separated: lock,
        profiles: {
          local: profileAvailable("local") && (!lock || auth === "local"),
          supabase: profileAvailable("supabase") && (!lock || auth === "supabase"),
        },
      },
    });
  });

  app.post("/api/v1/dev/db", async (c) => {
    const parsed = switchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "target harus 'local' atau 'supabase'." } },
        400,
      );
    }
    const { target } = parsed.data;
    if (separatedMode() && target !== authTarget()) {
      return c.json(
        {
          error: {
            code: "BUSINESS_RULE_VIOLATION",
            message: `Mode terpisah: Auth aktif = ${authTarget()}. Pindah penuh: bun run db:use ${target} lalu restart.`,
          },
        },
        422,
      );
    }
    const url = process.env[PROFILE_VAR[target]];
    if (!url || url.trim() === "") {
      return c.json(
        {
          error: {
            code: "BUSINESS_RULE_VIOLATION",
            message: `Profil "${target}" belum diisi di .env (${PROFILE_VAR[target]}).`,
          },
        },
        422,
      );
    }
    await overrideDatabaseUrl(url);
    const host = currentDatabaseHost();
    deps.logger.info("dev db switched", { target, dbHost: host });
    return c.json({ data: { target: targetOfHost(host), host } });
  });
}
