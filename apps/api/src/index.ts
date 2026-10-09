import { createApp } from "./app.ts";
import { createLogger } from "./core/logger.ts";
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

export default app;
