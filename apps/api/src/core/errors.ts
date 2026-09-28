import type { ErrorCode } from "@hris/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// PROMPT §4: logika bisnis melempar turunan AppError, bukan Error mentah.
// `message` tampil ke pengguna (bahasa Indonesia) dan TIDAK boleh berisi data sensitif.
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  readonly details: unknown[] | undefined;

  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string, details?: unknown[]) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details?: unknown[], message = "Data yang dikirim tidak valid.") {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.") {
    super(401, "UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Anda tidak memiliki akses untuk tindakan ini.") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Data tidak ditemukan.") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Data bentrok dengan data yang sudah ada.") {
    super(409, "CONFLICT", message);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, details?: unknown[]) {
    super(422, "BUSINESS_RULE_VIOLATION", message, details);
  }
}

export const INTERNAL_ERROR_MESSAGE = "Terjadi kesalahan pada server. Silakan coba lagi.";
