import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// Mengisi template .xlsx langsung di XML lembar kerjanya: gaya sel, merge, gambar (logo),
// ukuran kolom, dan pengaturan cetak template tetap persis seperti buatan Excel.
// Nilai teks ditulis sebagai inline string, jadi sharedStrings.xml tidak perlu diubah.

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const CELL_REF = /^([A-Z]{1,3})([1-9]\d*)$/;

export type CellValue = string | number | null | undefined;

/** Titik sudut gambar: kolom/baris berbasis 0 + offset EMU di dalam sel itu. */
export interface CellAnchor {
  col: number;
  row: number;
  colOffset: number;
  rowOffset: number;
}

/** Gambar JPEG yang disisipkan ke drawing lembar (mis. foto di bingkai formulir). */
export interface TemplateImage {
  /** Drawing milik lembar, mis. "xl/drawings/drawing1.xml". */
  drawingPath: string;
  name: string;
  jpeg: Uint8Array;
  from: CellAnchor;
  to: CellAnchor;
}

/** 1 piksel layar = 9525 EMU (satuan DrawingML). */
export const EMU_PER_PIXEL = 9525;

export class XlsxTemplateError extends Error {}

/** "A" → 1, "AE" → 31. */
export function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index;
}

function parseRef(ref: string) {
  const match = CELL_REF.exec(ref);
  if (!match?.[1] || !match[2]) throw new XlsxTemplateError(`Alamat sel tidak valid: ${ref}`);
  return { column: columnIndex(match[1]), row: Number(match[2]) };
}

const refOf = (el: Element) => el.getAttribute("r") ?? "";

/** Cari elemen berurutan (row/c) dengan kunci tertentu; buat & sisipkan di posisi benar bila tidak ada. */
function findOrInsert(
  parent: Element,
  tag: string,
  key: number,
  keyOf: (el: Element) => number,
  create: () => Element,
): Element {
  const siblings = Array.from(parent.children).filter((el) => el.localName === tag);
  const existing = siblings.find((el) => keyOf(el) === key);
  if (existing) return existing;
  const created = create();
  const next = siblings.find((el) => keyOf(el) > key);
  parent.insertBefore(created, next ?? null);
  return created;
}

function writeCell(doc: Document, cell: Element, value: CellValue) {
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  cell.removeAttribute("t");
  if (value === null || value === undefined || value === "") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new XlsxTemplateError("Nilai angka tidak valid.");
    const v = doc.createElementNS(MAIN_NS, "v");
    v.textContent = String(value);
    cell.appendChild(v);
    return;
  }
  cell.setAttribute("t", "inlineStr");
  const is = doc.createElementNS(MAIN_NS, "is");
  const t = doc.createElementNS(MAIN_NS, "t");
  t.setAttributeNS(XML_NS, "xml:space", "preserve");
  t.textContent = value;
  is.appendChild(t);
  cell.appendChild(is);
}

/**
 * Chromium menyertakan deklarasi `<?xml …?>` hasil parse, jsdom tidak. Deklarasi ganda membuat
 * file rusak di Excel, jadi buang yang ada lalu tulis tepat satu.
 */
export function serializeSheet(doc: Document): string {
  const xml = new XMLSerializer().serializeToString(doc).replace(/^\s*<\?xml[^?]*\?>\s*/, "");
  return XML_DECLARATION + xml;
}

/**
 * Isi sel-sel `cells` (mis. `{ R9: "Budi" }`) di lembar `sheetPath` dan kembalikan file .xlsx baru.
 * Untuk sel gabungan (merge), tulis ke sel kiri-atasnya. Gaya sel (`s`) yang sudah ada dipertahankan.
 */
