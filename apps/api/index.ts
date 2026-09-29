// Entry Vercel (D-036). Builder Hono memilih file pertama yang meng-import "hono" dengan urutan
// app → index → server → src/app → src/index; tanpa file ini yang terpilih src/app.ts (tanpa default export).
// Lokal & Docker tetap memakai src/index.ts.
import type { Env, Hono } from "hono";
import app from "./src/index.ts";

export default app satisfies Hono<Env>;
