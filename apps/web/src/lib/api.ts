import { createApiClient } from "./api-client.ts";
import { env } from "./env.ts";

export const api = createApiClient({ baseUrl: env.VITE_API_BASE_URL });
