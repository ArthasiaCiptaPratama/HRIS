import { Camera, ImageUp, Loader2, Trash2 } from "lucide-react";
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
 * Tanpa hak ubah (`canEdit` false) hanya menampilkan avatar.
 */
export function EmployeePhotoControl({
  employeeId,
  name,
  photoUrl,
  inactive = false,
  canEdit,
  toastPosition,
  className,
}: {
  employeeId: string;
  name: string;
  photoUrl: string | null;
  inactive?: boolean;
  canEdit: boolean;
  toastPosition?: "bottom-center";
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const avatar = (
    <EmployeeAvatar
      name={name}
      size="2xl"
      inactive={inactive}
      photoUrl={photoUrl}
      className="ring-background shadow-sm ring-4"
    />
  );
  if (!canEdit) return <div className={className}>{avatar}</div>;

  return (
    <div className={cn("relative", className)}>
      {avatar}
      {busy ? (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-zinc-950/40 text-white">
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
