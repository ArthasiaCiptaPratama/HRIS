import type { WarningLevel } from "@hris/shared";
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { BRAND_LOGO_PNG_BASE64 } from "../../core/brand-logo.ts";

// ARS-D7: surat SP dari template sistem (teks tidak bisa diedit dari aplikasi; disetujui HR/legal sebelum
// produksi). Dicetak, ditandatangani basah HR + atasan + karyawan, lalu scan-nya diunggah sebagai dokumen
// WARNING_LETTER. Dibuat saat diminta; tidak disimpan di server.

export interface WarningLetterPdfInput {
  /** null = draft (belum bernomor; diberi tanda DRAF). */
  number: string | null;
  level: WarningLevel;
  companyName: string;
  /** YYYY-MM-DD; null = draft. */
  issuedAt: string | null;
  effectiveUntil: string | null;
  validityMonths: number;
  violationName: string;
  incidentDate: string | null;
  description: string;
  alphaDates: string[];
  employee: { name: string; number: string; role: string };
  issuer: { name: string; role: string };
  manager: { name: string; role: string } | null;
}

const TITLES: Record<WarningLevel, string> = {
  SP1: "SURAT PERINGATAN PERTAMA (SP 1)",
  SP2: "SURAT PERINGATAN KEDUA (SP 2)",
  SP3: "SURAT PERINGATAN KETIGA (SP 3)",
};
const LEVEL_WORDS: Record<WarningLevel, string> = {
  SP1: "Pertama",
  SP2: "Kedua",
  SP3: "Ketiga",
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

export function formatIndonesianDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** Font standar PDF hanya WinAnsi: karakter di luar itu (mis. emoji, aksara non-Latin) diganti "?". */
function safe(text: string): string {
  return text.normalize("NFC").replace(/[^\x20-\x7E -ÿ]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  // Baris baru dari uraian dipertahankan sebagai paragraf.
  for (const para of safe(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) cur = next;
      else {
        if (cur) out.push(cur);
        cur = w;
      }
    }
    out.push(cur);
  }
  return out.length > 0 ? out : [""];
}

const A4: [number, number] = [595.28, 841.89];
const LEFT = 56;
const RIGHT = A4[0] - 56;
const BOTTOM = 60;

export async function buildWarningLetterPdf(input: WarningLetterPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const number = input.number ?? "(draf, belum bernomor)";
  pdf.setTitle(`${TITLES[input.level]} ${number}`);
  pdf.setCreator("Akselerasi Arthasia HRIS");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);
  const pages: PDFPage[] = [];
  let page = pdf.addPage(A4);
  pages.push(page);
  let y = 790;

  const newPage = () => {
    page = pdf.addPage(A4);
    pages.push(page);
    y = 790;
  };
  const ensure = (space: number) => {
    if (y - space < BOTTOM) newPage();
  };
  const text = (t: string, x: number, size = 10, font = regular, color = ink) =>
    page.drawText(safe(t), { x, y, size, font, color });
  const centered = (t: string, size: number, font: PDFFont) =>
    page.drawText(safe(t), {
      x: (A4[0] - font.widthOfTextAtSize(safe(t), size)) / 2,
      y,
      size,
      font,
      color: ink,
    });
  const paragraph = (t: string, indent = 0, font = regular) => {
    for (const line of wrap(t, font, 10, RIGHT - LEFT - indent)) {
      ensure(14);
      text(line, LEFT + indent, 10, font);
      y -= 14;
    }
    y -= 6;
  };

  // Kop: logo Arthasia + nama PT, lalu garis pemisah (sama dengan BAST aset).
  const logo = await pdf.embedPng(Buffer.from(BRAND_LOGO_PNG_BASE64, "base64"));
  const logoSize = 54;
  const top = 806;
  page.drawImage(logo, { x: LEFT, y: top - logoSize, width: logoSize, height: logoSize });
  y = top - 22;
  text(input.companyName || "Akselerasi Arthasia", LEFT + logoSize + 12, 13, bold);
  y -= 15;
  text("Akselerasi Arthasia · HRIS", LEFT + logoSize + 12, 9, regular, muted);
  y = top - logoSize - 8;
  page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 1, color: ink });
  y -= 30;
  centered(TITLES[input.level], 13, bold);
  y -= 16;
  centered(`Nomor: ${number}`, 10, regular);
  y -= 30;

  paragraph("Surat peringatan ini ditujukan kepada:");
  for (const [k, v] of [
    ["Nama", input.employee.name],
    ["NIP", input.employee.number],
    ["Jabatan", input.employee.role],
  ] as const) {
    text(k, LEFT + 12);
    text(`: ${v}`, LEFT + 120);
    y -= 14;
  }
  y -= 8;

  const when = input.incidentDate
    ? ` pada tanggal ${formatIndonesianDate(input.incidentDate)}`
    : "";
  paragraph(
    `Berdasarkan hasil pemeriksaan, Saudara/i telah melakukan pelanggaran berupa ${input.violationName}${when}, dengan uraian sebagai berikut:`,
  );
  paragraph(input.description, 12);
  if (input.alphaDates.length > 0) {
    paragraph(
      `Hari tidak hadir tanpa keterangan (ALPHA) yang menjadi dasar: ${input.alphaDates.map(formatIndonesianDate).join(", ")}.`,
      12,
    );
  }
  const period =
    input.issuedAt && input.effectiveUntil
      ? `berlaku sejak ${formatIndonesianDate(input.issuedAt)} sampai dengan ${formatIndonesianDate(input.effectiveUntil)}`
      : `berlaku ${input.validityMonths} bulan sejak tanggal diterbitkan`;
  paragraph(
    `Atas pelanggaran tersebut, perusahaan memberikan Surat Peringatan ${LEVEL_WORDS[input.level]} yang ${period}. Apabila dalam masa berlaku surat ini Saudara/i kembali melakukan pelanggaran, perusahaan dapat menjatuhkan sanksi lebih lanjut sesuai Peraturan Perusahaan / Perjanjian Kerja Bersama dan peraturan perundang-undangan yang berlaku.`,
  );
  if (input.level === "SP3") {
    paragraph("Surat Peringatan Ketiga ini merupakan peringatan terakhir.", 0, bold);
  }
  paragraph(
    "Demikian surat peringatan ini dibuat untuk diperhatikan dan menjadi bahan perbaikan sikap serta kinerja Saudara/i.",
  );

  // Tanda tangan: HR (penerbit), atasan langsung, karyawan (ARS-D7).
  ensure(150);
  y -= 6;
  text(
    input.issuedAt
      ? `Diterbitkan, ${formatIndonesianDate(input.issuedAt)}`
      : "Diterbitkan, ____________",
    LEFT,
  );
  y -= 24;
  const colWidth = (RIGHT - LEFT - 30) / 3;
  const sign = (label: string, name: string, role: string, col: number) => {
    const x = LEFT + col * (colWidth + 15);
    page.drawText(safe(label), { x, y, size: 10, font: bold, color: ink });
    page.drawLine({
      start: { x, y: y - 70 },
      end: { x: x + colWidth, y: y - 70 },
      thickness: 0.7,
      color: ink,
    });
    for (const [i, line] of wrap(name, regular, 9, colWidth).slice(0, 2).entries()) {
      page.drawText(line, { x, y: y - 84 - i * 11, size: 9, font: regular, color: ink });
    }
    page.drawText(safe(role).slice(0, 40), { x, y: y - 108, size: 8, font: regular, color: muted });
  };
  sign("Diterbitkan oleh", input.issuer.name, input.issuer.role, 0);
  sign("Atasan langsung", input.manager?.name ?? "____________", input.manager?.role ?? "", 1);
  sign("Diterima oleh", input.employee.name, "Karyawan", 2);

  pages.forEach((p, i) => {
    p.drawText(
      safe(
        `Dibuat oleh sistem Akselerasi Arthasia HRIS · ${number} · hal. ${i + 1}/${pages.length}`,
      ),
      { x: LEFT, y: 40, size: 7, font: regular, color: muted },
    );
    if (!input.number) {
      p.drawText("DRAF", {
        x: 170,
        y: 330,
        size: 120,
        font: bold,
        color: rgb(0.85, 0.85, 0.85),
        rotate: degrees(35),
        opacity: 0.5,
      });
    }
  });
  return pdf.save();
}
