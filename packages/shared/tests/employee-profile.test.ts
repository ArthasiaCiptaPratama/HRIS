import { describe, expect, test } from "bun:test";
import { employeeProfileInputSchema } from "../src/employee-profile.ts";

// EMP-D2: profil lengkap saat tambah karyawan manual (aturan sama dengan Import Google Form).
describe("employeeProfileInputSchema", () => {
  test("kosong = semua bagian bawaan kosong; string kosong → null", () => {
    const parsed = employeeProfileInputSchema.parse({
      personal: { birthPlace: "", nickname: " Budi " },
    });
    expect(parsed).toMatchObject({ family: [], educations: [], certifications: [] });
    expect(parsed.personal?.birthPlace).toBeNull();
    expect(parsed.personal?.nickname).toBe("Budi");
    expect(parsed.personal?.drivingLicenses).toEqual([]);
  });

  test("NIK/KK 16 digit, NPWP 15–16 digit (titik & strip dibuang), golongan darah baku", () => {
    const ok = employeeProfileInputSchema.parse({
      personal: {
        ktpNumber: "3200 0000 0000 0001",
        npwpNumber: "00.000.000.0-000.000",
        bloodType: "ab-",
        personalEmail: "Budi@Contoh.Test",
      },
    });
    expect(ok.personal).toMatchObject({
      ktpNumber: "3200000000000001",
      npwpNumber: "000000000000000",
      bloodType: "AB-",
      personalEmail: "budi@contoh.test",
    });
    const bad = (personal: Record<string, unknown>) =>
      employeeProfileInputSchema.safeParse({ personal }).error?.issues[0]?.message;
    expect(bad({ ktpNumber: "123" })).toBe("NIK KTP harus 16 digit.");
    expect(bad({ kkNumber: "12" })).toBe("Nomor KK harus 16 digit.");
    expect(bad({ npwpNumber: "1234" })).toBe("NPWP 15 atau 16 digit.");
    expect(bad({ bloodType: "Z" })).toBe("Golongan darah: A, B, AB, atau O.");
    expect(bad({ personalEmail: "bukan-email" })).toBe("Email tidak valid.");
    expect(bad({ drivingLicenses: [{ type: "X", number: "1" }] })).toBeDefined();
  });

  test("baris berulang: nama/sekolah wajib; rekening 6–20 digit", () => {
    const issue = (body: Record<string, unknown>) =>
      employeeProfileInputSchema.safeParse(body).error?.issues[0]?.message;
    expect(issue({ family: [{ relationship: "CHILD", name: "" }] })).toBe(
      "Nama anggota keluarga wajib diisi.",
    );
    expect(issue({ educations: [{ schoolName: " " }] })).toBe("Nama sekolah/kampus wajib diisi.");
    expect(issue({ bank: { bankName: "BRI", accountNumber: "12" } })).toBe(
      "Nomor rekening 6–20 digit.",
    );
    const bank = employeeProfileInputSchema.parse({
      bank: { bankName: "BRI", accountNumber: "0000-1111-22" },
    });
    expect(bank.bank?.accountNumber).toBe("0000111122");
  });
});
