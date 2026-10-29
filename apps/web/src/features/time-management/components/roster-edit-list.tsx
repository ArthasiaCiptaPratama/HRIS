import { Check, Inbox, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useCancelRosterEdit, useDecideApproval, useRosterEdits } from "../api";
import type { RosterEdit } from "../schemas";
import { workDateLabel } from "./display";

// TM-D24: perubahan roster karyawan ber-crew oleh HR. Atasan & HR (bukan pengaju) memutus; pengaju bisa
// membatalkan selama menunggu. Ringkasan 14 hari jadwal lama → baru.

const STATUS: Record<RosterEdit["status"], { label: string; className: string }> = {
  PENDING: { label: "Menunggu persetujuan", className: "bg-amber-100 text-amber-900" },
  APPLIED: { label: "Diterapkan", className: "bg-emerald-100 text-emerald-900" },
  REJECTED: { label: "Ditolak", className: "bg-destructive/10 text-destructive" },
  CANCELLED: { label: "Dibatalkan", className: "bg-muted text-muted-foreground" },
};

export function useRosterEditInbox(enabled: boolean) {
  return useRosterEdits("inbox", enabled);
}

export function RosterEditList({ scope, enabled }: { scope: "inbox" | "mine"; enabled: boolean }) {
  const list = useRosterEdits(scope, enabled);
  if (list.isPending) return <Skeleton className="h-48 rounded-2xl" />;
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={
          scope === "inbox"
            ? "Tidak ada perubahan jadwal yang perlu diputuskan"
            : "Belum ada perubahan jadwal yang Anda ajukan"
        }
      />
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <EditCard row={row} scope={scope} />
        </li>
      ))}
    </ul>
  );
}

function EditCard({ row, scope }: { row: RosterEdit; scope: "inbox" | "mine" }) {
  const decide = useDecideApproval();
  const cancel = useCancelRosterEdit();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const status = STATUS[row.status];
  const changed = row.preview.filter((d) => d.from !== d.to);
  const act = async (decision: "APPROVED" | "REJECTED") => {
    if (!row.approval) return;
    try {
      await decide.mutateAsync({
        requestId: row.approval.id,
        decision,
        ...(decision === "REJECTED" ? { note } : {}),
      });
      toast.success(
        decision === "APPROVED"
          ? `Perubahan jadwal ${row.employee.fullName} disetujui.`
          : `Perubahan jadwal ${row.employee.fullName} ditolak.`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{row.employee.fullName}</p>
          <p className="text-muted-foreground text-xs">
            {row.summary} · mulai {workDateLabel(row.effectiveDate)}
            {row.appliedFrom && row.appliedFrom !== row.effectiveDate
              ? ` (diterapkan mulai ${workDateLabel(row.appliedFrom)})`
              : ""}
          </p>
        </div>
        <Badge className={cn("border-0", status.className)}>{status.label}</Badge>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-center text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Tanggal</th>
              {row.preview.map((d) => (
                <th key={d.date} className="px-1 py-1 font-normal whitespace-nowrap">
                  {workDateLabel(d.date).replace(",", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-2 py-1 text-left whitespace-nowrap">Lama</td>
              {row.preview.map((d) => (
                <td key={d.date} className="text-muted-foreground px-1 py-1 font-mono">
                  {d.from ?? "—"}
                </td>
              ))}
            </tr>
            <tr className="border-t">
              <td className="px-2 py-1 text-left font-medium whitespace-nowrap">Baru</td>
              {row.preview.map((d) => (
                <td
                  key={d.date}
                  className={cn(
                    "px-1 py-1 font-mono font-semibold",
                    d.from !== d.to &&
                      "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
                  )}
                >
                  {d.to ?? "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        {changed.length} dari {row.preview.length} hari pertama berubah. Pola berlanjut ke minggu
        berikutnya.
      </p>
      {row.status === "PENDING" && scope === "inbox" && row.approval?.canDecide ? (
        rejecting ? (
          <div className="space-y-2">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Alasan menolak (wajib)"
              aria-label="Alasan menolak"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setRejecting(false)}>
                Batal
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={note.trim().length === 0 || decide.isPending}
                onClick={() => void act("REJECTED")}
              >
                Tolak perubahan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
              <X /> Tolak
            </Button>
            <Button
              size="sm"
              variant="brand"
              disabled={decide.isPending}
              onClick={() => void act("APPROVED")}
            >
              <Check /> Setujui
            </Button>
          </div>
        )
      ) : null}
      {row.status === "PENDING" && row.createdByMe ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(row.id, {
                onSuccess: () => toast.success("Pengajuan dibatalkan; roster tidak berubah."),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            Batalkan pengajuan
          </Button>
        </div>
      ) : null}
    </div>
  );
}
