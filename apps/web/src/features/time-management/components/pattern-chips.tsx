import { OFF_CODE } from "@hris/shared";
import { cn } from "@/lib/utils";

/** Langkah pola roster sebagai chip kecil (OFF abu-abu). */
export function PatternChips({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-0.5", className)}>
      {steps.map((step, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: urutan langkah pola adalah identitasnya
          key={i}
          className={cn(
            "rounded px-1 font-mono text-[10px] font-semibold",
            step === OFF_CODE
              ? "bg-muted text-muted-foreground"
              : "bg-brand-soft text-brand-soft-foreground",
          )}
        >
          {step}
        </span>
      ))}
    </div>
  );
}
