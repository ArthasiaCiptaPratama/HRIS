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

describe("buildWorkbook — tata letak laporan (ARS-D16)", () => {
  const bytes = buildWorkbook(
    [
      {
        name: "Ringkasan",
        title: "Laporan Headcount & Turnover 2026",
        info: ["Filter: semua PT", "RAHASIA — untuk keperluan internal HR"],
        rows: [
          ["Indikator", "Nilai"],
          ["Aktif akhir", 12],
          ["Turnover", { value: 12.5, format: "percent" }],
        ],
        formats: ["text", "int"],
        notes: ["Turnover = keluar ÷ rata-rata aktif."],
      },
      {
        name: "Per bulan",
        title: "Per bulan",
        rows: [
          ["Bulan", "Tanggal", "Masuk", "Turnover %"],
          ["Jan", new Date("2026-01-31T00:00:00Z"), 1, 10],
          ["Feb", null, 0, 33.3],
          ["Setahun", null, 1, 10],
        ],
        formats: ["text", "date", "int", "percent"],
        totalRow: true,
        freezeColumns: 1,
      },
      { name: "Kosong", title: "Kosong", rows: [["NIP", "Nama"]] },
      { name: "Tanpa filter", title: "Tanpa filter", rows: [["A"], ["x"]], autoFilter: false },
    ],
    { title: "Laporan", creator: "HRIS" },
  );
  const xml = read(bytes);

  test("judul, keterangan, header berwarna, format persen sebagai pecahan, catatan", () => {
    const sheet = xml("xl/worksheets/sheet1.xml");
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="3">');
    expect(sheet).toContain("Laporan Headcount &amp; Turnover 2026");
    expect(sheet).toContain('<c r="A2" t="inlineStr" s="4">');
    // Judul + 2 keterangan + baris kosong → header di baris 5, dibekukan.
    expect(sheet).toContain('<c r="A5" t="inlineStr" s="5">');
    expect(sheet).toContain('ySplit="5"');
    expect(sheet).toContain('showGridLines="0"');
    expect(sheet).toContain('<c r="B6" s="7"><v>12</v></c>');
    // Baris belang (zebra) + format persen: 12,5 → 0,125.
    expect(sheet).toContain('<c r="B7" s="14"><v>0.125</v></c>');
    expect(sheet).toContain('<autoFilter ref="A5:B7"/>');
    expect(sheet).toContain("Turnover = keluar");
    expect(sheet).toContain('fitToWidth="1"');
    expect(sheet).toContain("Halaman &amp;P dari &amp;N");
    expect(sheet).toContain("Headcount &amp;&amp; Turnover");
  });

  test("baris total di luar autofilter; tanggal & sel kosong bergaris; kolom kiri dibekukan", () => {
    const sheet = xml("xl/worksheets/sheet2.xml");
    expect(sheet).toContain('<autoFilter ref="A3:D5"/>');
    expect(sheet).toContain('<c r="B4" s="10"><v>46053</v></c>');
    expect(sheet).toContain('<c r="B5" s="15"/>');
    expect(sheet).toContain('<c r="D5" s="14"><v>0.333</v></c>');
    expect(sheet).toContain('<c r="A6" t="inlineStr" s="16">');
    expect(sheet).toContain('<c r="D6" s="19"><v>0.1</v></c>');
    expect(sheet).toContain('xSplit="1" ySplit="3"');
    const workbook = xml("xl/workbook.xml");
    expect(workbook).toContain(
      '<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">\'Per bulan\'!$A$3:$D$5</definedName>',
    );
    expect(workbook).toContain(
      '<definedName name="_xlnm.Print_Titles" localSheetId="1">\'Per bulan\'!$3:$3</definedName>',
    );
  });

  test("tabel kosong diberi keterangan tanpa autofilter; properti berkas & gaya terdaftar", () => {
    const sheet = xml("xl/worksheets/sheet3.xml");
    expect(sheet).toContain("Tidak ada data untuk filter ini.");
    expect(sheet).not.toContain("<autoFilter");
    expect(xml("xl/worksheets/sheet4.xml")).not.toContain("<autoFilter");
    expect(xml("docProps/core.xml")).toContain("<dc:creator>HRIS</dc:creator>");
    expect(xml("[Content_Types].xml")).toContain("/docProps/core.xml");
    expect(xml("xl/styles.xml")).toContain('<cellXfs count="21">');
    expect(xml("xl/styles.xml")).toContain('formatCode="0.0%"');
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
