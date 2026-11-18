import { describe, expect, test } from "bun:test";
import {
  detectSchemaGap,
  findMigration,
  pendingMigrations,
  SchemaOutdatedError,
} from "../schema-drift.ts";

// Bentuk error Prisma 7 + adapter pg saat tabel/kolom belum ada di DB aktif.
const prismaError = (code: string, cause: Record<string, string>, modelName: string) =>
  Object.assign(new Error("x"), { code, meta: { modelName, driverAdapterError: { cause } } });

describe("skema tertinggal → 503 SCHEMA_OUTDATED", () => {
  test("P2021 tabel tidak ada → menyebut tabel & migrasi pembuatnya", () => {
    const gap = detectSchemaGap(
      prismaError(
        "P2021",
        { kind: "TableDoesNotExist", table: "attendance.work_rosters" },
        "WorkRoster",
      ),
    );
    expect(gap).toEqual({
      kind: "table",
      target: "attendance.work_rosters",
      model: "WorkRoster",
      migration: "20261113080422_work_rosters",
    });
    const err = new SchemaOutdatedError(gap as NonNullable<typeof gap>, true);
    expect(err.status).toBe(503);
    expect(err.code).toBe("SCHEMA_OUTDATED");
    expect(err.message).toContain("tabel attendance.work_rosters belum ada");
    expect(err.message).toContain("20261113080422_work_rosters");
  });

  test("P2022 kolom tidak ada → migrasi ALTER TABLE yang menambahkannya", () => {
    const gap = detectSchemaGap(
      prismaError("P2022", { kind: "ColumnNotFound", column: "roster_days.time_off" }, "RosterDay"),
    );
    expect(gap?.kind).toBe("column");
    expect(gap?.migration).toBe("20261113080422_work_rosters");
  });

  test("raw query (kode Postgres 42P01) tetap dikenali", () => {
    const gap = detectSchemaGap(prismaError("P2010", { originalCode: "42P01" }, ""));
    expect(gap?.kind).toBe("table");
  });

  test("di luar development pesan umum tanpa nama tabel", () => {
    const err = new SchemaOutdatedError(
      { kind: "table", target: "attendance.work_rosters", model: null, migration: null },
      false,
    );
    expect(err.message).not.toContain("work_rosters");
    expect(err.details).toBeUndefined();
  });

  test("error lain bukan skema tertinggal", () => {
    expect(detectSchemaGap(prismaError("P2002", {}, "Employee"))).toBeNull();
    expect(detectSchemaGap(new Error("boom"))).toBeNull();
  });

  test("migrasi tertunda = folder yang belum tercatat; tabel tak dikenal → null", () => {
    const pending = pendingMigrations(["20260928032354_init_module_schemas"]);
    expect(pending).not.toContain("20260928032354_init_module_schemas");
    expect(pending).toContain("20261113080422_work_rosters");
    expect(findMigration("table", "attendance.tidak_ada")).toBeNull();
  });
});
