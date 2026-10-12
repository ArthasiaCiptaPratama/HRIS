import { getEnv } from "./env.ts";
import app from "./index.ts";

// Entry Bun.serve untuk lokal (`bun run dev`/`start`) dan Docker (D-016). Vercel tetap memakai
// `index.ts` (function Hono, tidak lewat Bun.serve). Bun default menutup koneksi yang diam > 10 dtk;
// request lampiran Drive (±8 dtk kerja + unduhan lambat) bisa melewatinya → koneksi diputus padahal
// server masih bekerja. 60 dtk = di bawah batas Bun (255) dan setara timeout proxy umum.
export default {
  port: getEnv().PORT,
  fetch: app.fetch,
  idleTimeout: 60,
};
