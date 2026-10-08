import { describe, expect, test } from "bun:test";
import {
  isLoginEmailDomain,
  loginEmailFor,
  passwordResetBodySchema,
  resolveLoginEmail,
} from "../src/login.ts";

// D-048: login dengan nomor induk karyawan → alamat turunan `lower(nomor)@<domain per lingkungan>`.
const DOMAIN = "stg.login.akselerasi.invalid";

describe("alamat login turunan NIK", () => {
  test("huruf kecil, spasi dibuang; garis miring → garis bawah", () => {
    expect(loginEmailFor("25.11.ACP.023", DOMAIN)).toBe(`25.11.acp.023@${DOMAIN}`);
    expect(loginEmailFor(" EMP-0001 ", DOMAIN)).toBe(`emp-0001@${DOMAIN}`);
    expect(loginEmailFor("ACP/2026/7", DOMAIN)).toBe(`acp_2026_7@${DOMAIN}`);
  });

  test("masukan login: email dipakai apa adanya (huruf kecil); NIK → alamat turunan", () => {
    expect(resolveLoginEmail(" Ani@Example.com ", DOMAIN)).toBe("ani@example.com");
    expect(resolveLoginEmail("25.11.acp.023", DOMAIN)).toBe(`25.11.acp.023@${DOMAIN}`);
    // Tanpa domain (NIK belum aktif di lingkungan ini): NIK tidak bisa dipetakan.
    expect(resolveLoginEmail("25.11.ACP.023", undefined)).toBeNull();
    expect(resolveLoginEmail("bukan nik!", DOMAIN)).toBeNull();
    expect(resolveLoginEmail("", DOMAIN)).toBeNull();
  });

  test("domain login harus hostname huruf kecil", () => {
    expect(isLoginEmailDomain(DOMAIN)).toBe(true);
    expect(isLoginEmailDomain("dev-oatse.login.akselerasi.invalid")).toBe(true);
    expect(isLoginEmailDomain("Bad Domain")).toBe(false);
    expect(isLoginEmailDomain("@x.invalid")).toBe(false);
  });

  test("lupa password: masukan NIK atau email wajib, dipangkas", () => {
    expect(passwordResetBodySchema.parse({ identifier: " 25.11.ACP.023 " })).toEqual({
      identifier: "25.11.ACP.023",
    });
    expect(passwordResetBodySchema.safeParse({ identifier: "" }).success).toBe(false);
  });
});
