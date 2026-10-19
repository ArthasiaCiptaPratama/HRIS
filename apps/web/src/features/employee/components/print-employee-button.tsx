import { useMutation } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { imageUrlToJpeg, PROFILE_PHOTO_ASPECT } from "@/lib/image";
import { downloadBytes } from "@/lib/xlsx-write";
import { fetchEmployeeForm } from "../api";

// Panel detail layar penuh: toast di bawah-tengah supaya tidak menutupi tombol tutup (X) di kanan atas.
const TOAST_POSITION = "bottom-center" as const;

const PHOTO_NOTE = {
  included: null,
  none: "Karyawan belum punya foto; kotak foto dibiarkan kosong.",
  unsupported: "Format foto tidak didukung (selain JPEG/PNG); kotak foto dibiarkan kosong.",
  failed: "Foto tidak dapat diambil; kotak foto dibiarkan kosong.",
} as const;

/**
 * Print data: unduh "Formulir Data Karyawan" (PDF dari template HR, dibuat server) — SA/HR, tercatat di
 * audit log. Menggantikan unduhan .xlsx (2026-10-19).
 */
/** Foto profil (WebP) → JPEG base64 untuk PDF; gagal → server mencoba sendiri (kotak foto bisa kosong). */
async function photoForPdf(photoUrl: string | null): Promise<string | null> {
  if (!photoUrl) return null;
  try {
    const { bytes } = await imageUrlToJpeg(photoUrl, PROFILE_PHOTO_ASPECT);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  } catch {
    return null;
  }
}

export function PrintEmployeeButton({
  employeeId,
  photoUrl,
  canViewPersonal,
}: {
  employeeId: string;
  /** URL foto profil bertanda tangan (null = tanpa foto). */
  photoUrl: string | null;
  /** Tanpa hak data pribadi, bagian itu di formulir kosong — beri tahu pengguna. */
  canViewPersonal: boolean;
}) {
  const print = useMutation({
    mutationFn: async () => {
      const file = await fetchEmployeeForm(employeeId, await photoForPdf(photoUrl));
      const bytes = Uint8Array.from(atob(file.contentBase64), (c) => c.charCodeAt(0));
      downloadBytes(bytes, file.fileName, file.contentType);
      return file;
    },
    onSuccess: (file) =>
      toast.success(`${file.fileName} diunduh.`, {
        description:
          [
            canViewPersonal
              ? null
              : "Data pribadi & keluarga dikosongkan karena Anda tidak memiliki izin melihatnya.",
            PHOTO_NOTE[file.photo],
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        position: TOAST_POSITION,
      }),
    onError: (error) => toast.error(errorMessage(error), { position: TOAST_POSITION }),
  });

  return (
    <Button size="sm" variant="outline" onClick={() => print.mutate()} disabled={print.isPending}>
      {print.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
      {print.isPending ? "Menyiapkan…" : "Print data"}
    </Button>
  );
}
