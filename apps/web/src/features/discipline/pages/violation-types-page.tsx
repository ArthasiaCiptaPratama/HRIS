import { createColumnHelper } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, ShieldAlert } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
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
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { useDisciplineMutations, useDisciplineSettings, useViolationTypes } from "../api";
import type { ViolationType } from "../schemas";

// ARS-D8/ARS-D12: Administrasi › Master Data › Jenis Pelanggaran — master jenis pelanggaran SP (SA / HR
// ber-grant employee.discipline.write) dan masa berlaku bawaan SP (ubah: SA saja).

const col = createColumnHelper<typeof tableFeaturesNone, ViolationType>();
const c = (def: Parameters<typeof col.display>[0]) => col.display(def) as DataColumn<ViolationType>;

export function ViolationTypesPage() {
  const me = useMe().data as Me;
  const canManage = access.manageWarningLetters(me);
  const list = useViolationTypes();
  const { saveType } = useDisciplineMutations();
  const [editing, setEditing] = useState<ViolationType | "new" | null>(null);
  const toggle = async (t: ViolationType) => {
    try {
      await saveType.mutateAsync({
        id: t.id,
        body: {
          code: t.code,
          name: t.name,
          linksAttendance: t.linksAttendance,
          isActive: !t.isActive,
        },
      });
      toast.success(t.isActive ? "Jenis diarsipkan." : "Jenis dipulihkan.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  // Tabel master kecil: kolom dibuat langsung tiap render (tanpa useMemo).
  const columns: DataColumn<ViolationType>[] = [
    c({
      id: "name",
      header: "Jenis pelanggaran",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium">
            {row.original.name}
            {row.original.isActive ? null : <Badge variant="muted">Diarsipkan</Badge>}
          </p>
          <p className="text-muted-foreground font-mono text-xs">{row.original.code}</p>
        </div>
      ),
    }),
    c({
      id: "alpha",
      header: "Bukti ALPHA",
      cell: ({ row }) =>
        row.original.linksAttendance ? (
          <Badge variant="secondary">Bisa ditautkan</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    }),
    c({
      id: "actions",
      header: "",
      meta: { className: "w-0 text-right" },
      cell: ({ row }) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Ubah ${row.original.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(row.original);
              }}
            >
              <Pencil />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={
                row.original.isActive
                  ? `Arsipkan ${row.original.name}`
                  : `Pulihkan ${row.original.name}`
              }
              onClick={(e) => {
                e.stopPropagation();
                void toggle(row.original);
              }}
            >
              {row.original.isActive ? <Archive /> : <ArchiveRestore />}
            </Button>
          </div>
        ) : null,
    }),
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Jenis Pelanggaran"
        description="Daftar jenis pelanggaran untuk surat peringatan. Uraian/kronologi tetap ditulis bebas per surat."
      />
      <ValiditySettings canChange={me.role === "SUPER_ADMIN"} />
      <ListPanel
        toolbar={
          canManage ? (
            <Button onClick={() => setEditing("new")}>
              <Plus /> Tambah jenis
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              Hanya SA atau HR dengan izin kelola SP yang bisa mengubah.
            </p>
          )
        }
      >
        <DataTable
          label="Jenis pelanggaran"
          columns={columns}
          data={list.data ?? []}
          loading={list.isPending}
          empty={{ icon: ShieldAlert, title: "Belum ada jenis pelanggaran" }}
        />
      </ListPanel>
      <TypeDialog
        value={editing}
        onClose={() => setEditing(null)}
        pending={saveType.isPending}
        onSave={async (body, id) => {
          await saveType.mutateAsync(id ? { id, body } : { body });
        }}
      />
    </div>
  );
}

/** ARS-D8: masa berlaku bawaan SP (PP 35/2021: 6 bulan); hanya SA yang mengubah. */
function ValiditySettings({ canChange }: { canChange: boolean }) {
  const settings = useDisciplineSettings();
  const { saveSettings } = useDisciplineMutations();
  const [months, setMonths] = useState("");
  const id = useId();
  useEffect(() => {
    if (settings.data) setMonths(String(settings.data.validityMonths));
  }, [settings.data]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveSettings.mutateAsync({ validityMonths: Number(months) });
      toast.success("Masa berlaku bawaan disimpan. Berlaku untuk SP yang diterbitkan berikutnya.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <form
      onSubmit={submit}
      className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end"
    >
      <div className="grid flex-1 gap-2">
        <Label htmlFor={`${id}-months`}>Masa berlaku SP (bulan)</Label>
        <p className="text-muted-foreground text-xs">
          Bawaan 6 bulan untuk semua tingkat (PP 35/2021). Ubah bila PP/PKB perusahaan berbeda; SP
          yang sudah terbit tidak ikut berubah.
        </p>
      </div>
      <Input
        id={`${id}-months`}
        type="number"
        min={1}
        max={24}
        className="sm:w-28"
        value={months}
        disabled={!canChange}
        onChange={(e) => setMonths(e.target.value)}
      />
      {canChange ? (
        <Button type="submit" disabled={saveSettings.isPending}>
          {saveSettings.isPending ? <Loader2 className="animate-spin" /> : null} Simpan
        </Button>
      ) : null}
    </form>
  );
}

function TypeDialog({
  value,
  onClose,
  pending,
  onSave,
}: {
  value: ViolationType | "new" | null;
  onClose: () => void;
  pending: boolean;
  onSave: (body: Record<string, unknown>, id?: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [linksAttendance, setLinksAttendance] = useState(false);
  const id = useId();
  const editing = value && value !== "new" ? value : null;
  useEffect(() => {
    setCode(editing?.code ?? "");
    setName(editing?.name ?? "");
    setLinksAttendance(editing?.linksAttendance ?? false);
  }, [editing]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSave(
        { code, name, linksAttendance, ...(editing ? { isActive: editing.isActive } : {}) },
        editing?.id,
      );
      toast.success("Jenis pelanggaran disimpan.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open={value !== null} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Ubah jenis pelanggaran" : "Tambah jenis pelanggaran"}
            </DialogTitle>
            <DialogDescription>Kode 2–10 huruf/angka, mis. MANGKIR, K3.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-code`}>Kode</Label>
            <Input
              id={`${id}-code`}
              required
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Nama</Label>
            <Input
              id={`${id}-name`}
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={linksAttendance}
              onChange={(e) => setLinksAttendance(e.target.checked)}
            />
            <span>
              Bisa ditautkan ke hari ALPHA
              <span className="text-muted-foreground block text-xs">
                Untuk pelanggaran mangkir: HR memilih hari ALPHA + surat pernyataan sebagai bukti.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
