import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "../env.ts";
import { PrismaClient } from "../generated/prisma/client.ts";

// PLAN §10: pool kecil per instance karena serverless + transaction pooler Supabase.
const POOL_MAX = 5;

let client: PrismaClient | undefined;
// DEV-only: override URL koneksi saat runtime (endpoint /dev/db, hanya NODE_ENV=development).
// Di luar dev tetap undefined → getPrisma memakai getEnv().DATABASE_URL seperti biasa (tak berubah).
let overrideUrl: string | undefined;

function activeDatabaseUrl(): string {
  return overrideUrl ?? getEnv().DATABASE_URL;
}

export function getPrisma(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: activeDatabaseUrl(), max: POOL_MAX }),
  });
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Host DB aktif (`host:port`, tanpa kredensial) untuk ditampilkan/di-log. */
export function currentDatabaseHost(): string {
  try {
    return new URL(activeDatabaseUrl()).host;
  } catch {
    return "(tak terurai)";
  }
}

/**
 * DEV-only: ganti koneksi DB aktif saat runtime (dipakai endpoint /dev/db).
 * Memutus client lama lalu membangun ulang; repository memanggil getPrisma() per-operasi
 * sehingga langsung memakai koneksi baru. Tidak pernah dipanggil di staging/produksi.
 */
export async function overrideDatabaseUrl(url: string): Promise<void> {
  await disconnectPrisma();
  overrideUrl = url;
  getPrisma();
}
