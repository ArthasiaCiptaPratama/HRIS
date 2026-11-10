import { describe, expect, test } from "bun:test";
import {
  chartHolderMatch,
  chartHolderNameKey,
  isChartHolderNumber,
  matchesNameInitials,
} from "../src/index.ts";

// IMP-D1: kunci nama pemegang bagan (gelar, titik, koma, huruf besar/kecil, spasi diabaikan).
describe("chartHolderNameKey", () => {
  test.each([
    ["Budiman, S.H., M.H.", "budiman"],
    ["Ir. Budi  Santoso", "budi santoso"],
    ["dr. Siti Aminah, M.Kes", "siti aminah"],
    ["H. Ahmad Sampel", "ahmad sampel"],
    ["Hj. SITI CONTOH", "siti contoh"],
    ["Drs. Joko Rekaan, S.T.,M.M.", "joko rekaan"],
    ["  M. Fajar   A. Sampel ", "m fajar a sampel"],
  ])("%s → %s", (input, key) => {
    expect(chartHolderNameKey(input)).toBe(key);
  });
});

describe("saran inisial", () => {
  test("singkatan di bagan cocok dengan nama lengkap di file", () => {
    expect(matchesNameInitials("M. Arif", "Muhammad Arif")).toBe(true);
    expect(matchesNameInitials("M. Fajar A. Sampel", "Muhammad Fajar Akbar Sampel")).toBe(true);
    expect(matchesNameInitials("A. Contoh", "Ahmad Contoh")).toBe(true);
  });
  test("tidak cocok: jumlah kata beda, kata utuh beda, huruf awal beda, atau semua inisial", () => {
    expect(matchesNameInitials("M. Arif", "Muhammad Arif Putra")).toBe(false);
    expect(matchesNameInitials("A. Contoh", "Ahmad Cahyono")).toBe(false);
    expect(matchesNameInitials("A. Contoh", "Budi Contoh")).toBe(false);
    expect(matchesNameInitials("A. B.", "Ahmad Budi")).toBe(false);
    expect(matchesNameInitials("Vino", "Vino")).toBe(false);
  });
  test("chartHolderMatch: nama persis (tanpa gelar) > inisial > tidak cocok", () => {
    expect(chartHolderMatch("BUDIMAN", "Budiman, S.H., M.H.")).toBe("NAME");
    expect(chartHolderMatch("Budi Santoso", "Budi S.")).toBe("INITIALS");
    expect(chartHolderMatch("Muhammad Arif", "M. Arif")).toBe("INITIALS");
    expect(chartHolderMatch("Budi", "Andi")).toBe(null);
    expect(chartHolderMatch("", "Andi")).toBe(null);
  });
  test("NIP sementara pemegang bagan", () => {
    expect(isChartHolderNumber("ASLI-ACP-KTT-1")).toBe(true);
    expect(isChartHolderNumber("asli-x")).toBe(true);
    expect(isChartHolderNumber("ACP-2021-0009")).toBe(false);
    expect(isChartHolderNumber(null)).toBe(false);
  });
});
