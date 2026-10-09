import { describe, expect, test } from "bun:test";
import {
  isDeceasedText,
  normalizeImportRow,
  parseBankName,
  parseBloodTypeCell,
  parseOccupationText,
  parseRelationText,
  unitKey,
  unitSimilarity,
} from "../src/import/index.ts";

// D-064: penyeragaman isian Formulir Data Karyawan & kemiripan nama unit organisasi.

describe("unitKey & unitSimilarity", () => {
  test("HRGA, HR & GA, hr-ga → kunci sama (otomatis satu unit)", () => {
    expect(unitKey("HRGA")).toBe(unitKey("HR & GA"));
    expect(unitKey("hr-ga")).toBe("hrga");
  });

  test.each([
    ["Enginering", "Engineering", "SPELLING"],
    ["Engginering", "Engineering", "SPELLING"],
    ["Explorasi", "Eksplorasi", "SPELLING"],
    ["Engineering", "Engineering (ACP)", "SAME_NAME"],
    ["QC", "Quality Control", "ABBREVIATION"],
    ["HRGA", "Human Resources & General Affair", "ABBREVIATION"],
    ["HRGA", "HR & GA Site (ACP)", "CONTAINS"],
  ])("%s ~ %s → %s", (value, name, reason) => {
    expect(unitSimilarity(value, name)).toBe(reason as ReturnType<typeof unitSimilarity>);
  });

  test.each([
    ["HR", "IR"],
    ["Operations", "Operasional"],
    ["Survey", "Supply Chain (ACP)"],
    ["Engineering", "Engineering"],
  ])("%s vs %s → tidak disarankan", (value, name) => {
    expect(unitSimilarity(value, name)).toBeNull();
  });
});

describe("normalisasi isian Form", () => {
  test("golongan darah: angka nol → O", () => {
    expect(parseBloodTypeCell(0)).toEqual({ value: "O" });
    expect(parseBloodTypeCell("0+")).toEqual({ value: "O+" });
    expect(parseBloodTypeCell("A+")).toEqual({ value: "A+" });
    expect(parseBloodTypeCell("_")).toBeUndefined();
  });

  test("almarhum dikenali dari usia/pekerjaan", () => {
    for (const text of ["Sudah meninggal dunia", "Almarhum", "Almarhummah", "alm.", "Wafat"])
      expect(isDeceasedText(text)).toBe(true);
    for (const text of ["Petani", "64", "Almira", "_"]) expect(isDeceasedText(text)).toBe(false);
  });

  test("hubungan, bank, pekerjaan diseragamkan", () => {
    expect(parseRelationText("ISTERI", 50)).toEqual({ value: "Istri" });
    expect(parseRelationText("Kaka", 50)).toEqual({ value: "Kakak" });
    expect(parseRelationText("Kakak Kandung", 50)).toEqual({ value: "Kakak" });
    expect(parseRelationText("Calon istri", 50)).toEqual({ value: "Calon istri" });
    expect(parseBankName("MANDIRI")).toEqual({ value: "Bank Mandiri" });
    expect(parseBankName("Bank Mandiri")).toEqual({ value: "Bank Mandiri" });
    expect(parseBankName("bca")).toEqual({ value: "BCA" });
    expect(parseBankName("Bank kaltimtara")).toEqual({ value: "Bank Kaltimtara" });
    expect(parseOccupationText("Irt", 100)).toEqual({ value: "Ibu Rumah Tangga" });
    expect(parseOccupationText("IBU RUMAH TANGGA", 100)).toEqual({ value: "Ibu Rumah Tangga" });
    expect(parseOccupationText("Wirasuasta", 100)).toEqual({ value: "Wiraswasta" });
    expect(parseOccupationText("AKUPUNKTUR TERAPIS", 100)).toEqual({
      value: "Akupunktur Terapis",
    });
  });

  test("baris Form: `_` = kosong (tanpa peringatan), usia 'N tahun', almarhum, suku HURUF BESAR", () => {
    const { row, issues } = normalizeImportRow({
      employeeNumber: "2602.ACP.001",
      fullName: "Uji",
      ethnicity: "JAWA",
      fatherName: "Ayah",
      fatherAge: "Sudah meninggal dunia",
      fatherOccupation: "Almarhum",
      motherName: "Ibu",
      motherAge: "_",
      sibling1Name: "Kakak",
      sibling1Age: "19 tahun",
      education1Level: "SMA",
      education1School: "SMA Uji",
      education1EntryYear: "_",
      education1GraduationYear: "_",
    });
    expect(row.personal.ethnicity).toBe("Jawa");
    expect(row.family?.find((m) => m.relationship === "FATHER")).toMatchObject({
      isDeceased: true,
    });
    expect(row.family?.find((m) => m.relationship === "FATHER")?.occupation).toBeUndefined();
    expect(row.family?.find((m) => m.relationship === "MOTHER")?.ageAtEntry).toBeUndefined();
    expect(row.family?.find((m) => m.relationship === "SIBLING")?.ageAtEntry).toBe(19);
    expect(issues.filter((i) => /AGE|YEAR/.test(i.code))).toEqual([]);
  });
});
