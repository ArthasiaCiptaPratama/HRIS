import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// Penulis .xlsx minimal, dipakai web (baris bermasalah import, cetak) & api (ekspor Arsip, D-058):
// teks/angka/boolean/tanggal, header tebal & dibekukan, lebar kolom menyesuaikan isi.

export type XlsxCell = string | number | boolean | Date | null | undefined;
export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Karakter kontrol tidak sah di XML (kecuali tab/baris baru).
    // biome-ignore lint/suspicious/noControlCharactersInRegex: memang menyaring karakter kontrol
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function columnName(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Nama sheet sah: maks 31 karakter, tanpa : \ / ? * [ ]. */
export function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Sheet";
}

/** `styled` = memakai gaya penulis ini (1 = tanggal, 2 = header tebal); false = tanpa atribut gaya. */
function cellXml(ref: string, value: XlsxCell, header: boolean, styled: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (!styled) {
      return cellXml(
        ref,
        value.toISOString().slice(0, 10).split("-").reverse().join("/"),
        header,
        false,
      );
    }
    const serial = (value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
    return `<c r="${ref}" s="1"><v>${serial}</v></c>`;
  }
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const style = header && styled ? ' s="2"' : "";
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function displayLength(value: XlsxCell): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return 10;
  return String(value).length;
}

function sheetXml(rows: XlsxCell[][], styled: boolean): string {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, c) =>
    Math.min(60, Math.max(8, ...rows.slice(0, 500).map((row) => displayLength(row[c]) + 2))),
  );
  const cols =
    columns > 0
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : "";
  // Baris header dibekukan supaya tetap terlihat saat menggulir.
  const views =
    rows.length > 1
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : "";
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => cellXml(`${columnName(c)}${r + 1}`, value, r === 0, styled))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}${cols}<sheetData>${sheetRows}</sheetData></worksheet>`;
}

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

/** Workbook baru berisi satu atau beberapa sheet. */
export function buildWorkbook(sheets: XlsxSheet[]): Uint8Array {
  const list = sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [] }];
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${SHEET_TYPE}"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL_NS}"><sheets>${list.map((s, i) => `<sheet name="${esc(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${list.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf numFmtId="15" applyNumberFormat="1"/><xf fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
  list.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet.rows, true);
  });
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

/** Workbook satu sheet (kompatibel dengan pemakaian lama). */
export function buildXlsx(name: string, rows: XlsxCell[][]): Uint8Array {
  return buildWorkbook([{ name, rows }]);
}

/**
 * Tambah sheet ke workbook yang sudah ada (mis. template cetak). Sheet tambahan tanpa gaya (gaya
 * template tidak diubah); tanggal ditulis sebagai teks dd/mm/yyyy. Nama sheet ganda diberi akhiran.
 */
export function appendSheets(xlsx: Uint8Array, sheets: XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) return xlsx;
  const files = unzipSync(xlsx);
  const text = (path: string) => {
    const file = files[path];
    if (!file) throw new Error(`xlsx: ${path} tidak ada`);
    return strFromU8(file);
  };
  let workbook = text("xl/workbook.xml");
  let rels = text("xl/_rels/workbook.xml.rels");
  let types = text("[Content_Types].xml");

  const names = new Set([...workbook.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]));
  let sheetId = Math.max(0, ...[...workbook.matchAll(/sheetId="(\d+)"/g)].map((m) => Number(m[1])));
  let relId = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1])));
  let fileNo = Math.max(
    0,
    ...Object.keys(files).map((path) =>
      Number(/^xl\/worksheets\/sheet(\d+)\.xml$/.exec(path)?.[1] ?? 0),
    ),
  );

  const added: string[] = [];
  for (const sheet of sheets) {
    let name = sheetName(sheet.name);
    for (let n = 2; names.has(name); n++) name = sheetName(`${sheet.name.slice(0, 27)} (${n})`);
    names.add(name);
    sheetId += 1;
    relId += 1;
    fileNo += 1;
    files[`xl/worksheets/sheet${fileNo}.xml`] = strToU8(sheetXml(sheet.rows, false));
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="rId${relId}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${fileNo}.xml"/></Relationships>`,
    );
    types = types.replace(
      "</Types>",
      `<Override PartName="/xl/worksheets/sheet${fileNo}.xml" ContentType="${SHEET_TYPE}"/></Types>`,
    );
    added.push(`<sheet name="${esc(name)}" sheetId="${sheetId}" r:id="rId${relId}"/>`);
  }
  workbook = workbook.replace("</sheets>", `${added.join("")}</sheets>`);
  // Prefiks r: wajib dideklarasikan di workbook (template Excel selalu punya; jaga-jaga).
  if (!workbook.includes(`xmlns:r="${REL_NS}"`)) {
    workbook = workbook.replace("<workbook ", `<workbook xmlns:r="${REL_NS}" `);
  }
  files["xl/workbook.xml"] = strToU8(workbook);
  files["xl/_rels/workbook.xml.rels"] = strToU8(rels);
  files["[Content_Types].xml"] = strToU8(types);
  return zipSync(files, { level: 6 });
}
