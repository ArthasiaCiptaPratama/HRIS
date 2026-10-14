// Absen PWA (D-067): selfie dari kamera langsung (bukan galeri) dikompres ± 200 KB di browser, dan
// posisi GPS dengan akurasinya. Kamera & GPS butuh HTTPS (atau localhost).

export const SELFIE_TARGET_BYTES = 200 * 1024;
const SELFIE_MAX_SIDE = 640;

export class CaptureError extends Error {}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Gambar sumber (video/bitmap) → JPEG maks 640 px, kualitas diturunkan sampai ± 200 KB. */
export async function compressSelfie(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  if (width <= 0 || height <= 0) throw new CaptureError("Kamera belum siap. Coba lagi.");
  const scale = Math.min(1, SELFIE_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new CaptureError("Browser tidak mendukung pengolahan gambar.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  let quality = 0.82;
  let blob = await toBlob(canvas, quality);
  while (blob && blob.size > SELFIE_TARGET_BYTES && quality > 0.45) {
    quality -= 0.1;
    blob = await toBlob(canvas, quality);
  }
  if (!blob) throw new CaptureError("Gagal memproses foto.");
  return blob;
}

/** Cadangan bila kamera langsung tidak tersedia: file dari `<input capture="user">`. */
export async function compressSelfieFile(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new CaptureError("File bukan gambar yang dapat dibaca.");
  }
  try {
    return await compressSelfie(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyM: number;
  /** Ketinggian (m di atas permukaan laut) bila perangkat menyediakan. */
  altitudeM: number | null;
  at: number;
}

export function gpsErrorMessage(error: GeolocationPositionError | Error): string {
  if ("code" in error) {
    if (error.code === 1) return "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini.";
    if (error.code === 3) return "Lokasi belum didapat. Pastikan GPS aktif lalu coba lagi.";
    return "Lokasi tidak tersedia. Pastikan GPS aktif.";
  }
  return error.message;
}

export function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError")
      return "Izin kamera ditolak. Aktifkan izin kamera untuk situs ini.";
    if (error.name === "NotFoundError") return "Kamera tidak ditemukan di perangkat ini.";
    if (error.name === "NotReadableError") return "Kamera sedang dipakai aplikasi lain.";
  }
  return "Kamera tidak dapat dibuka.";
}

export interface StampInfo {
  title: string;
  employee: string;
  at: Date;
  timezone: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  altitudeM: number | null;
  place: string;
}

const TZ_LABEL: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

/** Teks cap foto (dipisah supaya bisa diuji). */
export function stampLines(info: StampInfo): string[] {
  const when = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: info.timezone,
  }).format(info.at);
  return [
    `${info.title} · ${info.employee}`,
    `${when} ${TZ_LABEL[info.timezone] ?? info.timezone}`,
    `Lat ${info.latitude.toFixed(6)}  Long ${info.longitude.toFixed(6)}  ±${info.accuracyM} m${
      info.altitudeM !== null ? `  Alt ${Math.round(info.altitudeM)} m` : ""
    }`,
    info.place,
  ];
}

/**
 * Cap waktu, koordinat (lat/long/alt), & lokasi geofence di bagian bawah foto — seperti kamera GPS —
 * supaya foto bisa diperiksa langsung saat approval. Hasil tetap JPEG ± 200 KB.
 */
export async function stampSelfie(source: Blob, info: StampInfo): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new CaptureError("Foto tidak dapat diproses.");
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new CaptureError("Browser tidak mendukung pengolahan gambar.");
    ctx.drawImage(bitmap, 0, 0);
    const lines = stampLines(info);
    const size = Math.max(12, Math.round(canvas.width / 34));
    const pad = Math.round(size * 0.8);
    const lineH = Math.round(size * 1.35);
    const boxH = pad * 2 + lineH * lines.length;
    const gradient = ctx.createLinearGradient(0, canvas.height - boxH - size * 2, 0, canvas.height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.35, "rgba(0,0,0,0.55)");
    gradient.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, canvas.height - boxH - size * 2, canvas.width, boxH + size * 2);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 2;
    lines.forEach((line, i) => {
      ctx.font = `${i === 0 ? "600 " : ""}${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      let text = line;
      while (ctx.measureText(text).width > canvas.width - pad * 2 && text.length > 4) {
        text = `${text.slice(0, -2)}…`;
      }
      ctx.fillText(text, pad, canvas.height - boxH + pad + i * lineH);
    });
    let quality = 0.85;
    let blob = await toBlob(canvas, quality);
    while (blob && blob.size > SELFIE_TARGET_BYTES && quality > 0.45) {
      quality -= 0.1;
      blob = await toBlob(canvas, quality);
    }
    if (!blob) throw new CaptureError("Gagal memproses foto.");
    return blob;
  } finally {
    bitmap.close();
  }
}
