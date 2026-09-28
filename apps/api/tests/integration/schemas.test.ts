import { afterAll, describe, expect, test } from "bun:test";
import { disconnectPrisma, getPrisma } from "../../src/core/db.ts";

// PLAN §3.2: satu skema Postgres per modul harus ada setelah migrasi.
const MODULE_SCHEMAS = [
  "approval",
  "attendance",
  "audit",
  "contract",
  "employee",
  "iam",
  "leave",
  "notification",
  "organization",
  "payroll",
];

afterAll(async () => {
  await disconnectPrisma();
});

describe("migrasi awal", () => {
  test("semua skema modul sudah dibuat", async () => {
    const rows = await getPrisma().$queryRaw<{ nspname: string }[]>`
      SELECT nspname FROM pg_namespace WHERE nspname = ANY(${MODULE_SCHEMAS})`;
    expect(rows.map((row) => row.nspname).sort()).toEqual(MODULE_SCHEMAS);
  });
});
