import { OFF_CODE } from "@hris/shared";
import { ArrowRightLeft, Check, Inbox, Plus, Repeat, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { tmAccess } from "../access";
import {
  useCrews,
  useDecideApproval,
  useRosterChangeActions,
  useRosterChanges,
  useShifts,
} from "../api";
import {
  ApprovalSteps,
  addDays,
  ChangeStatusBadge,
  todayIn,
  workDateLabel,
} from "../components/display";
import type { RosterChange } from "../schemas";
import { useRosterCompany } from "./roster-page";

// D-068: pengajuan perubahan / tukar shift. Tukar: rekan setuju dulu, lalu Atasan + HR paralel; saat
// disetujui roster diperbarui otomatis (sumber "perubahan disetujui").

export function RosterChangesPage() {
  const me = useMe().data as Me;
  const canRequest = me.employeeId !== null;
  const canDecide = tmAccess.decideRosterChanges(me);
  const mine = useRosterChanges("mine", canRequest);
  const inbox = useRosterChanges("inbox", canDecide);
  const [createOpen, setCreateOpen] = useState(false);
  const consents = (mine.data ?? []).filter((c) => c.awaitingMyConsent);
  const own = (mine.data ?? []).filter((c) => !c.awaitingMyConsent);
  const defaultTab =
    canDecide && (inbox.data?.length ?? 0) > 0 ? "inbox" : canRequest ? "mine" : "inbox";

  return (
    <div>
      <PageHeader
        title="Perubahan Roster"
        description="Ajukan ganti shift atau tukar dengan rekan. Tukar shift menunggu persetujuan rekan, lalu Atasan dan HR."
        actions={
          canRequest ? (
            <Button variant="brand" onClick={() => setCreateOpen(true)}>
              <Plus /> Ajukan perubahan
            </Button>
          ) : null
        }
      />
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {canRequest ? <TabsTrigger value="mine">Pengajuan saya</TabsTrigger> : null}
          {canRequest ? (
            <TabsTrigger value="consent">
              Permintaan tukar{consents.length ? ` (${consents.length})` : ""}
            </TabsTrigger>
          ) : null}
          {canDecide ? (
            <TabsTrigger value="inbox">
              Perlu keputusan{inbox.data?.length ? ` (${inbox.data.length})` : ""}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="mine" className="mt-4">
          <ChangeList query={mine} rows={own} empty="Belum ada pengajuan." mode="mine" />
        </TabsContent>
        <TabsContent value="consent" className="mt-4">
          <ChangeList
            query={mine}
            rows={consents}
            empty="Tidak ada permintaan tukar shift."
            mode="consent"
          />
        </TabsContent>
        <TabsContent value="inbox" className="mt-4">
          <ChangeList
            query={inbox}
            rows={inbox.data ?? []}
            empty="Tidak ada yang perlu diputuskan."
            mode="inbox"
          />
        </TabsContent>
      </Tabs>
      {createOpen ? <CreateDialog me={me} onClose={() => setCreateOpen(false)} /> : null}
    </div>
  );
}

function ChangeList({
  query,
  rows,
  empty,
  mode,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown };
  rows: RosterChange[];
  empty: string;
  mode: "mine" | "consent" | "inbox";
}) {
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.isError)
    return <EmptyState icon={Inbox} title="Gagal memuat" description={errorMessage(query.error)} />;
  if (rows.length === 0) return <EmptyState icon={Inbox} title={empty} />;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <ChangeCard key={row.id} row={row} mode={mode} />
      ))}
    </ul>
  );
}

