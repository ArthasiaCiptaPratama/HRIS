// D-064: pencocokan nilai kolom Departemen/Divisi (isian bebas Form) ke unit organisasi. Fungsi murni:
// server memakai untuk saran & pencocokan persis, web untuk label. Tidak ada pencocokan fuzzy diam-diam —
// kemiripan hanya menjadi SARAN yang dikonfirmasi HR.

import type { OrgUnitType } from "../organization.ts";

/** Kunci nilai: huruf kecil, hanya huruf & angka ("HR & GA", "HRGA", "hr-ga" → "hrga"). */
export function unitKey(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Kunci tanpa keterangan dalam kurung ("Engineering (ACP)" → "engineering"). */
export function looseUnitKey(value: string): string {
  return unitKey(value.replace(/\([^)]*\)/g, " "));
}

const STOP_WORDS = new Set(["dan", "and", "of", "the"]);

/** Singkatan dari huruf awal kata ("Human Resources & General Affair" → "hrga"). */
export function unitInitials(value: string): string {
  return value
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()))
    .map((w) => w[0]?.toLowerCase() ?? "")
    .join("");
}

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    prev = row;
  }
  return prev[b.length] ?? limit + 1;
}

/** Batas salah ketik menurut panjang: pendek (≤ 4) harus persis supaya "HR" tidak dikira "IR". */
function typoLimit(length: number): number {
  if (length <= 4) return 0;
  return length <= 8 ? 1 : 2;
}

export type UnitSimilarity = "SAME_NAME" | "SPELLING" | "ABBREVIATION" | "CONTAINS";

/**
 * Seberapa mirip nilai file dengan nama unit: SAME_NAME (beda keterangan kurung saja), SPELLING (salah
 * ketik), ABBREVIATION (singkatan huruf awal), CONTAINS (awalan sama, ≥ 4 huruf). null = tidak mirip.
 */
export function unitSimilarity(value: string, name: string): UnitSimilarity | null {
  const a = looseUnitKey(value);
  const b = looseUnitKey(name);
  if (!a || !b) return null;
  if (a === b) return unitKey(value) === unitKey(name) ? null : "SAME_NAME";
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return "CONTAINS";
  const limit = typoLimit(Math.min(a.length, b.length));
  if (limit > 0 && editDistance(a, b, limit) <= limit) return "SPELLING";
  const ia = unitInitials(value);
  const ib = unitInitials(name);
  if ((ib.length >= 2 && a === ib) || (ia.length >= 2 && b === ia)) return "ABBREVIATION";
  return null;
}

export const UNIT_SIMILARITY_LABELS: Record<UnitSimilarity, string> = {
  SAME_NAME: "nama sama",
  SPELLING: "ejaan mirip",
  ABBREVIATION: "singkatan",
  CONTAINS: "awalan sama",
};

/** Urutan jenjang (kecil = tinggi). Unit baru di bawah induk memakai jenjang berikutnya. */
export const ORG_UNIT_RANK: Record<OrgUnitType, number> = {
  DIRECTORATE: 0,
  DIVISION: 1,
  DEPARTMENT: 2,
  SECTION: 3,
};

export function childUnitType(parent: OrgUnitType): OrgUnitType {
  if (parent === "DIRECTORATE") return "DIVISION";
  if (parent === "DIVISION") return "DEPARTMENT";
  return "SECTION";
}
