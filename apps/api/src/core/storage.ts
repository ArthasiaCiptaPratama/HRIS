import { createClient } from "@supabase/supabase-js";
import { BusinessRuleError } from "./errors.ts";

// Supabase Storage (service role) — HANYA server/script (PROMPT §3.13). Antarmuka supaya test memakai
// implementasi palsu (tests/helpers/storage.ts) dan tidak pernah menyentuh bucket sungguhan.

/** D-037: foto profil pegawai. Bucket private; akses hanya lewat URL bertanda tangan dari API. */
export const EMPLOYEE_PHOTO_BUCKET = "employee-photos";
export const EMPLOYEE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const EMPLOYEE_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
// D-045 b: dokumen karyawan (KTP, KK, ijazah, buku rekening, …) — bucket private terpisah.
export const EMPLOYEE_DOCUMENT_BUCKET = "employee-documents";
export const EMPLOYEE_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const EMPLOYEE_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export interface BucketConfig {
  id: string;
  fileSizeLimit: number;
  allowedMimeTypes: readonly string[];
}

export interface StoredObjectInfo {
  size: number;
  contentType: string | null;
}

export interface StorageAdmin {
  /** URL + token sekali pakai untuk mengunggah langsung dari browser ke `path`. */
  createSignedUploadUrl(
    bucket: string,
    path: string,
  ): Promise<{ signedUrl: string; token: string; path: string }>;
  /** URL baca bertanda tangan per path (path yang gagal tidak ada di map). */
  createSignedUrls(
    bucket: string,
    paths: string[],
    expiresInSeconds: number,
  ): Promise<Map<string, string>>;
  /** null bila objek tidak ada. */
  getObjectInfo(bucket: string, path: string): Promise<StoredObjectInfo | null>;
  removeObjects(bucket: string, paths: string[]): Promise<void>;
  /** D-060: unggah dari server (lampiran Google Drive di Import); path dibuat server, tidak menimpa. */
  uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Idempoten: buat bucket private bila belum ada, lalu samakan batas ukuran & tipe. */
  ensurePrivateBucket(config: BucketConfig): Promise<"created" | "updated">;
}

export function createSupabaseStorage(supabaseUrl: string, serviceRoleKey: string): StorageAdmin {
  const storage = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;

  return {
    async createSignedUploadUrl(bucket, path) {
      const { data, error } = await storage.from(bucket).createSignedUploadUrl(path);
      if (error) throw new Error(`Supabase createSignedUploadUrl failed: ${error.message}`);
      return data;
    },

    async createSignedUrls(bucket, paths, expiresInSeconds) {
      const unique = [...new Set(paths)];
      if (unique.length === 0) return new Map();
      const { data, error } = await storage.from(bucket).createSignedUrls(unique, expiresInSeconds);
      if (error) throw new Error(`Supabase createSignedUrls failed: ${error.message}`);
      const result = new Map<string, string>();
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) result.set(item.path, item.signedUrl);
      }
      return result;
    },

    async getObjectInfo(bucket, path) {
      const { data, error } = await storage.from(bucket).info(path);
      if (error) {
        // Objek tidak ada → 400/404 dari Storage; selain itu kegagalan layanan.
        const status = (error as { statusCode?: string | number; status?: number }).status;
        const code = (error as { statusCode?: string | number }).statusCode;
        if (status === 400 || status === 404 || code === "404" || code === 404) return null;
        if (/not found/i.test(error.message)) return null;
        throw new Error(`Supabase storage info failed: ${error.message}`);
      }
      return { size: data.size ?? 0, contentType: data.contentType ?? null };
    },

    async removeObjects(bucket, paths) {
      if (paths.length === 0) return;
      const { error } = await storage.from(bucket).remove(paths);
      if (error) throw new Error(`Supabase storage remove failed: ${error.message}`);
    },

    async uploadObject(bucket, path, bytes, contentType) {
      const { error } = await storage
        .from(bucket)
        .upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
    },

    async ensurePrivateBucket({ id, fileSizeLimit, allowedMimeTypes }) {
      const options = {
        public: false,
        fileSizeLimit,
        allowedMimeTypes: [...allowedMimeTypes],
      };
      const existing = await storage.getBucket(id);
      if (existing.data) {
        const { error } = await storage.updateBucket(id, options);
        if (error) throw new Error(`Supabase updateBucket failed: ${error.message}`);
        return "updated";
      }
      const { error } = await storage.createBucket(id, options);
      if (error) throw new Error(`Supabase createBucket failed: ${error.message}`);
      return "created";
    },
  };
}

/** Dipakai bila SUPABASE_URL/SERVICE_ROLE_KEY belum diisi: aksi foto ditolak, baca foto = tanpa URL. */
export const UNCONFIGURED_STORAGE: StorageAdmin = {
  createSignedUploadUrl: notConfigured,
  async createSignedUrls() {
    return new Map();
  },
  getObjectInfo: notConfigured,
  removeObjects: notConfigured,
  uploadObject: notConfigured,
  ensurePrivateBucket: notConfigured,
};

async function notConfigured(): Promise<never> {
  throw new BusinessRuleError("Layanan penyimpanan file belum dikonfigurasi (Supabase Storage).");
}
