import { z } from "zod";

// D-059: data pribadi tambahan dari Formulir Data Karyawan (Google Form → Sheet → Import): jenis SIM
// (daftar baku, jamak) & golongan darah. Parser dipakai normalisasi Import (`import/normalize.ts`).

export const DRIVING_LICENSE_TYPES = [
  "A",
  "A_UMUM",
  "B1",
  "B1_UMUM",
  "B2",
  "B2_UMUM",
  "C",
  "C1",
  "C2",
  "D",
  "D1",
] as const;
export const drivingLicenseTypeSchema = z.enum(DRIVING_LICENSE_TYPES);
export type DrivingLicenseType = z.infer<typeof drivingLicenseTypeSchema>;
export const DRIVING_LICENSE_LABELS: Record<DrivingLicenseType, string> = {
  A: "A",
  A_UMUM: "A Umum",
  B1: "B1",
  B1_UMUM: "B1 Umum",
  B2: "B2",
  B2_UMUM: "B2 Umum",
  C: "C",
  C1: "C1",
  C2: "C2",
  D: "D",
  D1: "D1",
};

export const BLOOD_TYPE_PATTERN = /^(A|B|AB|O)[+-]?$/;

const EMPTY_LIKE =
  /^(-+|–|—|\.|0|tidak (ada|tahu|punya)|belum (ada|punya)|tdk ada|n\/?a|none|kosong|nihil)$/i;

/** Pilihan jenis SIM dari teks bebas ("SIM A, C", "B 1 Umum dan C") atau kotak centang. */
export function parseDrivingLicenseTypes(value: string | string[]): {
  types: DrivingLicenseType[];
  unknown: string[];
} {
  const tokens = (Array.isArray(value) ? value : [value])
    .flatMap((v) => v.toUpperCase().split(/[,;/&+]|\bDAN\b/))
    .map((t) =>
      t
        .replace(/\bSIM\b/g, "")
        .replace(/\b([ABCD])\s+(\d)\b/g, "$1$2")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((t) => t !== "" && !EMPTY_LIKE.test(t));
  const types: DrivingLicenseType[] = [];
  const unknown: string[] = [];
  for (const token of tokens) {
    const m = /^(A|B1|B2|C|C1|C2|D|D1)( UMUM)?$/.exec(token);
    const code = m ? (m[2] ? `${m[1]}_UMUM` : m[1]) : null;
    const parsed = drivingLicenseTypeSchema.safeParse(code);
    if (parsed.success) {
      if (!types.includes(parsed.data)) types.push(parsed.data);
    } else unknown.push(token);
  }
  // Urutan baku (sesuai DRIVING_LICENSE_TYPES) supaya "C, A" = "A, C" saat dibandingkan.
  types.sort((a, b) => DRIVING_LICENSE_TYPES.indexOf(a) - DRIVING_LICENSE_TYPES.indexOf(b));
  return { types, unknown };
}

/** "o positif" / "AB-" / "B rh+" → A/B/AB/O + rhesus opsional; tidak dikenali → null. */
export function parseBloodType(v: string): string | null {
  const s = v
    .toUpperCase()
    .replace(/\bRH(ESUS)?\b/g, "")
    .replace(/POSITIF|POSITIVE|POS\b/g, "+")
    .replace(/NEGATIF|NEGATIVE|NEG\b/g, "-")
    .replace(/\s+/g, "");
  return BLOOD_TYPE_PATTERN.test(s) ? s : null;
}