function ChangeCard({ row, mode }: { row: RosterChange; mode: "mine" | "consent" | "inbox" }) {
  const { respond, cancel } = useRosterChangeActions();
  const decide = useDecideApproval();
  const [note, setNote] = useState("");
  const approval = row.approval;
  const canAct =
    mode === "inbox" &&
    approval?.status === "PENDING" &&
    (approval.canDecide || approval.canOverride);
  const overrideOnly = Boolean(approval && !approval.canDecide && approval.canOverride);
  const run = (decision: "APPROVED" | "REJECTED") => {
    if (!approval) return;
    if ((decision === "REJECTED" || overrideOnly) && !note.trim()) {
      toast.error(
        decision === "REJECTED" ? "Tulis alasan penolakan." : "Tulis alasan pengambilalihan.",
      );
      return;
    }
    decide.mutate(
      { requestId: approval.id, decision, note: note.trim() || undefined },
      {
        onSuccess: () =>
          toast.success(decision === "APPROVED" ? "Perubahan disetujui." : "Perubahan ditolak."),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  return (
    <li className="bg-card space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {row.employee.fullName}{" "}
            <span className="text-muted-foreground font-mono text-xs">
              {row.employee.employeeNumber ?? ""}
            </span>
          </p>
          <p className="text-sm">
            {workDateLabel(row.date)} ·{" "}
            {row.peer ? (
              <>
                <Repeat className="inline size-3.5" /> tukar dengan <b>{row.peer.fullName}</b> (
                {row.fromCode} ⇄ {row.toCode})
              </>
            ) : (
              <>
                <span className="font-mono">{row.fromCode}</span>{" "}
                <ArrowRightLeft className="inline size-3.5" />{" "}
                <span className="font-mono">{row.toCode}</span>
              </>
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            Diajukan {formatDateTime(row.createdAt)} · “{row.reason}”
          </p>
        </div>
        <ChangeStatusBadge status={row.status} />
      </div>
      {approval ? <ApprovalSteps approval={approval} /> : null}
      {mode === "consent" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={respond.isPending}
            onClick={() =>
              respond.mutate(
                { id: row.id, accept: false },
                {
                  onSuccess: () => toast.success("Permintaan tukar ditolak."),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <X /> Tolak
          </Button>
          <Button
            size="sm"
            variant="brand"
            disabled={respond.isPending}
            onClick={() =>
              respond.mutate(
                { id: row.id, accept: true },
                {
                  onSuccess: () => toast.success("Anda setuju; menunggu Atasan & HR."),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <Check /> Setuju tukar
          </Button>
        </div>
      ) : null}
      {mode === "mine" && row.canCancel ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={cancel.isPending}
          onClick={() =>
            cancel.mutate(row.id, {
              onSuccess: () => toast.success("Pengajuan dibatalkan."),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          Batalkan pengajuan
        </Button>
      ) : null}
      {canAct ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              overrideOnly ? "Alasan pengambilalihan (wajib)" : "Catatan (wajib bila ditolak)"
            }
            aria-label="Catatan keputusan"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => run("REJECTED")}
            >
              <X /> Tolak
            </Button>
            <Button
              size="sm"
              variant="brand"
              disabled={decide.isPending}
              onClick={() => run("APPROVED")}
            >
              <Check /> Setujui
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function CreateDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const { create } = useRosterChangeActions();
  const { companyId } = useRosterCompany();
  const shifts = useShifts(companyId || undefined);
  const crews = useCrews(companyId || undefined);
  const [mode, setMode] = useState<"change" | "swap">("change");
  const [date, setDate] = useState(addDays(todayIn(), 1));
  const [toCode, setToCode] = useState("");
  const [peerId, setPeerId] = useState("");
  const [reason, setReason] = useState("");
  const peers = (crews.data ?? [])
    .flatMap((c) => c.members.map((m) => ({ ...m, crew: c.name })))
    .filter((m) => m.employeeId !== me.employeeId);
  const submit = async () => {
    try {
      await create.mutateAsync({
        date,
        reason,
        ...(mode === "change" ? { toCode } : { peerEmployeeId: peerId }),
      });
      toast.success(
        mode === "swap"
          ? "Permintaan tukar dikirim ke rekan."
          : "Pengajuan dikirim ke Atasan & HR.",
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const valid =
    reason.trim().length >= 3 && (mode === "change" ? Boolean(toCode) : Boolean(peerId));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajukan perubahan roster</DialogTitle>
          <DialogDescription>
            Hari yang absennya sudah disetujui tidak bisa diubah.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "change" | "swap")}>
            <TabsList className="w-full">
              <TabsTrigger value="change" className="flex-1">
                Ganti shift
              </TabsTrigger>
              <TabsTrigger value="swap" className="flex-1">
                Tukar dengan rekan
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="space-y-1.5">
            <Label htmlFor="rc-date">Tanggal</Label>
            <Input
              id="rc-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {mode === "change" ? (
            <div className="space-y-1.5">
              <Label>Shift tujuan</Label>
              <FormSelect
                value={toCode}
                onChange={setToCode}
                placeholder="Pilih shift"
                options={[
                  ...(shifts.data ?? [])
                    .filter((s) => !s.archived)
                    .map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` })),
                  { value: OFF_CODE, label: "OFF · Libur" },
                ]}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Rekan</Label>
              <FormSelect
                value={peerId}
                onChange={setPeerId}
                placeholder={peers.length ? "Pilih rekan" : "Tidak ada rekan di crew"}
                options={peers.map((p) => ({
                  value: p.employeeId,
                  label: `${p.fullName}${p.employeeNumber ? ` (${p.employeeNumber})` : ""} · ${p.crew}`,
                }))}
              />
              <p className="text-muted-foreground text-xs">
                Shift Anda dan rekan pada tanggal itu saling ditukar.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rc-reason">Alasan</Label>
            <Textarea
              id="rc-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={!valid || create.isPending}
            onClick={() => void submit()}
          >
            Kirim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
