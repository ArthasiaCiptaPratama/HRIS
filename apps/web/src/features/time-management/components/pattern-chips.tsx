import { OFF_CODE } from "@hris/shared";
import { cn } from "@/lib/utils";
import { isTimeOff, TIME_OFF_TITLE, TIME_OFF_TONE } from "./display";

/** Langkah pola jadwal sebagai chip kecil (OFF abu-abu, TO = time off roster TM-D28). */
export function PatternChips({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-0.5", className)}>
      {steps.map((step, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: urutan langkah pola adalah identitasnya
          key={i}
          title={isTimeOff(step) ? TIME_OFF_TITLE : undefined}
          className={cn(
            "rounded px-1 font-mono text-[10px] font-semibold",
            step === OFF_CODE
              ? "bg-muted text-muted-foreground"
              : isTimeOff(step)
                ? TIME_OFF_TONE
                : "bg-brand-soft text-brand-soft-foreground",
          )}
        >
          {step}
        </span>
      ))}
    </div>
  );
}
