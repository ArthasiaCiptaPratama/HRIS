import { ClipboardList, Pencil, Plus, X } from "lucide-react";
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
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { EmployeePicker } from "@/features/employee/components/employee-picker";
import { errorMessage } from "@/lib/errors";
import { tmAccess } from "../access";
import { useTimezone } from "../api";
import {
  type OvertimeOrder,
  useCancelOvertimeOrder,
  useOvertimeOrders,
  useSetOvertimeOrder,
} from "../overtime-api";
import { timeIn, todayIn, workDateLabel } from "./display";

// TM-D17: perintah lembur (SPL) dari Atasan / HR sebelum dijalani. Lembur hanya diakui di dalam rentang SPL;
// tanpa SPL datang awal / pulang lambat tidak dihitung, dan hari OFF tidak bisa Clock In "Lembur hari libur".

export function OvertimeOrdersView({
  from,
  to,
  companyId,
  canCreate,
}: {
  from: string;
  to: string;
  companyId?: string;
  canCreate: boolean;
}) {
  const tz = useTimezone();
  const list = useOvertimeOrders({ from, to, ...(companyId ? { companyId } : {}) });
  const cancel = useCancelOvertimeOrder();
  const [editing, setEditing] = useState<OvertimeOrder | "new" | null>(null);
  const rows = list.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Lembur hanya dihitung bila ada perintah lembur sebelum dijalani. Hari kerja: isi jam mulai
          lebih awal dan/atau jam selesai lebih lambat. Hari libur (OFF): isi keduanya. Lembur yang
          terlanjur dijalani tanpa perintah: HR membuat perintah susulan selama periode belum
          ditutup.
        </p>
        {canCreate ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Perintah lembur
          </Button>
        ) : null}
      </div>
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <EmptyState
          icon={ClipboardList}
          title="Gagal memuat"
          description={errorMessage(list.error)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Belum ada perintah lembur"
          description="Perintah lembur dibuat atasan atau HR sebelum lembur dijalani."
        />
      ) : (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Karyawan</th>
                <th className="px-3 py-2 text-left font-medium">Tanggal kerja</th>
                <th className="px-3 py-2 text-left font-medium">Mulai lebih awal</th>
                <th className="px-3 py-2 text-left font-medium">Selesai lebih lambat</th>
                <th className="px-3 py-2 text-left font-medium">Alasan</th>
                <th className="px-3 py-2 text-right font-medium">Kontrol</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <p className="font-medium whitespace-nowrap">{r.employee.fullName}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {r.employee.employeeNumber ?? "—"}
                    </p>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {workDateLabel(r.workDate)}
                    {r.retroactive ? (
                      <Badge variant="warning" className="ml-2">
                        Susulan
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.startsAt ? timeIn(r.startsAt, tz) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.endsAt ? timeIn(r.endsAt, tz) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.reason}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.canManage ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Ubah perintah lembur ${r.employee.fullName}`}
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Batalkan perintah lembur ${r.employee.fullName}`}
                          disabled={cancel.isPending}
                          onClick={() =>
                            cancel.mutate(r.id, {
                              onSuccess: () => toast.success("Perintah lembur dibatalkan"),
                              onError: (e) => toast.error(errorMessage(e)),
                            })
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <OrderDialog row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function OrderDialog({ row, onClose }: { row: OvertimeOrder | null; onClose: () => void }) {
  const tz = useTimezone();
  const save = useSetOvertimeOrder();
  // Q1 opsi B: HR / SA boleh memilih tanggal lampau (SPL susulan, periode belum ditutup).
  const retroactiveAllowed = tmAccess.orderOvertimeRetroactive(useMe().data as Me);
  const [employee, setEmployee] = useState<{ id: string; fullName: string } | null>(
    row ? { id: row.employee.id, fullName: row.employee.fullName } : null,
  );
  const [workDate, setWorkDate] = useState(row?.workDate ?? todayIn(tz));
  const [startTime, setStartTime] = useState(row?.startsAt ? timeIn(row.startsAt, tz) : "");
  const [endTime, setEndTime] = useState(row?.endsAt ? timeIn(row.endsAt, tz) : "");
  const [reason, setReason] = useState(row?.reason ?? "");

  const submit = () => {
    if (!employee) return;
    save.mutate(
      {
        employeeId: employee.id,
        workDate,
        startTime: startTime || null,
        endTime: endTime || null,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Perintah lembur disimpan; karyawan diberi tahu");
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Ubah perintah lembur" : "Perintah lembur"}</DialogTitle>
          <DialogDescription>
            Berlaku langsung. Karyawan menerima notifikasi; batas absen pulang ikut jam selesai.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {row ? (
            <p className="text-sm font-medium">{row.employee.fullName}</p>
          ) : employee ? (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{employee.fullName}</span>
              <Button size="sm" variant="ghost" onClick={() => setEmployee(null)}>
                Ganti
              </Button>
            </div>
          ) : (
            <EmployeePicker
              active
              selectedId={null}
              onSelect={(id, e) => setEmployee({ id, fullName: e.fullName })}
              title="Pilih karyawan"
              className="h-64 min-h-0"
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ot-date">Tanggal kerja (tanggal roster)</Label>
            <Input
              id="ot-date"
              type="date"
              {...(retroactiveAllowed ? {} : { min: todayIn(tz) })}
              value={workDate}
              disabled={row !== null}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ot-start">Mulai lebih awal (opsional)</Label>
              <Input
                id="ot-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-end">Selesai lebih lambat (opsional)</Label>
              <Input
                id="ot-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ot-reason">Alasan</Label>
            <Textarea
              id="ot-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mis. bongkar muat kapal tertunda"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={submit}
            disabled={
              !employee || (!startTime && !endTime) || reason.trim().length < 3 || save.isPending
            }
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
