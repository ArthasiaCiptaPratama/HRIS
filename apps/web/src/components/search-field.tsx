import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Kotak cari dengan ikon & tombol hapus (gaya bilah filter daftar pegawai). */
export function SearchField({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  "aria-label": string;
}) {
  return (
    <div className="relative flex-1">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 pr-9 pl-9"
      />
      {value ? (
        <button
          type="button"
          aria-label="Hapus pencarian"
          onClick={() => onChange("")}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
