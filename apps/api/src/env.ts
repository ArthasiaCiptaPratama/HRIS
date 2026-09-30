import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === "" ? undefined : value));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DIRECT_URL: optionalString,

    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
    APP_URL: z.url().default("http://localhost:5173"),

    // Wajib di luar NODE_ENV=test (verifikasi JWT via JWKS, core/auth). Test memakai verifier pengganti.
    SUPABASE_URL: optionalString.pipe(z.url().optional()),
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    CRON_SECRET: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalString
      .transform((value) => (value === undefined ? undefined : Number(value)))
      .pipe(z.number().int().min(1).max(65535).optional()),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    EMAIL_FROM: optionalString,
    // PLAN §3.3: lokal `dev/<nama-developer>/` (bucket staging dipakai bersama); staging/produksi kosong.
    STORAGE_PATH_PREFIX: z
      .string()
      .regex(/^(?:[a-z0-9][a-z0-9-]*\/)*$/, "lowercase segments ending with '/', e.g. dev/name/")
      .max(64)
      .default(""),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "test" && !env.SUPABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_URL"],
        message: "required outside NODE_ENV=test",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Hanya nama variabel & alasan; nilai env (bisa berisi rahasia) tidak pernah ditampilkan.
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

// Lazy supaya import modul tidak gagal sebelum env siap (mis. saat test mengganti env).
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
