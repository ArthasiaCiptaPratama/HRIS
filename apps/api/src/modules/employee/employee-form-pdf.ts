import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { type EmployeeFormData, imageInfo } from "./employee-form.ts";
import { EMPLOYEE_FORM_TEMPLATE_BASE64 } from "./employee-form-template.ts";

// Print data karyawan (2026-10-19): template PDF "Formulir Data Karyawan" dari HR dipakai sebagai latar,
// isian ditulis di koordinat sel (pdf-lib, tanpa LibreOffice/Gotenberg — jalan di Vercel). Bagian pernyataan,
// daftar dokumen, tanggal & tanda tangan Pelamar ditutup; footer "Page x of 7" bawaan Word dibetulkan.
// Koordinat diukur dari template (pdfplumber, satuan pt, dihitung dari ATAS halaman). Template diganti →
// ukur ulang posisi di bawah (posisi tetap, EMP-OD2).

const PAGE_HEIGHT = 842.04;
const FONT_SIZE = 8.5;
const MIN_FONT_SIZE = 6;
const PAD = 3;
const INK = rgb(0.05, 0.05, 0.05);
const WHITE = rgb(1, 1, 1);

type Box = { x0: number; x1: number; top: number; bottom: number };

/** Font standar PDF hanya WinAnsi: tanda kutip/pisah tipografis diganti ASCII, karakter lain di luar Latin-1 → "?". */
export function pdfSafe(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Potong satu baris supaya muat (akhiran "..."). */
function clip(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > width)
    out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

/**
 * Tulis teks di dalam kotak sel: rata kiri, tengah vertikal. Kecilkan huruf sampai muat (maks `maxLines`
 * baris); bila tetap tidak muat, baris terakhir dipotong.
 */
function drawInBox(page: PDFPage, font: PDFFont, raw: string, box: Box, maxLines = 1) {
  const value = pdfSafe(raw).trim();
  if (!value) return;
  const width = box.x1 - box.x0 - PAD * 2;
  const height = box.bottom - box.top - 2;
  let size = FONT_SIZE;
  let lines = [value];
  for (; size >= MIN_FONT_SIZE; size -= 0.5) {
    lines = maxLines === 1 ? [value] : wrap(value, font, size, width);
    const fitsWidth = lines.every((l) => font.widthOfTextAtSize(l, size) <= width);
    if (lines.length <= maxLines && fitsWidth && lines.length * size * 1.15 <= height) break;
  }
  size = Math.max(size, MIN_FONT_SIZE);
  if (lines.length > maxLines) {
    const rest = lines.slice(maxLines - 1).join(" ");
    lines = [...lines.slice(0, maxLines - 1), rest];
  }
  lines = lines.map((l) => clip(l, font, size, width));
  const leading = size * 1.15;
  const blockHeight = leading * (lines.length - 1) + size * 0.72;
  const firstBaselineFromTop = box.top + (box.bottom - box.top - blockHeight) / 2 + size * 0.72;
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: box.x0 + PAD,
      y: PAGE_HEIGHT - (firstBaselineFromTop + i * leading),
      size,
      font,
      color: INK,
    });
  });
}

function whiteOut(page: PDFPage, x0: number, top: number, x1: number, bottom: number) {
  page.drawRectangle({
    x: x0,
    y: PAGE_HEIGHT - bottom,
    width: x1 - x0,
    height: bottom - top,
    color: WHITE,
  });
}

/** Isi tabel berbaris tetap; kelebihan data → baris terakhir "+n lainnya". */
function drawTable<T extends Record<string, string>>(
  page: PDFPage,
  font: PDFFont,
  rows: T[],
  keys: (keyof T)[],
  rowTops: number[],
  cols: number[],
) {
  const capacity = rowTops.length - 1;
  const shown =
    rows.length > capacity
      ? [
          ...rows.slice(0, capacity - 1),
          {
            [keys[0] as string]: `+${rows.length - capacity + 1} lainnya (lihat aplikasi HRIS)`,
          } as T,
        ]
      : rows;
  shown.forEach((row, r) => {
    keys.forEach((key, c) => {
      drawInBox(page, font, String(row[key] ?? ""), {
        x0: cols[c] as number,
        x1: cols[c + 1] as number,
        top: rowTops[r] as number,
        bottom: rowTops[r + 1] as number,
      });
    });
  });
}

/** Pasangan label kiri/kanan berbaris tetap: [kunci kiri, kunci kanan] per baris. */
function drawPairs(
  page: PDFPage,
  font: PDFFont,
  data: Record<string, unknown>,
  pairs: [string | null, string | null][],
  rowTops: number[],
  left: [number, number],
  right: [number, number],
  maxLines = 1,
) {
  pairs.forEach(([a, b], i) => {
    const top = rowTops[i] as number;
    const bottom = rowTops[i + 1] as number;
    if (a)
      drawInBox(
        page,
        font,
        String(data[a] ?? ""),
        { x0: left[0], x1: left[1], top, bottom },
        maxLines,
      );
    if (b)
      drawInBox(
        page,
        font,
        String(data[b] ?? ""),
        { x0: right[0], x1: right[1], top, bottom },
        maxLines,
      );
  });
}

export type PhotoOutcome = "included" | "none" | "unsupported";

