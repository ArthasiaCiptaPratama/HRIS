// Menyiapkan bucket Supabase Storage yang dipakai aplikasi (D-037). Idempoten: aman diulang.
// Pakai: bun run storage:setup   (memakai SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY dari .env)
// Staging & produksi memakai script yang sama; tidak ada pengaturan bucket manual di dashboard.
import { z } from "zod";
import {
  createSupabaseStorage,
  EMPLOYEE_PHOTO_BUCKET,
  EMPLOYEE_PHOTO_MAX_BYTES,
  EMPLOYEE_PHOTO_MIME_TYPES,
} from "../src/core/storage.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);

const env = z
  .object({ SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(20) })
  .safeParse(process.env);
if (!env.success) {
  out("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env.");
  process.exit(1);
}

const storage = createSupabaseStorage(env.data.SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY);
const buckets = [
  {
    id: EMPLOYEE_PHOTO_BUCKET,
    fileSizeLimit: EMPLOYEE_PHOTO_MAX_BYTES,
    allowedMimeTypes: EMPLOYEE_PHOTO_MIME_TYPES,
  },
];

for (const bucket of buckets) {
  const result = await storage.ensurePrivateBucket(bucket);
  out(
    `${bucket.id}: ${result === "created" ? "dibuat" : "diperbarui"} (private, maks ${bucket.fileSizeLimit} byte, ${bucket.allowedMimeTypes.join(", ")})`,
  );
}
out(`Target: ${new URL(env.data.SUPABASE_URL).host}`);
