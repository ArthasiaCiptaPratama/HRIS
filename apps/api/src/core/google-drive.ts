// D-060: baca file Google Drive lewat service account (hanya `drive.readonly`; yang terlihat hanya
// folder/file yang dibagikan ke email service account). Tanpa library Google: token OAuth didapat dari
// JWT yang ditandatangani kunci service account (jose), lalu Drive API v3 lewat fetch.
import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";
import { BusinessRuleError } from "./errors.ts";

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Sidik jari dari Google (file biner); null untuk dokumen Google (Docs/Sheets). */
  sha256: string | null;
}

export interface GoogleDriveReader {
  readonly configured: boolean;
  /** null = file tidak ada / tidak dibagikan ke service account. */
  getMeta(fileId: string): Promise<DriveFileMeta | null>;
  download(fileId: string): Promise<Uint8Array>;
}

const keySchema = z.object({
  type: z.literal("service_account"),
  client_email: z.email(),
  private_key: z.string().startsWith("-----BEGIN PRIVATE KEY-----"),
  token_uri: z.url().default("https://oauth2.googleapis.com/token"),
});

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const API = "https://www.googleapis.com/drive/v3/files";

/** `json` = isi file kunci service account (env GOOGLE_SERVICE_ACCOUNT_JSON). */
export function createServiceAccountDrive(
  json: string,
  fetcher: typeof fetch = fetch,
): GoogleDriveReader {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  const key = keySchema.safeParse(parsed);
  if (!key.success) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not a service account key");
  const { client_email: email, private_key: pem, token_uri: tokenUri } = key.data;
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (token && token.expiresAt - 60 > now) return token.value;
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(email)
      .setAudience(tokenUri)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(await importPKCS8(pem, "RS256"));
    const response = await fetcher(tokenUri, {
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
  }

  const get = async (url: string) =>
    fetcher(url, { headers: { authorization: `Bearer ${await accessToken()}` } });

  return {
    configured: true,
    async getMeta(fileId) {
      const response = await get(
        `${API}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,sha256Checksum&supportsAllDrives=true`,
      );
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Error(`Google Drive metadata failed (${response.status})`);
      const body = (await response.json()) as {
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        sha256Checksum?: string;
      };
      return {
        id: body.id,
        name: body.name,
        mimeType: body.mimeType,
        size: Number(body.size ?? 0),
        sha256: body.sha256Checksum?.toLowerCase() ?? null,
      };
    },
    async download(fileId) {
      const response = await get(
        `${API}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      );
      if (!response.ok) throw new Error(`Google Drive download failed (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

/** Env belum diisi: lampiran tetap tercatat di antrean, pemrosesan ditolak dengan pesan jelas. */
export const UNCONFIGURED_DRIVE: GoogleDriveReader = {
  configured: false,
  getMeta: notConfigured,
  download: notConfigured,
};

async function notConfigured(): Promise<never> {
  throw new BusinessRuleError(
    "Google Drive belum dikonfigurasi (GOOGLE_SERVICE_ACCOUNT_JSON). Lampiran tetap tersimpan di antrean.",
  );
}
