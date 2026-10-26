import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { listTestAccounts } from "../modules/iam/index.ts";
import { currentDatabaseHost } from "./db.ts";
import { supabaseTarget } from "./dev-runtime.ts";

// DEV-ONLY: switcher akun uji di web lokal — sekali klik masuk sebagai akun @arthasia.test tanpa password,
// satu akun per tab. Didaftarkan HANYA saat NODE_ENV=development (app.ts) dan setiap permintaan ditolak bila
// DB atau Supabase Auth bukan lokal. Service role key tidak pernah dikirim ke browser; browser hanya
// menerima sesi akun uji yang dipilih (lewat magic link Supabase Auth lokal).

export const TEST_EMAIL_SUFFIX = "@arthasia.test";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const isLocalHost = (host: string) =>
  LOCAL_HOSTNAMES.has(host.replace(/:\d+$/, "").replace(/^\[|\]$/g, ""));

export interface DevAccountDeps {
  listAccounts: (
    suffix: string,
  ) => Promise<{ email: string; role: string; employeeId: string | null }[]>;
  databaseHost: () => string;
  auth: () => { url: string | undefined; serviceRoleKey: string | undefined };
  fetch: typeof fetch;
}

const defaultDeps = (): DevAccountDeps => ({
  listAccounts: listTestAccounts,
  databaseHost: currentDatabaseHost,
  auth: supabaseTarget,
  fetch: globalThis.fetch,
});

const errorBody = (code: string, message: string) => ({ error: { code, message } });
const sessionBody = z.object({ email: z.email().transform((e) => e.trim().toLowerCase()) });

/** Alasan penolakan bila target tidak lokal; null = aman. */
function notLocal(deps: DevAccountDeps): string | null {
  if (!isLocalHost(deps.databaseHost())) return "DB bukan lokal — switcher akun uji dinonaktifkan.";
  const { url, serviceRoleKey } = deps.auth();
  try {
    if (!url || !serviceRoleKey || !isLocalHost(new URL(url).host)) throw new Error();
  } catch {
    return "Supabase Auth bukan lokal — switcher akun uji dinonaktifkan.";
  }
  return null;
}

export function registerDevAccountRoutes(
  app: OpenAPIHono,
  deps: DevAccountDeps = defaultDeps(),
): void {
  app.get("/api/v1/dev/test-accounts", async (c) => {
    const blocked = notLocal(deps);
    if (blocked) return c.json(errorBody("FORBIDDEN", blocked), 403);
    return c.json({ data: await deps.listAccounts(TEST_EMAIL_SUFFIX) });
  });

  app.post("/api/v1/dev/test-session", async (c) => {
    const blocked = notLocal(deps);
    if (blocked) return c.json(errorBody("FORBIDDEN", blocked), 403);
    const parsed = sessionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(errorBody("VALIDATION_ERROR", "Email tidak valid."), 400);
    const { email } = parsed.data;
    const accounts = await deps.listAccounts(TEST_EMAIL_SUFFIX);
    if (!email.endsWith(TEST_EMAIL_SUFFIX) || !accounts.some((a) => a.email === email)) {
      return c.json(errorBody("FORBIDDEN", `Hanya akun uji aktif ${TEST_EMAIL_SUFFIX}.`), 403);
    }

    const { url, serviceRoleKey } = deps.auth() as { url: string; serviceRoleKey: string };
    const headers = { apikey: serviceRoleKey, "Content-Type": "application/json" };
    const link = (await deps
      .fetch(`${url}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: { ...headers, Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ type: "magiclink", email }),
      })
      .then((r) => r.json())
      .catch(() => null)) as {
      hashed_token?: string;
      properties?: { hashed_token?: string };
    } | null;
    const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
    if (!tokenHash)
      return c.json(errorBody("INTERNAL_ERROR", "Gagal membuat link masuk lokal."), 500);
    const session = (await deps
      .fetch(`${url}/auth/v1/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
      })
      .then((r) => r.json())
      .catch(() => null)) as { access_token?: string } | null;
    if (!session?.access_token) {
      return c.json(errorBody("INTERNAL_ERROR", "Gagal membuat sesi akun uji."), 500);
    }
    return c.json({ data: session });
  });
}
