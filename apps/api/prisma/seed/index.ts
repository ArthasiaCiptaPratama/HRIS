// Seed data dummy (PROMPT §6): hanya data fiktif; email memakai plus-addressing developer (PLAN §3.3).
// Fase 1 belum punya model. Seed per modul ditambahkan mulai Fase 3 (organization) & Fase 4 (employee).
import { disconnectPrisma } from "../../src/core/db.ts";

const seeders: Array<{ name: string; run: () => Promise<void> }> = [];

async function main(): Promise<void> {
  for (const seeder of seeders) {
    await seeder.run();
    process.stdout.write(`seeded: ${seeder.name}\n`);
  }
  process.stdout.write(`seed finished (${seeders.length} seeder)\n`);
}

try {
  await main();
} finally {
  await disconnectPrisma();
}
