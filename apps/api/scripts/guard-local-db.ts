// Jaring pengaman untuk perintah DB berbahaya (db:reset, db:seed, db:migrate = `prisma migrate dev`):
// tolak bila target bukan DB lokal, supaya tidak sengaja menghapus/menimpa data Supabase atau menerapkan
// migrasi develop yang belum dirilis ke staging (D-030: migrasi staging hanya lewat workflow Deploy).
// Lewati dengan HRIS_ALLOW_REMOTE_DB=1.
import { hostOf, isRemoteUrl } from "./db-target.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const override = process.env.HRIS_ALLOW_REMOTE_DB;
const allowRemote = override === "1" || override === "true";

const remote = (["DATABASE_URL", "DIRECT_URL"] as const)
  .map((key) => ({ key, url: process.env[key] }))
  .filter(({ url }) => isRemoteUrl(url));

if (remote.length > 0 && !allowRemote) {
  out("✘ Perintah DB ditolak: target bukan database lokal.");
  for (const { key, url } of remote) out(`  ${key} → ${hostOf(url)}`);
  out("  reset/seed menghapus & menimpa data; migrate dev menerapkan migrasi yang belum dirilis.");
  out("  DB lokal            : 'bun run db:use local' lalu ulangi.");
  out("  Sengaja ke non-lokal: set HRIS_ALLOW_REMOTE_DB=1 lalu ulangi.");
  process.exit(1);
}

// Mode terpisah penuh (LOCAL_SUPABASE_URL diisi): DB lokal WAJIB berpasangan dengan Auth/Storage lokal,
// supaya seed/akun demo (demo:dashboard, db:seed:time --accounts) tidak pernah membuat/menautkan
// user di Supabase Auth staging. Tanpa LOCAL_SUPABASE_URL perilaku lama tidak berubah.
const separated = (process.env.LOCAL_SUPABASE_URL ?? "").trim() !== "";
if (separated && remote.length === 0 && isRemoteUrl(process.env.SUPABASE_URL) && !allowRemote) {
  out("✘ Perintah DB ditolak: DB lokal tetapi Auth/Storage masih Supabase staging.");
  out(`  SUPABASE_URL → ${hostOf(process.env.SUPABASE_URL)}`);
  out(
    "  Mode terpisah penuh aktif (LOCAL_SUPABASE_URL terisi): 'bun run db:use local' lalu ulangi.",
  );
  process.exit(1);
}
