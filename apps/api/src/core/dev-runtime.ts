import { getEnv } from "../env.ts";

// DEV-ONLY: target Supabase (Auth/JWKS, Admin API, Storage) yang bisa ditukar saat runtime oleh tombol
// switch DB di web (core/dev.ts). Di luar NODE_ENV=development tidak pernah diubah → selalu nilai env.ts.

export interface SupabaseTarget {
  url: string | undefined;
  serviceRoleKey: string | undefined;
}

let override: SupabaseTarget | undefined;
let generation = 0;

/** Target Supabase aktif: hasil switch (dev) atau SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY dari env. */
export function supabaseTarget(): SupabaseTarget {
  if (override) return override;
  const env = getEnv();
  return { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
}

/** DEV-only: ganti target; semua client `switchable` dibangun ulang pada pemakaian berikutnya. */
export function setSupabaseTarget(next: SupabaseTarget): void {
  override = next;
  generation += 1;
}

/**
 * Pembungkus client yang dibangun ulang saat target berubah. Dipakai hanya di development; di tempat lain
 * app.ts memakai instance biasa (tanpa Proxy).
 */
export function switchable<T extends object>(build: () => T): T {
  let built = -1;
  let instance: T | undefined;
  const current = (): T => {
    if (instance === undefined || built !== generation) {
      instance = build();
      built = generation;
    }
    return instance;
  };
  return new Proxy({} as T, {
    get(_target, key) {
      const target = current();
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Parser `.env` sederhana (KEY=VALUE, kutip tunggal/ganda opsional, abaikan komentar). */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === "'" || quote === '"') && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
