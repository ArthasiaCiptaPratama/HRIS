// D-060: baca file Google Drive lewat service account (hanya `drive.readonly`; yang terlihat hanya
// folder/file yang dibagikan ke email service account). Tanpa library Google: token OAuth lewat
// core/google-auth.ts, lalu Drive API v3 lewat fetch.
import { BusinessRuleError } from "./errors.ts";
import { parseServiceAccountKey, serviceAccountTokenSource } from "./google-auth.ts";

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

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const API = "https://www.googleapis.com/drive/v3/files";

/** `json` = isi file kunci service account (env GOOGLE_SERVICE_ACCOUNT_JSON). */
export function createServiceAccountDrive(
  json: string,
  fetcher: typeof fetch = fetch,
): GoogleDriveReader {
  const accessToken = serviceAccountTokenSource(
    parseServiceAccountKey(json, "GOOGLE_SERVICE_ACCOUNT_JSON"),
    SCOPE,
    fetcher,
  );

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
