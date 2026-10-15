import { createClient } from "@supabase/supabase-js";
import { env } from "./env.ts";

/**
 * DEV-ONLY: konfigurasi Auth dari tombol switch DB (URL + publishable key — publik, bukan rahasia), supaya
 * pindah lokal ⇄ Supabase tidak perlu restart Vite. Build produksi: import.meta.env.DEV = false → selalu env.
 */
export const DEV_AUTH_KEY = "hris.dev.auth";

function devAuthOverride(): { url: string; anonKey: string } | null {
  if (!import.meta.env.DEV) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(DEV_AUTH_KEY) ?? "null") as {
      url?: unknown;
      anonKey?: unknown;
    } | null;
    return typeof raw?.url === "string" && typeof raw.anonKey === "string" && raw.url && raw.anonKey
      ? { url: raw.url, anonKey: raw.anonKey }
      : null;
  } catch {
    return null;
  }
}

const auth = devAuthOverride() ?? {
  url: env.VITE_SUPABASE_URL,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
};

/** URL Supabase Auth yang benar-benar dipakai client ini (dibandingkan widget switch DB di dev). */
export const activeSupabaseUrl = auth.url;

// Login langsung ke Supabase Auth (PLAN §3.1); token dikirim sebagai Bearer ke API kita.
// detectSessionInUrl: menangkap sesi dari link undangan/reset password (/auth/callback).
export const supabase = createClient(auth.url, auth.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
