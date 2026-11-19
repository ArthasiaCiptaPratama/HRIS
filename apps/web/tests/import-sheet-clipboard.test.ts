import { describe, expect, it } from "vitest";
import { parseClipboardGrid } from "@/features/employee/import/sheet/clipboard";

// Paket B (IMP-D6): blok yang disalin dari Excel/Google Sheets (TSV) → baris × sel.
describe("parseClipboardGrid", () => {
  it("tab & CRLF; baris kosong terakhir dari Excel diabaikan", () => {
    expect(parseClipboardGrid("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("sel berkutip berisi tab, baris baru, dan kutip ganda; sel kosong tetap dihitung", () => {
    expect(parseClipboardGrid('"x\ty"\t"baris\nbaru"\t"kata ""kutip"""\n1\t\t3')).toEqual([
      ["x\ty", "baris\nbaru", 'kata "kutip"'],
      ["1", "", "3"],
    ]);
  });
  it("satu sel tanpa baris baru", () => {
    expect(parseClipboardGrid("tunggal")).toEqual([["tunggal"]]);
  });
});
