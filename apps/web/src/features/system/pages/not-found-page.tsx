import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="text-muted-foreground text-sm">Alamat yang Anda buka tidak tersedia.</p>
      <Button asChild variant="outline">
        <Link to="/">Kembali ke beranda</Link>
      </Button>
    </div>
  );
}
