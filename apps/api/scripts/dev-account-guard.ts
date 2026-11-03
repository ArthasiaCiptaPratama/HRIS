/** Guard ketat: tidak ada override untuk membuat akun uji pada layanan non-lokal. */
export function assertLocalDevAccountTargets(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV !== "development") throw new Error("Akun uji hanya untuk NODE_ENV=development");
  for (const key of ["DATABASE_URL", "SUPABASE_URL", "DIRECT_URL"] as const) {
    if (key === "DIRECT_URL" && !env[key]) continue;
    let valid = false;
    try {
      const url = new URL(env[key] ?? "");
      const protocols = key === "SUPABASE_URL" ? ["http:", "https:"] : ["postgres:", "postgresql:"];
      valid =
        protocols.includes(url.protocol) &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    } catch {
      // URL kosong/rusak gagal tertutup; jangan tampilkan nilai rahasia.
    }
    if (!valid) throw new Error(`${key} harus menunjuk layanan lokal`);
  }
}
