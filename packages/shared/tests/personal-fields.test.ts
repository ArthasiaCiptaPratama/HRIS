import { describe, expect, test } from "bun:test";
import { parseBloodType, parseDrivingLicenseTypes } from "../src/personal-fields.ts";

// D-059: jenis SIM (daftar baku, jamak) & golongan darah dari isian bebas Formulir Data Karyawan.
describe("parseDrivingLicenseTypes", () => {
  test("teks bebas → daftar baku tanpa duplikat, urutan baku", () => {
    expect(parseDrivingLicenseTypes("SIM A, C")).toEqual({ types: ["A", "C"], unknown: [] });
    expect(parseDrivingLicenseTypes("B 1 Umum dan sim c")).toEqual({
      types: ["B1_UMUM", "C"],
      unknown: [],
    });
    expect(parseDrivingLicenseTypes(["A", "a"])).toEqual({ types: ["A"], unknown: [] });
    expect(parseDrivingLicenseTypes("C, A")).toEqual({ types: ["A", "C"], unknown: [] });
    expect(parseDrivingLicenseTypes("A / truk")).toEqual({ types: ["A"], unknown: ["TRUK"] });
    expect(parseDrivingLicenseTypes("C Umum")).toEqual({ types: [], unknown: ["C UMUM"] });
  });
});

describe("parseBloodType", () => {
  test("A/B/AB/O + rhesus opsional; lainnya null", () => {
    expect(parseBloodType("o positif")).toBe("O+");
    expect(parseBloodType("AB")).toBe("AB");
    expect(parseBloodType("b rh-")).toBe("B-");
    expect(parseBloodType("Z")).toBeNull();
  });
});
