import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  classifyUrl,
  hostOf,
  isLocalHostname,
  isRemoteUrl,
  realDataTarget,
  STAGING_PROJECT_REF,
} from "../scripts/db-target.ts";

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
  // fileURLToPath, bukan URL.pathname: di Windows pathname = "/C:/..." (path tak valid untuk bun).
  const SCRIPT = fileURLToPath(new URL("../scripts/guard-local-db.ts", import.meta.url));
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

  // Mode terpisah penuh: DB lokal tidak boleh berpasangan dengan Auth staging (seed akun demo).
  const STAGING_AUTH = "https://ref.supabase.co";
  const LOCAL_AUTH = "http://127.0.0.1:54321";

  test("mode terpisah: DB lokal + Auth staging → ditolak; + Auth lokal → lolos", () => {
    const base = { DATABASE_URL: LOCAL, DIRECT_URL: LOCAL, LOCAL_SUPABASE_URL: LOCAL_AUTH };
    const blocked = run({ ...base, SUPABASE_URL: STAGING_AUTH });
    expect(blocked.exitCode).toBe(1);
    expect(blocked.stdout.toString()).toContain("Auth/Storage masih Supabase staging");
    expect(run({ ...base, SUPABASE_URL: LOCAL_AUTH }).exitCode).toBe(0);
  });

  test("tanpa LOCAL_SUPABASE_URL: DB lokal + Auth staging tetap lolos (perilaku lama)", () => {
    expect(run({ DATABASE_URL: LOCAL, SUPABASE_URL: STAGING_AUTH }).exitCode).toBe(0);
  });
});

// db:use: mode terpisah penuh menukar kunci Auth/Storage dan mencadangkan nilai staging.
describe("use-db: mode terpisah penuh", () => {
  const SCRIPT = fileURLToPath(new URL("../scripts/use-db.ts", import.meta.url));
  const tmp = () => `${tmpdir()}/use-db-${crypto.randomUUID()}.env`;
  const parse = (text: string) =>
    Object.fromEntries(
      text
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
  const toEnv = (vars: Record<string, string>) =>
    `${Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`;
  const use = (file: string, target: string) =>
    Bun.spawnSync(["bun", SCRIPT, target], {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        HRIS_ENV_FILE: file,
        ...parse(readFileSync(file, "utf8")),
      },
    });

  const START = {
    DATABASE_URL: SUPABASE_POOLER,
    DIRECT_URL: SUPABASE_POOLER,
    LOCAL_DATABASE_URL: LOCAL,
    SUPABASE_DATABASE_URL: SUPABASE_POOLER,
    SUPABASE_URL: "https://ref.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "staging-service-key-xxxxxxxx",
    VITE_SUPABASE_URL: "https://ref.supabase.co",
    VITE_SUPABASE_ANON_KEY: "staging-anon-key-xxxxxxxxxxx",
    LOCAL_SUPABASE_URL: "http://127.0.0.1:54321",
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: "local-service-key-xxxxxxxxxx",
    LOCAL_VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    LOCAL_VITE_SUPABASE_ANON_KEY: "local-anon-key-xxxxxxxxxxxxx",
  };

  test("local → Auth lokal + cadangan STAGING_*; supabase → staging dipulihkan; kunci tak dicetak", () => {
    const file = tmp();
    writeFileSync(file, toEnv(START));
    try {
      const toLocal = use(file, "local");
      expect(toLocal.exitCode).toBe(0);
      expect(toLocal.stdout.toString()).not.toContain("service-key");
      let env = parse(readFileSync(file, "utf8"));
      expect(env.DATABASE_URL).toBe(LOCAL);
      expect(env.SUPABASE_URL).toBe("http://127.0.0.1:54321");
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(START.LOCAL_SUPABASE_SERVICE_ROLE_KEY);
      expect(env.STAGING_SUPABASE_SERVICE_ROLE_KEY).toBe(START.SUPABASE_SERVICE_ROLE_KEY);
      expect(env.STAGING_VITE_SUPABASE_ANON_KEY).toBe(START.VITE_SUPABASE_ANON_KEY);

      expect(use(file, "supabase").exitCode).toBe(0);
      env = parse(readFileSync(file, "utf8"));
      expect(env.DATABASE_URL).toBe(SUPABASE_POOLER);
      expect(env.SUPABASE_URL).toBe(START.SUPABASE_URL);
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(START.SUPABASE_SERVICE_ROLE_KEY);
      expect(env.VITE_SUPABASE_ANON_KEY).toBe(START.VITE_SUPABASE_ANON_KEY);
    } finally {
      rmSync(file, { force: true });
    }
  });

  test("tanpa LOCAL_SUPABASE_URL: hanya DB yang ditukar (perilaku lama)", () => {
    const file = tmp();
    const { LOCAL_SUPABASE_URL: _drop, ...legacy } = START;
    writeFileSync(file, toEnv(legacy));
    try {
      expect(use(file, "local").exitCode).toBe(0);
      const env = parse(readFileSync(file, "utf8"));
      expect(env.DATABASE_URL).toBe(LOCAL);
      expect(env.SUPABASE_URL).toBe(START.SUPABASE_URL);
      expect(env.STAGING_SUPABASE_URL).toBeUndefined();
    } finally {
      rmSync(file, { force: true });
    }
  });
});

// D-066: script data asli (org:import-local) — lokal tanpa flag; staging hanya dengan --remote=<ref staging>.
describe("realDataTarget", () => {
  const POOLER = `postgresql://postgres.${STAGING_PROJECT_REF}:x@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  const DIRECT = `postgresql://postgres:x@db.${STAGING_PROJECT_REF}.supabase.co:5432/postgres`;
  const OTHER =
    "postgresql://postgres.abcdefghijklmnopqrst:x@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

  test("DB lokal tanpa flag → local; dengan flag → ditolak", () => {
    expect(realDataTarget(LOCAL, undefined)).toBe("local");
    expect(realDataTarget(LOCAL, STAGING_PROJECT_REF)).toBeNull();
  });
  test("staging hanya dengan ref yang benar (pooler maupun direct)", () => {
    expect(realDataTarget(POOLER, STAGING_PROJECT_REF)).toBe("staging");
    expect(realDataTarget(DIRECT, STAGING_PROJECT_REF)).toBe("staging");
    expect(realDataTarget(POOLER, undefined)).toBeNull();
    expect(realDataTarget(POOLER, "abcdefghijklmnopqrst")).toBeNull();
  });
  test("project Supabase lain / URL kosong → ditolak", () => {
    expect(realDataTarget(OTHER, STAGING_PROJECT_REF)).toBeNull();
    expect(realDataTarget(undefined, undefined)).toBeNull();
    expect(realDataTarget("", STAGING_PROJECT_REF)).toBeNull();
  });
});
