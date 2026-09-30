// Olah gambar di browser (canvas): foto profil dipotong ke tengah dengan rasio tetap lalu dikompres
// sebelum diunggah (PROMPT §7: kompres di client), dan dikonversi ke JPEG untuk disisipkan ke Excel.

export const PROFILE_PHOTO_ASPECT = 3 / 4; // lebar : tinggi, seperti pas foto (D-037)
const PROFILE_PHOTO_MAX = { width: 600, height: 800 };
/** Batas file mentah dari perangkat sebelum dikompres. */
export const PHOTO_INPUT_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class ImageProcessingError extends Error {}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Potongan tengah terbesar dengan rasio `aspect` (lebar/tinggi) dari gambar width × height. */
export function centerCrop(width: number, height: number, aspect: number): CropRect {
  if (width <= 0 || height <= 0) throw new ImageProcessingError("Ukuran gambar tidak valid.");
  if (width / height > aspect) {
    const sw = Math.round(height * aspect);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sh = Math.round(width / aspect);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

/** Ukuran hasil: tidak diperbesar, diperkecil agar muat dalam max. */
export function fitWithin(width: number, height: number, max: { width: number; height: number }) {
  const scale = Math.min(1, max.width / width, max.height / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decode(source: Blob): Promise<ImageBitmap> {
  try {
    // "from-image": foto kamera ponsel mengikuti orientasi EXIF.
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new ImageProcessingError("File bukan gambar yang dapat dibaca.");
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function render(
  bitmap: ImageBitmap,
  aspect: number,
  max: { width: number; height: number },
): Promise<HTMLCanvasElement> {
  const crop = centerCrop(bitmap.width, bitmap.height, aspect);
  const size = fitWithin(crop.sw, crop.sh, max);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageProcessingError("Browser tidak mendukung pengolahan gambar.");
  // Latar putih: PNG transparan tidak menjadi hitam saat dijadikan JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height);
  return canvas;
}

/** File dari perangkat → foto profil 3:4 (maks 600×800), WebP (JPEG bila browser tak mendukung). */
export async function prepareProfilePhoto(
  file: File,
): Promise<{ blob: Blob; contentType: "image/webp" | "image/jpeg" }> {
  if (!(PHOTO_INPUT_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageProcessingError("Pilih gambar JPG, PNG, atau WebP.");
  }
  if (file.size > PHOTO_INPUT_MAX_BYTES) {
    throw new ImageProcessingError("Ukuran gambar maksimal 15 MB.");
  }
  const bitmap = await decode(file);
  try {
    const canvas = await render(bitmap, PROFILE_PHOTO_ASPECT, PROFILE_PHOTO_MAX);
    const webp = await toBlob(canvas, "image/webp", 0.85);
    if (webp?.type === "image/webp") return { blob: webp, contentType: "image/webp" };
    const jpeg = await toBlob(canvas, "image/jpeg", 0.88);
    if (!jpeg) throw new ImageProcessingError("Gagal mengompres gambar.");
    return { blob: jpeg, contentType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}

/** URL gambar → JPEG dengan rasio `aspect` (Excel tidak menampilkan WebP). */
export async function imageUrlToJpeg(
  url: string,
  aspect: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const response = await fetch(url);
  if (!response.ok) throw new ImageProcessingError("Foto karyawan tidak dapat diunduh.");
  const bitmap = await decode(await response.blob());
  try {
    const canvas = await render(bitmap, aspect, PROFILE_PHOTO_MAX);
    const jpeg = await toBlob(canvas, "image/jpeg", 0.9);
    if (!jpeg) throw new ImageProcessingError("Gagal menyiapkan foto untuk dicetak.");
    return {
      bytes: new Uint8Array(await jpeg.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}
