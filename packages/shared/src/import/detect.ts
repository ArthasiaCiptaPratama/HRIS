// D-042: deteksi struktur file karyawan "apa adanya" — pilih sheet, cari baris header, sarankan
// pemetaan kolom (sinonim + kemiripan teks + isi kolom) dengan skor keyakinan. Fungsi murni.

import { attachmentFieldOfHeader } from "./attachments.ts";
import { DERIVED_HEADERS, IMPORT_FIELDS, type ImportFieldKey } from "./fields.ts";
import { CERTIFICATIONS, type CertificationKey } from "./groups.ts";
import {
  cleanText,
  formTitle,
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
  /**
   * D-061: baris pertama tiap sel header apa adanya (judul pertanyaan Form tanpa deskripsinya). Header
   * `headers` sudah dirapikan (baris baru → spasi) sehingga judul & deskripsi tidak bisa dipisah lagi.
   */
  titles?: string[];
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
  const firstLine = (cell: GridCell | undefined) =>
    (cleanText(String(cell ?? "").split(/\r?\n|_x000a_/i)[0]) ?? "").trim();
  const titles = headerRow.map((cell, c) => firstLine(cell) || firstLine(above[c]));
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
  return { headerRowIndex, headers, titles, rows, score: headerScore(headerRow) + rows.length };
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

// ── D-059: kolom berkelompok Formulir Data Karyawan ─────────────────────────────────────────

type GroupContext =
  | { kind: "spouse" }
  | { kind: "parent"; who: "father" | "mother" }
  | { kind: "education"; slot: number }
  | { kind: "cert"; key: CertificationKey }
  | { kind: "emergency" }
  | { kind: "emergency2" }
  | null;

const SLOT_ATTR: Record<string, string> = {
  "nama lengkap": "Name",
  "jenis kelamin": "Gender",
  "tempat lahir": "BirthPlace",
  "tanggal lahir": "BirthDate",
  pendidikan: "Education",
  usia: "Age",
  pekerjaan: "Occupation",
  "status hubungan": "Relation",
};
// D-061: rincian alamat Form versi baru — set pertama = domisili, set kedua = KTP (urutan kolom Sheet,
// dikonfirmasi pemilik projek 2026-10-08).
const ADDRESS_ATTR: Record<string, string> = {
  "kelurahan desa": "Village",
  kelurahan: "Village",
  desa: "Village",
  kecamatan: "District",
  "kabupaten kota": "City",
  "kota kabupaten": "City",
  provinsi: "Province",
};
const EMERGENCY_ATTR: Record<string, string> = {
  "nama lengkap": "Name",
  nama: "Name",
  "no hp": "Phone",
  "no telp": "Phone",
  "alamat lengkap": "Address",
  alamat: "Address",
};
const ORDINAL: Record<string, number> = { pertama: 1, kedua: 2, ketiga: 3 };
// normalizeHeader membuang isi kurung di kedua sisi ("… Pertama (POP)" → "… pertama").
const CERT_BY_TEXT = CERTIFICATIONS.map((c) => ({ key: c.key, text: normalizeHeader(c.name) }));

/**
 * Kolom berulang ekspor Sheet Form dikenali dari kolom penandanya: "Nama Istri/Suami" → kolom pasangan
 * berikutnya; "Nama Lengkap Ayah/Ibu" → usia/pendidikan/pekerjaan; "(Anak n)"/"(Saudara Kandung n)" →
 * slot; "Pendidikan Terakhir Pertama…Ketiga" → sekolah & tahun; nama sertifikasi → No. & tahun; kolom
 * "Nama Lengkap" tepat sebelum "Hubungan" → kontak darurat. Header lain menutup kelompok.
 */
function formGroupMapping(titles: readonly GridCell[]): Map<number, ImportFieldKey> {
  const result = new Map<number, ImportFieldKey>();
  // D-061: judul tanpa akhiran kembar Sheet ("Tahun Masuk 2" → "Tahun Masuk").
  const raw = titles.map((h) => formTitle(String(h ?? "").replace(/[ \t]+/g, " ")));
  const norm = raw.map((h) => normalizeHeader(h));
  const hasChildSlots = raw.some((h) => /\(anak\s*1\)/i.test(h));
  const addressSeen = new Map<string, number>();
  let emergencyGroups = 0;
  let ctx: GroupContext = null;
  const set = (column: number, field: string) => result.set(column, field as ImportFieldKey);
  for (let i = 0; i < raw.length; i++) {
    const h = raw[i] as string;
    const n = norm[i] as string;
    if (result.has(i)) continue; // sudah diambil kelompok kontak darurat 2 (lihat bawah)
    const slot = /\((anak|saudara kandung)\s*(\d)\)/i.exec(h);
    const base = normalizeHeader(h.replace(/\(.*\)/, ""));
    if (slot) {
      const attr = SLOT_ATTR[base];
      const prefix = slot[1]?.toLowerCase() === "anak" ? "child" : "sibling";
      if (attr) set(i, `${prefix}${slot[2]}${attr}`);
      ctx = null;
      continue;
    }
    if (/\b(istri|suami)\b/i.test(h) && n.startsWith("nama")) {
      set(i, "spouseName");
      ctx = { kind: "spouse" };
      continue;
    }
    const parent = /^nama lengkap (ayah|ibu)$/.exec(n);
    if (parent) {
      const who = parent[1] === "ayah" ? "father" : "mother";
      set(i, `${who}Name`);
      ctx = { kind: "parent", who };
      continue;
    }
    // "Pendidikan Terakhir Pertama…Ketiga" (Form lama) · "Pendidikan 1 (Terbaru/Tertinggi)" (D-061).
    const edu =
      /^pendidikan terakhir (pertama|kedua|ketiga)$/.exec(n) ?? /^pendidikan ([123])$/.exec(n);
    if (edu) {
      const slotNo = ORDINAL[edu[1] as string] ?? Number(edu[1]);
      set(i, `education${slotNo}Level`);
      ctx = { kind: "education", slot: slotNo };
      continue;
    }
    const cert = CERT_BY_TEXT.find((c) => n === c.text || n === `sertifikasi ${c.text}`);
    if (cert) {
      ctx = { kind: "cert", key: cert.key }; // kolom ini = unggahan file (tautan) → tidak dipetakan
      continue;
    }
    const sim = /^no\.?\s*sim\s+(a|b1|b2|c|c1|c2|d|d1)(\s+umum)?$/i.exec(h);
    if (sim) {
      set(i, `simNumber${(sim[1] as string).toUpperCase()}${sim[2] ? "_UMUM" : ""}`);
      ctx = null;
      continue;
    }
    if (n === "hubungan" && emergencyGroups === 0) {
      emergencyGroups++;
      set(i, "emergencyContactRelationship");
      if (norm[i - 1] === "nama lengkap" && !result.has(i - 1)) set(i - 1, "emergencyContactName");
      ctx = { kind: "emergency" };
      continue;
    }
    // D-061: "Hubungan" kedua = kontak darurat 2. Kolom pertanyaan yang ditambahkan belakangan masuk di
    // ujung Sheet dengan urutan pembuatan (mis. Alamat, No. HP, Hubungan, Nama) → tetangga kiri & kanan
    // yang berjudul atribut kontak diambil, masing-masing sekali.
    if (n === "hubungan" && emergencyGroups === 1) {
      emergencyGroups++;
      set(i, "emergency2Relationship");
      const taken = new Set<string>();
      for (const step of [-1, 1]) {
        for (let j = i + step; j >= 0 && j < raw.length; j += step) {
          const attr = EMERGENCY_ATTR[norm[j] as string];
          if (!attr || taken.has(attr) || result.has(j)) break;
          taken.add(attr);
          set(j, `emergency2${attr}`);
        }
      }
      ctx = null;
      continue;
    }
    const address = ADDRESS_ATTR[n];
    if (address) {
      const seen = (addressSeen.get(address) ?? 0) + 1;
      addressSeen.set(address, seen);
      if (seen <= 2) set(i, `${seen === 1 ? "domicile" : "ktp"}${address}`);
      ctx = null;
      continue;
    }
    // D-061: "Jenis Kelamin 2" lepas dari kelompok = pertanyaan jenis kelamin Anak 1 versi baru
    // (isinya sama dengan "Jenis Kelamin (Anak 1)" pada respons contoh) → digabung ke Anak 1.
    if (
      hasChildSlots &&
      n === "jenis kelamin" &&
      /\s\d{1,2}$/.test(String(titles[i] ?? "").trim())
    ) {
      set(i, "child1Gender");
      ctx = null;
      continue;
    }
    // Atribut di dalam kelompok aktif.
    let field: string | undefined;
    if (ctx?.kind === "spouse") {
      field = {
        pekerjaan: "spouseOccupation",
        "alamat kerja": "spouseWorkAddress",
        "tempat lahir": "spouseBirthPlace",
        "tanggal lahir": "spouseBirthDate",
      }[n];
    } else if (ctx?.kind === "parent") {
      const attr = { usia: "Age", pendidikan: "Education", pekerjaan: "Occupation" }[n];
      if (attr) field = `${ctx.who}${attr}`;
    } else if (ctx?.kind === "education") {
      if (n.startsWith("nama sekolah")) field = `education${ctx.slot}School`;
      else if (n === "tahun masuk") field = `education${ctx.slot}EntryYear`;
      else if (n === "tahun lulus") field = `education${ctx.slot}GraduationYear`;
    } else if (ctx?.kind === "cert") {
      if (n === "no sertifikasi" || n === "nomor sertifikasi") field = `cert${ctx.key}Number`;
      else if (n === "tahun terbit") field = `cert${ctx.key}Year`;
    } else if (ctx?.kind === "emergency") {
      field = {
        "no hp": "emergencyPhone",
        "no telp": "emergencyPhone",
        "alamat lengkap": "emergencyContactAddress",
        alamat: "emergencyContactAddress",
      }[n];
    }
    if (field) set(i, field);
    else ctx = null;
  }
  return result;
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
  // Kolom berkelompok Form (D-059): hanya untuk ekspor Form / file dengan ≥ 2 kolom penanda.
  const titles = detected.titles ?? detected.headers;
  const grouped = formGroupMapping(titles);
  const useGroups = formsExport || new Set(grouped.values()).size >= 2;
  // D-061: pada ekspor Form, pencocokan memakai judul pertanyaan (tanpa deskripsi & akhiran kembar).
  const labelOf = (column: number) => {
    const header = detected.headers[column] ?? "";
    if (!useGroups) return header;
    return formTitle(titles[column] ?? header) || header;
  };
  // Header yang muncul lebih dari sekali (Sheet Form: "Pendidikan" ayah & ibu, "No. HP" karyawan &
  // kontak darurat) kurang meyakinkan → skornya diturunkan supaya kalah dari header unik yang setara;
  // kemunculan pertama tetap terpilih bila tidak ada pesaing (urutan kolom).
  const headerCount = new Map<string, number>();
  for (const [column] of detected.headers.entries()) {
    const h = labelOf(column);
    if (FAMILY_HEADER.test(String(h ?? ""))) continue; // kolom keluarga diabaikan, bukan pesaing
    const key = normalizeHeader(h);
    headerCount.set(key, (headerCount.get(key) ?? 0) + 1);
  }
  const columns = detected.headers.map((fullHeader, column) => {
    const header = labelOf(column);
    const values = detected.rows.map((row) => row.cells[column] ?? null);
    // D-059 (Sheet respons Google Form): kolom berisi tautan (unggahan file di Drive) dan kolom milik
    // anggota keluarga — "Nama Lengkap (Anak 1)", "Pendidikan (Saudara Kandung 2)" — bukan data
    // karyawan; isi kurung dibuang normalizeHeader, jadi dicek dari header asli.
    const linkColumn =
      profile(values).ratio((v) => /^https?:\/\//i.test(String(v ?? "").trim())) >= 0.5;
    const familyColumn = FAMILY_HEADER.test(String(header ?? ""));
    const groupField = useGroups ? grouped.get(column) : undefined;
    if (groupField) {
      return {
        column,
        header,
        derived: false,
        grouped: true,
        combined: { [groupField]: 1 } as Partial<Record<ImportFieldKey, number>>,
      };
    }
    // D-060: kolom tautan berjudul unggahan Form ("Foto Karyawan", "KTP", nama sertifikasi) = lampiran.
    // D-061: pada ekspor Form, judul unggahan tetap lampiran walau hanya sebagian berisi tautan (sel
    // berisi nama file → peringatan per baris, bukan "No. KK" yang error) atau masih kosong — kecuali
    // judulnya persis nama field data ("NPWP", "KTP": kolom nomor yang kosong tetap kolom nomor).
    const content = profile(values);
    const someLink =
      content.ratio((v) =>
        /^https?:\/\/|\.(jpe?g|png|pdf|heic|heif|webp)$/i.test(String(v ?? "").trim()),
      ) > 0;
    // Judul kembar ("NPWP 2") = pertanyaan unggahan setelah pertanyaan nomornya ("NPWP").
    const repeatedTitle = /\s\d{1,2}$/.test(String(titles[column] ?? "").trim());
    const emptyUploadTitle =
      content.count === 0 &&
      (repeatedTitle || !Object.values(headerScores(header)).some((score) => score >= 1));
    const attachmentField =
      linkColumn || (useGroups && (someLink || emptyUploadTitle))
        ? attachmentFieldOfHeader(header)
        : null;
    if (attachmentField) {
      return {
        column,
        header,
        derived: false,
        combined: { [attachmentField]: 1 } as Partial<Record<ImportFieldKey, number>>,
      };
    }
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
    if (KTP_HEADER.test(String(fullHeader ?? ""))) {
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
  const byColumn = new Map<number, { field: ImportFieldKey; score: number }>();
  const usedFields = new Set<ImportFieldKey>();
  // D-061: kolom berkelompok Form dipetakan apa adanya — dua kolom boleh ke field yang sama (pertanyaan
  // versi lama & baru, mis. "No. SIM A" dan "No. SIM A 2"); nilai pertama yang terisi dipakai.
  for (const col of columns) {
    if (!("grouped" in col)) continue;
    const [field] = Object.keys(col.combined) as ImportFieldKey[];
    if (!field) continue;
    byColumn.set(col.column, { field, score: 1 });
    usedFields.add(field);
  }
  for (const col of columns) {
    if (col.derived || "grouped" in col) continue;
    for (const [field, score] of Object.entries(col.combined) as [ImportFieldKey, number][]) {
      if (score >= 0.5) candidates.push({ column: col.column, field, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.column - b.column);
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
      header: detected.headers[col.column] ?? "",
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
      // D-061: field dari dua kolom (Form versi lama & baru) → nilai pertama yang terisi.
      if (field && !isEmpty(cell) && raw[field] === undefined) raw[field] = cell;
    });
    return { sourceRow: row.sourceRow, raw };
  });
}

/**
 * Kunci profil pemetaan per kolom: header ternormalisasi; kemunculan ke-2 dst. header yang sama diberi
 * akhiran "#n" (Sheet Form: "Usia", "Pekerjaan", "Tahun Masuk" muncul berkali-kali, D-059).
 */
export function profileKeys(headers: readonly GridCell[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const key = normalizeHeader(h);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  });
}

/** Tanda tangan susunan header (untuk profil pemetaan): header ternormalisasi, dipisah "|". */
export function headerSignatureSource(headers: readonly string[]): string {
  return headers.map(normalizeHeader).join("|");
}

/**
 * Terapkan profil pemetaan tersimpan (kunci per kemunculan, `profileKeys`). D-060: profil yang dibuat
 * sebelum ada field lampiran (tidak memuat satu pun `attach*`) menandai kolom tautan Drive "diabaikan";
 * kolom yang kini dikenali sebagai lampiran memakai saran baru, bukan null dari profil lama.
 * D-061: kolom yang isinya tautan Drive juga mengalahkan field data dari profil.
 */
export function applySavedMapping(
  headers: readonly GridCell[],
  saved: Record<string, ImportFieldKey | null>,
  suggested: (ImportFieldKey | null)[],
): (ImportFieldKey | null)[] {
  const knowsAttachments = Object.values(saved).some((field) => field?.startsWith("attach"));
  return profileKeys(headers).map((key, i) => {
    const suggestion = suggested[i] ?? null;
    if (!(key in saved)) return suggestion;
    const field = saved[key] ?? null;
    if (field === null && !knowsAttachments && suggestion?.startsWith("attach")) return suggestion;
    // D-061: kolom yang kini berisi tautan Drive tidak dipaksa ke field data dari profil (profil disimpan
    // saat kolom unggahan masih kosong, mis. "Kartu Keluarga" → No. KK). "Abaikan" (null) tetap dihormati.
    if (field !== null && !field.startsWith("attach") && suggestion?.startsWith("attach"))
      return suggestion;
    return field;
  });
}
