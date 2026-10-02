import { timingSafeEqual } from "node:crypto";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { UnauthenticatedError } from "../core/errors.ts";
import type { Logger } from "../core/logger.ts";
import { notifyExpiringGrants } from "../modules/iam/index.ts";
import { retryEmailOutbox } from "../modules/notification/index.ts";

// CODEMAP §7: endpoint Vercel Cron (`/api/cron/*`), dilindungi `Authorization: Bearer ${CRON_SECRET}`.
// Di lokal Vercel Cron tidak jalan; picu manual dengan header yang sama (PLAN §3.3).

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireCronSecret(secret: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    // Tanpa CRON_SECRET, endpoint cron tidak pernah terbuka.
    const provided = /^Bearer\s+(\S+)$/i.exec(c.req.header("Authorization") ?? "")?.[1];
    if (!secret || !provided || !secretMatches(provided, secret)) throw new UnauthenticatedError();
    await next();
  };
}

export const CRON_JOBS = {
  "grant-expiry": () => notifyExpiringGrants(),
  "email-retry": () => retryEmailOutbox(),
} as const;

export function registerCronRoutes(
  app: OpenAPIHono,
  deps: {
    cronSecret: string | undefined;
    logger: Logger;
    /** Job yang butuh dependency (mis. Supabase Admin) dirakit di app.ts. */
    extraJobs?: Record<string, () => Promise<unknown>>;
  },
): void {
  const guard = requireCronSecret(deps.cronSecret);
  for (const [name, run] of Object.entries({ ...CRON_JOBS, ...deps.extraJobs })) {
    app.get(`/api/cron/${name}`, guard, async (c) => {
      const startedAt = performance.now();
      const result = await run();
      deps.logger.info("cron finished", {
        job: name,
        requestId: c.get("requestId"),
        durationMs: Math.round(performance.now() - startedAt),
        result,
      });
      return c.json({ data: { job: name, result } }, 200);
    });
  }
}
