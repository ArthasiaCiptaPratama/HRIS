import { type Grid, type GridCell, IMPORT_MAX_FILE_BYTES } from "@hris/shared";

// D-042: file diurai DI BROWSER dan tidak dikirim/disimpan (UU PDP). Library dimuat lazy supaya
// bundle halaman lain tetap kecil.

export interface ParsedWorkbook {
  fileName: string;
  sha256: string;
  sheets: { name: string; grid: Grid }[];
}

export class ImportFileError extends Error {}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Teks CSV: UTF-8 (dengan/ tanpa BOM); bila bukan UTF-8 valid → Windows-1252 (ekspor Excel lama). */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

export async function parseImportFile(file: File): Promise<ParsedWorkbook> {
  const name = file.name.toLowerCase();
  if (file.size > IMPORT_MAX_FILE_BYTES) {
    throw new ImportFileError("Ukuran file melebihi 5 MB.");
  }
  if (name.endsWith(".xls")) {
    throw new ImportFileError(
      "Format .xls (Excel 97–2003) belum didukung. Buka di Excel lalu simpan sebagai .xlsx.",
    );
  }
  const buffer = await file.arrayBuffer();
  const sha256 = await sha256Hex(buffer);

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const { default: Papa } = await import("papaparse");
    // Pemisah dideteksi otomatis (",", ";", tab) — ekspor Excel berlokal Indonesia memakai ";".
    const result = Papa.parse<string[]>(decodeText(buffer), { skipEmptyLines: false });
    const grid: Grid = result.data.map((row) => row.map((cell) => (cell === "" ? null : cell)));
    return { fileName: file.name, sha256, sheets: [{ name: "CSV", grid }] };
  }

  if (!name.endsWith(".xlsx")) {
    throw new ImportFileError("Format file tidak didukung. Gunakan .xlsx atau .csv.");
  }
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  try {
    const sheets = await readXlsxFile(file);
    return {
      fileName: file.name,
      sha256,
      sheets: sheets.map((sheet) => ({
        name: sheet.sheet,
        grid: sheet.data.map((row) => row.map((cell) => (cell ?? null) as GridCell)),
      })),
    };
  } catch {
    throw new ImportFileError(
      "File Excel tidak bisa dibaca. Pastikan file tidak rusak atau terkunci.",
    );
  }
}

/** Nilai sel siap kirim (JSON): tanggal → ISO; selain itu apa adanya. */
export function serializeCell(cell: GridCell): string | number | boolean | null {
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : cell.toISOString();
  return cell;
}

/** Tanda tangan susunan header (SHA-256) untuk profil pemetaan. */
export async function signatureOf(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
