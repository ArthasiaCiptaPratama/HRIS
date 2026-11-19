import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** IMP-D5 "sekali lihat": penjelasan tambahan disimpan di balik ikon ⓘ (hover/fokus), bukan paragraf. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground inline-grid size-5 place-items-center rounded-full align-middle"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{children}</TooltipContent>
    </Tooltip>
  );
}
