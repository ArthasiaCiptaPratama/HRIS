import { createClient } from "@supabase/supabase-js";
import { env } from "./env.ts";

// Login langsung ke Supabase Auth (PLAN §3.1); token dikirim sebagai Bearer ke API kita.
// detectSessionInUrl: menangkap sesi dari link undangan/reset password (/auth/callback).
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
