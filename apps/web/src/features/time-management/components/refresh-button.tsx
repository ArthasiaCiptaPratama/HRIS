import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Ambil ulang data halaman persetujuan (antrean baru masuk dari karyawan tanpa memuat ulang halaman). */
export function RefreshButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  return (
    <Button
      variant="outline"
      size={compact ? "icon-sm" : "default"}
      className={className}
      aria-label="Muat ulang"
      title="Muat ulang"
      disabled={fetching}
      onClick={() => void queryClient.refetchQueries({ type: "active" })}
    >
      <RefreshCw className={cn(fetching && "animate-spin")} />
      {compact ? null : "Muat ulang"}
    </Button>
  );
}
