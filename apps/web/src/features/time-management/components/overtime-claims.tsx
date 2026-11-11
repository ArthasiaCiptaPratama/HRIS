import { OVERTIME_CLAIM_STATUS_LABELS } from "@hris/shared";
import { Check, ClipboardList, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { useTimezone } from "../api";
import {
  type OvertimeClaim,
  useCancelOvertimeClaim,
  useCreateOvertimeClaim,
  useDecideOvertimeClaim,
  useOvertimeClaims,
} from "../overtime-api";
import { timeIn, todayIn, workDateLabel } from "./display";

// TM-D27: absen pulang bebas s.d. 24:00 dan jam setelah jadwal pulang TIDAK otomatis lembur. Karyawan
// mengajukan lembur; HR menetapkan jam yang diakui & menyetujui → perintah lembur susulan (SPL) → jam
// aktual di dalam rentang itu dihitung sebagai usulan lembur (Atasan + HR).

const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const STATUS_TONE: Record<
  OvertimeClaim["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  CANCELLED: "outline",
};

const range = (start: string | null, end: string | null) =>
  [start ? `mulai ${start}` : null, end ? `s.d. ${end}` : null].filter(Boolean).join(" ") || "—";

function ClaimRow({
  claim,
  tz,
  showEmployee,
  actions,
}: {
  claim: OvertimeClaim;
  tz: string;
  showEmployee: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <li className="bg-card space-y-1 rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {showEmployee ? `${claim.employee.fullName} · ` : ""}
          {workDateLabel(claim.workDate)}
        </span>
        <Badge variant={STATUS_TONE[claim.status]}>
          {OVERTIME_CLAIM_STATUS_LABELS[claim.status]}
        </Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        Absen {timeIn(claim.checkInAt, tz)}–
        {claim.checkOutAt ? timeIn(claim.checkOutAt, tz) : "belum pulang"} · Diajukan{" "}
        {range(claim.startTime, claim.endTime)}
        {claim.status === "APPROVED"
          ? ` · Diakui ${range(claim.approvedStartTime, claim.approvedEndTime)}`
          : ""}
      </p>
      <p>“{claim.reason}”</p>
      {claim.decisionNote ? (
        <p className="text-muted-foreground text-xs">Catatan HR: {claim.decisionNote}</p>
      ) : null}
      {actions ? <div className="flex justify-end gap-2 pt-1">{actions}</div> : null}
    </li>
  );
}

/** Karyawan: ajukan lembur & daftar pengajuan 30 hari terakhir (app absen). */
export function MyOvertimeClaims() {
  const tz = useTimezone();
  const today = todayIn(tz);
  const list = useOvertimeClaims({ scope: "me", from: addDays(today, -30), to: today });
  const create = useCreateOvertimeClaim();
  const cancel = useCancelOvertimeClaim();
  const [form, setForm] = useState({ workDate: today, startTime: "", endTime: "", reason: "" });
  const submit = async () => {
    try {
      await create.mutateAsync({
        workDate: form.workDate,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        reason: form.reason,
      });
      toast.success("Pengajuan lembur terkirim ke HR.");
      setForm({ ...form, startTime: "", endTime: "", reason: "" });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="space-y-4">
      <section className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Plus className="size-4" /> Ajukan lembur
        </h2>
        <p className="text-muted-foreground text-xs">
          Jam setelah jadwal pulang tidak otomatis dihitung lembur. Ajukan di sini; HR menetapkan
          jam yang diakui lalu menyetujui. Hari kerja: isi jam mulai lebih awal dan/atau selesai
          lebih lambat. Hari libur: isi keduanya.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor="oc-date">Tanggal kerja</Label>
            <Input
              id="oc-date"
              type="date"
              max={today}
              value={form.workDate}
              onChange={(e) => setForm({ ...form, workDate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oc-start">Mulai lebih awal</Label>
            <Input
              id="oc-start"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oc-end">Selesai lebih lambat</Label>
            <Input
              id="oc-end"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="oc-reason">Alasan</Label>
          <Textarea
            id="oc-reason"
            rows={2}
            value={form.reason}
            placeholder="Contoh: menyelesaikan bongkar muat kapal"
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <Button
          variant="brand"
          className="w-full"
          disabled={
            create.isPending || form.reason.trim().length < 3 || (!form.startTime && !form.endTime)
          }
          onClick={() => void submit()}
        >
          Kirim pengajuan
        </Button>
      </section>
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">Pengajuan saya (30 hari)</h2>
        {list.isPending ? (
          <Skeleton className="h-24" />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState icon={ClipboardList} title="Belum ada pengajuan lembur" />
        ) : (
          <ul className="space-y-2">
            {(list.data ?? []).map((c) => (
              <ClaimRow
                key={c.id}
                claim={c}
                tz={tz}
                showEmployee={false}
                actions={
                  c.canCancel ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancel.isPending}
                      onClick={() =>
                        cancel.mutate(c.id, {
                          onSuccess: () => toast.success("Pengajuan dibatalkan."),
                          onError: (e) => toast.error(errorMessage(e)),
                        })
                      }
                    >
                      <X className="size-4" /> Batalkan
                    </Button>
                  ) : null
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** HR / atasan: pengajuan lembur karyawan dalam cakupan; HR PT / SA memutus & menetapkan jam yang diakui. */
export function OvertimeClaimsView({
  from,
  to,
  companyId,
}: {
  from: string;
  to: string;
  companyId?: string;
}) {
  const tz = useTimezone();
  const list = useOvertimeClaims({ scope: "all", from, to, ...(companyId ? { companyId } : {}) });
  const [deciding, setDeciding] = useState<OvertimeClaim | null>(null);
  const rows = list.data ?? [];
  if (list.isPending) return <Skeleton className="h-60" />;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Absen pulang bebas s.d. 24:00 dan tidak otomatis menjadi lembur. Karyawan mengajukan lembur;
        HR menetapkan jam yang diakui lalu menyetujui — menjadi perintah lembur susulan dan usulan
        lembur hari itu dihitung ulang.
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Belum ada pengajuan lembur karyawan" />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {rows.map((c) => (
            <ClaimRow
              key={c.id}
              claim={c}
              tz={tz}
              showEmployee
              actions={
                c.canDecide ? (
                  <Button size="sm" variant="brand" onClick={() => setDeciding(c)}>
                    <Check className="size-4" /> Putuskan
                  </Button>
                ) : null
              }
            />
          ))}
        </ul>
      )}
      {deciding ? <DecideDialog claim={deciding} onClose={() => setDeciding(null)} /> : null}
    </div>
  );
}

function DecideDialog({ claim, onClose }: { claim: OvertimeClaim; onClose: () => void }) {
  const decide = useDecideOvertimeClaim();
  const [startTime, setStartTime] = useState(claim.startTime ?? "");
  const [endTime, setEndTime] = useState(claim.endTime ?? "");
  const [note, setNote] = useState("");
  const send = async (decision: "APPROVED" | "REJECTED") => {
    try {
      await decide.mutateAsync({
        id: claim.id,
        body: {
          decision,
          startTime: decision === "APPROVED" ? startTime || null : null,
          endTime: decision === "APPROVED" ? endTime || null : null,
          note: note.trim() || null,
        },
      });
      toast.success(decision === "APPROVED" ? "Lembur disetujui." : "Pengajuan ditolak.");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Lembur {claim.employee.fullName} · {workDateLabel(claim.workDate)}
          </DialogTitle>
          <DialogDescription>
            Tetapkan jam lembur yang diakui (boleh berbeda dari yang diajukan). Disetujui → perintah
            lembur susulan; jam absen aktual di dalam rentang ini dihitung lembur.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="ocd-start">Mulai lebih awal</Label>
            <Input
              id="ocd-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ocd-end">Selesai lebih lambat</Label>
            <Input
              id="ocd-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ocd-note">Catatan (wajib bila ditolak)</Label>
          <Textarea id="ocd-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={decide.isPending || note.trim().length === 0}
            onClick={() => void send("REJECTED")}
          >
            Tolak
          </Button>
          <Button
            variant="brand"
            disabled={decide.isPending || (!startTime && !endTime)}
            onClick={() => void send("APPROVED")}
          >
            Setujui
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
