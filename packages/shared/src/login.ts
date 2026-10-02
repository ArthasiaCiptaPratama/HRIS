import { z } from "zod";

// D-048: login dengan Nomor Induk Karyawan. Email user Supabase diganti ke alamat turunan
// `lower(nomor_induk)@<LOGIN_EMAIL_DOMAIN>` (domain `.invalid`, per lingkungan karena Auth staging
// dipakai bersama — D-023). Web memetakan NIK → alamat lalu login langsung ke Supabase (D-033).

const DOMAIN_PATTERN =
  /^(?=.{3,200}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
/** Pola nomor induk yang diterima (sama dengan input calon/karyawan). */
const EMPLOYEE_NUMBER_PATTERN = /^[A-Za-z0-9./-]{1,30}$/;

export function isLoginEmailDomain(domain: string): boolean {
  return DOMAIN_PATTERN.test(domain);
}

/** Alamat login turunan nomor induk. "/" diganti "_" supaya tetap alamat email yang lazim. */
export function loginEmailFor(employeeNumber: string, domain: string): string {
  return `${employeeNumber.trim().toLowerCase().replaceAll("/", "_")}@${domain}`;
}

/**
 * Masukan halaman login → email untuk Supabase. Mengandung "@" = email biasa; selain itu dianggap
 * nomor induk (butuh domain login lingkungan ini). null = masukan tidak bisa dipakai.
 */
export function resolveLoginEmail(input: string, domain: string | undefined): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (value.includes("@")) return value.toLowerCase();
  if (!domain || !EMPLOYEE_NUMBER_PATTERN.test(value)) return null;
  return loginEmailFor(value, domain);
}

export const passwordResetBodySchema = z.object({
  identifier: z.string().trim().min(1, "Isi NIK atau email.").max(254),
});
export type PasswordResetBody = z.infer<typeof passwordResetBodySchema>;
