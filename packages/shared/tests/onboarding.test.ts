import { describe, expect, test } from "bun:test";
import {
  formatEmployeeNumber,
  nextEmployeeNumberSequence,
  suggestEmployeeNumbers,
} from "../src/onboarding.ts";

// D-045: nomor induk otomatis DD.MM.KODE-PT.NNN — tanggal & bulan join, urut berjalan per PT.
describe("nomor induk otomatis", () => {
  test("format DD.MM.KODE.NNN (3 digit, lebih bila > 999)", () => {
    expect(formatEmployeeNumber("2026-11-25", "ACP", 23)).toBe("25.11.ACP.023");
    expect(formatEmployeeNumber("2026-01-05", "cd2", 7)).toBe("05.01.CD2.007");
    expect(formatEmployeeNumber("2026-11-25", "ACP", 1234)).toBe("25.11.ACP.1234");
  });

  test("urut berikutnya = angka terbesar di ujung nomor PT itu + 1 (semua pola, termasuk lama)", () => {
    expect(
      nextEmployeeNumberSequence([
        "25.11.ACP.023",
        "2511.ACP.041",
        "ACP-2022-0006",
        "01.02.ACP.009",
      ]),
    ).toBe(42);
    expect(nextEmployeeNumberSequence([])).toBe(1);
    expect(nextEmployeeNumberSequence(["TANPA-ANGKA"])).toBe(1);
  });

  test("usulan berurutan untuk satu batch, melewati nomor yang sudah dipakai", () => {
    expect(
      suggestEmployeeNumbers({
        existing: ["25.11.ACP.022"],
        companyCode: "ACP",
        joinDates: ["2026-11-25", "2026-11-25", "2026-12-01"],
      }),
    ).toEqual(["25.11.ACP.023", "25.11.ACP.024", "01.12.ACP.025"]);
  });

  test("tanggal tidak valid ditolak", () => {
    expect(() => formatEmployeeNumber("2026-13-01", "ACP", 1)).toThrow();
  });
});
