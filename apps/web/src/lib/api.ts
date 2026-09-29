import { createApiClient } from "./api-client.ts";
import { env } from "./env.ts";
import { supabase } from "./supabase.ts";

export const api = createApiClient({
  baseUrl: env.VITE_API_BASE_URL,
  getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token,
});
