import { hrLevelCodeDiffers, hrLevelCodeNote, type PositionLevel } from "@hris/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * ORG-D8: penanda kode level asli dari file HR (mis. "3A") di sebelah Level — hanya bila kode tidak
 * sama persis dengan level jabatan. Level karyawan tetap = level jabatannya.
 */
export function HrLevelChip({
  code,
  level,
}: {
  code: string | null | undefined;
  level: PositionLevel | null;
}) {
  if (!code || !hrLevelCodeDiffers(code, level)) return null;
  const note = `Kode HR di file: ${code} — ${hrLevelCodeNote(code, level)}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={note}
          className="bg-muted text-muted-foreground ml-2 inline-flex cursor-help items-center rounded-md px-1.5 py-0.5 align-middle font-mono text-[11px] font-normal"
        >
          Kode HR {code}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{note}</TooltipContent>
    </Tooltip>
  );
}
