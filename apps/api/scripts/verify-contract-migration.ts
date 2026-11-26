// Disposable local PostgreSQL database: verify the full migration chain, legacy backfill and collision failure.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { seedContracts } from "../prisma/seed/contract.ts";
import { seedEmployees } from "../prisma/seed/employee.ts";
import { seedOrganization } from "../prisma/seed/organization.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { classifyUrl } from "./db-target.ts";

const source = process.env.DIRECT_URL;
if (classifyUrl(source) !== "local" || !source)
  throw new Error("Migration verification requires a local DIRECT_URL");
const database = `ktr_verify_${crypto.randomUUID().replaceAll("-", "")}`;
const sourceUrl = new URL(source);
const admin = new pg.Client({ connectionString: source });
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${database}`;
const target = new pg.Client({ connectionString: targetUrl.toString() });
const migrationRoot = path.join(import.meta.dirname, "../prisma/migrations");
await admin.connect();
let created = false;
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  await target.connect();
  const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const latest = migrations.find((name) => name.endsWith("_ktr_k1_employment_contracts"));
  assert(latest, "KTR migration missing");
  for (const migration of migrations.filter((name) => name < latest))
    await target.query(
      await readFile(path.join(migrationRoot, migration, "migration.sql"), "utf8"),
    );
  const sql = await readFile(path.join(migrationRoot, latest, "migration.sql"), "utf8");
  const company = crypto.randomUUID();
  const department = crypto.randomUUID();
  const position = crypto.randomUUID();
  await target.query(
    "INSERT INTO organization.companies (id, code, name, updated_at) VALUES ($1, $2, $3, now())",
    [company, "KTRVERIFY", "Dummy migration PT"],
  );
  await target.query(
    "INSERT INTO organization.departments (id, name, updated_at) VALUES ($1, $2, now())",
    [department, "Dummy migration department"],
  );
  await target.query(
    "INSERT INTO organization.positions (id, department_id, name, updated_at) VALUES ($1, $2, $3, now())",
    [position, department, "Dummy migration position"],
  );
  const statuses = new Map<string, string>();
  for (const [category, name] of [
    ["PERMANENT", "Karyawan Tetap"],
    ["PROBATION", "Karyawan Percobaan"],
    ["PKWT", "PKWT"],
    ["DAILY_WORKER", "Pekerja Harian"],
  ]) {
    const result = await target.query<{ id: string }>(
      "INSERT INTO organization.employment_statuses (id, name, category, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (category) DO UPDATE SET name = EXCLUDED.name RETURNING id",
      [crypto.randomUUID(), name, category],
    );
    statuses.set(category ?? "", result.rows[0]?.id ?? "");
  }
  const rows: string[] = [];
  for (const category of ["PERMANENT", "PERMANENT", "PERMANENT", "PROBATION", "PKWT"]) {
    const id = crypto.randomUUID();
    rows.push(id);
    await target.query(
      "INSERT INTO employee.employees (id, full_name, company_id, position_id, employment_status_id, join_date, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now())",
      [id, "Dummy migration employee", company, position, statuses.get(category), "2020-01-01"],
    );
  }
  async function history(
    employeeId: string | undefined,
    type: string,
    effectiveDate: string,
    from: string | null,
    to: string,
  ) {
    await target.query(
      "INSERT INTO employee.employment_histories (id, employee_id, change_type, effective_date, from_status_id, to_status_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        crypto.randomUUID(),
        employeeId,
        type,
        effectiveDate,
        from ? statuses.get(from) : null,
        statuses.get(to),
      ],
    );
  }
  await history(rows[0], "HIRED", "2021-01-01", null, "PERMANENT");
  await history(rows[1], "STATUS_CHANGED", "2022-01-01", "PKWT", "PROBATION");
  await history(rows[1], "STATUS_CHANGED", "2022-04-01", "PROBATION", "PERMANENT");
  await history(rows[2], "STATUS_CHANGED", "2021-01-01", "PKWT", "PERMANENT");
  await history(rows[2], "STATUS_CHANGED", "2023-01-01", "PERMANENT", "PKWT");
  await history(rows[2], "STATUS_CHANGED", "2024-01-01", "PKWT", "PERMANENT");
  const conflict = crypto.randomUUID();
  await target.query(
    "INSERT INTO organization.employment_statuses (id, name, deleted_at, updated_at) VALUES ($1, $2, now(), now())",
    [conflict, "Harian Lepas (THL)"],
  );
  await assert.rejects(target.query(sql), /KTR-K1: employment status target name already belongs/);
  await target.query("DELETE FROM organization.employment_statuses WHERE id = $1", [conflict]);
  await target.query(sql);
  // Migrasi sesudah K1 (mis. K4 daily_wages) juga diterapkan agar seed kontrak terbaru bisa jalan.
  for (const migration of migrations.filter((name) => name > latest))
    await target.query(
      await readFile(path.join(migrationRoot, migration, "migration.sql"), "utf8"),
    );
  const renamed = await target.query<{ name: string }>(
    "SELECT name FROM organization.employment_statuses WHERE id = ANY($1::uuid[]) ORDER BY name",
    [[...statuses.values()]],
  );
  assert.deepEqual(
    renamed.rows.map((r) => r.name).sort(),
    ["Karyawan Tetap", "Karyawan Percobaan", "PKWT", "Harian Lepas (THL)"].sort(),
  );
  const expected = ["2021-01-01", "2022-01-01", "2024-01-01", "2020-01-01", null];
  for (const [index, id] of rows.entries()) {
    const result = await target.query<{ value: string | null }>(
      "SELECT pkwtt_start_date::text AS value FROM employee.employees WHERE id = $1",
      [id],
    );
    assert.equal(result.rows[0]?.value, expected[index]);
  }
  assert.equal(
    (await target.query<{ count: string }>("SELECT count(*) FROM contract.contracts")).rows[0]
      ?.count,
    "0",
  );
  assert.equal(
    (
      await target.query<{ count: string }>(
        "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('auth', 'storage')",
      )
    ).rows[0]?.count,
    "0",
  );
  const seedClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString: targetUrl.toString() }),
  });
  try {
    const org = await seedOrganization(seedClient);
    await seedEmployees(seedClient, org, undefined);
    await seedContracts(seedClient, org);
    await seedContracts(seedClient, org);
    const examples = await seedClient.employee.findMany({
      where: {
        employeeNumber: { startsWith: "KTR-DMY-" },
        NOT: { employeeNumber: { startsWith: "KTR-DMY-THL-" } },
      },
      include: { contracts: true },
    });
    assert.equal(examples.length, 4);
    // K4: dua THL dummy dengan upah harian, idempoten (seed dijalankan dua kali di atas).
    assert.equal(
      await seedClient.employee.count({
        where: { employeeNumber: { startsWith: "KTR-DMY-THL-" } },
      }),
      2,
    );
    assert.equal(await seedClient.dailyWage.count(), 3);
    assert.equal(examples.flatMap((e) => e.contracts).length, 5);
    assert.equal(examples.find((e) => e.employeeNumber === "KTR-DMY-L")?.contracts.length, 0);
    // KTR-D2 revisi: salinan tahap/akhir kontrak di employees = kontrak ACTIVE (tanpa ACTIVE → null).
    for (const e of examples) {
      const current = e.contracts.find((c) => c.status === "ACTIVE");
      assert.equal(e.contractStage, current?.kind === "PKWT" ? current.sequence : null);
      assert.equal(
        e.contractEndDate?.toISOString() ?? null,
        current?.endDate.toISOString() ?? null,
      );
    }
    assert.equal(
      examples.flatMap((e) => e.contracts).filter((c) => c.status === "EXTENDED").length,
      2,
    );
    assert.equal(
      await seedClient.employee.count({
        where: {
          employmentStatus: { category: { in: ["PERMANENT", "PROBATION"] } },
          pkwttStartDate: null,
        },
      }),
      0,
    );
  } finally {
    await seedClient.$disconnect();
  }
  process.stdout.write(
    `PASS: ${migrations.length} migrations on plain PostgreSQL; rename, archived-name collision, contract copy, hired/transition/re-entry/fallback backfill; no legacy contracts; dummy seeds and idempotence\n`,
  );
} finally {
  await target.end();
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
