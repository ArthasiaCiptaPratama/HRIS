import { z } from "@hono/zod-openapi";

// MOB-D7 #1: kontrak respons OpenAPI harus sama persis dengan tipe keluaran service.
// `assertExact<z.infer<typeof skema>, TipeService>(true)` gagal saat typecheck bila keduanya berbeda,
// sehingga skema respons tidak bisa diam-diam tertinggal dari service.

export type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export function assertExact<A, B>(_proof: Exact<A, B>): void {}

/**
 * Bentuk tipe setelah `c.json()` (JSON.stringify): Date/Decimal → hasil `toJSON()` (string).
 * Pakai bila service mengembalikan Date/Decimal: `assertExact<z.infer<typeof s>, Jsonify<T>>(true)`.
 */
export type Jsonify<T> = T extends { toJSON(): infer R }
  ? R
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

/**
 * Field nullable yang merujuk skema bernama (`.openapi("Nama")`). `skema.nullable()` menghasilkan
 * `allOf: [$ref, {type: [object, null]}]` (atau kehilangan `null`) yang merusak codegen Dart (MOB-D9);
 * union eksplisit menghasilkan `anyOf: [$ref, {type: "null"}]` (OpenAPI 3.1 standar).
 */
export const nullableRef = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);
