import { describe, expect, test } from "bun:test";
import { changedFields, dataChangeInputSchema, maskAccountNumber } from "../src/data-changes.ts";

// D-054 / OD-6 (Arsip gelombang 1c): perubahan data diri lewat pengajuan, disetujui SA/HR.
const TYPE_ID = "6b0f3a52-8c1e-4d3a-9f21-2a7c5e9d1b40";

describe("dataChangeInputSchema", () => {
  test("PERSONAL: format dicek; nama & jenis kelamin tidak bisa diajukan", () => {
    const ok = dataChangeInputSchema.parse({
      section: "PERSONAL",
      data: { domicileAddress: " Jl. Baru 1 ", npwpNumber: "12.345.678.9-012.000" },
    });
    expect(ok).toEqual({
      section: "PERSONAL",
      data: { domicileAddress: "Jl. Baru 1", npwpNumber: "123456789012000" },
    });
    expect(
      dataChangeInputSchema.safeParse({ section: "PERSONAL", data: { ktpNumber: "123" } }).success,
    ).toBe(false);
    expect(
      dataChangeInputSchema.safeParse({ section: "PERSONAL", data: { fullName: "Baru" } }).success,
    ).toBe(false);
  });

  test("BANK: bank, nomor & buku tabungan wajib", () => {
    expect(
      dataChangeInputSchema.safeParse({
        section: "BANK",
        data: { bankName: "BRI", accountNumber: "1234567890", accountHolder: "Ani" },
      }).success,
    ).toBe(false);
    expect(
      dataChangeInputSchema.parse({
        section: "BANK",
        data: {
          bankName: "BRI",
          accountNumber: "1234 5678 90",
          accountHolder: "Ani",
          bankBookPath: "employees/e1/documents/x.pdf",
        },
      }).data,
    ).toMatchObject({ accountNumber: "1234567890" });
  });

  test("FAMILY: daftar lengkap pengganti; DOCUMENT: jenis & file wajib", () => {
    expect(
      dataChangeInputSchema.safeParse({
        section: "FAMILY",
        data: { members: [{ name: "Ani", relationship: "SPOUSE" }] },
      }).success,
    ).toBe(true);
    expect(
      dataChangeInputSchema.safeParse({ section: "DOCUMENT", data: { documentTypeId: TYPE_ID } })
        .success,
    ).toBe(false);
    expect(
      dataChangeInputSchema.safeParse({
        section: "DOCUMENT",
        data: { documentTypeId: TYPE_ID, path: "employees/e1/documents/x.pdf" },
      }).success,
    ).toBe(true);
  });
});

describe("changedFields", () => {
  test("hanya field yang berbeda (null ≈ kosong); kunci tak dikenal diabaikan", () => {
    expect(
      changedFields(
        { domicileAddress: "Lama", religion: "ISLAM", originCity: null },
        { domicileAddress: "Baru", religion: "ISLAM", originCity: "" as unknown as null },
      ),
    ).toEqual(["domicileAddress"]);
  });
});

describe("maskAccountNumber", () => {
  test("hanya 4 digit terakhir", () => {
    expect(maskAccountNumber("1234567890")).toBe("••••••7890");
    expect(maskAccountNumber(null)).toBeNull();
  });
});
