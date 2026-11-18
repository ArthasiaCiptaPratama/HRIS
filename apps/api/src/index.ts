import { createApp } from "./app.ts";
import { getPrisma } from "./core/db.ts";
import { createLogger } from "./core/logger.ts";
import { appliedMigrations, pendingMigrations } from "./core/schema-drift.ts";
import { getEnv } from "./env.ts";

// Entry untuk Vercel dan Bun lokal: Bun otomatis menyajikan default export yang punya `fetch`,
// memakai port dari env PORT (default 3000).
const app = createApp();

// Penanda target DB saat start (host saja, tanpa kredensial) agar jelas DB mana yang dipakai.
// DATABASE_URL sudah divalidasi sebagai URL postgres di env.ts, jadi `new URL` aman.
const env = getEnv();
createLogger(env.LOG_LEVEL).info("server start", {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  dbHost: new URL(env.DATABASE_URL).host,
});

// DEV-only: peringatkan bila DB aktif tertinggal migrasi (mis. mode Supabase) — fitur terkait
// akan dibalas 503 SCHEMA_OUTDATED. Hanya membaca _prisma_migrations, tidak mengubah apa pun.
if (env.NODE_ENV === "development") {
  appliedMigrations((sql) => getPrisma().$queryRaw(sql))
    .then((applied) => {
      const pending = pendingMigrations(applied);
      if (pending.length > 0) {
        createLogger(env.LOG_LEVEL).warn("database tertinggal migrasi", {
          dbHost: new URL(env.DATABASE_URL).host,
          count: pending.length,
          pending,
        });
      }
    })
    .catch(() => {
      // DB tak terjangkau sudah tampak di /health; jangan menggagalkan start.
    });
}

export default app;
