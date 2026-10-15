import {
  WARNING_LETTER_STATE_LABELS,
  WARNING_LEVEL_LABELS,
  type WarningLetterState,
  type WarningLevel,
} from "@hris/shared";
import { CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

// ARS-D7–D13: badge bersama halaman SP, tab SP detail karyawan & Layanan Mandiri. Tidak mengimpor fitur
// lain (cegah dependensi melingkar).

type Variant = "success" | "warning" | "destructive" | "muted" | "brand" | "secondary";

const LEVEL_VARIANT: Record<WarningLevel, Variant> = {
  SP1: "warning",
  SP2: "warning",
  SP3: "destructive",
};
export function LevelBadge({ level }: { level: WarningLevel }) {
  return <Badge variant={LEVEL_VARIANT[level]}>{WARNING_LEVEL_LABELS[level]}</Badge>;
}

const STATE_VARIANT: Record<WarningLetterState, Variant> = {
  DRAFT: "secondary",
  ACTIVE: "brand",
  CONFIRMED: "success",
  EXPIRED: "muted",
  REVOKED: "muted",
};
export function StateBadge({ state }: { state: WarningLetterState }) {
  return (
    <Badge
      variant={STATE_VARIANT[state]}
      className={state === "REVOKED" ? "line-through decoration-1" : undefined}
    >
      {WARNING_LETTER_STATE_LABELS[state]}
    </Badge>
  );
}

/** ARS-D9: jejak konfirmasi atasan ("Sudah disampaikan") & karyawan ("Sudah menerima"). */
export function ConfirmBadge({ label, at }: { label: string; at: string | null }) {
  return at ? (
    <Badge variant="success" title={formatDateTime(at)}>
      <CheckCircle2 /> {label}
    </Badge>
  ) : (
    <Badge variant="muted">
      <Clock /> Belum {label.toLowerCase()}
    </Badge>
  );
}
