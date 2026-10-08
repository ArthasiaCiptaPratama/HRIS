// Seed data dummy (PROMPT §6): hanya data fiktif; email memakai plus-addressing developer (PLAN §3.3).
// Idempoten: aman dijalankan berulang (`bun run db:seed`).
import { disconnectPrisma, getPrisma } from "../../src/core/db.ts";
import { seedEmployees } from "./employee.ts";
import { seedOrgChart } from "./org-chart.ts";
import { seedOrganization } from "./organization.ts";

async function main(): Promise<void> {
  // Data dummy tidak boleh masuk produksi.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed dummy data when NODE_ENV=production");
  }
  const prisma = getPrisma();
  const org = await seedOrganization(prisma);
  process.stdout.write(
    `seeded organization: ${org.positions.size} positions, ${org.statuses.size} statuses, ${org.grades.size} grades, ${org.locations.size} locations\n`,
  );
  const emailBase = process.env.SEED_EMAIL_BASE?.trim() || undefined;
  const count = await seedEmployees(prisma, org, emailBase);
  process.stdout.write(
    `seeded employee: ${count} employees (work_email ${emailBase ? "plus-addressed" : "empty: SEED_EMAIL_BASE not set"})\n`,
  );
  // D-051: replika bentuk bagan ACP (nama fiktif) + bagan kecil CD2 — setelah karyawan dummy ada.
  const posts = await seedOrgChart(prisma, org);
  process.stdout.write(`seeded org chart: ${posts} posts\n`);
}

try {
  await main();
} finally {
  await disconnectPrisma();
}
