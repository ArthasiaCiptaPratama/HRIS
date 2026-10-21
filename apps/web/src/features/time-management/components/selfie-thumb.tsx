import { PUNCH_KIND_LABELS } from "@hris/shared";
import { ImageOff, PenLine } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Punch } from "../schemas";

/** Foto kecil di tabel; klik → foto penuh (cap waktu & koordinat terbaca). */
export function SelfieThumb({ punch }: { punch: Punch }) {
  const [open, setOpen] = useState(false);
  if (!punch.selfieUrl) {
    return (
      <span
        className="bg-muted text-muted-foreground grid size-11 shrink-0 place-items-center rounded-md"
        title={punch.source === "MANUAL" ? "Input manual (tanpa foto)" : "Foto tidak tersedia"}
      >
        {punch.source === "MANUAL" ? (
          <PenLine className="size-4" />
        ) : (
          <ImageOff className="size-4" />
        )}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="ring-border hover:ring-brand block size-11 shrink-0 overflow-hidden rounded-md ring-1 transition"
        aria-label="Lihat foto absen"
      >
        <img src={punch.selfieUrl} alt="" className="size-full object-cover" loading="lazy" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Foto {PUNCH_KIND_LABELS[punch.kind]}</DialogTitle>
            <DialogDescription>
              {punch.latitude !== null && punch.longitude !== null
                ? `${punch.latitude.toFixed(6)}, ${punch.longitude.toFixed(6)} · ±${punch.accuracyM ?? "?"} m`
                : "Tanpa koordinat"}
            </DialogDescription>
          </DialogHeader>
          <img src={punch.selfieUrl} alt="Selfie absen" className="w-full rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  );
}
