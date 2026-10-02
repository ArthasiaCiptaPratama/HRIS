import { Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";

// D-045 c: Layanan Mandiri Karyawan (ESS) — placeholder. Isi menyusul setelah modul Time Management.
export function EssPage() {
  return (
    <div>
      <PageHeader
        title="Layanan Mandiri"
        description="Absensi, cuti, dan slip gaji Anda akan tersedia di sini."
      />
      <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <Clock className="size-8" />
        <p className="font-medium text-foreground">Segera hadir</p>
        <p className="max-w-sm text-sm">
          Fitur layanan mandiri sedang disiapkan. Sementara itu, lihat dan perbarui profil Anda di
          menu Akun Saya.
        </p>
      </div>
    </div>
  );
}
