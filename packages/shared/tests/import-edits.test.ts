import { describe, expect, it } from "bun:test";
import { applyCellEdits, editedCellList } from "../src/import/edits.ts";
import { normalizeImportRow, type RawImportRow } from "../src/import/row.ts";

// Paket B (IMP-D6): sel yang diubah di Pratinjau spreadsheet diterapkan ke raw sebelum pratinjau/simpan.
describe("applyCellEdits", () => {
  const rows: { sourceRow: number; raw: RawImportRow }[] = [
    { sourceRow: 2, raw: { fullName: "Ani", phoneNumber: "0812-abc" } },
    { sourceRow: 3, raw: { fullName: "Budi", personalEmail: "budi@gmail.com" } },
  ];

  it("menimpa isian, menambah isian baru, teks kosong = null; baris tanpa ubahan tetap objek sama", () => {
    const next = applyCellEdits(rows, {
      2: { phoneNumber: "0812 3456 7890", companyCode: "ACP" },
      3: { personalEmail: "  " },
    });
    expect(next[0]?.raw).toEqual({
      fullName: "Ani",
      phoneNumber: "0812 3456 7890",
      companyCode: "ACP",
    });
    expect(next[1]?.raw).toEqual({ fullName: "Budi", personalEmail: null });
    expect(rows[0]?.raw.phoneNumber).toBe("0812-abc");
    expect(applyCellEdits(rows, {})[0]).toBe(rows[0]);
  });

  it("hasil ubahan lolos validasi yang sama dengan server (No. HP diperbaiki → tanpa issue)", () => {
    const before = normalizeImportRow({ employeeNumber: "X-1", ...rows[0]?.raw });
    expect(before.issues.some((i) => i.field === "phoneNumber")).toBe(true);
    const [fixed] = applyCellEdits(rows, { 2: { phoneNumber: "0812 3456 7890" } });
    const after = normalizeImportRow({ employeeNumber: "X-1", ...fixed?.raw });
    expect(after.issues.some((i) => i.field === "phoneNumber")).toBe(false);
  });

  it("2.000 baris: terapkan ubahan + validasi semua baris < 1 dtk", () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({
      sourceRow: i + 2,
      raw: {
        employeeNumber: `2611.ACP.${i}`,
        fullName: `Karyawan ${i}`,
        phoneNumber: "081234567890",
        personalEmail: `k${i}@gmail.com`,
        birthDate: "1990-01-31",
      },
    }));
    const edits = Object.fromEntries(
      many.map((r) => [r.sourceRow, { phoneNumber: "0812 1111 2222" }]),
    );
    const t = performance.now();
    const applied = applyCellEdits(many, edits);
    for (const r of applied) normalizeImportRow(r.raw);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe("editedCellList", () => {
  it("baris + isian tanpa nilai", () => {
    expect(editedCellList({ 4: { phoneNumber: "x", fullName: "y" }, 9: { gender: "L" } })).toEqual([
      { sourceRow: 4, field: "phoneNumber" },
      { sourceRow: 4, field: "fullName" },
      { sourceRow: 9, field: "gender" },
    ]);
  });
});
