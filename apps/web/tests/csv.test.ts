import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "../src/lib/csv";

describe("escapeCsvCell", () => {
  it.each(["=SUM(1;2)", "+cmd", "-1+1", "@SUM(A1)", "\tformula", "\rformula"])(
    "menetralkan awalan berbahaya %j sebelum quoting",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value}"`);
    },
  );
  it("mengutip separator, kutip, dan baris baru tanpa mengubah teks aman", () => {
    expect(escapeCsvCell('Nama; "A"\nBaru')).toBe('"Nama; ""A""\nBaru"');
    expect(escapeCsvCell("normal")).toBe('"normal"');
    expect(escapeCsvCell(42)).toBe('"42"');
    expect(escapeCsvCell(-5)).toBe('"-5"');
    expect(escapeCsvCell("-5")).toBe('"\'-5"');
    expect(escapeCsvCell("")).toBe('""');
    expect(escapeCsvCell("00123")).toBe('"00123"');
  });
});
