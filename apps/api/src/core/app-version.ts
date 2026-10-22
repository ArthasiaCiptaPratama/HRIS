import type { MiddlewareHandler } from "hono";
import { AppUpdateRequiredError, ValidationError } from "./errors.ts";

export const APP_VERSION_HEADER = "X-App-Version";

// MAJOR.MINOR.PATCH, opsional diikuti `+build` (format versi Flutter, mis. 1.2.0+15). Build diabaikan.
const VERSION_PATTERN = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})(?:\+[0-9A-Za-z.-]{1,32})?$/;

export interface AppVersionPolicy {
  minVersion: string;
  downloadUrl: string | null;
}

export function parseAppVersion(value: string): [number, number, number] | null {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isOlderVersion(version: [number, number, number], min: [number, number, number]) {
  for (let i = 0; i < 3; i++) {
    if (version[i] !== min[i]) return (version[i] ?? 0) < (min[i] ?? 0);
  }
  return false;
}

/**
 * MOB-D7: app mobile (APK sideload, MOB-D4) tidak update otomatis, jadi server menolak versi lama
 * dengan 426 APP_UPDATE_REQUIRED. Request tanpa header (web/PWA, cron) tidak terpengaruh.
 */
export function appVersionGate(policy: AppVersionPolicy | undefined): MiddlewareHandler {
  const min = policy ? parseAppVersion(policy.minVersion) : null;
  return async (c, next) => {
    const header = c.req.header(APP_VERSION_HEADER);
    if (header === undefined) return next();
    const version = parseAppVersion(header);
    if (!version) {
      throw new ValidationError(
        [
          {
            path: APP_VERSION_HEADER,
            code: "invalid_format",
            message: "Expected MAJOR.MINOR.PATCH",
          },
        ],
        "Versi aplikasi tidak dikenali.",
      );
    }
    if (policy && min && isOlderVersion(version, min)) {
      throw new AppUpdateRequiredError({
        minVersion: policy.minVersion,
        downloadUrl: policy.downloadUrl,
      });
    }
    return next();
  };
}
