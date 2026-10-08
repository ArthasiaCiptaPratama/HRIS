// Unduhan file di browser. Penulis .xlsx ada di @hris/shared (dipakai juga ekspor Arsip di api).
export { buildXlsx, type XlsxCell } from "@hris/shared";

/** Unduh byte sebagai file di browser. */
export function downloadBytes(bytes: Uint8Array, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
