import { useMutation } from "@tanstack/react-query";
import { ChevronDown, FileText, FileType2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/errors";
import { downloadBytes } from "@/lib/xlsx-write";
import { fetchApplicationForm } from "../api";

// EMP-D1: unduh Formulir Aplikasi (template Word kantor) sebagai Word (.docx) atau PDF — dibuat server,
// SA/HR, tercatat di audit. Berdampingan dengan "Print data" (.xlsx) selama fitur ini masih lokal.

const TOAST_POSITION = "bottom-center" as const;
const PHOTO_NOTE = {
  included: null,
  none: "Karyawan belum punya foto; kotak foto dibiarkan kosong.",
  unsupported: "Format foto tidak didukung Word (selain JPEG/PNG); kotak foto dibiarkan kosong.",
  failed: "Foto tidak dapat diambil; kotak foto dibiarkan kosong.",
} as const;

export function ApplicationFormButton({
  employeeId,
  canViewPersonal,
}: {
  employeeId: string;
  canViewPersonal: boolean;
}) {
  const download = useMutation({
    mutationFn: async (format: "docx" | "pdf") => {
      const file = await fetchApplicationForm(employeeId, format);
      const bytes = Uint8Array.from(atob(file.contentBase64), (c) => c.charCodeAt(0));
      downloadBytes(bytes, file.fileName, file.contentType);
      return { ...file, format };
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={download.isPending}>
          {download.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
          {download.isPending ? "Menyiapkan…" : "Formulir Aplikasi"}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Template formulir kantor
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => download.mutate("pdf")}>
          <FileType2 /> PDF (siap cetak)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download.mutate("docx")}>
          <FileText /> Word (.docx, bisa diedit)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
