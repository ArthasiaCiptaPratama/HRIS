import { Search, SearchX } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useEmployees } from "../api";
import { EmployeeAvatar } from "./employee-avatar";
import { StatusBadge } from "./status-badge";

// Daftar pilih pegawai (aktif/nonaktif) dengan pencarian; dipakai menu Ubah Status & Pengaktifan.
export function EmployeePicker({
  active,
  selectedId,
  onSelect,
  title,
}: {
  active: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 250);
  const query = useEmployees({
    page: 1,
    pageSize: 50,
    active,
    q: q || undefined,
    sort: "fullName:asc",
  });
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  return (
    <div className="bg-card flex max-h-[calc(100dvh-13rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">{title}</h2>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">{total}</span>
        </div>
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau nomor induk…"
            aria-label="Cari pegawai"
            className="h-9 pl-9"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {query.isPending ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: 7 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={q ? "Tidak ada yang cocok" : "Belum ada data"}
            className="py-10"
          />
        ) : (
          <ul className="space-y-0.5" aria-label={title}>
            {rows.map((row, index) => {
              const selected = row.id === selectedId;
              return (
                <li
                  key={row.id}
                  style={{ "--i": Math.min(index, 10) } as React.CSSProperties}
                  className="animate-fade-up"
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(row.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      selected ? "bg-brand-soft" : "hover:bg-muted/70",
                    )}
                  >
                    <EmployeeAvatar name={row.fullName} inactive={!row.isActive} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          selected && "text-brand-soft-foreground",
                        )}
                      >
                        {row.fullName}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {row.position.name}
                      </span>
                    </span>
                    <StatusBadge
                      name={row.employmentStatus.name}
                      category={row.employmentStatus.category}
                      className="hidden sm:inline-flex"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {total > rows.length ? (
          <p className="text-muted-foreground px-3 py-3 text-center text-xs">
            Menampilkan {rows.length} dari {total}. Persempit dengan pencarian.
          </p>
        ) : null}
      </div>
    </div>
  );
}
