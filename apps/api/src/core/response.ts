import { z } from "@hono/zod-openapi";
import { errorBodySchema, type PaginationMeta, paginationMetaSchema } from "@hris/shared";

// PROMPT §5: envelope sukses { data, meta? } dan envelope error { error }.
export function ok<T>(data: T): { data: T } {
  return { data };
}

export function paginated<T>(data: T[], meta: PaginationMeta): { data: T[]; meta: PaginationMeta } {
  return { data, meta };
}

export function dataEnvelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema });
}

export function paginatedEnvelope<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema });
}

const errorContent = (description: string) => ({
  description,
  content: { "application/json": { schema: errorBodySchema } },
});

// Respons error standar untuk dokumen OpenAPI (PROMPT §5: termasuk respons error).
export const ERROR_RESPONSES = {
  400: errorContent("VALIDATION_ERROR: input tidak lolos validasi"),
  401: errorContent("UNAUTHENTICATED: token tidak ada/tidak valid"),
  403: errorContent("FORBIDDEN: tidak berhak"),
  404: errorContent("NOT_FOUND: data tidak ada atau tidak boleh diketahui"),
  409: errorContent("CONFLICT: duplikat atau bentrok status"),
  422: errorContent("BUSINESS_RULE_VIOLATION: melanggar aturan bisnis"),
  500: errorContent("INTERNAL_ERROR: kesalahan tak terduga"),
} as const;
