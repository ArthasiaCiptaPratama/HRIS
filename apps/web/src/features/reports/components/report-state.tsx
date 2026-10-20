import { CalendarClock, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";

// ARS-D16/D21: keadaan muat/galat & tanggal data, dipakai semua tab Laporan.

export function State({
  query,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown };
}) {
  if (query.isPending)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  if (query.isError)
    return (
      <EmptyState
        icon={SearchX}
        title="Laporan gagal dimuat"
        description={errorMessage(query.error)}
      />
    );
  return null;
}

/** Tanggal data (pojok kanan atas tiap tab). */
export function AsOf({ date, children }: { date: string; children?: ReactNode }) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
      <CalendarClock className="size-3.5" aria-hidden />
      Data per {formatDate(date)}
      {children}
    </p>
  );
}
