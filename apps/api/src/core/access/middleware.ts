import type { Permission, Role } from "@hris/shared";
import type { MiddlewareHandler } from "hono";
import { ForbiddenError, UnauthenticatedError } from "../errors.ts";
import { type Actor, hasPermission, hasRole } from "./rules.ts";

declare module "hono" {
  interface ContextVariableMap {
    actor: Actor;
  }
}

/** Disediakan modul iam saat app dirakit (menghindari siklus core ↔ modul). Null = tidak ada akun aktif. */
export type ActorLoader = (authUserId: string) => Promise<Actor | null>;

// PLAN §3.2.7 & §4.5: JWT valid tanpa akun aktif ditolak; klien diminta masuk ulang.
export function loadActor(loader: ActorLoader): MiddlewareHandler {
  return async (c, next) => {
    const actor = await loader(c.get("auth").authUserId);
    if (!actor) {
      throw new UnauthenticatedError("Akun tidak aktif atau belum terdaftar. Hubungi HR.");
    }
    c.set("actor", actor);
    await next();
  };
}

export function requireRole(...roles: Role[]): MiddlewareHandler {
  return async (c, next) => {
    if (!hasRole(c.get("actor"), roles)) throw new ForbiddenError();
    await next();
  };
}

export function requirePermission(permission: Permission): MiddlewareHandler {
  return async (c, next) => {
    if (!hasPermission(c.get("actor"), permission)) throw new ForbiddenError();
    await next();
  };
}
