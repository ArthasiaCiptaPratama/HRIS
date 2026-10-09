import { describe, expect, test } from "bun:test";
import { classifyUrl, hostOf, isLocalHostname, isRemoteUrl } from "../scripts/db-target.ts";

const LOCAL = "postgresql://postgres:postgres@localhost:5432/hris";
const LOOPBACK = "postgresql://postgres:postgres@127.0.0.1:5432/hris";
const IPV6 = "postgresql://postgres:postgres@[::1]:5432/hris";
const SUPABASE_POOLER =
  "postgresql://postgres.ref:secret@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres";

describe("db-target: klasifikasi host", () => {
  test("host lokal dianggap local", () => {
    for (const url of [LOCAL, LOOPBACK, IPV6]) {
      expect(classifyUrl(url)).toBe("local");
      expect(isRemoteUrl(url)).toBe(false);
    }
  });

  test("host Supabase pooler dianggap remote", () => {
    expect(classifyUrl(SUPABASE_POOLER)).toBe("remote");
    expect(isRemoteUrl(SUPABASE_POOLER)).toBe(true);
  });

  test("URL kosong/undefined = empty dan tidak diblokir", () => {
    expect(classifyUrl(undefined)).toBe("empty");
    expect(classifyUrl("")).toBe("empty");
    expect(isRemoteUrl(undefined)).toBe(false);
  });

  test("URL tak terurai tidak diblokir (aman untuk test)", () => {
    expect(isRemoteUrl("bukan-url")).toBe(false);
  });

  test("isLocalHostname mengenali loopback & *.localhost", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("db.localhost")).toBe(true);
    expect(isLocalHostname("[::1]")).toBe(true);
    expect(isLocalHostname("db.supabase.co")).toBe(false);
  });

  test("hostOf menampilkan host:port tanpa kredensial", () => {
    expect(hostOf(LOCAL)).toBe("localhost:5432");
    expect(hostOf(SUPABASE_POOLER)).toBe("aws-0-ap-northeast-2.pooler.supabase.com:6543");
    expect(hostOf(undefined)).toBe("(kosong)");
  });
});

// Pengaman db:reset / db:seed / db:migrate (`prisma migrate dev`): target non-lokal ditolak (D-030).
describe("guard-local-db", () => {
  const SCRIPT = new URL("../scripts/guard-local-db.ts", import.meta.url).pathname;
  const run = (env: Record<string, string>) =>
    Bun.spawnSync(["bun", SCRIPT], {
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    });

  test("DB lokal → lolos", () => {
    expect(run({ DATABASE_URL: LOCAL, DIRECT_URL: LOCAL }).exitCode).toBe(0);
  });

  test("DB Supabase → ditolak, kecuali HRIS_ALLOW_REMOTE_DB=1", () => {
    const blocked = run({ DATABASE_URL: SUPABASE_POOLER, DIRECT_URL: SUPABASE_POOLER });
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stdout.toString()).toContain("ditolak");
    // Host saja yang dicetak, tanpa kredensial.
    expect(blocked.stdout.toString()).not.toContain("secret");
    expect(run({ DATABASE_URL: SUPABASE_POOLER, HRIS_ALLOW_REMOTE_DB: "1" }).exitCode).toBe(0);
  });
});
