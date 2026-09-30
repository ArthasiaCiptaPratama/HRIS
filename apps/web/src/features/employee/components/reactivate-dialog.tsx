import { EXIT_REASON_LABELS } from "@hris/shared";
import { Info, RotateCcw } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useMasterData, useReactivateEmployee } from "../api";
import { todayIso } from "../labels";
import type { EmployeeListItem } from "../schemas";
import { EmployeeAvatar } from "./employee-avatar";

export function ReactivateDialog({
  employee,
  onOpenChange,
}: {
  employee: EmployeeListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const master = useMasterData();
  const mutation = useReactivateEmployee();
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [statusId, setStatusId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (employee) {
      setEffectiveDate(todayIso());
      setStatusId(employee.employmentStatus.id);
      setNote("");
    }
  }, [employee]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!employee) return;
    try {
      await mutation.mutateAsync({
        id: employee.id,
        effectiveDate,
        ...(statusId && statusId !== employee.employmentStatus.id
          ? { employmentStatusId: statusId }
          : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(`${employee.fullName} aktif kembali.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Dialog open={employee !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aktifkan kembali karyawan</DialogTitle>
          <DialogDescription>
            Karyawan kembali tampil di Data Karyawan Aktif. Riwayat keluar tetap tersimpan.
          </DialogDescription>
        </DialogHeader>
        {employee ? (
          <form onSubmit={submit} className="space-y-5">
            <div className="bg-muted/40 flex items-center gap-3 rounded-xl p-3">
              <EmployeeAvatar name={employee.fullName} photoUrl={employee.photoUrl} inactive />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{employee.fullName}</p>
                <p className="text-muted-foreground truncate text-xs">
                  Keluar {formatDate(employee.endDate)}
                  {employee.exitReason ? ` · ${EXIT_REASON_LABELS[employee.exitReason]}` : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="re-date">Tanggal efektif</Label>
                <Input
                  id="re-date"
                  type="date"
                  required
                  min={employee.joinDate}
                  value={effectiveDate}
                  onChange={(event) => setEffectiveDate(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="re-status">Status kepegawaian</Label>
                <FormSelect
                  id="re-status"
                  value={statusId}
                  onChange={setStatusId}
                  placeholder="Pilih status"
                  options={(master.data?.employmentStatuses ?? []).map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="re-note">
                Catatan <span className="text-muted-foreground font-normal">(opsional)</span>
              </Label>
              <Textarea
                id="re-note"
                rows={2}
                maxLength={500}
                placeholder="Mis. direkrut kembali untuk proyek baru"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <Alert>
              <Info />
              <AlertDescription>
                <p>
                  Akun login HRIS karyawan ini <strong>tidak</strong> ikut aktif otomatis. Aktifkan
                  lewat menu Administrasi → Akun bila diperlukan.
                </p>
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type="submit" variant="brand" disabled={mutation.isPending}>
                <RotateCcw /> {mutation.isPending ? "Memproses…" : "Aktifkan kembali"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
