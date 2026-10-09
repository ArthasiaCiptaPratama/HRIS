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

/** "Kolom AC · NIK KTP: Harus 16 digit". */
export function issueText(
  issue: Pick<ImportRowIssue, "field" | "code">,
  columnOf: (field: ImportFieldKey) => number | undefined,
): string {
  const message = IMPORT_ISSUE_MESSAGES[issue.code] ?? issue.code;
  if (!issue.field) return message;
  const column = columnOf(issue.field);
  const where = column === undefined ? "" : `Kolom ${columnLetter(column)} · `;
  return `${where}${fieldLabel(issue.field)}: ${message}`;
}

/** D-060: tujuan lampiran → teks. */
export const attachmentTargetLabel = (field: string) => fieldLabel(field).replace(/^File /, "");

export const ACTION_LABELS = {
  CREATE: "Dibuat",
  UPDATE: "Diperbarui",
  SKIP: "Dilewati",
  ERROR: "Error",
} as const;

/** Petunjuk tindakan untuk error baris di Pratinjau (yang tidak tercantum: perbaiki di file). */
const ISSUE_HINTS: Record<string, string> = {
  NO_IDENTITY: "Isi NIP atau perbaiki NIK KTP di file, lalu unggah ulang.",
  UNIT_UNMATCHED: "Pilih unitnya di langkah Lengkapi data.",
  UNIT_INVALID: "Pilih ulang unitnya di langkah Lengkapi data.",
  COMPANY_REQUIRED: "Pilih PT di kolom PT baris ini atau PT bawaan di Lengkapi data.",
  CATEGORY_REQUIRED: "Pilih status di kolom Status baris ini.",
  STATUS_INVALID: "Pilih status lain di kolom Status baris ini.",
};

/** Satu kalimat "apa yang harus dilakukan" untuk error-error satu baris. */
export function issueHint(issues: Pick<ImportRowIssue, "code" | "severity">[]): string | null {
  const errors = issues.filter((i) => i.severity === "ERROR");
  if (errors.length === 0) return null;
  const hints = [...new Set(errors.map((i) => ISSUE_HINTS[i.code]).filter(Boolean))];
  if (errors.some((i) => !ISSUE_HINTS[i.code]))
    hints.push("Perbaiki di file (Unduh baris bermasalah), lalu unggah ulang.");
  return hints.join(" ");
}
