import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { appendSheets, buildWorkbook, buildXlsx, columnName, sheetName } from "../src/xlsx.ts";

// Penulis .xlsx bersama (D-058 ekspor Arsip, cetak, baris bermasalah import).
const read = (bytes: Uint8Array) => {
  const files = unzipSync(bytes);
  return (path: string) => strFromU8(files[path] as Uint8Array);
};

describe("buildWorkbook", () => {
  test("beberapa sheet; header tebal & dibekukan; tanggal, angka, teks di-escape", () => {
    const xml = read(
      buildWorkbook([
        {
          name: "Pelatihan",
          rows: [
            ["NIP", "Tanggal", "Jam"],
            ["ACP-1", new Date("2026-01-02T00:00:00Z"), 8],
            ["A & B <c>", null, true],
          ],
        },
        { name: "Kosong", rows: [] },
      ]),
    );
    expect(xml("xl/workbook.xml")).toContain('<sheet name="Pelatihan" sheetId="1" r:id="rId1"/>');
    expect(xml("xl/workbook.xml")).toContain('<sheet name="Kosong" sheetId="2" r:id="rId2"/>');
    const sheet = xml("xl/worksheets/sheet1.xml");
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="2">');
    expect(sheet).toContain('<c r="B2" s="1"><v>46024</v></c>');
    expect(sheet).toContain('<c r="C2"><v>8</v></c>');
    expect(sheet).toContain("A &amp; B &lt;c&gt;");
    expect(xml("[Content_Types].xml")).toContain("/xl/worksheets/sheet2.xml");
  });

  test("nama sheet & kolom aman", () => {
    expect(sheetName("Riwayat/Jabatan: [lama]?")).toBe("Riwayat-Jabatan- -lama--");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    expect([columnName(0), columnName(25), columnName(26), columnName(701)]).toEqual([
      "A",
      "Z",
      "AA",
      "ZZ",
    ]);
  });
});

describe("appendSheets", () => {
  test("menambah sheet ke workbook yang ada tanpa gaya; nama ganda diberi akhiran", () => {
    const base = buildXlsx("Data", [["Nama"], ["Uji"]]);
    const xml = read(
      appendSheets(base, [
        { name: "Data", rows: [["Tanggal"], [new Date("2026-03-04T00:00:00Z")]] },
        { name: "Pelatihan", rows: [["Nama"]] },
      ]),
    );
    const workbook = xml("xl/workbook.xml");
    expect(workbook).toContain('<sheet name="Data (2)" sheetId="2" r:id="rId3"/>');
    expect(workbook).toContain('<sheet name="Pelatihan" sheetId="3" r:id="rId4"/>');
    expect(xml("xl/_rels/workbook.xml.rels")).toContain('Target="worksheets/sheet3.xml"');
    expect(xml("[Content_Types].xml")).toContain("/xl/worksheets/sheet3.xml");
    const added = xml("xl/worksheets/sheet2.xml");
    expect(added).not.toContain(' s="');
    expect(added).toContain("04/03/2026");
    // Sheet asli tidak berubah.
    expect(xml("xl/worksheets/sheet1.xml")).toContain("Uji");
  });
});
