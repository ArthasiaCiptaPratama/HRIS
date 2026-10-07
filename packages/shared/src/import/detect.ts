// D-042: deteksi struktur file karyawan "apa adanya" — pilih sheet, cari baris header, sarankan
// pemetaan kolom (sinonim + kemiripan teks + isi kolom) dengan skor keyakinan. Fungsi murni.

import { DERIVED_HEADERS, IMPORT_FIELDS, type ImportFieldKey } from "./fields.ts";
import {
  cleanText,
  normalizeHeader,
  parseDate,
  parseEmail,
  parseEmploymentStatus,
  parseGender,
  parsePhone,
  parsePtkp,
  parseReligion,
} from "./normalize.ts";

export type GridCell = string | number | boolean | Date | null;
export type Grid = GridCell[][];

export interface DataRow {
  /** Nomor baris di file asli (1-based), untuk laporan & unduh baris gagal. */
  sourceRow: number;
  cells: GridCell[];
}

export interface DetectedSheet {
  headerRowIndex: number;
  headers: string[];
  rows: DataRow[];
  score: number;
}

export interface ColumnSuggestion {
  column: number;
  letter: string;
  header: string;
  field: ImportFieldKey | null;
  /** 0–1. ≥ 0,85 tinggi · ≥ 0,6 sedang · < 0,6 rendah. */
  confidence: number;
  /** Kolom turunan (NO, usia, lama kerja, …): diabaikan, dihitung sistem. */
  derived: boolean;
}

const isEmpty = (cell: GridCell) =>
  cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");

export function columnLetter(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Buang kolom & baris kosong di ujung (file kantor tercatat 1.220 kolom, 37 berisi). */
export function trimGrid(grid: Grid): Grid {
  let lastCol = -1;
  let lastRow = -1;
  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!isEmpty(cell)) {
        if (c > lastCol) lastCol = c;
        lastRow = r;
      }
    });
  });
  return grid.slice(0, lastRow + 1).map((row) => {
    const cells = row.slice(0, lastCol + 1);
    while (cells.length < lastCol + 1) cells.push(null);
    return cells;
  });
}

const SYNONYMS = (() => {
  const map = new Map<string, ImportFieldKey[]>();
  for (const [key, def] of Object.entries(IMPORT_FIELDS) as [
    ImportFieldKey,
    { synonyms: readonly string[] },
  ][]) {
    for (const synonym of def.synonyms) map.set(synonym, [...(map.get(synonym) ?? []), key]);
  }
  return map;
})();
const DERIVED = new Set(DERIVED_HEADERS);

function looksLikeHeader(cell: GridCell): boolean {
  const text = normalizeHeader(cell);
  return text !== "" && (SYNONYMS.has(text) || DERIVED.has(text));
}

/** Skor baris sebagai header: banyak sel cocok kamus + banyak teks pendek, sedikit angka/tanggal. */
function headerScore(row: GridCell[]): number {
  let score = 0;
  for (const cell of row) {
    if (isEmpty(cell)) continue;
    if (typeof cell === "number" || cell instanceof Date) score -= 1;
    else if (typeof cell === "string" && /^=/.test(cell)) score -= 1;
    else if (looksLikeHeader(cell)) score += 3;
    else if (typeof cell === "string" && cell.length <= 60) score += 0.5;
  }
  return score;
}

