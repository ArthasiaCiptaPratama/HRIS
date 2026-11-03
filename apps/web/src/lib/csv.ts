/** Netralisasi formula spreadsheet sebelum quoting; quoting saja tidak mencegah eksekusi.
 * Angka (termasuk negatif) dibiarkan apa adanya agar tetap terbaca sebagai angka. */
export function escapeCsvCell(value: string | number): string {
  const text = String(value);
  const safe = typeof value === "string" && /^[=+@\t\r-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
