// D-060: file dari Google Drive → sesuai aturan unggah HRIS. Library JS murni (bundle Vercel tanpa
// modul native): Jimp (JPEG/PNG/BMP/GIF/TIFF; orientasi EXIF diterapkan) & pdf-lib. Foto profil = JPEG
// sisi terpanjang 1024 px; gambar dokumen besar dikecilkan; beberapa gambar satu dokumen → satu PDF.
// HEIC/WebP tidak bisa dibaca → dilewati dengan alasan (unggah manual).
import { Jimp } from "jimp";
import { PDFDocument } from "pdf-lib";

export type UploadMime = "application/pdf" | "image/jpeg" | "image/png";
export type PreparedFile = { bytes: Uint8Array; contentType: UploadMime } | { skip: string };

/** Batas file mentah dari Drive (sebelum dikompres) — mencegah memori fungsi habis. */
export const SOURCE_MAX_BYTES = 20 * 1024 * 1024;

/** Jenis file dari byte awal (bukan dari nama/klaim Drive). */
export function sniffMime(bytes: Uint8Array): string {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|mif1|msf1|hevc)$/.test(ascii(8, 12))) {
    return "image/heic";
  }
  if (ascii(0, 3) === "GIF") return "image/gif";
  if (ascii(0, 2) === "BM") return "image/bmp";
  if (starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)) return "image/tiff";
  return "application/octet-stream";
}

const READABLE_IMAGES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);
const UNREADABLE_IMAGE = "format gambar tidak didukung (mis. HEIC/WebP) — unggah manual";
const MB = 1024 * 1024;

async function toJpeg(bytes: Uint8Array, maxSide: number, quality: number) {
  const image = await Jimp.read(Buffer.from(bytes));
  if (image.width > maxSide || image.height > maxSide) {
    image.scaleToFit({ w: maxSide, h: maxSide });
  }
  return new Uint8Array(await image.getBuffer("image/jpeg", { quality }));
}

export async function preparePhoto(bytes: Uint8Array, maxBytes: number): Promise<PreparedFile> {
  const mime = sniffMime(bytes);
  if (!mime.startsWith("image/")) return { skip: "foto profil harus berupa gambar" };
  if (!READABLE_IMAGES.has(mime)) return { skip: UNREADABLE_IMAGE };
  const jpeg = await toJpeg(bytes, 1024, 85);
  if (jpeg.byteLength > maxBytes) return { skip: "foto masih terlalu besar setelah dikompres" };
  return { bytes: jpeg, contentType: "image/jpeg" };
}

/**
 * Satu dokumen dari satu atau beberapa file. PDF dipakai apa adanya (tidak dikompres); gambar JPEG/PNG
 * yang muat dipakai apa adanya, selebihnya diubah ke JPEG 2400 px. Beberapa file: semua gambar →
 * satu PDF (satu halaman per gambar); campuran dengan PDF tidak digabung.
 */
export async function prepareDocument(
  files: Uint8Array[],
  allowed: string[],
  maxBytes: number,
): Promise<PreparedFile> {
  const fits = (contentType: UploadMime, bytes: Uint8Array): PreparedFile => {
    if (!allowed.includes(contentType)) {
      return { skip: `jenis dokumen ini tidak menerima ${contentType}` };
    }
    if (bytes.byteLength > maxBytes) {
      return { skip: `file melebihi ${Math.round(maxBytes / MB)} MB setelah dikompres` };
    }
    return { bytes, contentType };
  };
  const typed = files.map((bytes) => ({ bytes, mime: sniffMime(bytes) }));

  if (typed.length === 1) {
    const [file] = typed as [(typeof typed)[number]];
    if (file.mime === "application/pdf") return fits("application/pdf", file.bytes);
    if (!file.mime.startsWith("image/")) return { skip: "format file tidak didukung" };
    if (!READABLE_IMAGES.has(file.mime)) return { skip: UNREADABLE_IMAGE };
    const asIs = file.mime === "image/jpeg" || file.mime === "image/png";
    if (asIs && file.bytes.byteLength <= maxBytes && allowed.includes(file.mime)) {
      return { bytes: file.bytes, contentType: file.mime as UploadMime };
    }
    return fits("image/jpeg", await toJpeg(file.bytes, 2400, 82));
  }

  if (typed.some((file) => !file.mime.startsWith("image/"))) {
    return { skip: `${typed.length} file dalam satu jawaban dan ada PDF — gabungkan manual` };
  }
  if (typed.some((file) => !READABLE_IMAGES.has(file.mime))) return { skip: UNREADABLE_IMAGE };
  const pdf = await PDFDocument.create();
  for (const file of typed) {
    const image = await pdf.embedJpg(await toJpeg(file.bytes, 1800, 75));
    // Halaman seukuran gambar, sisi terpanjang ±A4 (842 pt).
    const scale = Math.min(1, 842 / Math.max(image.width, image.height));
    const page = pdf.addPage([image.width * scale, image.height * scale]);
    page.drawImage(image, { x: 0, y: 0, width: image.width * scale, height: image.height * scale });
  }
  return fits("application/pdf", await pdf.save());
}
