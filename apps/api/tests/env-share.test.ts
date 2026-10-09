import { describe, expect, test } from "bun:test";
import { decrypt, encrypt, readKey, writeKey } from "../scripts/env-share.ts";

// Berbagi profil DB Supabase terenkripsi (env:share / env:pull).
describe("env-share", () => {
  const values = {
    SUPABASE_DATABASE_URL: "postgresql://u:p%40ss@host:6543/postgres",
    SUPABASE_DIRECT_URL: "postgresql://u:p%40ss@host:5432/postgres",
    SUPABASE_STORAGE_PATH_PREFIX: "",
  };

  test("enkripsi → dekripsi kembali; nilai polos tidak tampak di file", () => {
    const envelope = encrypt(values, "passphrase-uji-panjang");
    expect(JSON.stringify(envelope)).not.toContain("p%40ss");
    expect(decrypt(envelope, "passphrase-uji-panjang")).toEqual(values);
  });

  test("passphrase salah ditolak (GCM auth tag)", () => {
    const envelope = encrypt(values, "passphrase-uji-panjang");
    expect(() => decrypt(envelope, "passphrase-lain-xyz")).toThrow();
  });

  test("baca & tulis baris .env tanpa menyentuh baris lain", () => {
    const text = "A=1\nSUPABASE_DATABASE_URL=\nB='dua'\n";
    expect(readKey(text, "B")).toBe("dua");
    const next = writeKey(text, "SUPABASE_DATABASE_URL", "postgresql://x$1@h/db");
    expect(next).toBe("A=1\nSUPABASE_DATABASE_URL=postgresql://x$1@h/db\nB='dua'\n");
    expect(writeKey("A=1", "C", "3")).toBe("A=1\nC=3\n");
  });
});
