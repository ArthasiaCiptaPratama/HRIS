import { useMutation } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { XlsxTemplateError } from "@/lib/xlsx-template";
import { fetchEmployeeForPrint } from "../api";
import { todayIso } from "../labels";
import { downloadEmployeeXlsx } from "../print";

// Panel detail layar penuh: toast di bawah-tengah supaya tidak menutupi tombol tutup (X) di kanan atas.
const TOAST_POSITION = "bottom-center" as const;

/** Unduh formulir data pegawai (.xlsx dari template kantor) — SA/HR, tercatat di audit log. */
export function PrintEmployeeButton({
  employeeId,
  canViewPersonal,
}: {
  employeeId: string;
  /** Tanpa hak data pribadi, bagian itu di formulir kosong — beri tahu pengguna. */
  canViewPersonal: boolean;
}) {
  const print = useMutation({
    mutationFn: async () => {
      const employee = await fetchEmployeeForPrint(employeeId);
      const photo = await downloadEmployeeXlsx(employee, todayIso());
      return { employee, photo };
    },
    onSuccess: ({ employee, photo }) =>
      toast.success(`Data ${employee.fullName} diunduh (.xlsx).`, {
        description: [
          canViewPersonal
            ? "Buka file di Excel lalu cetak."
            : "Data pribadi & keluarga dikosongkan karena Anda tidak memiliki izin melihatnya.",
          photo === "failed" ? "Foto tidak dapat diambil; bingkai foto dibiarkan kosong." : null,
        ]
          .filter(Boolean)
          .join(" "),
        position: TOAST_POSITION,
      }),
    onError: (error) =>
      toast.error(error instanceof XlsxTemplateError ? error.message : errorMessage(error), {
        position: TOAST_POSITION,
      }),
  });

  return (
    <Button size="sm" variant="outline" onClick={() => print.mutate()} disabled={print.isPending}>
      {print.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
      {print.isPending ? "Menyiapkan…" : "Print data"}
    </Button>
  );
}
