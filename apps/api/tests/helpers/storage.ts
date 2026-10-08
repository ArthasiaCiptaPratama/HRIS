import type { StorageAdmin, StoredObjectInfo } from "../../src/core/storage.ts";

/** Storage palsu (D-037): objek disimpan di memori, tidak pernah menghubungi Supabase (PROMPT §10). */
export function createFakeStorage() {
  const objects = new Map<string, StoredObjectInfo>(); // "bucket/path" → info
  const uploadUrls: string[] = [];
  const removed: string[] = [];
  const uploaded: { key: string; contentType: string; size: number }[] = [];
  const key = (bucket: string, path: string) => `${bucket}/${path}`;

  const storage: StorageAdmin = {
    async createSignedUploadUrl(bucket, path) {
      uploadUrls.push(key(bucket, path));
      return { signedUrl: `https://storage.test/upload/${key(bucket, path)}`, token: "tok", path };
    },
    async createSignedUrls(bucket, paths) {
      const result = new Map<string, string>();
      for (const path of paths) {
        if (objects.has(key(bucket, path))) {
          result.set(path, `https://storage.test/sign/${key(bucket, path)}?token=x`);
        }
      }
      return result;
    },
    async getObjectInfo(bucket, path) {
      return objects.get(key(bucket, path)) ?? null;
    },
    async removeObjects(bucket, paths) {
      for (const path of paths) {
        objects.delete(key(bucket, path));
        removed.push(key(bucket, path));
      }
    },
    async uploadObject(bucket, path, bytes, contentType) {
      if (objects.has(key(bucket, path))) throw new Error("object exists");
      objects.set(key(bucket, path), { size: bytes.byteLength, contentType });
      uploaded.push({ key: key(bucket, path), contentType, size: bytes.byteLength });
    },
    async ensurePrivateBucket() {
      return "created";
    },
  };

  return {
    storage,
    uploadUrls,
    removed,
    /** D-060: unggahan dari server (lampiran Import). */
    uploaded,
    /** Mensimulasikan browser yang sudah mengunggah ke signed upload URL. */
    putObject(bucket: string, path: string, info: StoredObjectInfo) {
      objects.set(key(bucket, path), info);
    },
    has(bucket: string, path: string) {
      return objects.has(key(bucket, path));
    },
  };
}