export function fillXlsxTemplate(
  template: Uint8Array,
  sheetPath: string,
  cells: Record<string, CellValue>,
  images: TemplateImage[] = [],
): Uint8Array {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(template);
  } catch {
    throw new XlsxTemplateError("File template bukan file Excel (.xlsx) yang valid.");
  }
  const sheet = files[sheetPath];
  if (!sheet) throw new XlsxTemplateError(`Lembar ${sheetPath} tidak ada di template.`);

  const doc = new DOMParser().parseFromString(strFromU8(sheet), "application/xml");
  const sheetData = doc.getElementsByTagNameNS(MAIN_NS, "sheetData")[0];
  if (doc.getElementsByTagName("parsererror").length > 0 || !sheetData) {
    throw new XlsxTemplateError("Isi lembar template tidak dapat dibaca.");
  }

  for (const [ref, value] of Object.entries(cells)) {
    const { column, row } = parseRef(ref);
    const rowEl = findOrInsert(
      sheetData,
      "row",
      row,
      (el) => Number(refOf(el)),
      () => {
        const el = doc.createElementNS(MAIN_NS, "row");
        el.setAttribute("r", String(row));
        return el;
      },
    );
    const cell = findOrInsert(
      rowEl,
      "c",
      column,
      (el) => parseRef(refOf(el)).column,
      () => {
        const el = doc.createElementNS(MAIN_NS, "c");
        el.setAttribute("r", ref);
        return el;
      },
    );
    writeCell(doc, cell, value);
  }

  files[sheetPath] = strToU8(serializeSheet(doc));
  images.forEach((image, index) => {
    insertImage(files, image, index + 1);
  });
  return zipSync(files, { level: 6 });
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

function anchorXml(tag: "from" | "to", anchor: CellAnchor) {
  const int = (value: number) => {
    if (!Number.isInteger(value) || value < 0) {
      throw new XlsxTemplateError("Posisi gambar tidak valid.");
    }
    return value;
  };
  return `<xdr:${tag}><xdr:col>${int(anchor.col)}</xdr:col><xdr:colOff>${int(anchor.colOffset)}</xdr:colOff><xdr:row>${int(anchor.row)}</xdr:row><xdr:rowOff>${int(anchor.rowOffset)}</xdr:rowOff></xdr:${tag}>`;
}

/**
 * Sisipkan JPEG ke drawing yang sudah ada: file media baru, relasi baru, dan anchor dua sel
 * (gambar mengikuti ukuran sel). Bagian lain template tidak disentuh.
 */
function insertImage(files: Record<string, Uint8Array>, image: TemplateImage, seq: number) {
  const drawing = files[image.drawingPath];
  const relsPath = image.drawingPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const rels = files[relsPath];
  const types = files["[Content_Types].xml"];
  if (!drawing || !rels || !types) {
    throw new XlsxTemplateError("Template tidak punya area gambar untuk foto.");
  }
  const mediaName = `hris-image-${seq}.jpeg`;
  const relId = `rIdHrisImage${seq}`;
  files[`xl/media/${mediaName}`] = image.jpeg;

  const relsXml = strFromU8(rels);
  if (!relsXml.includes("</Relationships>")) throw new XlsxTemplateError("Relasi drawing rusak.");
  files[relsPath] = strToU8(
    relsXml.replace(
      "</Relationships>",
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/></Relationships>`,
    ),
  );

  const typesXml = strFromU8(types);
  if (!/Extension="jpeg"/i.test(typesXml)) {
    files["[Content_Types].xml"] = strToU8(
      typesXml.replace("</Types>", '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>'),
    );
  }

  const drawingXml = strFromU8(drawing);
  if (!drawingXml.includes("</xdr:wsDr>")) throw new XlsxTemplateError("Drawing template rusak.");
  const ids = [...drawingXml.matchAll(/<xdr:cNvPr id="(\d+)"/g)].map((m) => Number(m[1]));
  const shapeId = Math.max(0, ...ids) + seq;
  const anchor =
    `<xdr:twoCellAnchor editAs="oneCell">${anchorXml("from", image.from)}${anchorXml("to", image.to)}` +
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${shapeId}" name="${escapeXml(image.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  files[image.drawingPath] = strToU8(drawingXml.replace("</xdr:wsDr>", `${anchor}</xdr:wsDr>`));
}

/** Unduh byte sebagai file di browser. */
export function downloadFile(bytes: Uint8Array, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Beri waktu browser memulai unduhan sebelum URL dilepas.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