export function findHeaderRow(grid: Grid, scanRows = 30): number {
  let best = -1;
  let bestScore = 2; // minimal dua kolom dikenali
  for (let r = 0; r < Math.min(scanRows, grid.length); r++) {
    const score = headerScore(grid[r] ?? []);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Struktur satu sheet: header (dengan cadangan sel di atasnya bila kosong, untuk header 2 baris)
 * dan baris data (baris yang punya ≥ 2 sel berisi di kolom non-turunan).
 */
export function detectSheet(input: Grid): DetectedSheet | null {
  const grid = trimGrid(input);
  const headerRowIndex = findHeaderRow(grid);
  if (headerRowIndex < 0) return null;
  const headerRow = grid[headerRowIndex] ?? [];
  const above = grid[headerRowIndex - 1] ?? [];
  const headers = headerRow.map((cell, c) => {
    const own = cleanText(cell) ?? "";
    const upper = cleanText(above[c]) ?? "";
    return own || upper;
  });
  const derivedCols = new Set(
    headers.map((h, c) => (DERIVED.has(normalizeHeader(h)) ? c : -1)).filter((c) => c >= 0),
  );
  const rows: DataRow[] = [];
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    const filled = cells.filter((cell, c) => !derivedCols.has(c) && !isEmpty(cell)).length;
    const first = normalizeHeader(cells.find((cell) => !isEmpty(cell)));
    if (filled < 2 || /^(total|jumlah|grand total|control)\b/.test(first)) continue;
    rows.push({ sourceRow: r + 1, cells });
  }
  return { headerRowIndex, headers, rows, score: headerScore(headerRow) + rows.length };
}

/** Pilih sheet terbaik dari workbook (skor header + jumlah baris data). */
export function pickSheet<T extends { name: string; grid: Grid }>(
  sheets: T[],
): { sheet: T; detected: DetectedSheet } | null {
  let best: { sheet: T; detected: DetectedSheet } | null = null;
  for (const sheet of sheets) {
    const detected = detectSheet(sheet.grid);
    if (detected && (!best || detected.score > best.detected.score)) best = { sheet, detected };
  }
  return best;
}

// ── Kemiripan teks (Dice bigram) ─────────────────────────────────────────────

function bigrams(text: string): string[] {
  const s = ` ${text} `;
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  const x = bigrams(a);
  const y = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of y) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of x) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

// ── Pengklasifikasi isi kolom ────────────────────────────────────────────────

const BANKS =
  /^(bank\s+)?(mandiri|bri|bni|bca|btn|cimb( niaga)?|danamon|permata|bsi|ocbc|maybank|panin|mega|bjb|btpn|jago|muamalat|sinarmas|kalteng|bpd .+)$/i;

interface ContentProfile {
  count: number;
  ratio: (test: (v: GridCell) => boolean) => number;
  distinct: number;
}

function profile(values: GridCell[]): ContentProfile {
  const sample = values.filter((v) => !isEmpty(v)).slice(0, 50);
  return {
    count: sample.length,
    distinct: new Set(sample.map((v) => String(v))).size,
    ratio: (test) => (sample.length === 0 ? 0 : sample.filter(test).length / sample.length),
  };
}

const ok = (result: unknown) =>
  result !== undefined && !(typeof result === "object" && result !== null && "issue" in result);
const digitsOf = (v: GridCell) => String(v ?? "").replace(/\D/g, "");

/** Skor isi kolom untuk tiap field yang punya pola khas (0–1). */
function contentScores(p: ContentProfile): Partial<Record<ImportFieldKey, number>> {
  if (p.count === 0) return {};
  const nik16 = p.ratio((v) => digitsOf(v).length === 16 && !/[a-z]/i.test(String(v)));
  const empNo = p.ratio(
    (v) =>
      typeof v === "string" && /^[A-Za-z0-9]+([./-][A-Za-z0-9]+)+$/.test(v.trim()) && /\d/.test(v),
  );
  const unique = p.distinct / p.count;
  return {
    ktpNumber: nik16,
    kkNumber: nik16 * 0.6,
    employeeNumber: empNo * unique,
    joinDate: p.ratio((v) => ok(parseDate(v))),
    birthDate: p.ratio((v) => ok(parseDate(v))),
    exitDate: p.ratio((v) => ok(parseDate(v))),
    ptkpStatus: p.ratio((v) => ok(parsePtkp(v))),
    phoneNumber: p.ratio((v) => ok(parsePhone(v))),
    emergencyPhone: p.ratio((v) => ok(parsePhone(v))),
    workEmail: p.ratio((v) => ok(parseEmail(v))),
    gender: p.ratio((v) => ok(parseGender(v))),
    religion: p.ratio((v) => ok(parseReligion(v))),
    bankName: p.ratio((v) => typeof v === "string" && BANKS.test(v.trim())),
    employmentStatusText: p.ratio((v) => typeof v === "string" && ok(parseEmploymentStatus(v))),
    companyCode:
      p.ratio((v) => typeof v === "string" && /^[A-Z]{2,5}$/.test(v.trim())) *
      (p.distinct <= 10 ? 1 : 0.3),
  };
}

