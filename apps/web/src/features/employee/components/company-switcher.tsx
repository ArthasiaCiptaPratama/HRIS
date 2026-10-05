import { Building2 } from "lucide-react";
import { FormSelect } from "@/components/form-select";
import { cn } from "@/lib/utils";
import { useCompanyScope } from "../api";
import { setSelectedCompany } from "../company-scope";

/**
 * D-040: pilih perusahaan untuk data Personal Management. Hanya tampil bila pengguna melihat > 1
 * perusahaan (SA di grup multi-PT, atau HR yang ditugaskan ke beberapa PT). Desktop: top bar;
 * mobile: di atas isi halaman (lihat app-layout).
 */
export function CompanySwitcher({ enabled, className }: { enabled: boolean; className?: string }) {
  const { companies, selectedId, showCompany } = useCompanyScope(enabled);
  if (!enabled || !showCompany) return null;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Building2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <FormSelect
        aria-label="Perusahaan"
        className="h-9 md:w-44"
        value={selectedId ?? ""}
        onChange={(value) => setSelectedCompany(value || null)}
        noneLabel="Semua perusahaan"
        placeholder="Semua perusahaan"
        options={companies.map((company) => ({
          value: company.id,
          label: company.code,
          hint: company.name,
        }))}
      />
    </div>
  );
}
