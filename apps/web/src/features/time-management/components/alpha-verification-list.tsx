import {
  ALPHA_VERIFICATION_LABELS,
  ALPHA_VERIFICATION_OUTCOMES,
  type AlphaVerificationOutcome,
} from "@hris/shared";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { type AlphaVerification, useAlphaVerifications, useVerifyAlpha } from "../period-api";
import { workDateLabel } from "./display";

// TM-D13 Fase B (poin 16): atasan memverifikasi hari Alpha tim — Alpha / izin / sakit / tugas luar.

export function useAlphaInbox(enabled: boolean) {
  return useAlphaVerifications("inbox", enabled);
}

export function AlphaVerificationList({ enabled }: { enabled: boolean }) {
  const inbox = useAlphaInbox(enabled);
  if (inbox.isPending) return <Skeleton className="h-60 rounded-2xl" />;
  const rows = inbox.data ?? [];
  if (rows.length === 0) {
    return <EmptyState icon={Inbox} title="Tidak ada Alpha yang perlu diverifikasi" />;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.dayId}>
          <AlphaCard row={row} />
        </li>
      ))}
    </ul>
  );
}

function AlphaCard({ row }: { row: AlphaVerification }) {
  const verify = useVerifyAlpha();
  const [outcome, setOutcome] = useState<AlphaVerificationOutcome | null>(null);
  const [note, setNote] = useState("");
  const submit = async () => {
    if (!outcome) return;
    try {
      await verify.mutateAsync({ dayId: row.dayId, outcome, note });
      toast.success(`${row.employee.fullName}: ${ALPHA_VERIFICATION_LABELS[outcome]}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
      <div>
        <p className="truncate text-sm font-medium">{row.employee.fullName}</p>
        <p className="text-muted-foreground text-xs">
          Tidak absen {workDateLabel(row.workDate)}
          {row.shiftCode ? ` · shift ${row.shiftCode}` : ""} · batas pengajuan{" "}
          {workDateLabel(row.deadline)}
        </p>
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Hasil verifikasi</legend>
        {ALPHA_VERIFICATION_OUTCOMES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={outcome === value}
            onClick={() => setOutcome(value)}
            className={cn(
              "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
              outcome === value
                ? value === "CONFIRMED"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-brand bg-brand-soft text-brand"
                : "hover:bg-muted",
            )}
          >
            {ALPHA_VERIFICATION_LABELS[value]}
          </button>
        ))}
      </fieldset>
      <Textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Catatan (wajib), mis. sudah izin lewat telepon"
        aria-label="Catatan verifikasi"
      />
      <Button
        className="w-full"
        variant="brand"
        disabled={!outcome || note.trim().length < 3 || verify.isPending}
        onClick={() => void submit()}
      >
        Simpan verifikasi
      </Button>
    </div>
  );
}
