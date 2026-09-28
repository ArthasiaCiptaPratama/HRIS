import { type ColumnDef, type RowData, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// PROMPT §7: DataTable bersama (TanStack Table v9, headless). Sort & paginasi dikerjakan SERVER;
// tabel hanya merender baris halaman aktif, jadi fitur row model klien tidak didaftarkan.

export const tableFeaturesNone = tableFeatures({});
type Features = typeof tableFeaturesNone;

export interface DataColumnMeta {
  /** Nama field sort API (mis. "fullName"); tanpa ini kolom tidak bisa diurutkan. */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
}

export type DataColumn<T extends RowData> = ColumnDef<Features, T, unknown> & {
  meta?: DataColumnMeta;
};

export interface SortState {
  field: string;
  direction: "asc" | "desc";
}

export function parseSort(sort: string): SortState {
  const [field = "fullName", direction] = sort.split(":");
  return { field, direction: direction === "desc" ? "desc" : "asc" };
}

export function DataTable<T extends RowData & { id: string }>({
  columns,
  data,
  loading,
  fetching,
  sort,
  onSortChange,
  onRowClick,
  empty,
  skeletonRows = 8,
  label,
}: {
  columns: DataColumn<T>[];
  data: T[];
  loading: boolean;
  /** Memuat halaman berikutnya di belakang layar (data lama tetap tampil). */
  fetching?: boolean;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  onRowClick?: (row: T) => void;
  empty: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode };
  skeletonRows?: number;
  label: string;
}) {
  const table = useTable({
    features: tableFeaturesNone,
    columns,
    data,
    getRowId: (row: T) => row.id,
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const columnCount = columns.length;

  return (
    <div className="relative overflow-hidden">
      {/* Garis progres tipis saat data halaman baru dimuat (tanpa menghapus data lama). */}
      <div
        aria-hidden
        className={cn(
          "bg-brand absolute inset-x-0 top-0 z-10 h-0.5 origin-left transition-[opacity,transform] duration-500",
          fetching && !loading ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
        )}
      />
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm" aria-label={label} aria-busy={loading}>
          <thead className="bg-muted/40 sticky top-0">
            {headerGroups.map((group) => (
              <tr key={group.id} className="border-b">
                {group.headers.map((header) => {
                  const meta = (header.column.columnDef as DataColumn<T>).meta;
                  const sortKey = meta?.sortKey;
                  const active = sortKey && sort?.field === sortKey ? sort.direction : null;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        active ? (active === "asc" ? "ascending" : "descending") : undefined
                      }
                      className={cn(
                        "text-muted-foreground h-10 px-4 text-left align-middle text-xs font-medium whitespace-nowrap",
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder ? null : sortKey && onSortChange ? (
                        <button
                          type="button"
                          className="hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors"
                          onClick={() =>
                            onSortChange({
                              field: sortKey,
                              direction: active === "asc" ? "desc" : "asc",
                            })
                          }
                        >
                          <table.FlexRender header={header} />
                          {active === "asc" ? (
                            <ArrowUp className="text-foreground size-3.5" aria-hidden />
                          ) : active === "desc" ? (
                            <ArrowDown className="text-foreground size-3.5" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: baris kerangka statis
                <tr key={index} className="border-b last:border-0">
                  {Array.from({ length: columnCount }, (_, cell) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: sel kerangka statis
                    <td key={cell} className="px-4 py-3.5">
                      {cell === 0 ? (
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-9 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3.5 w-36" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                      ) : (
                        <Skeleton className="h-3.5 w-24" />
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>
                  <EmptyState {...empty} />
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={row.id}
                  style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
                  className={cn(
                    "animate-fade-up group border-b transition-colors last:border-0",
                    onRowClick &&
                      "hover:bg-muted/50 focus-visible:bg-muted/60 cursor-pointer outline-none",
                  )}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                >
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-4 py-3 align-middle",
                        (cell.column.columnDef as DataColumn<T>).meta?.className,
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
