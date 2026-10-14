import { ASSET_CONDITION_LABELS, type AssetCondition } from "@hris/shared";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

// ARS-D2: PDF Berita Acara Serah Terima dibuat dari data transaksi, dicetak, ditandatangani basah, lalu
// scan-nya diunggah sebagai dokumen BAST_ASSET. Dibuat saat diminta; tidak disimpan di server.

export type BastDocumentKind = "ASSET_HANDOVER" | "ASSET_RETURN" | "ASSET_LOST" | "PPE_ISSUE";

export interface BastLine {
  name: string;
  detail: string;
  quantity: string;
  condition: AssetCondition;
}

export interface BastInput {
  kind: BastDocumentKind;
  number: string;
  companyName: string;
  /** YYYY-MM-DD */
  date: string;
  lines: BastLine[];
  manager: { name: string; role: string };
  employee: { name: string; number: string; role: string };
  dueBackAt: string | null;
  note: string | null;
}

const TITLES: Record<BastDocumentKind, string> = {
  ASSET_HANDOVER: "BERITA ACARA SERAH TERIMA ASET",
  ASSET_RETURN: "BERITA ACARA PENGEMBALIAN ASET",
  ASSET_LOST: "BERITA ACARA KEHILANGAN ASET",
  PPE_ISSUE: "BERITA ACARA SERAH TERIMA APD / SERAGAM",
};

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const NUMBER_PREFIX: Record<BastDocumentKind, string> = {
  ASSET_HANDOVER: "BAST-S",
  ASSET_RETURN: "BAST-K",
  ASSET_LOST: "BAST-H",
  PPE_ISSUE: "BAST-APD",
};

/**
 * Nomor BAST unik per berita acara: jenis + kode aset/APD + tanggal + 6 karakter id transaksi
 * (serah & kembali di hari sama, atau APD sejenis untuk dua karyawan, tidak boleh bernomor sama).
 */
