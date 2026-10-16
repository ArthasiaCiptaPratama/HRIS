import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// Penulis .xlsx minimal, dipakai web (baris bermasalah import, cetak) & api (ekspor Arsip D-058,
// Laporan ARS-D16): teks/angka/boolean/tanggal, header tebal & dibekukan, lebar kolom menyesuaikan isi.
// Sheet ber-`title` memakai tata letak laporan: judul + baris keterangan, header berwarna, garis tabel,
// baris belang, format angka/persen/tanggal per kolom, autofilter, baris total, siap cetak A4 lanskap.

export type XlsxPlainCell = string | number | boolean | Date | null | undefined;
/** Format kolom laporan. `percent` menerima nilai 0–100 (ditulis sebagai pecahan berformat 0,0%). */
export type XlsxFormat = "text" | "int" | "decimal" | "percent" | "date";
/** Sel dengan format sendiri (mis. satu baris persen di kolom angka sheet Ringkasan). */
export interface XlsxStyledCell {
  value: XlsxPlainCell;
  format?: XlsxFormat;
}
export type XlsxCell = XlsxPlainCell | XlsxStyledCell;
export interface XlsxSheet {
  name: string;
  /** Baris pertama = header tabel. */
  rows: XlsxCell[][];
  /** Diisi → tata letak laporan (lihat komentar di atas). */
  title?: string;
  /** Baris keterangan di bawah judul (filter, tanggal data, kerahasiaan). */
  info?: string[];
  /** Format per kolom tabel; kosong = teks. */
  formats?: (XlsxFormat | undefined)[];
  /** Baris terakhir `rows` adalah total (tebal, garis atas, di luar autofilter). */
  totalRow?: boolean;
  /** Jumlah kolom kiri yang ikut dibekukan (mis. NIP + Nama). */
  freezeColumns?: number;
  /** Autofilter di header tabel (bawaan: ya; matikan untuk tabel ringkas seperti Ringkasan). */
  autoFilter?: boolean;
  /** Catatan di bawah tabel (definisi, batasan). */
  notes?: string[];
}
export interface XlsxMeta {
  title?: string;
  creator?: string;
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

const isStyled = (value: XlsxCell): value is XlsxStyledCell =>
  typeof value === "object" && value !== null && !(value instanceof Date);
const plain = (value: XlsxCell): XlsxPlainCell => (isStyled(value) ? value.value : value);
const excelSerial = (value: Date) => (value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;

// --- Gaya (styles.xml) ---
// 0 normal · 1 tanggal · 2 header tebal (mode lama) · 3 judul · 4 keterangan · 5 header laporan ·
// 6.. sel tabel laporan = 6 + varian × 5 + format.

const FORMATS: readonly XlsxFormat[] = ["text", "int", "decimal", "percent", "date"];
const VARIANTS = ["body", "zebra", "total"] as const;
type Variant = (typeof VARIANTS)[number];
const S_TITLE = 3;
const S_INFO = 4;
const S_HEADER = 5;
const tableStyle = (format: XlsxFormat, variant: Variant) =>
  6 + VARIANTS.indexOf(variant) * FORMATS.length + FORMATS.indexOf(format);

const BRAND = "FF1F4E79";
const LINE = "FFD0D7DE";
const STYLES_XML = (() => {
  const numFmts = [
    '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>',
    '<numFmt numFmtId="165" formatCode="#,##0.0"/>',
    '<numFmt numFmtId="166" formatCode="0.0%"/>',
  ];
  const numFmtOf: Record<XlsxFormat, number> = {
    text: 0,
    int: 3,
    decimal: 165,
    percent: 166,
    date: 164,
  };
  const fonts = [
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    `<font><b/><sz val="14"/><color rgb="${BRAND}"/><name val="Calibri"/></font>`,
    '<font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
  ];
  const solid = (rgb: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    solid(BRAND),
    solid("FFF3F6FA"),
    solid("FFDDE7F0"),
  ];
  const side = (tag: string, style: string, rgb: string) =>
    `<${tag} style="${style}"><color rgb="${rgb}"/></${tag}>`;
  const borders = [
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
    `<border>${side("left", "thin", LINE)}${side("right", "thin", LINE)}${side("top", "thin", LINE)}${side("bottom", "thin", LINE)}<diagonal/></border>`,
    `<border>${side("left", "thin", LINE)}${side("right", "thin", LINE)}${side("top", "medium", BRAND)}${side("bottom", "thin", LINE)}<diagonal/></border>`,
  ];
  const xfs = [
    "<xf/>",
    '<xf numFmtId="15" applyNumberFormat="1"/>',
    '<xf fontId="1" applyFont="1"/>',
    '<xf fontId="2" applyFont="1"/>',
    '<xf fontId="3" applyFont="1"/>',
    '<xf fontId="4" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
  ];
  for (const variant of VARIANTS) {
    for (const format of FORMATS) {
      const font = variant === "total" ? 1 : 0;
      const fill = variant === "zebra" ? 3 : variant === "total" ? 4 : 0;
      const border = variant === "total" ? 2 : 1;
      const align =
        format === "text"
          ? '<alignment vertical="top" wrapText="1"/>'
          : format === "date"
            ? '<alignment horizontal="center" vertical="top"/>'
            : '<alignment vertical="top"/>';
      xfs.push(
        `<xf numFmtId="${numFmtOf[format]}" fontId="${font}" fillId="${fill}" borderId="${border}" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf>`,
      );
    }
  }
  const list = (tag: string, items: string[]) =>
    `<${tag} count="${items.length}">${items.join("")}</${tag}>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${list("numFmts", numFmts)}${list("fonts", fonts)}${list("fills", fills)}${list("borders", borders)}<cellStyleXfs count="1"><xf/></cellStyleXfs>${list("cellXfs", xfs)}<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
})();

// --- Sheet mode lama (tanpa judul) ---

/** `styled` = memakai gaya penulis ini (1 = tanggal, 2 = header tebal); false = tanpa atribut gaya. */
function cellXml(ref: string, cell: XlsxCell, header: boolean, styled: boolean): string {
  const value = plain(cell);
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
    return `<c r="${ref}" s="1"><v>${excelSerial(value)}</v></c>`;
  }
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const style = header && styled ? ' s="2"' : "";
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function displayLength(cell: XlsxCell, format: XlsxFormat = "text"): number {
  const value = plain(cell);
  if (value === null || value === undefined) return 0;
  if (value instanceof Date || format === "date") return 10;
  if (typeof value === "number") {
    const text = value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
    return text.length + (format === "percent" ? 2 : 0);
  }
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

// --- Sheet laporan (ber-judul) ---

function textCell(ref: string, text: string, style: number): string {
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

function tableCell(ref: string, cell: XlsxCell, columnFormat: XlsxFormat, variant: Variant) {
  const format = (isStyled(cell) ? cell.format : undefined) ?? columnFormat;
  const value = plain(cell);
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}" s="${tableStyle(format, variant)}"/>`;
  }
  if (value instanceof Date) {
    return `<c r="${ref}" s="${tableStyle("date", variant)}"><v>${excelSerial(value)}</v></c>`;
  }
  if (typeof value === "number") {
    // Pecahan dibulatkan supaya tidak membawa sisa floating point (33,3 → 0.333, bukan 0.33299…).
    const v = format === "percent" ? Number((value / 100).toFixed(6)) : value;
    return `<c r="${ref}" s="${tableStyle(format, variant)}"><v>${v}</v></c>`;
  }
  if (typeof value === "boolean") {
    return textCell(ref, value ? "Ya" : "Tidak", tableStyle("text", variant));
  }
  return textCell(ref, value, tableStyle("text", variant));
}

/** Kutip nama sheet untuk rumus/nama terdefinisi. */
const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`;

interface ReportSheetXml {
  xml: string;
  definedNames: string[];
}

function reportSheetXml(sheet: XlsxSheet, index: number, name: string): ReportSheetXml {
  const [header = [], ...body] = sheet.rows;
  const columns = Math.max(1, header.length, ...body.map((row) => row.length));
  const formatOf = (c: number): XlsxFormat => sheet.formats?.[c] ?? "text";
  const info = sheet.info ?? [];
  const lines: string[] = [];
  let r = 0;
  const push = (cells: string, height?: number) => {
    r += 1;
    const ht = height ? ` ht="${height}" customHeight="1"` : "";
    lines.push(`<row r="${r}"${ht}>${cells}</row>`);
  };

  push(textCell(`A${r + 1}`, sheet.title ?? name, S_TITLE), 24);
  for (const line of info) push(textCell(`A${r + 1}`, line, S_INFO));
  push("");
  const headerRow = r + 1;
  push(
    header
      .map((cell, c) =>
        textCell(`${columnName(c)}${headerRow}`, String(plain(cell) ?? ""), S_HEADER),
      )
      .join(""),
    30,
  );
  const dataRows = sheet.totalRow ? body.slice(0, -1) : body;
  const total = sheet.totalRow ? body.at(-1) : undefined;
  dataRows.forEach((row, i) => {
    const variant: Variant = i % 2 === 1 ? "zebra" : "body";
    const rowNo = r + 1;
    push(
      Array.from({ length: columns }, (_, c) =>
        tableCell(`${columnName(c)}${rowNo}`, row[c], formatOf(c), variant),
      ).join(""),
    );
  });
  const lastDataRow = r;
  if (dataRows.length === 0) {
    push(textCell(`A${r + 1}`, "Tidak ada data untuk filter ini.", S_INFO));
  }
  if (total) {
    const rowNo = r + 1;
    push(
      Array.from({ length: columns }, (_, c) =>
        tableCell(`${columnName(c)}${rowNo}`, total[c], formatOf(c), "total"),
      ).join(""),
    );
  }
  if (sheet.notes?.length) {
    push("");
    for (const note of sheet.notes) push(textCell(`A${r + 1}`, note, S_INFO));
  }

  // Lebar kolom dari header + isi (judul/keterangan dibiarkan meluber ke sel kosong di kanannya).
  const widths = Array.from({ length: columns }, (_, c) =>
    Math.min(
      50,
      Math.max(
        9,
        displayLength(header[c]) + 4,
        ...body.slice(0, 500).map((row) => displayLength(row[c], formatOf(c)) + 2),
      ),
    ),
  );
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
  const freezeCols = Math.min(sheet.freezeColumns ?? 0, columns - 1);
  const topLeft = `${columnName(freezeCols)}${headerRow + 1}`;
  const pane =
    freezeCols > 0
      ? `<pane xSplit="${freezeCols}" ySplit="${headerRow}" topLeftCell="${topLeft}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${topLeft}" sqref="${topLeft}"/>`
      : `<pane ySplit="${headerRow}" topLeftCell="${topLeft}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${topLeft}" sqref="${topLeft}"/>`;
  const tab = index === 0 ? ' tabSelected="1"' : "";
  const views = `<sheetViews><sheetView showGridLines="0"${tab} workbookViewId="0">${pane}</sheetView></sheetViews>`;
  const lastCol = columnName(columns - 1);
  const filterRef = `A${headerRow}:${lastCol}${lastDataRow}`;
  const autoFilter =
    dataRows.length > 0 && sheet.autoFilter !== false ? `<autoFilter ref="${filterRef}"/>` : "";
  // Kode header/footer memakai "&"; tanda & di teks ditulis ganda.
  const footerTitle = (sheet.title ?? name).replace(/&/g, "&&");
  const print = `<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>${esc(`&L&8${footerTitle}&R&8Halaman &P dari &N`)}</oddFooter></headerFooter>`;
  const absRef = (ref: string) => ref.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");
  const definedNames = [
    `<definedName name="_xlnm.Print_Titles" localSheetId="${index}">${esc(`${quoted(name)}!$${headerRow}:$${headerRow}`)}</definedName>`,
  ];
  if (autoFilter) {
    definedNames.unshift(
      `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${esc(`${quoted(name)}!${absRef(filterRef)}`)}</definedName>`,
    );
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${views}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${lines.join("")}</sheetData>${autoFilter}${print}</worksheet>`;
  return { xml, definedNames };
}

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

function coreXml(meta: XlsxMeta, now: Date): string {
  const stamp = `${now.toISOString().slice(0, 19)}Z`;
  const title = meta.title ? `<dc:title>${esc(meta.title)}</dc:title>` : "";
  const creator = meta.creator ? `<dc:creator>${esc(meta.creator)}</dc:creator>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${title}${creator}<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created></cp:coreProperties>`;
}

/** Workbook baru berisi satu atau beberapa sheet. `meta` = judul & pembuat di properti berkas. */
export function buildWorkbook(sheets: XlsxSheet[], meta?: XlsxMeta, now = new Date()): Uint8Array {
  const list = sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [] }];
  const names = list.map((s) => sheetName(s.name));
  const definedNames: string[] = [];
  const sheetFiles = list.map((sheet, i) => {
    if (!sheet.title) return sheetXml(sheet.rows, true);
    const out = reportSheetXml(sheet, i, names[i] as string);
    definedNames.push(...out.definedNames);
    return out.xml;
  });
  const defined =
    definedNames.length > 0 ? `<definedNames>${definedNames.join("")}</definedNames>` : "";
  const core = meta
    ? {
        types: `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
        rel: `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`,
      }
    : { types: "", rel: "" };
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${SHEET_TYPE}"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${core.types}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>${core.rel}</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL_NS}"><sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${defined}</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${list.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": STYLES_XML,
  };
  if (meta) files["docProps/core.xml"] = coreXml(meta, now);
  sheetFiles.forEach((xml, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = xml;
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