const KTP_HEADER = /nomor induk kependudukan/i;
const FORMS_TIMESTAMP = new Set(["stempel waktu", "timestamp", "cap waktu"]);
const FORMS_ACCOUNT_EMAIL = new Set(["alamat email", "email address"]);

// Kolom milik anggota keluarga: "(Anak 1)", "(Saudara Kandung 2)", "Nama Istri/Suami", "Nama Lengkap Ayah".
const FAMILY_HEADER = /\b(anak|saudara|suami|istri|pasangan|ayah|ibu|orang tua)\b/i;

// Field yang punya pola isi: isi yang jelas-jelas tidak cocok menurunkan skor header.
const CONTENT_TYPED = new Set<ImportFieldKey>([
  "ktpNumber",
  "joinDate",
  "birthDate",
  "exitDate",
  "ptkpStatus",
  "workEmail",
  "gender",
  "religion",
]);

function headerScores(header: string): Partial<Record<ImportFieldKey, number>> {
  const text = normalizeHeader(header);
  const scores: Partial<Record<ImportFieldKey, number>> = {};
  if (!text) return scores;
  const bump = (key: ImportFieldKey, score: number) => {
    if (score > (scores[key] ?? 0)) scores[key] = score;
  };
  for (const [synonym, keys] of SYNONYMS) {
    let score = 0;
    if (text === synonym) score = 1;
    else if (synonym.length >= 4 && ` ${text} `.includes(` ${synonym} `)) score = 0.8;
    else {
      const d = dice(text, synonym);
      if (d >= 0.75) score = 0.7 * d;
    }
    for (const key of keys) bump(key, score);
  }
  return scores;
}

/**
 * Saran pemetaan kolom → field, satu-ke-satu (serakah dari skor tertinggi). Kolom turunan ditandai.
 * Kasus khusus file kantor: header "NIK" berisi nomor induk (bukan 16 digit) → employeeNumber;
 * header "STATUS" berisi TK/0…K/3 → ptkpStatus.
 */
