// IMP-D1: Import melengkapi pemegang bagan "ASLI-" (dibuat `org:import-local` dengan NIP sementara)
// supaya file data asli tidak menggandakan karyawan. Pencocokan nama dipakai HANYA sebagai saran di
// Pratinjau; HR selalu mengonfirmasi per baris (D-064: tanpa penggabungan diam-diam).

/** Awalan NIP sementara pemegang bagan dari file nama asli (D-066). */
export const CHART_HOLDER_NUMBER_PREFIX = "ASLI-";

export const isChartHolderNumber = (employeeNumber: string | null | undefined) =>
  Boolean(employeeNumber?.toUpperCase().startsWith(CHART_HOLDER_NUMBER_PREFIX));

/**
 * Gelar akademik/profesi/sapaan umum (tanpa titik, huruf kecil) yang diabaikan saat mencocokkan nama.
 * Nama yang tersimpan tidak diubah.
 */
export const NAME_TITLES: ReadonlySet<string> = new Set([
  // Sarjana/diploma
  "sh",
  "st",
  "se",
  "skom",
  "sked",
  "ssi",
  "spd",
  "spdi",
  "sag",
  "sip",
  "ssos",
  "spsi",
  "sfarm",
  "sgz",
  "sstp",
  "stp",
  "sp",
  "skm",
  "skep",
  "sth",
  "sh",
  "sei",
  "sn",
  "sds",
  "ssn",
  "amd",
  "ama",
  "ap",
  "bsc",
  "ba",
  // Magister/doktor/profesi
  "mm",
  "mh",
  "mt",
  "mkom",
  "msi",
  "mpd",
  "mba",
  "msc",
  "ma",
  "mkes",
  "map",
  "mak",
  "phd",
  "dr",
  "drs",
  "dra",
  "ir",
  "drg",
  "apt",
  "ners",
  "cpa",
  "ak",
  // Sapaan keagamaan
  "h",
  "hj",
]);

/**
 * Kunci nama untuk pencocokan: NFKC, huruf kecil, titik & koma dihapus, gelar dibuang, spasi rapat.
 * Contoh: "Budiman, S.H., M.H." → "budiman"; "Ir. Budi  Santoso" → "budi santoso".
 */
export function chartHolderNameKey(name: string): string {
  return nameTokens(name).join(" ");
}

function nameTokens(name: string): string[] {
  return (
    name
      .normalize("NFKC")
      .toLowerCase()
      .split(/[\s,]+/)
      .map((token) => token.replace(/\./g, ""))
      .filter((token) => token.length > 0)
      // "H."/"Hj." = sapaan haji hanya di depan nama; di belakang ("Budi S.") = inisial nama.
      .filter((token, i) => !NAME_TITLES.has(token) || (LEADING_ONLY.has(token) && i > 0))
  );
}

const LEADING_ONLY: ReadonlySet<string> = new Set(["h", "hj"]);

/**
 * Saran inisial (tetap harus dikonfirmasi HR): nama pemegang bagan yang disingkat ("M. Arif",
 * "Budi S.") cocok dengan nama lengkap di file bila jumlah kata sama, setiap kata satu huruf
 * cocok dengan awal kata pada posisi yang sama, dan kata lainnya sama persis. Minimal satu kata utuh
 * harus sama supaya "A. B." tidak cocok dengan siapa saja.
 */
export function matchesNameInitials(shortName: string, fullName: string): boolean {
  const short = nameTokens(shortName);
  const full = nameTokens(fullName);
  if (short.length === 0 || short.length !== full.length) return false;
  let fullWords = 0;
  for (const [i, token] of short.entries()) {
    const other = full[i] as string;
    if (token.length === 1) {
      if (!other.startsWith(token)) return false;
    } else if (token === other) {
      fullWords += 1;
    } else {
      return false;
    }
  }
  return fullWords > 0 && short.some((t) => t.length === 1);
}

export type ChartHolderMatch = "NAME" | "INITIALS";

/** Jenis kecocokan nama baris file dengan nama pemegang bagan (null = tidak cocok). */
export function chartHolderMatch(rowName: string, holderName: string): ChartHolderMatch | null {
  const key = chartHolderNameKey(rowName);
  if (key.length === 0) return null;
  if (key === chartHolderNameKey(holderName)) return "NAME";
  return matchesNameInitials(holderName, rowName) ? "INITIALS" : null;
}
