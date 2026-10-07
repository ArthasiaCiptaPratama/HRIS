// D-042: normalisasi nilai sel file kantor → nilai bertipe. Fungsi murni (tanpa I/O), dipakai
// web (pratinjau) dan api (sumber kebenaran). Hasil `undefined` = sel kosong; `{ issue }` = tidak valid.

import type { EducationLevel, EmploymentCategory, Gender, PtkpStatus } from "../employee.ts";
import {
  type DrivingLicenseType,
  parseBloodType,
  parseDrivingLicenseTypes,
} from "../personal-fields.ts";

export type Normalized<T> = { value: T } | { issue: string } | undefined;

const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  peb: 2,
  pebruari: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  agt: 8,
  agustus: 8,
  aug: 8,
  august: 8,
  ags: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oct: 10,
  oktober: 10,
  october: 10,
  nov: 11,
  nop: 11,
  november: 11,
  nopember: 11,
  des: 12,
  dec: 12,
  desember: 12,
  december: 12,
};

/** Header → bentuk pembanding: huruf kecil, tanpa isi kurung, tanpa tanda baca, spasi tunggal. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Teks umum: trim + spasi tunggal; kosong → undefined. */
export function cleanText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text === "" || text === "-" || text === "—" ? undefined : text;
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoOf(year: number, month: number, day: number): string | null {
  if (year < 100) year += year >= 50 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Tanggal dari berbagai bentuk: Date, ISO, serial Excel (1900 system), `dd/mm/yyyy`, `dd-mm-yyyy`,
 * `dd.mm.yyyy`, `yyyy-mm-dd`, `24 Februari 2024`, `24-Feb-24`. Hasil `YYYY-MM-DD` (tanggal murni).
 */
export function parseDate(value: unknown): Normalized<string> {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { issue: "INVALID_DATE" };
    return {
      value: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`,
    };
  }
  if (typeof value === "number") {
    // Serial Excel: hari sejak 1899-12-30. Rentang wajar 1940–2100.
    if (value < 14611 || value > 73051) return { issue: "INVALID_DATE" };
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return parseDate(date);
  }
  const text = String(value).trim().toLowerCase();
  if (text === "" || text === "-") return undefined;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s].*)?$/);
  if (match) {
    const iso = isoOf(Number(match[1]), Number(match[2]), Number(match[3]));
    return iso ? { value: iso } : { issue: "INVALID_DATE" };
  }
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) {
    const iso = isoOf(Number(match[3]), Number(match[2]), Number(match[1]));
    return iso ? { value: iso } : { issue: "INVALID_DATE" };
  }
  match = text.match(/^(\d{1,2})[\s.-]+([a-z]+)[\s.,-]+(\d{2,4})$/);
  if (match) {
    const month = MONTHS[match[2] as string];
    const iso = month ? isoOf(Number(match[3]), month, Number(match[1])) : null;
    return iso ? { value: iso } : { issue: "INVALID_DATE" };
  }
  return { issue: "INVALID_DATE" };
}

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

/** Angka dari Excel bisa datang sebagai number (hilang nol depan tidak bisa dipulihkan). */
function numericText(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? value.toFixed(0) : String(value);
  return String(value ?? "");
}

/** NIK KTP / No. KK: tepat 16 digit. */
export function parseNik16(value: unknown): Normalized<string> {
  const text = cleanText(numericText(value));
  if (!text) return undefined;
  const d = digits(text);
  return d.length === 16 ? { value: d } : { issue: "INVALID_LENGTH_16" };
}

/** NPWP: 15 digit (format lama) atau 16 digit (NIK), disimpan hanya digit. */
export function parseNpwp(value: unknown): Normalized<string> {
  const text = cleanText(numericText(value));
  if (!text) return undefined;
  const d = digits(text);
  return d.length === 15 || d.length === 16 ? { value: d } : { issue: "INVALID_NPWP" };
}

/** BPJS dari teks bebas: ambil deret digit terpanjang (≥ 8). Teks tanpa nomor → peringatan. */
export function parseBpjs(value: unknown): Normalized<string> {
  const text = cleanText(numericText(value));
  if (!text) return undefined;
  const runs = text.match(/\d[\d\s.-]*\d|\d/g) ?? [];
  const best = runs.map(digits).sort((a, b) => b.length - a.length)[0] ?? "";
  if (best.length < 8 || best.length > 20) return { issue: "BPJS_NOT_A_NUMBER" };
  return { value: best };
}

/** Telepon Indonesia → `08…` 10–14 digit. */
export function parsePhone(value: unknown): Normalized<string> {
  const text = cleanText(numericText(value));
  if (!text) return undefined;
  let d = digits(text);
  if (d.startsWith("62")) d = `0${d.slice(2)}`;
  else if (d.startsWith("8")) d = `0${d}`;
  return /^08\d{8,12}$/.test(d) ? { value: d } : { issue: "INVALID_PHONE" };
}

export function parseEmail(value: unknown): Normalized<string> {
  const text = cleanText(value)?.toLowerCase();
  if (!text) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 254
    ? { value: text }
    : { issue: "INVALID_EMAIL" };
}

export function parseGender(value: unknown): Normalized<Gender> {
  const key = normalizeHeader(value).replace(/\s/g, "");
  if (!key) return undefined;
  if (["l", "lk", "laki", "lakilaki", "pria", "male", "m"].includes(key)) return { value: "MALE" };
  if (["p", "pr", "perempuan", "wanita", "female", "f"].includes(key)) return { value: "FEMALE" };
  return { issue: "UNKNOWN_GENDER" };
}

export type ImportReligion =
  | "ISLAM"
  | "PROTESTANT"
  | "CATHOLIC"
  | "HINDU"
  | "BUDDHIST"
  | "CONFUCIAN"
  | "OTHER";

export function parseReligion(value: unknown): Normalized<ImportReligion> {
  const key = normalizeHeader(value).replace(/\s/g, "");
  if (!key) return undefined;
  if (key === "islam" || key === "moslem" || key === "muslim") return { value: "ISLAM" };
  if (["kristen", "protestan", "kristenprotestan", "christian", "protestant"].includes(key))
    return { value: "PROTESTANT" };
  if (["katolik", "katholik", "kristenkatolik", "catholic"].includes(key))
    return { value: "CATHOLIC" };
  if (key === "hindu") return { value: "HINDU" };
  if (["buddha", "budha", "buddhist", "budhis"].includes(key)) return { value: "BUDDHIST" };
  if (["konghucu", "khonghucu", "konghuchu", "confucian"].includes(key))
    return { value: "CONFUCIAN" };
  if (["lainnya", "lain", "other", "kepercayaan"].includes(key)) return { value: "OTHER" };
  return { issue: "UNKNOWN_RELIGION" };
}

export type ImportMaritalStatus = "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED";

export function parseMaritalStatus(value: unknown): Normalized<ImportMaritalStatus> {
  const key = normalizeHeader(value).replace(/\s/g, "");
  if (!key) return undefined;
  if (["belummenikah", "belumkawin", "lajang", "single", "tk", "tidakkawin"].includes(key))
    return { value: "SINGLE" };
  // "Sudah Menikah" = pilihan Google Form Formulir Data Karyawan (D-059).
  if (["menikah", "sudahmenikah", "kawin", "sudahkawin", "married", "k"].includes(key))
    return { value: "MARRIED" };
  if (["cerai", "ceraihidup", "divorced"].includes(key)) return { value: "DIVORCED" };
  if (["ceraimati", "janda", "duda", "widowed"].includes(key)) return { value: "WIDOWED" };
  return { issue: "UNKNOWN_MARITAL_STATUS" };
}

/** PTKP `TK/0`–`TK/3`, `K/0`–`K/3` (juga `K/I/1` → K1, spasi/titik bebas). */
export function parsePtkp(value: unknown): Normalized<PtkpStatus> {
  const text = cleanText(value)?.toUpperCase().replace(/\s/g, "");
  if (!text) return undefined;
  const match = text.match(/^(TK|K)(?:\/I)?[/.-]?([0-3])$/);
  if (!match) return { issue: "UNKNOWN_PTKP" };
  return { value: `${match[1]}${match[2]}` as PtkpStatus };
}

/** Status nikah turunan dari PTKP (dipakai bila kolom status nikah kosong). */
export const maritalFromPtkp = (ptkp: PtkpStatus): ImportMaritalStatus =>
  ptkp.startsWith("K") ? "MARRIED" : "SINGLE";

const EDUCATION_PREFIX: [RegExp, EducationLevel][] = [
  [/^s\s*3\b|^doktor/i, "S3"],
  [/^s\s*2\b|^magister|^master/i, "S2"],
  [/^s\s*1\b|^sarjana|^bachelor/i, "S1"],
  [/^d\s*4\b/i, "D4"],
  [/^d\s*3\b/i, "D3"],
  [/^d\s*2\b/i, "D2"],
  [/^d\s*1\b/i, "D1"],
  [/^(sma|smk|slta|stm|smea|ma|man|sma\s*n|smk\s*n)\b/i, "SMA"],
  [/^(smp|sltp|mts)\b/i, "SMP"],
  [/^(sd|mi)\b/i, "SD"],
];

/** "SMA N 3 Bau-Bau" → { level: SMA, schoolName: "SMA N 3 Bau-Bau" }; "S1" → { level: S1 }. */
export function parseEducation(value: unknown): Normalized<{
  level: EducationLevel;
  schoolName: string | null;
}> {
  const text = cleanText(value);
  if (!text) return undefined;
  for (const [pattern, level] of EDUCATION_PREFIX) {
    if (pattern.test(text)) {
      const onlyLevel = /^[a-z]{1,4}\s*\d?$/i.test(text.trim());
      return { value: { level, schoolName: onlyLevel ? null : text } };
    }
  }
  return { value: { level: "OTHER", schoolName: text } };
}

export interface StatusInfo {
  category: EmploymentCategory;
  /** PKWT ke-n (I/II/III/ke 3). */
  contractSequence?: number;
  /** Durasi kontrak/percobaan dalam bulan. */
  durationMonths?: number;
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

/** "PKWT II - 6 Bulan", "Probation  3 Bulan", "Permanent", "Outsourcing" → kategori + rincian. */
export function parseEmploymentStatus(value: unknown): Normalized<StatusInfo> {
  const text = cleanText(value)?.toLowerCase();
  if (!text) return undefined;
  const months = (() => {
    const m = text.match(/(\d+)\s*(bulan|bln|month)/);
    if (m) return Number(m[1]);
    const y = text.match(/(\d+)\s*(tahun|thn|year)/);
    return y ? Number(y[1]) * 12 : undefined;
  })();
  const withDuration = (info: StatusInfo): Normalized<StatusInfo> => ({
    value: months ? { ...info, durationMonths: months } : info,
  });
  if (/pkwtt|permanen|permanent|tetap/.test(text)) return { value: { category: "PERMANENT" } };
  if (/probation|percobaan/.test(text)) return withDuration({ category: "PROBATION" });
  if (/pkwt|kontrak|contract/.test(text)) {
    const seq =
      text.match(/pkwt\s+(i{1,3}|iv|v)\b/)?.[1] ??
      text.match(/ke\s*-?\s*(\d)/)?.[1] ??
      text.match(/pkwt\s*(\d)\b/)?.[1];
    const contractSequence = seq ? (ROMAN[seq] ?? Number(seq)) : undefined;
    return withDuration(
      contractSequence ? { category: "PKWT", contractSequence } : { category: "PKWT" },
    );
  }
  if (/harian|daily|freelance|lepas/.test(text)) return { value: { category: "DAILY_WORKER" } };
  if (/magang|intern|pkl|trainee/.test(text)) return withDuration({ category: "INTERNSHIP" });
  if (/outsourc|alih daya/.test(text)) return { value: { category: "OUTSOURCING" } };
  if (/vendor|mitra/.test(text)) return { value: { category: "VENDOR" } };
  return { issue: "UNKNOWN_EMPLOYMENT_STATUS" };
}

/** Kolom "Keterangan": RESIGN / keluar / PHK → karyawan nonaktif. Selain itu diabaikan. */
export function parseExitMarker(
  value: unknown,
): Normalized<"RESIGNATION" | "TERMINATION" | "OTHER"> {
  const text = cleanText(value)?.toLowerCase();
  if (!text) return undefined;
  if (/resign|mengundurkan/.test(text)) return { value: "RESIGNATION" };
  if (/phk|pemutusan|terminat/.test(text)) return { value: "TERMINATION" };
  if (/keluar|nonaktif|tidak aktif|berhenti/.test(text)) return { value: "OTHER" };
  return undefined;
}

/** Kode perusahaan: huruf/angka besar, 2–10 karakter. */
export function parseCompanyCode(value: unknown): Normalized<string> {
  const text = cleanText(value)?.toUpperCase().replace(/\s/g, "");
  if (!text) return undefined;
  return /^[A-Z0-9]{2,10}$/.test(text) ? { value: text } : { issue: "INVALID_COMPANY_CODE" };
}

/** Nomor induk karyawan: huruf/angka/titik/garis miring/tanda hubung, ≤ 30. */
export function parseEmployeeNumber(value: unknown): Normalized<string> {
  const text = cleanText(numericText(value))?.toUpperCase();
  if (!text) return undefined;
  return /^[A-Z0-9./-]{1,30}$/.test(text) ? { value: text } : { issue: "INVALID_EMPLOYEE_NUMBER" };
}

/** Nomor rekening: 6–20 digit. */
export function parseAccountNumber(value: unknown): Normalized<string> {
  const text = cleanText(numericText(value));
  if (!text) return undefined;
  const d = digits(text);
  return d.length >= 6 && d.length <= 20 ? { value: d } : { issue: "INVALID_ACCOUNT_NUMBER" };
}

/** Teks dengan batas panjang (nama, jabatan, alamat, …). */
export function parseText(value: unknown, max: number): Normalized<string> {
  const text = cleanText(numericText(value));
  if (!text) return undefined;
  return text.length <= max ? { value: text } : { issue: "TOO_LONG" };
}

// D-059: field Formulir Data Karyawan (Sheet respons Google Form → Import); parser di `personal-fields.ts`.
const EMPTY_LIKE =
  /^(-+|–|—|\.|tidak (ada|tahu|punya)|belum (ada|punya)|n\/?a|none|kosong|nihil)$/i;

export function parseBloodTypeCell(value: unknown): Normalized<string> {
  const text = cleanText(value);
  if (!text || EMPTY_LIKE.test(text)) return undefined;
  const parsed = parseBloodType(text);
  return parsed ? { value: parsed } : { issue: "UNKNOWN_BLOOD_TYPE" };
}

/** Jenis SIM jamak; sebagian tidak dikenali → nilai yang dikenali + peringatan. */
export function parseDrivingLicenseCell(
  value: unknown,
): { types: DrivingLicenseType[]; unknown: boolean } | undefined {
  const text = cleanText(value);
  if (!text || EMPTY_LIKE.test(text)) return undefined;
  const { types, unknown } = parseDrivingLicenseTypes(text);
  return { types, unknown: unknown.length > 0 };
}

export function parseNationality(value: unknown): Normalized<string> {
  const text = cleanText(value);
  if (!text || EMPTY_LIKE.test(text)) return undefined;
  if (text.length > 50) return { issue: "TOO_LONG" };
  return { value: /^(wni|indonesia|warga negara indonesia)$/i.test(text) ? "Indonesia" : text };
}

/** Teks pendek opsional dengan isian kosong-semacam ("-", "tidak ada") dianggap kosong. */
export function parseOptionalText(value: unknown, max: number): Normalized<string> {
  const text = cleanText(value);
  if (!text || EMPTY_LIKE.test(text)) return undefined;
  return parseText(text, max);
}