export function suggestMapping(detected: DetectedSheet): ColumnSuggestion[] {
  // Ekspor Sheet respons Google Form: kolom pertama "Stempel waktu"/"Timestamp"; kolom otomatis
  // "Alamat email" = akun Google pengisi, bukan email kantor → diabaikan.
  const formsExport = FORMS_TIMESTAMP.has(normalizeHeader(detected.headers[0]));
  // Header yang muncul lebih dari sekali (Sheet Form: "Pendidikan" ayah & ibu, "No. HP" karyawan &
  // kontak darurat) kurang meyakinkan → skornya diturunkan supaya kalah dari header unik yang setara;
  // kemunculan pertama tetap terpilih bila tidak ada pesaing (urutan kolom).
  const headerCount = new Map<string, number>();
  for (const h of detected.headers) {
    if (FAMILY_HEADER.test(String(h ?? ""))) continue; // kolom keluarga diabaikan, bukan pesaing
    const key = normalizeHeader(h);
    headerCount.set(key, (headerCount.get(key) ?? 0) + 1);
  }
  const columns = detected.headers.map((header, column) => {
    const values = detected.rows.map((row) => row.cells[column] ?? null);
    // D-059 (Sheet respons Google Form): kolom berisi tautan (unggahan file di Drive) dan kolom milik
    // anggota keluarga — "Nama Lengkap (Anak 1)", "Pendidikan (Saudara Kandung 2)" — bukan data
    // karyawan; isi kurung dibuang normalizeHeader, jadi dicek dari header asli.
    const linkColumn =
      profile(values).ratio((v) => /^https?:\/\//i.test(String(v ?? "").trim())) >= 0.5;
    const familyColumn = FAMILY_HEADER.test(String(header ?? ""));
    const formsAccountColumn = formsExport && FORMS_ACCOUNT_EMAIL.has(normalizeHeader(header));
    if (linkColumn || familyColumn || formsAccountColumn) {
      return {
        column,
        header,
        derived: false,
        combined: {} as Partial<Record<ImportFieldKey, number>>,
      };
    }
    const derived = DERIVED.has(normalizeHeader(header));
    const byHeader = headerScores(header);
    const byContent = contentScores(profile(values));
    const combined: Partial<Record<ImportFieldKey, number>> = {};
    const keys = new Set([
      ...Object.keys(byHeader),
      ...Object.keys(byContent),
    ]) as Set<ImportFieldKey>;
    for (const key of keys) {
      const h = byHeader[key] ?? 0;
      const c = byContent[key] ?? 0;
      let score = h;
      if (h > 0 && c >= 0.8) score = Math.min(1, h + 0.15);
      if (h > 0 && CONTENT_TYPED.has(key) && profile(values).count >= 3 && c < 0.3) score = h - 0.5;
      if (h === 0 && c >= 0.9 && ["ktpNumber", "workEmail", "ptkpStatus"].includes(key))
        score = 0.6;
      combined[key] = score;
    }
    // NIK ambigu: isi 16 digit = NIK KTP, selain itu nomor induk karyawan.
    if ((byHeader.employeeNumber ?? 0) >= 0.8 && (byContent.ktpNumber ?? 0) >= 0.6) {
      combined.ktpNumber = 1;
      combined.employeeNumber = 0;
    }
    // Header menyebut kependudukan/KTP secara eksplisit (mis. "NIK (Nomor Induk Kependudukan)") = NIK KTP
    // walau isinya belum berformat (isi salah tetap ditandai saat pratinjau).
    if (KTP_HEADER.test(String(header ?? ""))) {
      combined.ktpNumber = 1;
      combined.employeeNumber = 0;
    }
    if ((headerCount.get(normalizeHeader(header)) ?? 0) > 1) {
      for (const key of Object.keys(combined) as ImportFieldKey[]) {
        combined[key] = (combined[key] ?? 0) - 0.25;
      }
    }
    return { column, header, derived, combined };
  });

  const candidates: { column: number; field: ImportFieldKey; score: number }[] = [];
  for (const col of columns) {
    if (col.derived) continue;
    for (const [field, score] of Object.entries(col.combined) as [ImportFieldKey, number][]) {
      if (score >= 0.5) candidates.push({ column: col.column, field, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.column - b.column);
  const byColumn = new Map<number, { field: ImportFieldKey; score: number }>();
  const usedFields = new Set<ImportFieldKey>();
  for (const cand of candidates) {
    if (byColumn.has(cand.column) || usedFields.has(cand.field)) continue;
    byColumn.set(cand.column, { field: cand.field, score: cand.score });
    usedFields.add(cand.field);
  }
  return columns.map((col) => {
    const chosen = byColumn.get(col.column);
    return {
      column: col.column,
      letter: columnLetter(col.column),
      header: col.header,
      field: chosen?.field ?? null,
      confidence: chosen ? Math.round(chosen.score * 100) / 100 : 0,
      derived: col.derived,
    };
  });
}

/** Baris data → baris mentah per field sesuai pemetaan (kolom tanpa field diabaikan). */
export function buildRawRows(
  rows: DataRow[],
  mapping: readonly (ImportFieldKey | null)[],
): { sourceRow: number; raw: Partial<Record<ImportFieldKey, GridCell>> }[] {
  return rows.map((row) => {
    const raw: Partial<Record<ImportFieldKey, GridCell>> = {};
    mapping.forEach((field, column) => {
      const cell = row.cells[column] ?? null;
      if (field && !isEmpty(cell)) raw[field] = cell;
    });
    return { sourceRow: row.sourceRow, raw };
  });
}

/** Tanda tangan susunan header (untuk profil pemetaan): header ternormalisasi, dipisah "|". */
export function headerSignatureSource(headers: readonly string[]): string {
  return headers.map(normalizeHeader).join("|");
}
