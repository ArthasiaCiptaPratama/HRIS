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
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
