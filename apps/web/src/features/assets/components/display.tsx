import {
  ASSET_CONDITION_LABELS,
  ASSET_STATUS_LABELS,
  type AssetCondition,
  type AssetStatus,
  LOAN_STATE_LABELS,
  type LoanState,
} from "@hris/shared";
import { CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { PpeIssue } from "../schemas";

// ARS-D1–D6: badge & format bersama halaman aset. Tidak mengimpor fitur lain (dipakai juga oleh
// detail karyawan & Layanan Mandiri, cegah dependensi melingkar).

type Variant = "success" | "warning" | "destructive" | "muted" | "brand" | "secondary";

const STATUS_VARIANT: Record<AssetStatus, Variant> = {
  AVAILABLE: "success",
  ASSIGNED: "brand",
  MAINTENANCE: "warning",
  LOST: "destructive",
  RETIRED: "muted",
};
export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{ASSET_STATUS_LABELS[status]}</Badge>;
}

const CONDITION_VARIANT: Record<AssetCondition, Variant> = {
  GOOD: "secondary",
  FAIR: "warning",
  DAMAGED: "destructive",
};
export function ConditionBadge({ condition }: { condition: AssetCondition }) {
  return <Badge variant={CONDITION_VARIANT[condition]}>{ASSET_CONDITION_LABELS[condition]}</Badge>;
}

export function LoanBadge({ state }: { state: LoanState }) {
  if (state === "NONE" || state === "OPEN") return null;
  return (
    <Badge variant={state === "OVERDUE" ? "destructive" : "warning"}>
      {LOAN_STATE_LABELS[state]}
    </Badge>
  );
}

const REPLACEMENT_LABELS: Record<PpeIssue["replacementState"], string> = {
  NONE: "Tanpa masa ganti",
  OK: "Belum jatuh tempo",
  DUE: "Jatuh tempo ganti",
  REPLACED: "Sudah diganti",
};
export function ReplacementBadge({ issue }: { issue: PpeIssue }) {
  if (issue.replacementState === "NONE")
    return <span className="text-muted-foreground text-xs">—</span>;
  const variant: Variant =
    issue.replacementState === "DUE"
      ? "warning"
      : issue.replacementState === "REPLACED"
        ? "muted"
        : "secondary";
  return <Badge variant={variant}>{REPLACEMENT_LABELS[issue.replacementState]}</Badge>;
}

/** ARS-D2: konfirmasi "Sudah saya terima" oleh karyawan. */
export function AckBadge({ at }: { at: string | null }) {
  return at ? (
    <span
      className="text-success-soft-foreground inline-flex items-center gap-1 text-xs"
      title={formatDateTime(at)}
    >
      <CheckCircle2 className="size-3.5" aria-hidden /> Diterima karyawan
    </span>
  ) : (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <Clock className="size-3.5" aria-hidden /> Belum dikonfirmasi
    </span>
  );
}

/** Harga dari string desimal API → "Rp 12.500.000" tanpa melewati `number` (PROMPT §4). */
export function formatPrice(value: string | null): string {
  if (!value) return "—";
  const [whole = "0", fraction = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = fraction.replace(/0+$/, "");
  return `Rp ${grouped}${cents ? `,${cents.padEnd(2, "0")}` : ""}`;
}

export const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
