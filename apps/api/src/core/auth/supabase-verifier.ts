import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import { UnauthenticatedError } from "../errors.ts";
import type { TokenVerifier, VerifiedToken } from "./token-verifier.ts";

// Klaim minimum access token user Supabase Auth. Role/grant TIDAK dibaca dari token (D-008).
const claimsSchema = z.object({
  sub: z.uuid(),
  email: z.email().optional(),
  role: z.literal("authenticated"),
});

export interface SupabaseVerifierOptions {
  supabaseUrl: string;
  /** Hanya untuk test: sumber kunci lokal pengganti JWKS remote. */
  keySource?: JWTVerifyGetKey;
}

export function createSupabaseVerifier({
  supabaseUrl,
  keySource,
}: SupabaseVerifierOptions): TokenVerifier {
  const base = supabaseUrl.replace(/\/+$/, "");
  const issuer = `${base}/auth/v1`;
  // Kunci asimetris project (ES256) dari JWKS; jose meng-cache & me-refresh saat rotasi kunci.
  const keys = keySource ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return {
    async verify(token: string): Promise<VerifiedToken> {
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer,
          audience: "authenticated",
          algorithms: ["ES256", "RS256"],
        });
        const claims = claimsSchema.parse(payload);
        return { authUserId: claims.sub, email: claims.email };
      } catch {
        // Alasan teknis (kedaluwarsa, tanda tangan, issuer) tidak dibocorkan ke klien.
        throw new UnauthenticatedError();
      }
    },
  };
}
