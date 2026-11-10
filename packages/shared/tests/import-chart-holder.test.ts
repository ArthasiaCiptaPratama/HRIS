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
    ["Zulkarnaim, S.H., M.H.", "zulkarnaim"],
    ["Ir. Budi  Santoso", "budi santoso"],
    ["dr. Siti Aminah, M.Kes", "siti aminah"],
    ["H. Ahmad Hulaemi", "ahmad hulaemi"],
    ["Hj. NOOR HAIDAH", "noor haidah"],
    ["Drs. Abdul Rojak, S.T.,M.M.", "abdul rojak"],
    ["  M. Anugerah   A. Pasya ", "m anugerah a pasya"],
  ])("%s → %s", (input, key) => {
    expect(chartHolderNameKey(input)).toBe(key);
  });
});

describe("saran inisial", () => {
  test("singkatan di bagan cocok dengan nama lengkap di file", () => {
    expect(matchesNameInitials("M. Isnaini", "Muhammad Isnaini")).toBe(true);
    expect(matchesNameInitials("M. Anugerah A. Pasya", "Muhammad Anugerah Akbar Pasya")).toBe(true);
    expect(matchesNameInitials("A. Jaini", "Ahmad Jaini")).toBe(true);
  });
  test("tidak cocok: jumlah kata beda, kata utuh beda, huruf awal beda, atau semua inisial", () => {
    expect(matchesNameInitials("M. Isnaini", "Muhammad Isnaini Putra")).toBe(false);
    expect(matchesNameInitials("A. Jaini", "Ahmad Jaenudin")).toBe(false);
    expect(matchesNameInitials("A. Jaini", "Budi Jaini")).toBe(false);
    expect(matchesNameInitials("A. B.", "Ahmad Budi")).toBe(false);
    expect(matchesNameInitials("Revan", "Revan")).toBe(false);
  });
  test("chartHolderMatch: nama persis (tanpa gelar) > inisial > tidak cocok", () => {
    expect(chartHolderMatch("ZULKARNAIM", "Zulkarnaim, S.H., M.H.")).toBe("NAME");
    expect(chartHolderMatch("Rahmat Hidayat", "Rahmat H.")).toBe("INITIALS");
    expect(chartHolderMatch("Muhammad Isnaini", "M. Isnaini")).toBe("INITIALS");
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
