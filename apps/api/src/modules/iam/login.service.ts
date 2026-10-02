import { createHash } from "node:crypto";
import { loginEmailFor } from "@hris/shared";
import type { EmailSender } from "../../core/email.ts";
import { BusinessRuleError } from "../../core/errors.ts";
import type { Logger } from "../../core/logger.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import * as repository from "./iam.repository.ts";

// D-048: login dengan Nomor Induk Karyawan — email user Supabase diganti alamat turunan NIK
// (`accounts.login_email`), dan lupa password lewat API (tautan ke email pribadi, tanpa enumerasi).

export interface NikLoginDeps {
  authAdmin: AuthAdmin;
  /** LOGIN_EMAIL_DOMAIN lingkungan ini; kosong = login NIK nonaktif. */
  domain: string | undefined;
}

export type NikLoginOutcome = "disabled" | "none" | "unchanged" | "switched";

/**
 * Pasang/perbarui alamat login NIK akun yang tertaut karyawan, di transaksi pemanggil. Email Auth
 * diganti SETELAH baris akun diperbarui; bila Supabase gagal, error dilempar → transaksi dibatalkan.
 * `mode: "refresh"` (ubah nomor induk) hanya untuk akun yang sudah login NIK.
 */
export async function applyNikLogin(
  employeeId: string,
  employeeNumber: string,
  deps: NikLoginDeps,
  tx: repository.IamTx,
  mode: "enable" | "refresh" = "enable",
): Promise<NikLoginOutcome> {
  if (!deps.domain) return "disabled";
  const account = await repository.findAccountByEmployeeId(tx, employeeId);
  if (!account) return "none";
  if (mode === "refresh" && account.loginEmail === null) return "unchanged";
  const address = loginEmailFor(employeeNumber, deps.domain);
  if (account.loginEmail === address) return "unchanged";
  if (await repository.findAccountUsingAddress(tx, address, account.id)) {
    throw new BusinessRuleError(
      "Alamat login NIK bentrok dengan akun lain. Periksa nomor induk karyawan.",
    );
  }
  await repository.setLoginEmail(tx, account.id, address);
  await deps.authAdmin.updateUserEmail(account.authUserId, address);
  return "switched";
}

// ── Lupa password ────────────────────────────────────────────────────────────────────────────

/** Pencarian karyawan untuk lupa password — disuntik dari modul employee (PLAN §3.2). */
export interface LoginContactDirectory {
  employeeIdByNumber(employeeNumber: string): Promise<string | null>;
  employeeIdByPersonalEmail(email: string): Promise<string | null>;
  personalEmailOf(employeeId: string): Promise<string | null>;
}

export interface PasswordResetDeps {
  authAdmin: AuthAdmin;
  emailSender: EmailSender;
  directory: LoginContactDirectory;
  /** `<web>/auth/callback` (atur password baru). */
  redirectTo: string;
  logger: Logger;
}

export const PASSWORD_RESET_LIMIT = 3;
const HOUR_MS = 60 * 60 * 1000;

const hashKey = (identifier: string) =>
  createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");

/**
 * Respons selalu sama di route (tanpa enumerasi). Mengembalikan alasan internal untuk test/log saja.
 * Batas: 3 permintaan per masukan per jam (masukan disimpan sebagai hash).
 */
export async function requestPasswordReset(
  identifier: string,
  deps: PasswordResetDeps,
  now = new Date(),
): Promise<"sent" | "limited" | "unknown" | "no_contact" | "failed"> {
  const value = identifier.trim();
  const previous = await repository.recordResetAttempt(
    hashKey(value),
    new Date(now.getTime() - HOUR_MS),
    new Date(now.getTime() - 24 * HOUR_MS),
  );
  if (previous >= PASSWORD_RESET_LIMIT) return "limited";

  let account: Awaited<ReturnType<typeof repository.findAccountForReset>> = null;
  if (value.includes("@")) {
    const email = value.toLowerCase();
    account = await repository.findAccountForReset({ email });
    if (!account) {
      const employeeId = await deps.directory.employeeIdByPersonalEmail(email);
      if (employeeId) account = await repository.findAccountForReset({ employeeId });
    }
  } else {
    const employeeId = await deps.directory.employeeIdByNumber(value);
    if (employeeId) account = await repository.findAccountForReset({ employeeId });
  }
  if (!account?.isActive) return "unknown";

  // Tujuan: email pribadi karyawan; akun tanpa data karyawan → email akun (bila nyata).
  const personal = account.employeeId
    ? await deps.directory.personalEmailOf(account.employeeId)
    : null;
  const to = personal ?? (account.loginEmail ? null : account.email);
  if (!to) return "no_contact";
  try {
    const link = await deps.authAdmin.generateRecoveryLink(
      account.loginEmail ?? account.email,
      deps.redirectTo,
    );
    // PLAN §5.6: email hanya pemberitahuan + tautan, tanpa data sensitif.
    await deps.emailSender.send({
      to,
      subject: "Atur ulang password Akselerasi Arthasia",
      text: [
        "Kami menerima permintaan atur ulang password akun Akselerasi Arthasia Anda.",
        "",
        `Buka tautan berikut untuk membuat password baru: ${link}`,
        "",
        "Abaikan email ini bila Anda tidak memintanya; password Anda tidak berubah.",
      ].join("\n"),
    });
    return "sent";
  } catch (error) {
    deps.logger.error("password reset failed", {
      accountId: account.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}
