// Import roster (D-068; format final menunggu OD-12). File diurai DI BROWSER; yang dikirim hanya baris
// NIP–tanggal–kode. Dua bentuk dikenali otomatis:
//   1. Panjang: kolom "NIP", "Tanggal", "Kode" (satu baris per hari).
//   2. Lebar (grid bulanan seperti contoh kantor): kolom "NIP" lalu satu kolom per tanggal
//      (header tanggal ISO/Excel, atau angka 1–31 untuk bulan yang dipilih).

export type Cell = string | number | boolean | Date | null;
export type Grid = Cell[][];

export interface RosterFileRow {
  employeeNumber: string;
  date: string;
  code: string;
}

export interface RosterFileResult {
  format: "long" | "wide";
  rows: RosterFileRow[];
  problems: string[];
}

export class RosterFileError extends Error {}

const norm = (cell: Cell) =>
  String(cell ?? "")
    .trim()
    .toLowerCase();
const text = (cell: Cell) => (cell === null || cell === undefined ? "" : String(cell).trim());

const NIP_HEADERS = ["nip", "nik", "no induk", "nomor induk", "employee number", "id karyawan"];
const DATE_HEADERS = ["tanggal", "tgl", "date"];
const CODE_HEADERS = ["kode", "shift", "kode shift", "code"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Sel tanggal (Date Excel, "YYYY-MM-DD", "DD/MM/YYYY") → ISO; null bila bukan tanggal. */
export function toIsoDate(cell: Cell): string | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`;
  }
  const value = text(cell);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return null;
}

function validDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Kode sel: kosong → dilewati; "-", "L", "LIBUR" → OFF; selain itu huruf besar. */
export function normalizeCode(cell: Cell): string | null {
  const value = text(cell).toUpperCase();
  if (!value) return null;
  if (["-", "L", "LIBUR", "OFF", "O"].includes(value)) return "OFF";
  return value;
}

function findHeaderRow(grid: Grid): number {
  const limit = Math.min(grid.length, 15);
  for (let i = 0; i < limit; i++) {
    if ((grid[i] ?? []).some((cell) => NIP_HEADERS.includes(norm(cell)))) return i;
  }
  throw new RosterFileError('Kolom "NIP" tidak ditemukan di 15 baris pertama.');
}

/** Grid sheet → baris roster. `month` (YYYY-MM) dipakai bila header tanggal hanya angka 1–31. */
export function rowsFromGrid(grid: Grid, month: string): RosterFileResult {
  const headerIndex = findHeaderRow(grid);
  const header = grid[headerIndex] ?? [];
  const nipCol = header.findIndex((cell) => NIP_HEADERS.includes(norm(cell)));
  const dateCol = header.findIndex((cell) => DATE_HEADERS.includes(norm(cell)));
  const codeCol = header.findIndex((cell) => CODE_HEADERS.includes(norm(cell)));
  const body = grid.slice(headerIndex + 1);
  const rows: RosterFileRow[] = [];
  const problems: string[] = [];

  if (dateCol >= 0 && codeCol >= 0) {
    body.forEach((line, i) => {
      const nip = text(line[nipCol] ?? null);
      if (!nip) return;
      const date = toIsoDate(line[dateCol] ?? null);
      const code = normalizeCode(line[codeCol] ?? null);
      const at = `Baris ${headerIndex + i + 2}`;
      if (!date || !validDate(date)) problems.push(`${at}: tanggal tidak dikenali.`);
      else if (!code) problems.push(`${at}: kode kosong.`);
      else rows.push({ employeeNumber: nip, date, code });
    });
    return { format: "long", rows, problems };
  }

  const dateColumns: { index: number; date: string }[] = [];
  header.forEach((cell, index) => {
    if (index === nipCol) return;
    const iso = toIsoDate(cell);
    if (iso && validDate(iso)) {
      dateColumns.push({ index, date: iso });
      return;
    }
    const day =
      typeof cell === "number" ? cell : /^\d{1,2}$/.test(text(cell)) ? Number(text(cell)) : NaN;
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      const date = `${month}-${pad(day)}`;
      if (validDate(date)) dateColumns.push({ index, date });
    }
  });
  if (dateColumns.length === 0) {
    throw new RosterFileError(
      'Tidak ada kolom tanggal. Gunakan kolom "NIP, Tanggal, Kode" atau header tanggal per kolom.',
    );
  }
  for (const line of body) {
    const nip = text(line[nipCol] ?? null);
    if (!nip) continue;
    for (const { index, date } of dateColumns) {
      const code = normalizeCode(line[index] ?? null);
      if (code) rows.push({ employeeNumber: nip, date, code });
    }
  }
  return { format: "wide", rows, problems };
}

function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

const MAX_BYTES = 5 * 1024 * 1024;

/** File .xlsx/.csv → grid sheet pertama (library dimuat lazy). */
export async function readRosterFile(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_BYTES) throw new RosterFileError("Ukuran file melebihi 5 MB.");
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const { default: Papa } = await import("papaparse");
    const result = Papa.parse<string[]>(decodeText(await file.arrayBuffer()), {
      skipEmptyLines: true,
    });
    return result.data.map((row) => row.map((cell) => (cell === "" ? null : cell)));
  }
  if (!name.endsWith(".xlsx")) throw new RosterFileError("Gunakan file .xlsx atau .csv.");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  try {
    const sheets = await readXlsxFile(file);
    return (sheets[0]?.data ?? []).map((row) => row.map((cell) => (cell ?? null) as Cell));
  } catch {
    throw new RosterFileError("File Excel tidak bisa dibaca. Pastikan tidak rusak atau terkunci.");
  }
}
