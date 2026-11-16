import { employeeHomebaseInputSchema, employeeHomebaseUpdateSchema } from "@hris/shared";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import {
  useAddEmployeeHomebase,
  useDeleteEmployeeHomebase,
  useMasterData,
  useUpdateEmployeeHomebase,
} from "../api";
import { todayIso } from "../labels";
import type { EmployeeDetail, EmployeeHomebaseEntry } from "../schemas";

// EMP-D6: Homebase / Point of Hire (POH) berlaku per tanggal. Nilai sekarang = baris riwayat terbaru.
// Homebase baru diisi lewat form Ubah data (employee-form-dialog → POST riwayat); dialog ini untuk koreksi/
// hapus satu baris riwayat dari tab Riwayat. API tetap penentu akses.

type Values = { homebaseId: string; effectiveFrom: string; decreeNumber: string; note: string };

const fromEntry = (entry: EmployeeHomebaseEntry | null): Values => ({
  homebaseId: entry?.homebase.id ?? "",
  effectiveFrom: entry?.effectiveFrom ?? todayIso(),
  decreeNumber: entry?.decreeNumber ?? "",
  note: entry?.note ?? "",
});

const FUTURE_MESSAGE = "Tanggal berlaku tidak boleh di masa depan.";

/** Status dialog + aksi per baris riwayat homebase; `dialogs` dirender sekali oleh pemanggil. */
export function useHomebaseEditor(employee: EmployeeDetail) {
  const canManage = employee.access.manage;
  const [editing, setEditing] = useState<EmployeeHomebaseEntry | null>(null);
  const [deleting, setDeleting] = useState<EmployeeHomebaseEntry | null>(null);
  const dialogs = canManage ? (
    <>
      <HomebaseDialog
        employee={employee}
        entry={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <DeleteHomebaseDialog
        employeeId={employee.id}
        entry={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  ) : null;
  return {
    canManage,
    menu: (entry: EmployeeHomebaseEntry) =>
      canManage ? (
        <HomebaseRowMenu
          label={`${entry.homebase.name} (${formatDate(entry.effectiveFrom)})`}
          onEdit={() => setEditing(entry)}
          onDelete={() => setDeleting(entry)}
        />
      ) : null,
    dialogs,
  };
}

function HomebaseRowMenu({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Aksi untuk homebase ${label}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Ubah
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Hapus
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HomebaseDialog({
  employee,
  entry,
  open,
  onOpenChange,
}: {
  employee: EmployeeDetail;
  /** null = tambah baris baru ("Ubah homebase"). */
  entry: EmployeeHomebaseEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const master = useMasterData();
  const add = useAddEmployeeHomebase();
  const update = useUpdateEmployeeHomebase();
  const pending = add.isPending || update.isPending;
  const [values, setValues] = useState<Values>(() => fromEntry(entry));
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  // Reset hanya saat dialog dibuka: refetch detail di latar tidak menimpa isian yang sedang diubah.
  // biome-ignore lint/correctness/useExhaustiveDependencies: entry dibaca saat dibuka saja
  useEffect(() => {
    if (open) {
      setValues(fromEntry(entry));
      setErrors({});
      setProblem(null);
    }
  }, [open]);

  const set = (key: keyof Values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const today = todayIso();
  // Homebase terarsip milik baris yang diubah tetap tampil (tidak bisa dipilih untuk baris lain).
  const options = (master.data?.homebases ?? []).map((h) => ({
    value: h.id,
    label: h.name,
    ...(h.city || h.province ? { hint: [h.city, h.province].filter(Boolean).join(", ") } : {}),
  }));
  if (entry && !options.some((o) => o.value === entry.homebase.id)) {
    options.push({ value: entry.homebase.id, label: `${entry.homebase.name} (diarsipkan)` });
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const parsed = employeeHomebaseInputSchema.safeParse(values);
    const next: Partial<Record<keyof Values, string>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof Values;
        next[key] ??= issue.message;
      }
    } else if (parsed.data.effectiveFrom > today) {
      next.effectiveFrom = FUTURE_MESSAGE;
    }
    setErrors(next);
    if (!parsed.success || Object.keys(next).length > 0) return;
    try {
      if (entry) {
        // Koreksi: kirim field yang berubah saja.
        const original = employeeHomebaseInputSchema.parse(fromEntry(entry));
        const changes = Object.fromEntries(
          Object.entries(parsed.data).filter(
            ([key, value]) => original[key as keyof typeof original] !== value,
          ),
        );
        const body = employeeHomebaseUpdateSchema.safeParse(changes);
        if (!body.success) {
          onOpenChange(false);
          return;
        }
        await update.mutateAsync({ employeeId: employee.id, entryId: entry.id, body: body.data });
        toast.success("Riwayat homebase diperbarui.");
      } else {
        await add.mutateAsync({ employeeId: employee.id, body: parsed.data });
        toast.success("Homebase diperbarui.");
      }
      onOpenChange(false);
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };

  const field = (key: keyof Values, label: string, input: ReactNode, optional = false) => (
    <div className="space-y-2">
      <Label htmlFor={`hb-${key}`}>
        {label}
        {optional ? <span className="text-muted-foreground font-normal"> (opsional)</span> : null}
      </Label>
      {input}
      {errors[key] ? <p className="text-destructive text-xs">{errors[key]}</p> : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Ubah riwayat homebase" : "Ubah homebase"}</DialogTitle>
          <DialogDescription>
            {entry
              ? "Koreksi satu baris riwayat. Homebase sekarang mengikuti baris dengan tanggal berlaku terbaru."
              : `Homebase (POH) baru untuk ${employee.fullName}, berlaku mulai tanggal yang dipilih. Riwayat lama tetap tersimpan.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {field(
            "homebaseId",
            "Homebase",
            <FormSelect
              id="hb-homebaseId"
              value={values.homebaseId}
              onChange={set("homebaseId")}
              placeholder={master.isPending ? "Memuat…" : "Pilih homebase"}
              options={options}
              invalid={Boolean(errors.homebaseId)}
            />,
          )}
          {field(
            "effectiveFrom",
            "Berlaku mulai",
            <Input
              id="hb-effectiveFrom"
              type="date"
              max={today}
              value={values.effectiveFrom}
              onChange={(event) => set("effectiveFrom")(event.target.value)}
              aria-invalid={Boolean(errors.effectiveFrom)}
            />,
          )}
          {field(
            "decreeNumber",
            "No. SK",
            <Input
              id="hb-decreeNumber"
              maxLength={60}
              value={values.decreeNumber}
              onChange={(event) => set("decreeNumber")(event.target.value)}
              aria-invalid={Boolean(errors.decreeNumber)}
            />,
            true,
          )}
          {field(
            "note",
            "Catatan",
            <Textarea
              id="hb-note"
              rows={2}
              maxLength={500}
              value={values.note}
              onChange={(event) => set("note")(event.target.value)}
              aria-invalid={Boolean(errors.note)}
            />,
            true,
          )}
          {problem ? (
            <Alert variant="destructive">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" variant="brand" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteHomebaseDialog({
  employeeId,
  entry,
  onOpenChange,
}: {
  employeeId: string;
  entry: EmployeeHomebaseEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteEmployeeHomebase();
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (entry) setProblem(null);
  }, [entry]);
  if (!entry) return null;
  const confirm = async () => {
    try {
      await remove.mutateAsync({ employeeId, entryId: entry.id });
      toast.success("Baris riwayat homebase dihapus.");
      onOpenChange(false);
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hapus riwayat homebase?</DialogTitle>
          <DialogDescription>
            Baris "{entry.homebase.name}" berlaku mulai {formatDate(entry.effectiveFrom)} dihapus.
            Homebase sekarang dihitung ulang dari baris yang tersisa.
          </DialogDescription>
        </DialogHeader>
        {problem ? (
          <Alert variant="destructive">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => void confirm()}>
            {remove.isPending ? "Menghapus…" : "Hapus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
