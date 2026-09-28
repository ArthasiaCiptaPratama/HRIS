import type { MiddlewareHandler } from "hono";
import { UnauthenticatedError } from "../errors.ts";
import type { TokenVerifier, VerifiedToken } from "./token-verifier.ts";

declare module "hono" {
  interface ContextVariableMap {
    auth: VerifiedToken;
  }
}

const BEARER = /^Bearer\s+(\S+)$/i;

// PROMPT §5: Authorization: Bearer <jwt Supabase>. Tidak ada/tidak valid → 401 UNAUTHENTICATED.
export function authenticate(verifier: TokenVerifier): MiddlewareHandler {
  return async (c, next) => {
    const match = BEARER.exec(c.req.header("Authorization") ?? "");
    if (!match?.[1]) throw new UnauthenticatedError();
    c.set("auth", await verifier.verify(match[1]));
    await next();
  };
}
