// Preload test (bunfig.toml → [test].preload): batalkan test bila DATABASE_URL/DIRECT_URL menunjuk
// DB non-lokal. Test integration menulis & menghapus data; jangan sampai mengenai Supabase.
// Lewati dengan HRIS_ALLOW_REMOTE_DB=1 (CI memakai Postgres lokal, jadi tidak terpengaruh).
import { hostOf, isRemoteUrl } from "../../scripts/db-target.ts";

const override = process.env.HRIS_ALLOW_REMOTE_DB;
const allowRemote = override === "1" || override === "true";

if (!allowRemote) {
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const url = process.env[key];
    if (isRemoteUrl(url)) {
      throw new Error(
        `Test dibatalkan: ${key} menunjuk ${hostOf(url)} (bukan DB lokal). ` +
          "Test menulis data. Jalankan 'bun run db:use local', atau set HRIS_ALLOW_REMOTE_DB=1 bila disengaja.",
      );
    }
  }
}

// Guard env test (laporan Mat 2026-11-26; kutipan pengguna "Kita pasang di develop"): test API selalu
// NODE_ENV=test walau dijalankan tanpa skrip `test:api` (mis. `bun --env-file=../../.env test`, yang
// membawa NODE_ENV=development dari .env), dan kredensial layanan nyata dikosongkan sebelum app dimuat
// (getEnv lazy) → email = log, Auth Admin/Storage/Drive/FCM = stub. Lihat src/core/__tests__/test-env-guard.test.ts.
export const TEST_SECRET_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "EMAIL_FROM",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LOCAL_SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "FCM_SERVICE_ACCOUNT_JSON",
] as const;

process.env.NODE_ENV = "test";
for (const key of TEST_SECRET_KEYS) delete process.env[key];
