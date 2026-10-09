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
