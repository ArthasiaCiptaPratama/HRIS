import { getEnv } from "../env.ts";
import { BusinessRuleError } from "./errors.ts";

// EMP-D1: konversi DOCX → PDF lewat Gotenberg (LibreOffice headless) — layanan terpisah karena LibreOffice
// tidak bisa dijalankan di fungsi Vercel. Tata letak Word (tabel, kotak teks, gambar mengambang, kop)
// dirender oleh LibreOffice; font template (Arial Narrow) disediakan di image Gotenberg (docker/gotenberg).

const TIMEOUT_MS = 30_000;

export function pdfConversionAvailable(url = getEnv().GOTENBERG_URL): boolean {
  return Boolean(url);
}

export async function convertDocxToPdf(
  docx: Uint8Array,
  fileName: string,
  url = getEnv().GOTENBERG_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  if (!url) {
    throw new BusinessRuleError(
      "Unduhan PDF belum tersedia (layanan konversi belum dikonfigurasi). Unduh versi Word (.docx).",
    );
  }
  const form = new FormData();
  form.append(
    "files",
    new Blob([docx]),
    fileName.endsWith(".docx") ? fileName : `${fileName}.docx`,
  );
  let response: Response;
  try {
    response = await fetchImpl(`${url.replace(/\/$/, "")}/forms/libreoffice/convert`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new BusinessRuleError(
      "Layanan konversi PDF tidak dapat dihubungi. Coba lagi atau unduh versi Word (.docx).",
    );
  }
  if (!response.ok) {
    throw new BusinessRuleError(
      `Konversi PDF gagal (kode ${response.status}). Coba lagi atau unduh versi Word (.docx).`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
