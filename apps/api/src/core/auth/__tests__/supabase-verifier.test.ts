import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { UnauthenticatedError } from "../../errors.ts";
import { authenticate } from "../middleware.ts";
import { createSupabaseVerifier } from "../supabase-verifier.ts";
import type { TokenVerifier } from "../token-verifier.ts";

const SUPABASE_URL = "https://project-test.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_ID = "7f1b8f3e-2a6c-4f4e-9d7a-0a1b2c3d4e5f";

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
let trusted: KeyPair;
let untrusted: KeyPair;
let verifier: TokenVerifier;

async function sign(claims: JWTPayload, options: { key?: KeyPair; expiresIn?: string } = {}) {
  const key = options.key ?? trusted;
  return new SignJWT({ role: "authenticated", email: "budi@example.test", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject(typeof claims.sub === "string" ? claims.sub : USER_ID)
    .setIssuer(typeof claims.iss === "string" ? claims.iss : ISSUER)
    .setAudience(typeof claims.aud === "string" ? claims.aud : "authenticated")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign(key.privateKey);
}

beforeAll(async () => {
  trusted = await generateKeyPair("ES256", { extractable: true });
  untrusted = await generateKeyPair("ES256", { extractable: true });
  const jwk = {
    ...(await exportJWK(trusted.publicKey)),
    kid: "test-key",
    alg: "ES256",
    use: "sig",
  };
  verifier = createSupabaseVerifier({
    supabaseUrl: `${SUPABASE_URL}/`,
    keySource: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe("createSupabaseVerifier", () => {
  test("token valid → authUserId dari sub, email dari klaim", async () => {
    expect(await verifier.verify(await sign({}))).toEqual({
      authUserId: USER_ID,
      email: "budi@example.test",
    });
  });

  test.each([
    ["kedaluwarsa", () => sign({}, { expiresIn: "-1m" })],
    ["ditandatangani kunci lain", () => sign({}, { key: untrusted })],
    ["issuer project lain", () => sign({ iss: "https://lain.supabase.co/auth/v1" })],
    ["audience bukan authenticated", () => sign({ aud: "anon" })],
    ["role anon", () => sign({ role: "anon" })],
    ["sub bukan UUID", () => sign({ sub: "bukan-uuid" })],
  ])("ditolak: %s", async (_label, makeToken) => {
    await expect(verifier.verify(await makeToken())).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  test("string sampah ditolak", async () => {
    await expect(verifier.verify("abc.def.ghi")).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("authenticate middleware", () => {
  function app() {
    const hono = new Hono();
    hono.use("*", authenticate(verifier));
    hono.get("/who", (c) => c.json(c.get("auth")));
    hono.onError((err, c) =>
      c.json({ name: err.name }, err instanceof UnauthenticatedError ? 401 : 500),
    );
    return hono;
  }

  test("Bearer valid → auth tersedia di context", async () => {
    const res = await app().request("/who", {
      headers: { Authorization: `Bearer ${await sign({})}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ authUserId: USER_ID });
  });

  test.each([
    ["tanpa header", undefined],
    ["skema bukan Bearer", "Basic abc"],
    ["Bearer kosong", "Bearer "],
  ])("401: %s", async (_label, header) => {
    const res = await app().request("/who", header ? { headers: { Authorization: header } } : {});
    expect(res.status).toBe(401);
  });
});
