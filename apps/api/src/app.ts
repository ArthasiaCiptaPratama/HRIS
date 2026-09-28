import { OpenAPIHono } from "@hono/zod-openapi";
import type { ErrorBody, ErrorCode } from "@hris/shared";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { pingDatabase } from "./core/db.ts";
import { AppError, INTERNAL_ERROR_MESSAGE, ValidationError } from "./core/errors.ts";
import { type DatabaseCheck, registerHealth } from "./core/health.ts";
import { createLogger, type Logger, requestLogger } from "./core/logger.ts";
import { registerOpenApi } from "./core/openapi.ts";
import { getEnv } from "./env.ts";

export interface AppDeps {
  logger: Logger;
  corsOrigins: string[];
  checkDatabase: DatabaseCheck;
}

const HTTP_STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "BUSINESS_RULE_VIOLATION",
};

function errorJson(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  details?: unknown[],
) {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId: c.get("requestId"),
    },
  };
  return c.json(body, status);
}

export function createApp(overrides: Partial<AppDeps> = {}): OpenAPIHono {
  const deps: AppDeps = {
    logger: overrides.logger ?? createLogger(getEnv().LOG_LEVEL),
    corsOrigins: overrides.corsOrigins ?? getEnv().CORS_ORIGINS,
    checkDatabase: overrides.checkDatabase ?? pingDatabase,
  };

  const app = new OpenAPIHono({
    // PROMPT §5: input yang tidak lolos Zod → 400 VALIDATION_ERROR lewat envelope standar.
    // Hanya path & pesan issue; nilai input tidak dikembalikan supaya tidak memantulkan data sensitif.
    defaultHook: (result) => {
      if (!result.success) {
        throw new ValidationError(
          result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        );
      }
    },
  });

  app.use("*", requestId({ generator: () => crypto.randomUUID() }));
  app.use("*", requestLogger(deps.logger));
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: deps.corsOrigins,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
      maxAge: 600,
    }),
  );

  registerOpenApi(app);
  registerHealth(app, deps.checkDatabase);

  app.notFound((c) => errorJson(c, 404, "NOT_FOUND", "Endpoint tidak ditemukan."));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return errorJson(c, err.status, err.code, err.message, err.details);
    }
    if (err instanceof HTTPException) {
      const code = HTTP_STATUS_TO_CODE[err.status];
      if (code) {
        const message =
          code === "VALIDATION_ERROR" ? "Format permintaan tidak valid." : "Permintaan ditolak.";
        return errorJson(c, err.status, code, message);
      }
    }
    // Detail hanya di log server (PROMPT §5: 500 INTERNAL_ERROR).
    deps.logger.error("unhandled error", { requestId: c.get("requestId"), error: err });
    return errorJson(c, 500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE);
  });

  return app;
}
