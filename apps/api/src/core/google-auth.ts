// Token OAuth Google dari kunci service account tanpa library Google: JWT ditandatangani kunci
// service account (jose) lalu ditukar di token_uri. Dipakai Drive (D-060) dan FCM (MOB-D6).
import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";

const keySchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().optional(),
  client_email: z.email(),
  private_key: z.string().startsWith("-----BEGIN PRIVATE KEY-----"),
  token_uri: z.url().default("https://oauth2.googleapis.com/token"),
});
export type ServiceAccountKey = z.infer<typeof keySchema>;

/** `envName` hanya untuk pesan galat; isi kunci tidak pernah ditampilkan. */
export function parseServiceAccountKey(json: string, envName: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`${envName} is not valid JSON`);
  }
  const key = keySchema.safeParse(parsed);
  if (!key.success) throw new Error(`${envName} is not a service account key`);
  return key.data;
}

/** Mengembalikan fungsi pengambil access token yang di-cache sampai 60 detik sebelum kedaluwarsa. */
export function serviceAccountTokenSource(
  key: ServiceAccountKey,
  scope: string,
  fetcher: typeof fetch,
): () => Promise<string> {
  let token: { value: string; expiresAt: number } | null = null;
  return async () => {
    const now = Math.floor(Date.now() / 1000);
    if (token && token.expiresAt - 60 > now) return token.value;
    const assertion = await new SignJWT({ scope })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(key.client_email)
      .setAudience(key.token_uri)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(await importPKCS8(key.private_key, "RS256"));
    const response = await fetcher(key.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) throw new Error(`Google token request failed (${response.status})`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: now + body.expires_in };
    return token.value;
  };
}
