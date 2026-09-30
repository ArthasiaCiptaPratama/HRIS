import { OpenAPIHono } from "@hono/zod-openapi";
import type { ErrorBody, ErrorCode } from "@hris/shared";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { type ActorLoader, loadActor } from "./core/access/index.ts";
import { authenticate, createSupabaseVerifier, type TokenVerifier } from "./core/auth/index.ts";
import { pingDatabase } from "./core/db.ts";
import { createLogSender, createSmtpSender, type EmailSender } from "./core/email.ts";
import {
  AppError,
  INTERNAL_ERROR_MESSAGE,
  UnauthenticatedError,
  ValidationError,
} from "./core/errors.ts";
import { type DatabaseCheck, registerHealth } from "./core/health.ts";
import { createLogger, type Logger, requestLogger } from "./core/logger.ts";
import { registerOpenApi } from "./core/openapi.ts";
import { createSupabaseStorage, type StorageAdmin, UNCONFIGURED_STORAGE } from "./core/storage.ts";
import {
  type AuthAdmin,
  createSupabaseAdmin,
  UNCONFIGURED_AUTH_ADMIN,
} from "./core/supabase-admin.ts";
import { type Env, getEnv } from "./env.ts";
import { registerCronRoutes } from "./jobs/cron.ts";
import { registerEmployeeRoutes } from "./modules/employee/index.ts";
import { loadActor as loadIamActor, registerIamRoutes } from "./modules/iam/index.ts";
import { configureNotification, registerNotificationRoutes } from "./modules/notification/index.ts";
import { registerOrganizationRoutes } from "./modules/organization/index.ts";

export interface AppDeps {
  logger: Logger;
  corsOrigins: string[];
  checkDatabase: DatabaseCheck;
  tokenVerifier: TokenVerifier;
  actorLoader: ActorLoader;
  authAdmin: AuthAdmin;
  storage: StorageAdmin;
  /** PLAN §3.3: prefix path objek Storage (lokal `dev/<nama>/`, staging/produksi kosong). */
  storagePathPrefix: string;
  appUrl: string;
  emailSender: EmailSender;
  cronSecret: string | undefined;
}

// Hanya terjadi saat NODE_ENV=test tanpa SUPABASE_URL (env.ts mewajibkannya di tempat lain).
const REJECT_ALL_VERIFIER: TokenVerifier = {
  verify: async () => {
    throw new UnauthenticatedError();
  },
};

function defaultAuthAdmin(): AuthAdmin {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
  return SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseAdmin(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : UNCONFIGURED_AUTH_ADMIN;
}

// D-037: test tidak pernah menyentuh bucket sungguhan (pakai tests/helpers/storage.ts).
function defaultStorage(): StorageAdmin {
  const { NODE_ENV, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
  return NODE_ENV !== "test" && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseStorage(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : UNCONFIGURED_STORAGE;
}

// D-025: SMTP hanya bila lengkap (staging/produksi); lokal → email dicatat ke log saja.
// NODE_ENV=test selalu log: test tidak boleh mengirim email sungguhan walau `.env` berisi SMTP_*.
export function selectEmailSender(env: Env, logger: Logger): EmailSender {
  const { NODE_ENV, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = env;
  return NODE_ENV !== "test" && SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM
    ? createSmtpSender({
        host: SMTP_HOST,
        port: SMTP_PORT,
        user: SMTP_USER,
        pass: SMTP_PASS,
        from: EMAIL_FROM,
      })
    : createLogSender(logger);
}

function defaultVerifier(): TokenVerifier {
  const supabaseUrl = getEnv().SUPABASE_URL;
  return supabaseUrl ? createSupabaseVerifier({ supabaseUrl }) : REJECT_ALL_VERIFIER;
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
  const logger = overrides.logger ?? createLogger(getEnv().LOG_LEVEL);
  const deps: AppDeps = {
    logger,
    corsOrigins: overrides.corsOrigins ?? getEnv().CORS_ORIGINS,
    checkDatabase: overrides.checkDatabase ?? pingDatabase,
    tokenVerifier: overrides.tokenVerifier ?? defaultVerifier(),
    actorLoader: overrides.actorLoader ?? ((authUserId) => loadIamActor(authUserId)),
    authAdmin: overrides.authAdmin ?? defaultAuthAdmin(),
    storage: overrides.storage ?? defaultStorage(),
    storagePathPrefix: overrides.storagePathPrefix ?? getEnv().STORAGE_PATH_PREFIX,
    appUrl: overrides.appUrl ?? getEnv().APP_URL,
    emailSender: overrides.emailSender ?? selectEmailSender(getEnv(), logger),
    cronSecret: "cronSecret" in overrides ? overrides.cronSecret : getEnv().CRON_SECRET,
  };
  configureNotification({ sender: deps.emailSender, appUrl: deps.appUrl, logger: deps.logger });

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

  // Respons API berisi data pribadi/per akun: jangan disimpan cache browser/proxy (PLAN §10 PDP).
  // Cache sisi klien diatur TanStack Query di memori, bukan cache HTTP.
  app.use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "private, no-store");
  });

  registerOpenApi(app);
  registerHealth(app, deps.checkDatabase);

  // Endpoint terproteksi: verifikasi JWT → muat akun, role, grant dari DB (D-008).
  const protect = [authenticate(deps.tokenVerifier), loadActor(deps.actorLoader)];
  registerIamRoutes(app, { protect, authAdmin: deps.authAdmin, appUrl: deps.appUrl });
  registerNotificationRoutes(app, { protect });
  registerOrganizationRoutes(app, { protect });
  registerEmployeeRoutes(app, {
    protect,
    authAdmin: deps.authAdmin,
    storage: deps.storage,
    storagePathPrefix: deps.storagePathPrefix,
  });
  registerCronRoutes(app, { cronSecret: deps.cronSecret, logger: deps.logger });

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
