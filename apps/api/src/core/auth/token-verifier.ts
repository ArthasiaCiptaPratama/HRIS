// Verifikasi access token Supabase (PLAN §3.1). Diganti implementasi palsu di test (PROMPT §10).
export interface VerifiedToken {
  authUserId: string;
  email: string | undefined;
  /** Waktu terakhir user benar-benar memasukkan password (klaim `amr`); tidak berubah saat token di-refresh. */
  passwordAuthAt: Date | undefined;
}

export interface TokenVerifier {
  /** Melempar UnauthenticatedError bila token tidak valid, kedaluwarsa, atau bukan milik project ini. */
  verify(token: string): Promise<VerifiedToken>;
}
