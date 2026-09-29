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
