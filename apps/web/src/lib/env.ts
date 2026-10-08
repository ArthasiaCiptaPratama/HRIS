import { isLoginEmailDomain } from "@hris/shared";
import { z } from "zod";

// PROMPT §3.8: env divalidasi Zod. Hanya VITE_* (publik) yang boleh ada di frontend.
const webEnvSchema = z.object({
  VITE_API_BASE_URL: z.url().default("http://localhost:3000/api/v1"),
  // Supabase Auth (D-005): URL project & publishable/anon key (publik, bukan rahasia).
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  // D-048: domain alamat login NIK (sama dengan LOGIN_EMAIL_DOMAIN api). Kosong = login email saja.
  VITE_LOGIN_EMAIL_DOMAIN: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined))
    .refine((v) => v === undefined || isLoginEmailDomain(v), "Domain login tidak valid."),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const env: WebEnv = webEnvSchema.parse(import.meta.env);
