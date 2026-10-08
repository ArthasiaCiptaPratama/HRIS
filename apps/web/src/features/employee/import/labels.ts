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

export const ACTION_LABELS = {
  CREATE: "Dibuat",
  UPDATE: "Diperbarui",
  SKIP: "Dilewati",
  ERROR: "Error",
} as const;
