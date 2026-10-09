// Jaring pengaman untuk perintah DB destruktif (db:reset, db:seed): tolak bila target bukan DB
// lokal, supaya tidak sengaja menghapus/menimpa data Supabase. Lewati dengan HRIS_ALLOW_REMOTE_DB=1.
import { hostOf, isRemoteUrl } from "./db-target.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const override = process.env.HRIS_ALLOW_REMOTE_DB;
const allowRemote = override === "1" || override === "true";

const remote = (["DATABASE_URL", "DIRECT_URL"] as const)
  .map((key) => ({ key, url: process.env[key] }))
  .filter(({ url }) => isRemoteUrl(url));

if (remote.length > 0 && !allowRemote) {
  out("✘ Perintah DB destruktif ditolak: target bukan database lokal.");
  for (const { key, url } of remote) out(`  ${key} → ${hostOf(url)}`);
  out("  reset/seed menghapus & menimpa data.");
  out("  DB lokal            : 'bun run db:use local' lalu ulangi.");
  out("  Sengaja ke non-lokal: set HRIS_ALLOW_REMOTE_DB=1 lalu ulangi.");
  process.exit(1);
}
