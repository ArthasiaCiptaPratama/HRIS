/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.join(import.meta.dirname, "..", "..");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Satu file .env di root monorepo (CODEMAP §8). Hanya VITE_* yang sampai ke browser.
  envDir: rootDir,
  resolve: {
    alias: { "@": path.join(import.meta.dirname, "src") },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Nilai palsu: supabase-js di-mock di test, tidak ada panggilan jaringan.
    env: {
      VITE_API_BASE_URL: "http://api.test/api/v1",
      VITE_SUPABASE_URL: "https://project-test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "sb_publishable_test_key_value_1234567890",
    },
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
