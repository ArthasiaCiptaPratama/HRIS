import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { buildWorkbook } from "../src/xlsx.ts";

const read = (bytes: Uint8Array) => {
  const files = unzipSync(bytes);
  return (path: string) => strFromU8(files[path] as Uint8Array);
};

describe("opsi template Excel", () => {
  test("tanpa opsi baru mempertahankan XML lembar lama dan lima fill", () => {
    const xml = read(buildWorkbook([{ name: "Data", rows: [["NIP"], ["001"]] }]));
    expect(xml("xl/worksheets/sheet1.xml")).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="8" customWidth="1"/></cols><sheetData><row r="1"><c r="A1" t="inlineStr" s="2"><is><t xml:space="preserve">NIP</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">001</t></is></c></row></sheetData></worksheet>',
    );
    expect(xml("xl/styles.xml")).toContain('<fills count="5">');
    expect(xml("xl/styles.xml")).toContain('<cellXfs count="21">');
    expect(xml("xl/styles.xml")).not.toContain("FFFFEB9C");
    const withOldOptions = read(
      buildWorkbook([
        { name: "Data", rows: [["NIP"], ["001"]], formats: ["text"], freezeColumns: 1 },
      ]),
    );
    expect(withOldOptions("xl/worksheets/sheet1.xml")).toBe(xml("xl/worksheets/sheet1.xml"));
    expect(withOldOptions("xl/styles.xml")).toBe(xml("xl/styles.xml"));
    expect(xml("xl/workbook.xml")).not.toContain("Pilihan");
  });

  test("pilihan inline di-escape; warna tambahan hanya saat dipakai", () => {
    const xml = read(
      buildWorkbook([
        {
          name: "Data",
          rows: [
            ["PT", "Pribadi"],
            ["AA", "001"],
          ],
          columnChoices: [["A&B", "<BB>"], []],
          headerFills: ["required", "sensitive"],
        },
      ]),
    );
    expect(xml("xl/worksheets/sheet1.xml")).toContain('type="list"');
    expect(xml("xl/worksheets/sheet1.xml")).toContain('sqref="A2:A1000"');
    expect(xml("xl/worksheets/sheet1.xml")).toContain(
      "<formula1>&quot;A&amp;B,&lt;BB&gt;&quot;</formula1>",
    );
    expect(xml("xl/styles.xml")).toContain('<fills count="7">');
    expect(xml("xl/styles.xml")).toContain('rgb="FFFFEB9C"');
    expect(xml("xl/styles.xml")).toContain('rgb="FFD9D9D9"');
  });

  test("daftar panjang/berkoma memakai nama terdefinisi dan lembar tersembunyi tanpa bentrok", () => {
    const values = Array.from({ length: 50 }, (_, i) => `Status ${i}`);
    const xml = read(
      buildWorkbook([
        { name: "Data", rows: [["Status", "PT"]], columnChoices: [values, ['PT, "Satu"']] },
        { name: "Pilihan", rows: [["Tetap terlihat"]] },
      ]),
    );
    expect(xml("xl/workbook.xml")).toContain(
      '<sheet name="Pilihan (2)" sheetId="3" r:id="rId3" state="hidden"/>',
    );
    expect(xml("xl/workbook.xml")).toContain("!$A$1:$A$50</definedName>");
    expect(xml("xl/workbook.xml")).toContain("!$B$1:$B$1</definedName>");
    expect(xml("xl/worksheets/sheet1.xml")).toContain("<formula1>_xlsx_choices_0_0</formula1>");
    expect(xml("xl/worksheets/sheet3.xml")).toContain("Status 49");
    expect(xml("xl/worksheets/sheet3.xml")).toContain("PT, &quot;Satu&quot;");
    expect(xml("xl/styles.xml")).toContain('<fills count="5">');
  });

  test("opsi juga berlaku pada laporan dan validasi mendahului pengaturan cetak", () => {
    const xml = read(
      buildWorkbook([
        {
          name: "Laporan",
          title: "Judul",
          info: ["Keterangan"],
          rows: [["PT"], ["AA"]],
          columnChoices: [["AA", "BB"]],
          headerFills: ["required"],
        },
      ]),
    );
    const sheet = xml("xl/worksheets/sheet1.xml");
    expect(sheet).toContain('sqref="A5:A1000"');
    expect(sheet).toContain('<c r="A4" t="inlineStr" s="21">');
    expect(sheet.indexOf("</dataValidations>")).toBeLessThan(sheet.indexOf("<pageMargins"));
  });
});
