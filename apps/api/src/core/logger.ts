import type { MiddlewareHandler } from "hono";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// PROMPT §3.7: data sensitif tidak pernah masuk log. Pemanggil wajib tidak mengirimnya;
// redaksi berbasis nama field ini hanya jaring pengaman terakhir.
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|cookie|api[-_]?key|service[-_]?role|nik|npwp|kk[-_]?number|account[-_]?number|bank|address|alamat|salary|gaji|birth|selfie|phone)/i;

export const REDACTED = "[REDACTED]";

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(inner, depth + 1);
    }
    return output;
  }
  return value;
}

export type LogWriter = (line: string) => void;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const stdoutWriter: LogWriter = (line) => {
  process.stdout.write(`${line}\n`);
};

export function createLogger(
  minLevel: LogLevel = "info",
  write: LogWriter = stdoutWriter,
  base: LogFields = {},
): Logger {
  const log = (level: LogLevel, message: string, fields?: LogFields) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const entry = redact({ ...base, ...fields }) as LogFields;
    write(JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...entry }));
  };
  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}

// Hanya method, path (tanpa query string yang bisa berisi pencarian nama), status, durasi.
export function requestLogger(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = performance.now();
    await next();
    const status = c.res.status;
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    logger[level]("request", {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Math.round(performance.now() - startedAt),
    });
  };
}
