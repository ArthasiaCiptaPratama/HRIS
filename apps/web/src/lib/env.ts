import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === "" ? undefined : value));

// PROMPT §3.8: env divalidasi Zod. Hanya VITE_* (publik) yang boleh ada di frontend.
const webEnvSchema = z.object({
  VITE_API_BASE_URL: z.url().default("http://localhost:3000/api/v1"),
  // Baru dipakai mulai Fase 2 (login Supabase).
  VITE_SUPABASE_URL: optionalString,
  VITE_SUPABASE_ANON_KEY: optionalString,
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const env: WebEnv = webEnvSchema.parse(import.meta.env);