export function bastNumber(
  kind: BastDocumentKind,
  ref: string,
  date: string,
  transactionId: string,
) {
  return `${NUMBER_PREFIX[kind]}/${ref}/${date.replaceAll("-", "")}/${transactionId.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export function formatIndonesianDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** Font standar PDF hanya WinAnsi: karakter di luar itu (mis. emoji, aksara non-Latin) diganti "?". */
function safe(text: string): string {
  return text.normalize("NFC").replace(/[^\x20-\x7E -ÿ]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [""];
}

export async function buildBastPdf(input: BastInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${TITLES[input.kind]} ${input.number}`);
  pdf.setCreator("Akselerasi Arthasia HRIS");
  const page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);
  const left = 56;
  const right = 595.28 - 56;
  let y = 790;
  const text = (t: string, x: number, size = 10, font = regular, color = ink) =>
    page.drawText(safe(t), { x, y, size, font, color });

  text(safe(input.companyName || "Akselerasi Arthasia"), left, 12, bold);
  y -= 14;
  text("Akselerasi Arthasia · HRIS", left, 9, regular, muted);
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: ink });
  y -= 30;
  const title = TITLES[input.kind];
  page.drawText(title, {
    x: (595.28 - bold.widthOfTextAtSize(title, 13)) / 2,
    y,
    size: 13,
    font: bold,
    color: ink,
  });
  y -= 16;
  const no = `Nomor: ${input.number}`;
  page.drawText(safe(no), {
    x: (595.28 - regular.widthOfTextAtSize(no, 10)) / 2,
    y,
    size: 10,
    font: regular,
    color: ink,
  });
  y -= 30;

  const verb =
    input.kind === "ASSET_RETURN"
      ? "menerima kembali dari Pihak Kedua"
      : input.kind === "ASSET_LOST"
        ? "mencatat kehilangan barang yang dipegang Pihak Kedua"
        : "menyerahkan kepada Pihak Kedua";
  for (const line of wrap(
    `Pada tanggal ${formatIndonesianDate(input.date)}, yang bertanda tangan di bawah ini:`,
    regular,
    10,
    right - left,
  )) {
    text(line, left);
    y -= 14;
  }
  y -= 4;
  const party = (label: string, rows: [string, string][]) => {
    text(label, left, 10, bold);
    y -= 14;
    for (const [k, v] of rows) {
      text(k, left + 12);
      text(`: ${v}`, left + 120);
      y -= 14;
    }
    y -= 6;
  };
  party("Pihak Pertama (pengelola aset)", [
    ["Nama", input.manager.name],
    ["Jabatan", input.manager.role],
  ]);
  party("Pihak Kedua (karyawan)", [
    ["Nama", input.employee.name],
    ["NIP", input.employee.number],
    ["Jabatan", input.employee.role],
  ]);
  for (const line of wrap(`Pihak Pertama ${verb} barang berikut:`, regular, 10, right - left)) {
    text(line, left);
    y -= 14;
  }
  y -= 6;

  // Tabel barang
  const cols = [left, left + 26, left + 300, left + 370];
  const header = ["No", "Barang", "Jumlah", "Kondisi"];
  page.drawRectangle({
    x: left,
    y: y - 4,
    width: right - left,
    height: 18,
    color: rgb(0.93, 0.93, 0.93),
  });
  header.forEach((h, i) => {
    page.drawText(h, { x: (cols[i] as number) + 4, y: y + 1, size: 9, font: bold, color: ink });
  });
  y -= 18;
  input.lines.forEach((l, i) => {
    const nameLines = wrap(l.name, bold, 9, 266);
    const detailLines = l.detail ? wrap(l.detail, regular, 8, 266) : [];
    const height = 12 * (nameLines.length + detailLines.length) + 6;
    page.drawText(String(i + 1), {
      x: (cols[0] as number) + 4,
      y,
      size: 9,
      font: regular,
      color: ink,
    });
    let yy = y;
    for (const n of nameLines) {
      page.drawText(n, { x: (cols[1] as number) + 4, y: yy, size: 9, font: bold, color: ink });
      yy -= 12;
    }
    for (const d of detailLines) {
      page.drawText(d, { x: (cols[1] as number) + 4, y: yy, size: 8, font: regular, color: muted });
      yy -= 12;
    }
    page.drawText(safe(l.quantity), {
      x: (cols[2] as number) + 4,
      y,
      size: 9,
      font: regular,
      color: ink,
    });
    page.drawText(ASSET_CONDITION_LABELS[l.condition], {
      x: (cols[3] as number) + 4,
      y,
      size: 9,
      font: regular,
      color: ink,
    });
    y -= height;
    page.drawLine({
      start: { x: left, y: y + 8 },
      end: { x: right, y: y + 8 },
      thickness: 0.5,
      color: muted,
    });
  });
  y -= 10;
  if (input.dueBackAt) {
    text(
      `Dipinjam sementara; wajib dikembalikan paling lambat ${formatIndonesianDate(input.dueBackAt)}.`,
      left,
    );
    y -= 14;
  }
  if (input.note) {
    for (const line of wrap(`Catatan: ${input.note}`, regular, 10, right - left)) {
      text(line, left);
      y -= 14;
    }
  }
  const closing =
    input.kind === "ASSET_HANDOVER" || input.kind === "PPE_ISSUE"
      ? "Pihak Kedua bertanggung jawab menjaga barang tersebut dan mengembalikannya sesuai ketentuan perusahaan."
      : "Demikian berita acara ini dibuat dengan sebenarnya.";
  y -= 4;
  for (const line of wrap(closing, regular, 10, right - left)) {
    text(line, left);
    y -= 14;
  }

  // Tanda tangan
  y = Math.min(y - 30, 220);
  const sign = (label: string, name: string, x: number) => {
    page.drawText(label, { x, y, size: 10, font: bold, color: ink });
    page.drawLine({
      start: { x, y: y - 70 },
      end: { x: x + 180, y: y - 70 },
      thickness: 0.7,
      color: ink,
    });
    page.drawText(safe(name), { x, y: y - 84, size: 9, font: regular, color: ink });
  };
  sign("Pihak Pertama", input.manager.name, left);
  sign("Pihak Kedua", input.employee.name, right - 180);
  page.drawText(safe(`Dibuat oleh sistem Akselerasi Arthasia HRIS · ${input.number}`), {
    x: left,
    y: 40,
    size: 7,
    font: regular,
    color: muted,
  });
  return pdf.save();
}
