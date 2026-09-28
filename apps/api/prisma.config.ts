import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Satu file .env di root monorepo (CODEMAP §8). Di CI/Vercel env diisi langsung, file tidak ada.
loadEnv({ path: path.join(import.meta.dirname, "..", "..", ".env"), quiet: true });

export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "bun prisma/seed/index.ts",
  },
  datasource: {
    // Prisma 7: URL di sini dipakai CLI (migrate), jadi memakai koneksi direct/session (PLAN §3.3).
    // Runtime memakai DATABASE_URL lewat driver adapter di src/core/db.ts.
    // Tidak memakai env() karena `prisma generate` (postinstall) harus jalan tanpa DB.
    url: process.env.DIRECT_URL ?? "",
  },
});
