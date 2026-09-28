import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "../env.ts";
import { PrismaClient } from "../generated/prisma/client.ts";

// PLAN §10: pool kecil per instance karena serverless + transaction pooler Supabase.
const POOL_MAX = 5;

let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL, max: POOL_MAX }),
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
