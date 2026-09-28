import { createApp } from "./app.ts";

// Entry untuk Vercel dan Bun lokal: Bun otomatis menyajikan default export yang punya `fetch`,
// memakai port dari env PORT (default 3000).
const app = createApp();

export default app;
