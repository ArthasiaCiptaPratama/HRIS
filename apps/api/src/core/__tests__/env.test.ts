import { describe, expect, test } from "bun:test";
import { parseEnv } from "../../env.ts";

const BASE = { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hris" };

describe("parseEnv", () => {
  test("mengisi default dan memecah CORS_ORIGINS", () => {
    const env = parseEnv({ ...BASE, CORS_ORIGINS: "http://a.test, http://b.test" });
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
    expect(env.SUPABASE_URL).toBeUndefined();
  });

  test("string kosong dianggap tidak diisi", () => {
    expect(parseEnv({ ...BASE, SMTP_HOST: "" }).SMTP_HOST).toBeUndefined();
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
