import {
  columnLetter,
  IMPORT_FIELDS,
  IMPORT_ISSUE_MESSAGES,
  type ImportFieldKey,
  type ImportRowIssue,
} from "@hris/shared";

// D-042: teks tampilan import (Indonesia). Nilai sensitif disamarkan di layar pemetaan.

export const fieldLabel = (key: string | null) =>
  key && key in IMPORT_FIELDS ? IMPORT_FIELDS[key as ImportFieldKey].label : "Baris";

export const isSensitiveField = (key: ImportFieldKey | null) =>
  key !== null &&
  (IMPORT_FIELDS[key].section === "personal" ||
    IMPORT_FIELDS[key].section === "bank" ||
    IMPORT_FIELDS[key].section === "family");

/** "••••1234" untuk contoh isi kolom sensitif (tetap bisa dikenali tanpa menampilkan utuh). */
export function maskValue(value: string): string {
  const text = value.trim();
  if (text.length <= 4) return "••••";
  return `••••${text.slice(-4)}`;
}

/** "No. HP (kolom AD): Bukan nomor HP. Contoh …" — nama isian dulu, letak kolom sebagai keterangan (IMP-D5). */
export function issueText(
  issue: Pick<ImportRowIssue, "field" | "code">,
  columnOf: (field: ImportFieldKey) => number | undefined,
): string {
  const message = IMPORT_ISSUE_MESSAGES[issue.code] ?? issue.code;
  if (!issue.field) return message;
  const column = columnOf(issue.field);
  const where = column === undefined ? "" : ` (kolom ${columnLetter(column)})`;
  // "NIP (nomor induk pegawai)" → "NIP" supaya tidak ada kurung ganda dengan letak kolom.
  const label = fieldLabel(issue.field).replace(/\s*\([^)]*\)$/, "");
  return `${label}${where}: ${message}`;
}

/** D-060: tujuan lampiran → teks. */
export const attachmentTargetLabel = (field: string) => fieldLabel(field).replace(/^File /, "");

export const ACTION_LABELS = {
  CREATE: "Dibuat",
  UPDATE: "Diperbarui",
  SKIP: "Dilewati",
  ERROR: "Error",
} as const;

/** Petunjuk tindakan untuk error baris di Pratinjau (yang tidak tercantum: perbaiki di file Excel). */
const ISSUE_HINTS: Record<string, string> = {
  NO_IDENTITY: "Isi NIP atau No. KTP di file Excel, lalu unggah ulang.",
  UNIT_UNMATCHED: "Kembali ke langkah Lengkapi data dan pilih departemennya.",
  UNIT_INVALID: "Kembali ke langkah Lengkapi data dan pilih ulang departemennya.",
  COMPANY_REQUIRED: "Pilih PT di kolom PT baris ini.",
  CATEGORY_REQUIRED: "Pilih status di kolom Status baris ini.",
  STATUS_INVALID: "Pilih status lain di kolom Status baris ini.",
  CHART_HOLDER_CHOICE_REQUIRED:
    "Pilih di bawah nama karyawan: orang yang sama, atau karyawan baru.",
  EXIT_FUTURE_DATE:
    "Isi tanggal keluar paling lambat hari ini, atau hapus status keluar dan import lagi pada harinya.",
  HOMEBASE_FUTURE_DATE:
    "Isi tanggal berlaku homebase paling lambat hari ini di file Excel (boleh dikosongkan).",
};

/** Satu kalimat "apa yang harus dilakukan" untuk error-error satu baris. */
export function issueHint(issues: Pick<ImportRowIssue, "code" | "severity">[]): string | null {
  const errors = issues.filter((i) => i.severity === "ERROR");
  if (errors.length === 0) return null;
  const hints = [...new Set(errors.map((i) => ISSUE_HINTS[i.code]).filter(Boolean))];
  if (errors.some((i) => !ISSUE_HINTS[i.code]))
    hints.push("Perbaiki isinya di file Excel, lalu unggah ulang file itu.");
  return hints.join(" ");
}

/** IMP-D5 "sekali lihat": ringkasan pendek per kode untuk daftar/tabel; pesan lengkap + contoh di tooltip. */
const SHORT_ISSUES: Record<string, string> = {
  INVALID_PHONE: "salah",
  INVALID_EMAIL: "tidak lengkap",
  INVALID_NPWP: "harus 15/16 angka",
  INVALID_LENGTH_16: "harus 16 angka",
  INVALID_DATE: "tidak terbaca",
  REQUIRED: "belum diisi",
  NO_IDENTITY: "isi NIP atau No. KTP",
  UNKNOWN_GENDER: "tidak dikenali",
  UNKNOWN_PTKP: "tidak dikenali",
  UNKNOWN_EMPLOYMENT_STATUS: "tidak dikenali",
  COMPANY_UNKNOWN: "PT belum terdaftar",
  COMPANY_REQUIRED: "PT belum dipilih",
  CATEGORY_REQUIRED: "status belum dipilih",
  JOIN_DATE_REQUIRED: "tanggal masuk belum diisi",
  POSITION_REQUIRED: "jabatan/departemen belum diisi",
  DUPLICATE_IN_FILE: "NIP dobel di file",
  DUPLICATE_KTP_IN_FILE: "No. KTP dobel di file",
  KTP_TAKEN: "No. KTP sudah dipakai",
  EMAIL_TAKEN: "email sudah dipakai",
  PERSONAL_EMAIL_TAKEN: "email sudah dipakai",
  CHART_HOLDER_CHOICE_REQUIRED: "pilih: orang yang sama atau baru",
};

/** "No. HP salah", "Isi NIP atau No. KTP" — satu frasa pendek; fallback = pesan lengkap. */
export function issueShort(issue: Pick<ImportRowIssue, "field" | "code">): string {
  const short = SHORT_ISSUES[issue.code];
  if (!short) return IMPORT_ISSUE_MESSAGES[issue.code] ?? issue.code;
  if (
    issue.code === "NO_IDENTITY" ||
    !issue.field ||
    /^(PT|status|tanggal|jabatan|NIP|No\. KTP|email|pilih)/.test(short)
  )
    return short.charAt(0).toUpperCase() + short.slice(1);
  const label = fieldLabel(issue.field).replace(/\s*\([^)]*\)$/, "");
  return `${label} ${short}`;
}
