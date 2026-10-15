import { Camera, ImageUp, Loader2, Trash2, ZoomIn } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/errors";
import { ImageProcessingError, PHOTO_INPUT_TYPES } from "@/lib/image";
import { cn } from "@/lib/utils";
import { PhotoUploadError, useDeletePhoto, useUploadPhoto } from "../api";
import { EmployeeAvatar } from "./employee-avatar";

const photoError = (error: unknown) =>
  error instanceof ImageProcessingError || error instanceof PhotoUploadError
    ? error.message
    : errorMessage(error);

/**
 * Avatar besar + tombol kamera untuk mengganti/menghapus foto profil (D-037).
 * Tanpa hak ubah (`canEdit` false) hanya menampilkan avatar. `zoomable`: klik area foto (bukan tombol
 * kamera) membuka foto ukuran besar di pop-up (2026-10-15); tanpa foto = tidak bisa diklik.
 */
export function EmployeePhotoControl({
  employeeId,
  name,
  photoUrl,
  inactive = false,
  canEdit,
  toastPosition,
  className,
  shape = "circle",
  zoomable = false,
  subtitle,
}: {
  employeeId: string;
  name: string;
  photoUrl: string | null;
  inactive?: boolean;
  canEdit: boolean;
  toastPosition?: "bottom-center";
  className?: string;
  /** "portrait" = kotak pas foto 3:4 (header detail karyawan). */
  shape?: "circle" | "portrait";
  /** Klik foto → pop-up foto besar (header detail karyawan). */
  zoomable?: boolean;
  /** Teks kecil di bawah nama pada pop-up (mis. NIP). */
  subtitle?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const busy = upload.isPending || remove.isPending;
  const toastOptions = toastPosition ? { position: toastPosition } : {};

  const onFile = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(
      { id: employeeId, file },
      {
        onSuccess: () => toast.success("Foto profil diperbarui.", toastOptions),
        onError: (error) => toast.error(photoError(error), toastOptions),
      },
    );
  };

  const onDelete = () =>
    remove.mutate(
      { id: employeeId },
      {
        onSuccess: () => {
          setConfirmDelete(false);
          toast.success("Foto profil dihapus.", toastOptions);
        },
        onError: (error) => toast.error(photoError(error), toastOptions),
      },
    );

  const image = (
    <EmployeeAvatar
      name={name}
      size="2xl"
      inactive={inactive}
      photoUrl={photoUrl}
      className={cn(
        "ring-background shadow-sm ring-4",
        shape === "portrait" && "border-border h-36 w-28 rounded-lg border sm:h-40 sm:w-32",
      )}
    />
  );
  const canZoom = zoomable && photoUrl !== null;
  const avatar = canZoom ? (
    <button
      type="button"
      onClick={() => setZoomed(true)}
      aria-label={`Perbesar foto ${name}`}
      className={cn(
        "group/zoom focus-visible:ring-ring/50 relative block cursor-zoom-in outline-none focus-visible:ring-[3px]",
        shape === "portrait" ? "rounded-lg" : "rounded-full",
      )}
    >
      {image}
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 grid place-items-center bg-zinc-950/0 text-white opacity-0 transition group-hover/zoom:bg-zinc-950/30 group-hover/zoom:opacity-100",
          shape === "portrait" ? "rounded-lg" : "rounded-full",
        )}
      >
        <ZoomIn className="size-6" />
      </span>
    </button>
  ) : (
    image
  );
  const zoomDialog = canZoom ? (
    <Dialog open={zoomed} onOpenChange={setZoomed}>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] gap-3 p-3 sm:max-w-xl">
        <img
          src={photoUrl ?? undefined}
          alt={`Foto profil ${name}`}
          className="max-h-[75dvh] w-full rounded-lg object-contain"
        />
        <DialogHeader className="px-1 pb-1">
          <DialogTitle className="text-base">{name}</DialogTitle>
          <DialogDescription className={cn(!subtitle && "sr-only", "font-mono text-xs")}>
            {subtitle || "Foto profil karyawan"}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ) : null;
  if (!canEdit)
    return (
      <div className={className}>
        {avatar}
        {zoomDialog}
      </div>
    );

  return (
    <div className={cn("relative", className)}>
      {avatar}
      {busy ? (
        <span
          className={cn(
            "absolute inset-0 grid place-items-center bg-zinc-950/40 text-white",
            shape === "portrait" ? "rounded-lg" : "rounded-full",
          )}
        >
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <span className="sr-only">Memproses foto…</span>
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={PHOTO_INPUT_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label="Pilih file foto profil"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={busy}
            className="bg-background absolute right-0 bottom-0 rounded-full shadow-sm"
            aria-label={photoUrl ? "Ganti atau hapus foto profil" : "Unggah foto profil"}
          >
            <Camera />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onSelect={() => input.current?.click()}>
            <ImageUp /> {photoUrl ? "Ganti foto" : "Unggah foto"}
          </DropdownMenuItem>
          {photoUrl ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Hapus foto
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {zoomDialog}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus foto profil?</DialogTitle>
            <DialogDescription>
              Foto {name} dihapus permanen. Avatar kembali menampilkan inisial.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Batal
            </Button>
            <Button type="button" variant="destructive" onClick={onDelete} disabled={busy}>
              {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Hapus foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
