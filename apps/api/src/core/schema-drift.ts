import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "./errors.ts";

// Deteksi "skema tertinggal": kode lebih baru dari database aktif (mis. mode Supabase saat
// migrasi lokal belum dirilis). Prisma melempar P2021 (tabel tidak ada) / P2022 (kolom tidak ada).
// Alih-alih 500 umum, API membalas 503 SCHEMA_OUTDATED yang menyebut tabel/kolom & migrasinya
// (detail hanya di development; di luar dev pesan umum tanpa nama tabel).

export type SchemaGap = {
  kind: "table" | "column";
  /** `schema.tabel` atau `tabel.kolom` sesuai pesan Postgres. */
  target: string;
  model: string | null;
  /** Folder migrasi yang membuat tabel/kolom itu, bila ditemukan. */
  migration: string | null;
};

const MIGRATIONS_DIR = join(import.meta.dir, "../../prisma/migrations");

type DriverCause = { kind?: string; table?: string; column?: string; originalCode?: string };

function causeOf(err: unknown): { code?: string; model?: string; cause?: DriverCause } | null {
  if (err === null || typeof err !== "object") return null;
  const e = err as { code?: unknown; meta?: unknown };
  const meta = (e.meta ?? {}) as { modelName?: unknown; driverAdapterError?: { cause?: unknown } };
  return {
    code: typeof e.code === "string" ? e.code : undefined,
    model: typeof meta.modelName === "string" ? meta.modelName : undefined,
    cause: (meta.driverAdapterError?.cause ?? undefined) as DriverCause | undefined,
  };
}

/** Kenali error tabel/kolom tidak ada; null untuk error lain. */
export function detectSchemaGap(err: unknown): SchemaGap | null {
  const info = causeOf(err);
  if (!info) return null;
  const { code, cause } = info;
  const isTable =
    code === "P2021" || cause?.kind === "TableDoesNotExist" || cause?.originalCode === "42P01";
  const isColumn =
    code === "P2022" || cause?.kind === "ColumnNotFound" || cause?.originalCode === "42703";
  if (!isTable && !isColumn) return null;
  const target = (isTable ? cause?.table : cause?.column) ?? "(tidak diketahui)";
  const kind = isTable ? "table" : "column";
  return { kind, target, model: info.model ?? null, migration: findMigration(kind, target) };
}

const unquote = (s: string) => s.replaceAll('"', "");

let migrationSql: { name: string; sql: string }[] | null = null;
function loadMigrations(): { name: string; sql: string }[] {
  if (migrationSql) return migrationSql;
  try {
    migrationSql = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{14}_/.test(name))
      .sort()
      .map((name) => {
        try {
          return {
            name,
            sql: unquote(readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8")),
          };
        } catch {
          return { name, sql: "" };
        }
      });
  } catch {
    // Bundel serverless tanpa folder migrasi → cukup nama tabel/kolom.
    migrationSql = [];
  }
  return migrationSql;
}

/** Cari migrasi yang membuat tabel (`schema.tabel`) atau kolom (`tabel.kolom`). */
export function findMigration(kind: "table" | "column", target: string): string | null {
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const { name, sql } of loadMigrations()) {
    const statements = sql.split(";");
    if (kind === "table") {
      const [schema, table] = target.includes(".") ? target.split(".") : [null, target];
      const qualified = schema
        ? `${escapeRe(schema)}\\.${escapeRe(table ?? "")}`
        : `(?:\\w+\\.)?${escapeRe(table ?? "")}`;
      if (statements.some((s) => new RegExp(`CREATE TABLE\\s+${qualified}\\s*\\(`, "i").test(s)))
        return name;
    } else {
      const [table, column] = target.split(".");
      if (!table || !column) continue;
      const re = new RegExp(
        `ALTER TABLE\\s+(?:\\w+\\.)?${escapeRe(table)}\\b[\\s\\S]*ADD COLUMN\\s+${escapeRe(column)}\\b`,
        "i",
      );
      if (statements.some((s) => re.test(s))) return name;
    }
  }
  return null;
}

export class SchemaOutdatedError extends AppError {
  constructor(gap: SchemaGap, detailed: boolean) {
    const what = gap.kind === "table" ? `tabel ${gap.target}` : `kolom ${gap.target}`;
    const message = detailed
      ? `Fitur ini belum tersedia di database aktif: ${what} belum ada` +
        (gap.migration ? ` (migrasi ${gap.migration} belum diterapkan).` : ".")
      : "Fitur ini belum tersedia di database. Hubungi admin sistem.";
    super(503, "SCHEMA_OUTDATED", message, detailed ? [gap] : undefined);
  }
}

/** Migrasi yang ada di folder tetapi belum tercatat di database (untuk peringatan saat start). */
export function pendingMigrations(applied: readonly string[]): string[] {
  const done = new Set(applied);
  return loadMigrations()
    .map((m) => m.name)
    .filter((name) => !done.has(name));
}

/** Nama migrasi yang sudah selesai diterapkan di database aktif. */
export async function appliedMigrations(
  query: (sql: TemplateStringsArray) => Promise<{ migration_name: string }[]>,
): Promise<string[]> {
  const rows =
    await query`SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  return rows.map((r) => r.migration_name);
}
