import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Pilihan berbentuk kartu (radio) — lebih mudah dipindai daripada dropdown untuk pilihan sedikit.
export function ChoiceCard({
  selected,
  disabled,
  onSelect,
  title,
  description,
  tone = "brand",
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: ReactNode;
  tone?: "brand" | "destructive";
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: tombol ber-role radio di dalam radiogroup
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? tone === "brand"
            ? "border-brand bg-brand-soft/60"
            : "border-destructive/60 bg-destructive/5"
          : "hover:border-foreground/25 bg-card",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
          selected &&
            (tone === "brand" ? "border-brand bg-brand" : "border-destructive bg-destructive"),
        )}
      >
        {selected ? <Check className="size-2.5 text-white" strokeWidth={3} aria-hidden /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {description ? (
          <span className="text-muted-foreground mt-0.5 block text-xs">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
