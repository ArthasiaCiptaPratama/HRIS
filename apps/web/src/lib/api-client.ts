import { type ErrorCode, errorBodySchema } from "@hris/shared";
import type { z } from "zod";

// Error dari API dalam bentuk envelope PROMPT §5. `message` sudah berbahasa Indonesia.
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly requestId: string | undefined;
  readonly details: unknown[] | undefined;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    requestId?: string,
    details?: unknown[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  // Diisi mulai Fase 2: access token Supabase untuk header Authorization.
  getAccessToken?: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions<T extends z.ZodType> {
  schema: T;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  // Endpoint tertentu (mis. health 503) tetap mengembalikan envelope data pada status non-2xx.
  acceptStatuses?: number[];
}

export type ApiClient = <T extends z.ZodType>(
  path: string,
  options: RequestOptions<T>,
) => Promise<z.infer<T>>;

export function createApiClient({
  baseUrl,
  getAccessToken,
  // Dibaca saat dipanggil (bukan saat modul dimuat) supaya fetch global yang diganti tetap dipakai.
  fetchImpl = (input, init) => globalThis.fetch(input, init),
}: ApiClientOptions): ApiClient {
  return async (path, { schema, method = "GET", body, signal, acceptStatuses = [] }) => {
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const token = await getAccessToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
        signal: signal ?? null,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw new ApiError(0, "INTERNAL_ERROR", "Tidak dapat terhubung ke server.");
    }

    const payload: unknown = await response.json().catch(() => undefined);

    if (response.ok || acceptStatuses.includes(response.status)) {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiError(
          response.status,
          "INTERNAL_ERROR",
          "Respons server tidak sesuai format.",
        );
      }
      return parsed.data;
    }

    const errorBody = errorBodySchema.safeParse(payload);
    if (errorBody.success) {
      const { code, message, requestId, details } = errorBody.data.error;
      throw new ApiError(response.status, code, message, requestId, details);
    }
    throw new ApiError(response.status, "INTERNAL_ERROR", "Terjadi kesalahan pada server.");
  };
}
