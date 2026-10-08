import { describe, expect, test } from "bun:test";
import {
  type OnboardingSnapshot,
  onboardingCompleteness,
  personalSectionSchema,
} from "../src/onboarding-form.ts";

// D-045 b: aturan wajib wizard onboarding (design §7) — dipakai API (kirim) & web (penanda kurang).
const complete: OnboardingSnapshot = {
  personal: {
    fullName: "Ani Contoh",
    gender: "FEMALE",
    birthPlace: "Palangka Raya",
    birthDate: "2000-01-02",
    ktpNumber: "6271010101000001",
    kkNumber: "6271010101000002",
    religion: "ISLAM",
    maritalStatus: "SINGLE",
    ktpAddress: "Jl. Contoh 1",
    domicileAddress: "Jl. Contoh 1",
    originCity: "Palangka Raya",
    phoneNumber: "081234567890",
    npwpNumber: null,
    npwpAbsent: true,
    bpjsEmploymentNumber: "12345678901",
    bpjsEmploymentAbsent: false,
    bpjsHealthNumber: null,
    bpjsHealthAbsent: true,
  },
  emergency: { name: "Budi", relationship: "Ayah", phone: "081298765432" },
  family: [],
  bank: { bankName: "BRI", accountNumber: "1234567890", accountHolder: "Ani Contoh" },
  educations: [{ level: "S1", schoolName: "Universitas Contoh" }],
  documents: ["KTP", "KK", "DIPLOMA", "BANK_BOOK", "BPJS_EMPLOYMENT"],
  hasPhoto: true,
};
const missingCodes = (s: OnboardingSnapshot) =>
  onboardingCompleteness(s).map((m) => `${m.section}.${m.field}`);

describe("onboardingCompleteness", () => {
  test("data lengkap → tidak ada kekurangan", () => {
    expect(onboardingCompleteness(complete)).toEqual([]);
  });

  test("NPWP/BPJS: nomor ATAU 'belum punya'; keduanya kosong = kurang", () => {
    const s = { ...complete, personal: { ...complete.personal, npwpAbsent: false } };
    expect(missingCodes(s)).toContain("personal.npwpNumber");
  });

  test("menikah → pasangan wajib di keluarga", () => {
    const married = {
      ...complete,
      personal: { ...complete.personal, maritalStatus: "MARRIED" as const },
    };
    expect(missingCodes(married)).toContain("family.spouse");
    expect(
      missingCodes({ ...married, family: [{ name: "Suami", relationship: "SPOUSE" as const }] }),
    ).not.toContain("family.spouse");
  });

  test("pendidikan terakhir wajib; dokumen inti wajib; kartu NPWP/BPJS wajib bila nomornya diisi", () => {
    const s: OnboardingSnapshot = {
      ...complete,
      educations: [],
      documents: ["KTP"],
      personal: { ...complete.personal, npwpNumber: "123456789012345", npwpAbsent: false },
    };
    expect(missingCodes(s)).toEqual(
      expect.arrayContaining([
        "professional.education",
        "documents.KK",
        "documents.DIPLOMA",
        "documents.BANK_BOOK",
        "documents.NPWP",
        "documents.BPJS_EMPLOYMENT",
      ]),
    );
  });

  test("field pribadi kosong & foto belum ada dilaporkan per field", () => {
    const s = { ...complete, hasPhoto: false, personal: { ...complete.personal, kkNumber: null } };
    expect(missingCodes(s)).toEqual(
      expect.arrayContaining(["personal.kkNumber", "personal.photo"]),
    );
  });
});

describe("personalSectionSchema", () => {
  test("NIK & KK 16 digit; nomor & 'belum punya' tidak boleh bersamaan", () => {
    expect(personalSectionSchema.safeParse({ ktpNumber: "123" }).success).toBe(false);
    expect(
      personalSectionSchema.safeParse({ npwpNumber: "123456789012345", npwpAbsent: true }).success,
    ).toBe(false);
    expect(personalSectionSchema.safeParse({ ktpNumber: "6271010101000001" }).success).toBe(true);
  });
});
