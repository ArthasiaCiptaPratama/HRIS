import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { ValidationError } from "./errors.ts";

/**
 * MOB-D7 (punch) & MOB-D22 (pengajuan): header `Idempotency-Key` dari klien supaya retry setelah respons
 * hilang tidak menjadi 409/duplikat. Kunci = UUID / string aman 8–64 karakter, disimpan di kolom unik
 * `idempotency_key` tabel pemilik. Isi body tidak dibandingkan: kunci sama dari pemilik sama selalu
 * mengembalikan record yang sudah ada.
 */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;

/** Deklarasi header untuk OpenAPI (klien generate punya parameternya); validasi tetap `idempotencyKeyOf`. */
export const idempotencyHeaders = (description: string) =>
  z.object({
    [IDEMPOTENCY_KEY_HEADER]: z.string().regex(IDEMPOTENCY_KEY).optional().openapi({ description }),
  });

/** Header `Idempotency-Key` yang sudah divalidasi; tidak ada → `undefined`, format salah → 400. */
export function idempotencyKeyOf(c: Context): string | undefined {
  const key = c.req.header(IDEMPOTENCY_KEY_HEADER);
  if (key === undefined) return undefined;
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new ValidationError([
      {
        path: IDEMPOTENCY_KEY_HEADER,
        code: "invalid_format",
        message: "Expected 8-64 [A-Za-z0-9_-]",
      },
    ]);
  }
  return key;
}

/** Pelanggaran indeks unik `idempotency_key` (dua permintaan dengan kunci sama bersamaan). */
export function isIdempotencyConflict(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } };
  return e?.code === "P2002" && JSON.stringify(e.meta?.target ?? "").includes("idempotency");
}
