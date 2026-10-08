import type { MiddlewareHandler } from "hono";
import { ForbiddenError } from "../errors.ts";
import type { Actor } from "./rules.ts";

// D-045 b (design §12): calon yang belum disetujui hanya boleh memakai wizard onboarding. Ditegakkan di
// API (bukan hanya route guard web). Karyawan existing yang diminta melengkapi data TIDAK dikunci.

const OPEN = [
  /^\/api\/v1\/me$/,
  /^\/api\/v1\/onboarding\/me(\/.*)?$/,
  /^\/api\/v1\/notifications(\/.*)?$/,
  /^\/api\/v1\/master-data$/,
];

export function isAllowedWhileOnboarding(actor: Actor, path: string): boolean {
  if (OPEN.some((pattern) => pattern.test(path))) return true;
  // Foto profil diri sendiri (wizard memakai komponen foto yang sama, D-037).
  const photo = /^\/api\/v1\/employees\/([0-9a-f-]{36})\/photo(\/upload-url)?$/.exec(path);
  return photo !== null && photo[1] === actor.employeeId;
}

export function enforceOnboardingLock(): MiddlewareHandler {
  return async (c, next) => {
    const actor = c.get("actor") as Actor | undefined;
    if (actor?.onboarding?.locked && !isAllowedWhileOnboarding(actor, c.req.path)) {
      throw new ForbiddenError("Selesaikan pengisian data karyawan Anda terlebih dahulu.");
    }
    await next();
  };
}
