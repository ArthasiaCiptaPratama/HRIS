import {
  APPROVAL_REQUEST_STATUS_LABELS,
  APPROVAL_STEP_LABELS,
  ATTENDANCE_DAY_STATUS_LABELS,
  ATTENDANCE_LABEL_TEXT,
  type AttendanceDayStatus,
  type AttendanceLabel,
  ROSTER_CHANGE_STATUS_LABELS,
  type RosterChangeStatus,
} from "@hris/shared";
import { Check, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Approval } from "../schemas";

// Potongan tampilan bersama Time Management: badge status/label, langkah approval, jam shift.

type BadgeVariant = "success" | "warning" | "destructive" | "muted" | "brand";

const DAY_VARIANT: Record<AttendanceDayStatus, BadgeVariant> = {
  OPEN: "brand",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  ALPHA: "destructive",
  LEAVE: "muted",
};

export function DayStatusBadge({ status }: { status: string }) {
  const key = status as AttendanceDayStatus;
  return (
    <Badge variant={DAY_VARIANT[key] ?? "muted"}>
      {ATTENDANCE_DAY_STATUS_LABELS[key] ?? status}
    </Badge>
  );
}

const CHANGE_VARIANT: Record<RosterChangeStatus, BadgeVariant> = {
  AWAITING_PEER: "brand",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "muted",
};

export function ChangeStatusBadge({ status }: { status: string }) {
  const key = status as RosterChangeStatus;
  return (
    <Badge variant={CHANGE_VARIANT[key] ?? "muted"}>
      {ROSTER_CHANGE_STATUS_LABELS[key] ?? status}
    </Badge>
  );
}

/** Label D-070 (tidak memblokir; alasan wajib) — warna peringatan, kecuali tanpa label. */
export function LabelChips({ labels, className }: { labels: string[]; className?: string }) {
  if (labels.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {labels.map((label) => (
        <Badge key={label} variant="warning" className="text-[11px]">
          {ATTENDANCE_LABEL_TEXT[label as AttendanceLabel] ?? label}
        </Badge>
      ))}
    </div>
  );
}

const STEP_ICON = { PENDING: Clock, APPROVED: Check, REJECTED: X } as const;

/** Langkah approval paralel (D-068): Atasan & HR, masing-masing dengan keputusan & catatan. */
export function ApprovalSteps({ approval }: { approval: Approval | null }) {
  if (!approval) return <p className="text-muted-foreground text-xs">Belum masuk approval.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs">
        Status approval:{" "}
        <span className="font-medium">{APPROVAL_REQUEST_STATUS_LABELS[approval.status]}</span>
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {approval.steps.map((step) => {
          const Icon = STEP_ICON[step.decision];
          return (
            <li
              key={step.kind}
              className={cn(
                "rounded-lg border p-2.5 text-xs",
                step.decision === "APPROVED" && "border-success/40 bg-success-soft/40",
                step.decision === "REJECTED" && "border-destructive/40 bg-destructive/5",
              )}
            >
              <p className="flex items-center gap-1.5 font-medium">
                <Icon className="size-3.5" aria-hidden />
                {APPROVAL_STEP_LABELS[step.kind]}
                {step.isOverride ? (
                  <Badge variant="muted" className="ml-auto text-[10px]">
                    Diambil alih
                  </Badge>
                ) : null}
              </p>
              <p className="text-muted-foreground mt-1">
                {step.decision === "PENDING" ? "Menunggu" : formatDateTime(step.decidedAt)}
              </p>
              {step.note ? <p className="mt-1">“{step.note}”</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Menit dari tengah malam → "HH:mm". */
export function hhmm(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:mm" → menit dari tengah malam (null bila format salah). */
export function parseHhmm(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Jam dalam zona waktu tertentu (mis. jam shift WITA). */
export function timeIn(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

const DAY_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
/** Tanggal kerja "YYYY-MM-DD" → "Sen, 12 Okt" (tanggal murni, tanpa geser zona). */
export function workDateLabel(date: string): string {
  return DAY_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

/** Tanggal hari ini (YYYY-MM-DD) di zona waktu tertentu. */
export function todayIn(timeZone = "Asia/Jakarta", base = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(base);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Warna sel shift: warna dari master shift, OFF abu-abu. */
export function shiftColor(code: string, shifts: { code: string; color: string | null }[]) {
  if (code === "OFF") return undefined;
  return shifts.find((s) => s.code === code)?.color ?? undefined;
}

const STEP_BADGE = {
  PENDING: { variant: "warning", text: "Menunggu" },
  APPROVED: { variant: "success", text: "Disetujui" },
  REJECTED: { variant: "destructive", text: "Ditolak" },
} as const;

/** Badge satu langkah approval (kolom "Atasan" / "HR" di tabel persetujuan). */
export function StepBadge({
  approval,
  kind,
}: {
  approval: Approval | null;
  kind: "MANAGER" | "HR";
}) {
  const step = approval?.steps.find((s) => s.kind === kind);
  if (!step) return <span className="text-muted-foreground text-xs">—</span>;
  const look = STEP_BADGE[step.decision];
  return (
    <Badge
      variant={look.variant}
      title={[step.note, step.isOverride ? "Diambil alih" : null].filter(Boolean).join(" · ")}
      className="whitespace-nowrap"
    >
      {look.text}
      {step.isOverride ? "*" : ""}
    </Badge>
  );
}

/** Ringkas "Atasan ✓ · HR menunggu" untuk kartu di HP. */
export function StepChips({ approval }: { approval: Approval | null }) {
  if (!approval) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {approval.steps.map((step) => (
        <span key={step.kind} className="flex items-center gap-1">
          <span className="text-muted-foreground">{APPROVAL_STEP_LABELS[step.kind]}</span>
          <StepBadge approval={approval} kind={step.kind} />
        </span>
      ))}
    </div>
  );
}

/** Latitude, longitude (+ altitude bila ada) dengan tautan peta OpenStreetMap. */
export function CoordLink({
  latitude,
  longitude,
  altitudeM,
}: {
  latitude: number;
  longitude: number;
  altitudeM?: number | null | undefined;
}) {
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`}
      target="_blank"
      rel="noreferrer"
      className="text-brand block font-mono text-[11px] leading-tight whitespace-nowrap hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-muted-foreground">Lat </span>
      {latitude.toFixed(6)}
      <br />
      <span className="text-muted-foreground">Long </span>
      {longitude.toFixed(6)}
      <br />
      <span className="text-muted-foreground">Alt </span>
      {altitudeM === null || altitudeM === undefined ? "—" : `${altitudeM} m`}
    </a>
  );
}
