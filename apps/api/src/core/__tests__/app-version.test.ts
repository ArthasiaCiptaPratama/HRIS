import { describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../app.ts";
import { parseEnv } from "../../env.ts";
import { type AppVersionPolicy, isOlderVersion, parseAppVersion } from "../app-version.ts";
import { createLogger } from "../logger.ts";

const POLICY: AppVersionPolicy = {
  minVersion: "1.2.0",
  downloadUrl: "https://example.test/arthasia-akselerasi.apk",
};

function buildApp(appVersion: AppVersionPolicy | null = POLICY) {
  return createApp({
    logger: createLogger("error", () => undefined),
    corsOrigins: ["http://localhost:5173"],
    checkDatabase: async () => true,
    appVersion: appVersion ?? undefined,
  });
}

function health(app: ReturnType<typeof buildApp>, version?: string) {
  return app.request("/api/v1/health", {
    headers: version === undefined ? {} : { "X-App-Version": version },
  });
}

describe("versi minimum app mobile (MOB-D7)", () => {
  test("parseAppVersion menerima MAJOR.MINOR.PATCH dengan build opsional", () => {
    expect(parseAppVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseAppVersion("1.2.3+45")).toEqual([1, 2, 3]);
    expect(parseAppVersion("1.2")).toBeNull();
    expect(parseAppVersion("v1.2.3")).toBeNull();
    expect(parseAppVersion("1.2.3-beta")).toBeNull();
  });

  test("isOlderVersion membandingkan per bagian, bukan sebagai teks", () => {
    expect(isOlderVersion([1, 9, 0], [1, 10, 0])).toBe(true);
    expect(isOlderVersion([1, 10, 0], [1, 9, 9])).toBe(false);
    expect(isOlderVersion([1, 2, 0], [1, 2, 0])).toBe(false);
    expect(isOlderVersion([0, 99, 99], [1, 0, 0])).toBe(true);
  });

  test("tanpa header (web/PWA) tidak terpengaruh", async () => {
    expect((await health(buildApp())).status).toBe(200);
  });

  test("versi sama atau lebih baru diloloskan", async () => {
    const app = buildApp();
    expect((await health(app, "1.2.0")).status).toBe(200);
    expect((await health(app, "1.2.0+7")).status).toBe(200);
    expect((await health(app, "1.10.0")).status).toBe(200);
  });

  test("versi lebih lama → 426 APP_UPDATE_REQUIRED + tautan unduh", async () => {
    const res = await health(buildApp(), "1.1.9+30");
    expect(res.status).toBe(426);
    const { error } = (await res.json()) as ErrorBody;
    expect(error.code).toBe("APP_UPDATE_REQUIRED");
    expect(error.details).toEqual([POLICY]);
    expect(error.requestId).toBeString();
  });

  test("header berformat salah → 400 VALIDATION_ERROR", async () => {
    const res = await health(buildApp(), "terbaru");
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe("VALIDATION_ERROR");
  });

  test("tanpa versi minimum, semua versi valid diterima", async () => {
    expect((await health(buildApp(null), "0.0.1")).status).toBe(200);
  });

  test("env MOBILE_MIN_VERSION wajib MAJOR.MINOR.PATCH", () => {
    const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db", NODE_ENV: "test" };
    expect(parseEnv({ ...base, MOBILE_MIN_VERSION: "1.0.0" }).MOBILE_MIN_VERSION).toBe("1.0.0");
    expect(parseEnv({ ...base, MOBILE_MIN_VERSION: "" }).MOBILE_MIN_VERSION).toBeUndefined();
    expect(() => parseEnv({ ...base, MOBILE_MIN_VERSION: "1.0" })).toThrow(/MOBILE_MIN_VERSION/);
  });
});