/** Isi template → PDF. `template` default = template tersemat; dipisah supaya bisa diuji/diganti. */
export async function renderEmployeeFormPdf(
  data: EmployeeFormData,
  photo: Uint8Array | null,
  template: Uint8Array = Buffer.from(EMPLOYEE_FORM_TEMPLATE_BASE64, "base64"),
): Promise<{ pdf: Uint8Array; photo: PhotoOutcome }> {
  const doc = await PDFDocument.load(template);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const [p1, p2, p3] = pages as [PDFPage, PDFPage, PDFPage];
  const d = data as unknown as Record<string, unknown>;

  // ── Halaman 1: Data pribadi ──
  const t0Rows = [127, 156, 186, 215, 245, 274, 304];
  drawPairs(
    p1,
    font,
    d,
    [
      ["fullName", null],
      ["employeeNumber", null],
      ["domicileAddress", null],
      ["phone", null],
      ["ktpAddress", null],
      ["email", null],
    ],
    t0Rows,
    [170, 400],
    [0, 0],
    2,
  );
  // Kotak foto (403–561 × 127–304): tutup tulisan "(Photo)", pasang pas foto (rasio dijaga, maks 4 × 5,4 cm).
  let outcome: PhotoOutcome = "none";
  const info = photo ? imageInfo(photo) : null;
  if (photo && !info) outcome = "unsupported";
  if (photo && info) {
    whiteOut(p1, 405, 129, 559, 302);
    const image = info.format === "png" ? await doc.embedPng(photo) : await doc.embedJpg(photo);
    const maxW = 113.4;
    const maxH = 153.1;
    const scale = Math.min(maxW / info.width, maxH / info.height);
    const w = info.width * scale;
    const h = info.height * scale;
    const cx = (403 + 561) / 2;
    const cy = (127 + 304) / 2;
    p1.drawImage(image, { x: cx - w / 2, y: PAGE_HEIGHT - (cy + h / 2), width: w, height: h });
    outcome = "included";
  }
  drawPairs(
    p1,
    font,
    d,
    [
      ["birth", "religion"],
      ["nationality", "ethnicity"],
      ["marital", "ktpNumber"],
      ["bloodType", "gender"],
      ["simA", "npwp"],
      ["simC", null],
      ["domVillage", "domDistrict"],
      ["domCity", "domProvince"],
      ["ktpVillage", "ktpDistrict"],
      ["ktpCity", "ktpProvince"],
    ],
    [315, 344, 373, 403, 432, 462, 491, 521, 550, 580, 609],
    [151, 296],
    [414, 559],
  );

  // Template asli tidak punya titik dua di baris NPWP (ada di baris bawahnya) — samakan dengan baris lain.
  p1.drawText(":", { x: 408.5, y: PAGE_HEIGHT - 447.5, size: 9, font, color: INK });

  // ── Halaman 2: Keluarga, kepegawaian, rekening, kontak darurat ──
  drawPairs(
    p2,
    font,
    d,
    [
      ["spouseName", "spouseBirth"],
      ["spouseOccupation", "spouseWorkAddress"],
    ],
    [126, 152, 178],
    [159, 296],
    [421, 559],
    2,
  );
  drawTable(
    p2,
    font,
    data.children,
    ["name", "gender", "birth", "education", "occupation"],
    [216, 236, 256, 277, 297, 318],
    [35, 164, 202, 318, 420, 559],
  );
  drawTable(
    p2,
    font,
    data.parents,
    ["name", "age", "education", "occupation"],
    [356, 376, 396],
    [35, 210, 263, 420, 559],
  );
  drawTable(
    p2,
    font,
    data.siblings,
    ["name", "age", "education", "occupation", "relation"],
    [430, 450, 470, 490, 511, 531],
    [35, 164, 202, 318, 420, 559],
  );
  drawPairs(
    p2,
    font,
    d,
    [
      ["department", "position"],
      ["division", "joinDate"],
    ],
    [549, 575, 601],
    [159, 296],
    [421, 559],
  );
  drawPairs(
    p2,
    font,
    d,
    [
      ["bankName", "bankHolder"],
      ["bankAccount", null],
    ],
    [615, 641, 667],
    [159, 296],
    [421, 559],
  );
  drawTable(
    p2,
    font,
    data.contacts,
    ["name", "relation", "phone", "address"],
    [728, 750, 772],
    [37, 172, 292, 413, 561],
  );

  // ── Halaman 3: Pendidikan & sertifikasi; tanpa pernyataan, daftar dokumen, tanda tangan ──
  drawTable(
    p3,
    font,
    data.educations,
    ["level", "school", "from", "to"],
    [178, 198, 218, 238],
    [35, 140, 395, 478, 559],
  );
  drawTable(
    p3,
    font,
    data.certifications,
    ["type", "number", "year"],
    [295, 315, 336, 356, 376, 397, 417, 437, 458, 478, 498, 518],
    [35, 295, 460, 559],
  );
  whiteOut(p3, 28, 521, 568, 803);

  // Footer bawaan Word "Page n of 7" → jumlah halaman sebenarnya.
  pages.forEach((page, i) => {
    whiteOut(page, 494, 808, 562, 822);
    page.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: 499,
      y: PAGE_HEIGHT - 818,
      size: 7.5,
      font,
      color: INK,
    });
  });

  return { pdf: await doc.save(), photo: outcome };
}
