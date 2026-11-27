import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAuthAdmin, selectEmailSender } from "../../app.ts";
import { getEnv } from "../../env.ts";
import { setSupabaseTarget, supabaseTarget } from "../dev-runtime.ts";
import { createLogger } from "../logger.ts";
import { UNCONFIGURED_AUTH_ADMIN } from "../supabase-admin.ts";

// Guard env test API (laporan Mat 2026-11-26): test tidak boleh menyentuh email/Auth Admin/Storage/
// Drive/FCM sungguhan walau dijalankan tanpa NODE_ENV=test. Preload: tests/helpers/db-guard-preload.ts.
const SECRET_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "EMAIL_FROM",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LOCAL_SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "FCM_SERVICE_ACCOUNT_JSON",
];
const PROBE = process.env.HRIS_GUARD_PROBE === "1";
const logger = createLogger("error", () => {});

describe("guard env test API", () => {
  test("proses test selalu NODE_ENV=test dan kredensial layanan nyata kosong", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(getEnv().NODE_ENV).toBe("test");
    for (const key of SECRET_KEYS) expect(process.env[key]).toBeUndefined();
    expect(selectEmailSender(getEnv(), logger).kind).toBe("log");
    expect(defaultAuthAdmin()).toBe(UNCONFIGURED_AUTH_ADMIN);
  });

  test("defaultAuthAdmin gagal-tertutup di NODE_ENV=test walau service role terisi", () => {
    const original = supabaseTarget();
    setSupabaseTarget({ url: "http://127.0.0.1:9", serviceRoleKey: "fake-service-role" });
    try {
      expect(defaultAuthAdmin()).toBe(UNCONFIGURED_AUTH_ADMIN);
    } finally {
      setSupabaseTarget(original);
    }
  });

  // Jalankan ulang file ini seperti `bun --env-file=../../.env test` (tanpa NODE_ENV=test), tetapi
  // dengan env sementara berisi nilai PALSU (tidak pernah memakai .env asli): harus tetap memakai stub.
  test.skipIf(PROBE)(
    "tanpa NODE_ENV=test + .env development berisi SMTP/service role → tetap stub",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "hris-env-guard-"));
      const envFile = join(dir, "fake.env");
      writeFileSync(
        envFile,
        [
          "NODE_ENV=development",
          // DB lokal fiktif: file ini tidak membuka koneksi; preload menolak host non-lokal.
          "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hris_env_guard_probe",
          "DIRECT_URL=postgresql://postgres:postgres@localhost:5432/hris_env_guard_probe",
          "SUPABASE_URL=http://127.0.0.1:9",
          "SUPABASE_SERVICE_ROLE_KEY=fake-service-role",
          "LOCAL_SUPABASE_SERVICE_ROLE_KEY=fake-local-service-role",
          "SMTP_HOST=smtp.invalid",
          "SMTP_PORT=2525",
          "SMTP_USER=fake",
          "SMTP_PASS=fake",
          "EMAIL_FROM=fake@invalid.test",
        ].join("\n"),
      );
      try {
        const apiDir = fileURLToPath(new URL("../../../", import.meta.url));
        const result = Bun.spawnSync(
          [process.execPath, `--env-file=${envFile}`, "test", fileURLToPath(import.meta.url)],
          {
            cwd: apiDir,
            // Env minimal: tidak mewarisi env proses ini (yang bisa saja berisi kredensial).
            env: {
              PATH: process.env.PATH ?? "",
              HOME: process.env.HOME ?? "",
              HRIS_GUARD_PROBE: "1",
            },
          },
        );
        const output = `${result.stdout.toString()}${result.stderr.toString()}`;
        expect(output).toContain("2 pass");
        expect(result.exitCode).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
