import { describe, expect, test } from "bun:test";
import { parseEnv } from "../../env.ts";

const BASE = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hris",
  SUPABASE_URL: "https://project.supabase.co",
};

describe("parseEnv", () => {
  test("mengisi default dan memecah CORS_ORIGINS", () => {
    const env = parseEnv({ ...BASE, CORS_ORIGINS: "http://a.test, http://b.test" });
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
    expect(env.SUPABASE_URL).toBe("https://project.supabase.co");
  });

  test("D-045: ONBOARDING_INVITES_PER_HOUR kosong → 25; angka dipakai; 0/bukan angka ditolak", () => {
    expect(parseEnv({ ...BASE }).ONBOARDING_INVITES_PER_HOUR).toBe(25);
    expect(parseEnv({ ...BASE, ONBOARDING_INVITES_PER_HOUR: "" }).ONBOARDING_INVITES_PER_HOUR).toBe(
      25,
    );
    expect(
      parseEnv({ ...BASE, ONBOARDING_INVITES_PER_HOUR: "10" }).ONBOARDING_INVITES_PER_HOUR,
    ).toBe(10);
    expect(() => parseEnv({ ...BASE, ONBOARDING_INVITES_PER_HOUR: "0" })).toThrow();
    expect(() => parseEnv({ ...BASE, ONBOARDING_INVITES_PER_HOUR: "x" })).toThrow();
  });

  test("string kosong dianggap tidak diisi", () => {
    expect(parseEnv({ ...BASE, SMTP_HOST: "" }).SMTP_HOST).toBeUndefined();
  });

  test("SUPABASE_URL wajib di luar NODE_ENV=test", () => {
    const { SUPABASE_URL: _omit, ...withoutSupabase } = BASE;
    expect(() => parseEnv({ ...withoutSupabase, NODE_ENV: "development" })).toThrow(/SUPABASE_URL/);
    expect(parseEnv({ ...withoutSupabase, NODE_ENV: "test" }).SUPABASE_URL).toBeUndefined();
  });

  test("gagal cepat tanpa membocorkan nilai env", () => {
    const secret = "mysql://root:super-secret@db";
    expect(() => parseEnv({ DATABASE_URL: secret })).toThrow(/DATABASE_URL/);
    try {
      parseEnv({ DATABASE_URL: secret });
    } catch (error) {
      expect((error as Error).message).not.toContain("super-secret");
    }
  });
});

describe("SMTP_PORT", () => {
  const BASE_TEST = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hris",
    NODE_ENV: "test",
  };
  test("angka valid, kosong → undefined, bukan angka ditolak", () => {
    expect(parseEnv({ ...BASE_TEST, SMTP_PORT: "587" }).SMTP_PORT).toBe(587);
    expect(parseEnv({ ...BASE_TEST, SMTP_PORT: "" }).SMTP_PORT).toBeUndefined();
    expect(() => parseEnv({ ...BASE_TEST, SMTP_PORT: "abc" })).toThrow(/SMTP_PORT/);
  });
});

// PLAN §3.3: file dari lokal disimpan di bucket staging dengan prefix `dev/<nama-developer>/`.
describe("STORAGE_PATH_PREFIX", () => {
  test("kosong (staging/produksi) atau segmen huruf kecil diakhiri '/'", () => {
    expect(parseEnv(BASE).STORAGE_PATH_PREFIX).toBe("");
    expect(parseEnv({ ...BASE, STORAGE_PATH_PREFIX: "" }).STORAGE_PATH_PREFIX).toBe("");
    expect(parseEnv({ ...BASE, STORAGE_PATH_PREFIX: "dev/oatse/" }).STORAGE_PATH_PREFIX).toBe(
      "dev/oatse/",
    );
    expect(parseEnv({ ...BASE, STORAGE_PATH_PREFIX: "dev/budi-2/" }).STORAGE_PATH_PREFIX).toBe(
      "dev/budi-2/",
    );
  });

  test("format lain ditolak (tanpa '/' akhir, '/' awal, '..', huruf besar, spasi)", () => {
    for (const value of [
      "dev/oatse",
      "/dev/oatse/",
      "../x/",
      "dev//x/",
      "Dev/Oatse/",
      "dev/o atse/",
    ]) {
      expect(() => parseEnv({ ...BASE, STORAGE_PATH_PREFIX: value })).toThrow(
        /STORAGE_PATH_PREFIX/,
      );
    }
  });
});
