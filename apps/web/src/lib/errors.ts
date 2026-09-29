import { ApiError } from "./api-client";

// PROMPT §7: 403 ditampilkan dengan pesan jelas; pesan API sudah berbahasa Indonesia.
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === 403 && !error.message
      ? "Anda tidak memiliki akses untuk tindakan ini."
      : error.message;
  }
  return "Terjadi kesalahan. Coba lagi.";
}
