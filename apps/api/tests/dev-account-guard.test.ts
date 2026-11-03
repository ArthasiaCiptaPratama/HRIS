import { describe, expect, test } from "bun:test";
import { assertLocalDevAccountTargets } from "../scripts/dev-account-guard.ts";

const local = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/hris",
  SUPABASE_URL: "http://127.0.0.1:54321",
};
describe("dev account guard", () => {
  test("hanya development dengan DB dan Auth lokal", () => {
    expect(() => assertLocalDevAccountTargets(local)).not.toThrow();
    expect(() =>
      assertLocalDevAccountTargets({ ...local, SUPABASE_URL: "http://[::1]:54321" }),
    ).not.toThrow();
    for (const NODE_ENV of [undefined, "", "test", "production"]) {
      expect(() => assertLocalDevAccountTargets({ ...local, NODE_ENV })).toThrow();
    }
  });
  test("URL remote/kosong/rusak ditolak termasuk DIRECT_URL dan override DB", () => {
    for (const key of ["DATABASE_URL", "SUPABASE_URL", "DIRECT_URL"]) {
      for (const value of [
        "https://project.supabase.co",
        "postgresql://user:secret@db.remote/hris",
        "bad",
        "http://localhost.evil.test",
        "file://localhost/tmp/db",
      ]) {
        expect(() =>
          assertLocalDevAccountTargets({ ...local, [key]: value, HRIS_ALLOW_REMOTE_DB: "1" }),
        ).toThrow(key);
      }
    }
    for (const key of ["DATABASE_URL", "SUPABASE_URL"]) {
      expect(() => assertLocalDevAccountTargets({ ...local, [key]: undefined })).toThrow(key);
      expect(() => assertLocalDevAccountTargets({ ...local, [key]: "" })).toThrow(key);
    }
  });
});
