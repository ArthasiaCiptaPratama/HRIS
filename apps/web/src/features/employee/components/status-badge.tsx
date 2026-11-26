import {
  type EmploymentCategory,
  EXIT_REASON_LABELS,
  type ExitReason,
  employmentStatusShort,
} from "@hris/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Satu warna per kategori, tetap lembut (latar tipis) supaya tabel tenang.
const CATEGORY_TONE: Record<EmploymentCategory, string> = {
  PERMANENT: "bg-brand-soft text-brand-soft-foreground",
  PROBATION: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  PKWT: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  INTERNSHIP: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  DAILY_WORKER: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
  OUTSOURCING: "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  VENDOR: "bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
};

/** Tahap PKWT belum diisi: nada kuning supaya terlihat perlu dilengkapi. */
const MISSING_STAGE_TONE = "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200";

/**
 * `stage` = tahap PKWT aktif (masukan pengguna 2026-11-26: "Status: PKWT 1" dalam satu badge).
 * Tanpa `stage` (undefined) badge PKWT tampil polos, mis. di daftar nonaktif.
 */
export function StatusBadge({
  name,
  category,
  stage,
  className,
}: {
  name: string;
  category: EmploymentCategory | null;
  stage?: number | null;
  className?: string;
}) {
  const missingStage = category === "PKWT" && stage === null;
  return (
    <Badge
      variant="muted"
      className={cn(
        "rounded-md font-medium whitespace-nowrap",
        category && (missingStage ? MISSING_STAGE_TONE : CATEGORY_TONE[category]),
        className,
      )}
    >
      {category ? employmentStatusShort(category, stage) : name}
    </Badge>
  );
}

export function ExitReasonBadge({ reason }: { reason: ExitReason | null }) {
  if (!reason) return null;
  return (
    <Badge variant="muted" className="rounded-md">
      {EXIT_REASON_LABELS[reason]}
    </Badge>
  );
}

export function ActiveDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-success animate-pulse-dot" : "bg-muted-foreground/50",
        )}
      />
      {active ? "Aktif" : "Nonaktif"}
    </span>
  );
}
