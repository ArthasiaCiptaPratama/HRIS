import { Check, ExternalLink, ImageOff, PenLine, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
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
import { Textarea } from "@/components/ui/textarea";
import { useEmployees, useMasterData } from "@/features/employee/api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useDecideApproval, useManualPunch } from "../api";
import type { Approval, AttendanceDay } from "../schemas";
import { ApprovalSteps, DayStatusBadge, LabelChips, timeIn, todayIn } from "./display";
import { PunchChannelNote } from "./punch-channel-note";

// TM-D33: detail satu hari absen (panel Clock In / Clock Out, label, approval, input manual) dipakai
// bersama oleh DayDialog (tampilan "Per hari") dan dialog "Per karyawan". Dipindah apa adanya.

export const KINDS = ["IN", "OUT"] as const;
export const KIND_TEXT = { IN: "Clock In", OUT: "Clock Out" } as const;

export const isDecidable = (a: Approval | null | undefined): a is Approval =>
  a?.status === "PENDING" && (a.canDecide || a.canOverride);
export const punchOf = (day: AttendanceDay, kind: "IN" | "OUT") =>
  day.punches.find((p) => p.kind === kind);

/** TM-D7: jam istirahat (absen istirahat tanpa approval sendiri; dinilai lewat label & lembur). */
export function BreakLine({ day, tz }: { day: AttendanceDay; tz: string }) {
  const start = day.punches.find((p) => p.kind === "BREAK_START");
  const end = day.punches.find((p) => p.kind === "BREAK_END");
  if (!start) return null;
  return (
    <p className="text-muted-foreground text-[11px] tabular-nums">
      Istirahat {timeIn(start.at, tz)}–{end ? timeIn(end.at, tz) : "…"}
    </p>
  );
}

/** Panel satu absen di detail: foto, lokasi, label, alasan, approval & keputusan per absen. */
function PunchPanel({
  day,
  kind,
  tz,
  canManual,
  onManual,
}: {
  day: AttendanceDay;
  kind: "IN" | "OUT";
  tz: string;
  canManual: boolean;
  onManual: () => void;
}) {
  const punch = punchOf(day, kind);
  const decide = useDecideApproval();
  const [note, setNote] = useState("");
  const approval = punch?.approval ?? null;
  const canAct = isDecidable(approval);
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
        onSuccess: () => {
          toast.success(`${KIND_TEXT[kind]} ${decision === "APPROVED" ? "disetujui" : "ditolak"}.`);
          setNote("");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  if (!punch) {
    return (
      <div className="text-muted-foreground space-y-2 rounded-xl border border-dashed p-4 text-sm">
        <p>{KIND_TEXT[kind]}: belum ada.</p>
        {canManual ? (
          <Button size="sm" variant="outline" onClick={onManual}>
            <PenLine /> Input manual
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {KIND_TEXT[kind]} · <span className="tabular-nums">{timeIn(punch.at, tz)}</span>
        </p>
        {punch.source === "MANUAL" ? <Badge variant="muted">Input manual</Badge> : null}
      </div>
      <div className="bg-muted aspect-[3/4] overflow-hidden rounded-lg">
        {punch.selfieUrl ? (
          <img
            src={punch.selfieUrl}
            alt={`Selfie ${KIND_TEXT[kind]}`}
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="text-muted-foreground grid size-full place-items-center gap-1 p-4 text-center text-xs">
            <ImageOff className="size-5" />
            {punch.source === "MANUAL"
              ? "Dimasukkan manual oleh HR/SA (tanpa foto)."
              : punch.selfiePurged
                ? "Foto sudah dihapus (masa simpan habis)."
                : "Foto tidak tersedia."}
          </div>
        )}
      </div>
      {punch.latitude !== null && punch.longitude !== null ? (
        <>
          <p
            className={cn(
              "text-xs",
              punch.insideGeofence ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {punch.insideGeofence ? "Di dalam radius" : "Di luar radius"}
            {punch.distanceM !== null ? ` · ${punch.distanceM} m` : ""}
            {punch.accuracyM !== null ? ` · akurasi ±${punch.accuracyM} m` : ""}
            {punch.altitudeM !== null && punch.altitudeM !== undefined
              ? ` · alt ${punch.altitudeM} m`
              : ""}
          </p>
          <PunchChannelNote
            source={punch.source}
            channel={punch.channel}
            appVersion={punch.appVersion}
          />
          <a
            href={`https://www.openstreetmap.org/?mlat=${punch.latitude}&mlon=${punch.longitude}#map=17/${punch.latitude}/${punch.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="text-brand inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ExternalLink className="size-3" /> Lihat di peta
          </a>
        </>
      ) : null}
      <LabelChips labels={punch.labels} />
      {punch.reason ? (
        <p className="bg-muted rounded-md p-2 text-xs">Alasan: {punch.reason}</p>
      ) : null}
      <ApprovalSteps approval={approval} />
      {canAct ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={`Catatan keputusan ${KIND_TEXT[kind]}`}
            placeholder={
              overrideOnly ? "Alasan pengambilalihan (wajib)" : "Catatan (wajib bila ditolak)"
            }
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
              <Check /> Setujui {KIND_TEXT[kind]}
            </Button>
          </div>
        </div>
      ) : null}
      {canManual ? (
        <Button size="xs" variant="ghost" onClick={onManual}>
          <PenLine /> Perbaiki jam (manual)
        </Button>
      ) : null}
    </div>
  );
}

/** Isi detail satu hari: chip status/label/istirahat, dua panel absen, approval hari, dan input manual. */
export function DayDetailBody({
  day: d,
  tz,
  canManual,
}: {
  day: AttendanceDay;
  tz: string;
  canManual: boolean;
}) {
  const [manualKind, setManualKind] = useState<"IN" | "OUT" | null>(null);
  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DayStatusBadge status={d.status} />
          <LabelChips labels={d.labels} />
          <BreakLine day={d} tz={tz} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((kind) => (
            <PunchPanel
              key={kind}
              day={d}
              kind={kind}
              tz={tz}
              canManual={canManual}
              onManual={() => setManualKind(kind)}
            />
          ))}
        </div>
        {d.approval ? <ApprovalSteps approval={d.approval} /> : null}
      </div>
      {manualKind ? (
        <ManualDialog
          tz={tz}
          preset={{
            employee: d.employee,
            workDate: d.workDate,
            kind: manualKind,
            time: punchOf(d, manualKind) ? timeIn(punchOf(d, manualKind)?.at, tz) : "",
            // Bawaan: lokasi absen yang sudah tercatat, lalu lokasi hari kerja.
            workLocationId: punchOf(d, manualKind)?.location?.id ?? d.workLocation?.id ?? undefined,
          }}
          onClose={() => setManualKind(null)}
        />
      ) : null}
    </>
  );
}

/** D-073: autentikasi manual HR/SA — masukkan atau ganti jam Clock In / Clock Out (alasan wajib). */
export function ManualDialog({
  tz,
  preset,
  onClose,
}: {
  tz: string;
  preset?: {
    employee: { id: string; fullName: string; employeeNumber: string | null };
    workDate: string;
    kind: "IN" | "OUT";
    time: string;
    workLocationId?: string | undefined;
  };
  onClose: () => void;
}) {
  const manual = useManualPunch();
  const master = useMasterData();
  const [locationId, setLocationId] = useState(preset?.workLocationId ?? "");
  const [employee, setEmployee] = useState(preset?.employee ?? null);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const results = useEmployees(
    { page: 1, pageSize: 8, active: true, q: q || undefined, sort: "fullName:asc" },
    !preset && q.length >= 2,
  );
  const [workDate, setWorkDate] = useState(preset?.workDate ?? todayIn(tz));
  const [kind, setKind] = useState<"IN" | "OUT">(preset?.kind ?? "IN");
  const [time, setTime] = useState(
    preset?.time && preset.time !== "—" ? preset.time.replace(".", ":") : "",
  );
  const [reason, setReason] = useState("");
  const submit = () => {
    if (!employee) return;
    manual.mutate(
      { employeeId: employee.id, workDate, kind, time, reason, workLocationId: locationId },
      {
        onSuccess: () => {
          toast.success(
            `${KIND_TEXT[kind]} ${employee.fullName} disimpan (manual) — menunggu persetujuan.`,
          );
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Input manual absen</DialogTitle>
          <DialogDescription>
            Untuk data yang salah (salah pencet, HP rusak, GPS error). Tercatat di audit log dengan
            label MANUAL dan tetap memerlukan persetujuan. Bila ada atasan, input HR menuntaskan
            langkah HR. Tanpa atasan, pengajuan menunggu HR lain atau Super Admin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Karyawan</Label>
            {employee ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  {employee.fullName}{" "}
                  <span className="text-muted-foreground font-mono text-xs">
                    {employee.employeeNumber ?? ""}
                  </span>
                </span>
                {!preset ? (
                  <Button size="xs" variant="ghost" onClick={() => setEmployee(null)}>
                    Ganti
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <Input
                  placeholder="Cari nama atau NIP (min. 2 huruf)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {q.length >= 2 ? (
                  <ul className="max-h-40 divide-y overflow-y-auto rounded-md border text-sm">
                    {(results.data?.data ?? []).map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          className="hover:bg-muted w-full px-3 py-2 text-left"
                          onClick={() =>
                            setEmployee({
                              id: e.id,
                              fullName: e.fullName,
                              employeeNumber: e.employeeNumber,
                            })
                          }
                        >
                          {e.fullName}{" "}
                          <span className="text-muted-foreground font-mono text-xs">
                            {e.employeeNumber ?? ""}
                          </span>
                        </button>
                      </li>
                    ))}
                    {results.data?.data.length === 0 ? (
                      <li className="text-muted-foreground px-3 py-2">Tidak ditemukan.</li>
                    ) : null}
                  </ul>
                ) : null}
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 space-y-1.5 sm:col-span-1">
              <Label htmlFor="mn-date">Tanggal kerja</Label>
              <Input
                id="mn-date"
                type="date"
                value={workDate}
                max={todayIn(tz)}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <FormSelect
                value={kind}
                onChange={(v) => setKind(v as "IN" | "OUT")}
                placeholder="Jenis"
                options={KINDS.map((k) => ({ value: k, label: KIND_TEXT[k] }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mn-time">Jam</Label>
              <Input
                id="mn-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn-location">Lokasi absen</Label>
            <FormSelect
              id="mn-location"
              value={locationId}
              onChange={setLocationId}
              placeholder="Pilih lokasi"
              options={(master.data?.workLocations ?? []).map((l) => ({
                value: l.id,
                label: l.city ? `${l.name} · ${l.city}` : l.name,
              }))}
            />
            <p className="text-muted-foreground text-xs">
              Lokasi tempat karyawan bekerja pada jam ini — dicatat sebagai lokasi dipilih HR, bukan
              GPS HP.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn-reason">Alasan</Label>
            <Textarea
              id="mn-reason"
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
            disabled={
              !employee || !time || !locationId || reason.trim().length < 5 || manual.isPending
            }
            onClick={submit}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
