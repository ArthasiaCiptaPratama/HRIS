import { createColumnHelper } from "@tanstack/react-table";
import { Archive, ArchiveRestore, HardHat, Laptop, Loader2, Pencil, Plus } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { useAssetCategories, useAssetMutations, usePpeTypes } from "../api";
import { Field } from "../components/asset-actions";
import type { AssetCategory, PpeType } from "../schemas";

// ARS-D1/D5/D6: Administrasi › Master Data › Aset & APD — kategori aset per unit dan jenis APD/seragam
// (masa ganti, wajib kembali). Kelola: SA / HR ber-grant asset.manage; HR lain lihat.

const catCol = createColumnHelper<typeof tableFeaturesNone, AssetCategory>();
const cc = (def: Parameters<typeof catCol.display>[0]) =>
  catCol.display(def) as DataColumn<AssetCategory>;
const ppeCol = createColumnHelper<typeof tableFeaturesNone, PpeType>();
const pc = (def: Parameters<typeof ppeCol.display>[0]) =>
  ppeCol.display(def) as DataColumn<PpeType>;
const nameCell = (name: string, code: string, active: boolean) => (
  <div className="min-w-0">
    <p className="flex items-center gap-2 truncate font-medium">
      {name}
      {active ? null : <Badge variant="muted">Diarsipkan</Badge>}
    </p>
    <p className="text-muted-foreground font-mono text-xs">{code}</p>
  </div>
);

export function AssetMastersPage() {
  const me = useMe().data as Me;
  const canManage = access.manageAssets(me);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "apd" ? "apd" : "kategori";
  return (
    <div>
      <PageHeader
        title="Aset & APD"
        description="Kategori aset per unit (laptop, HP, radio HT, kendaraan, alat) dan jenis APD/seragam yang dibagikan ke karyawan."
      />
      <Tabs value={tab} onValueChange={(next) => setParams({ tab: next })} className="gap-4">
        <TabsList>
          <TabsTrigger value="kategori">
            <Laptop /> Kategori aset
          </TabsTrigger>
          <TabsTrigger value="apd">
            <HardHat /> Jenis APD
          </TabsTrigger>
        </TabsList>
        <TabsContent value="kategori">
          <Categories canManage={canManage} />
        </TabsContent>
        <TabsContent value="apd">
          <PpeTypes canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Categories({ canManage }: { canManage: boolean }) {
  const list = useAssetCategories();
  const { saveCategory } = useAssetMutations();
  const [editing, setEditing] = useState<AssetCategory | "new" | null>(null);
  const toggle = async (c: AssetCategory) => {
    try {
      await saveCategory.mutateAsync({
        id: c.id,
        body: {
          code: c.code,
          name: c.name,
          requiresSerial: c.requiresSerial,
          isActive: !c.isActive,
        },
      });
      toast.success(c.isActive ? "Kategori diarsipkan." : "Kategori dipulihkan.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  // Tabel master kecil: kolom dibuat langsung tiap render (tanpa useMemo).
  const columns: DataColumn<AssetCategory>[] = [
    cc({
      id: "name",
      header: "Kategori",
      cell: ({ row }) => nameCell(row.original.name, row.original.code, row.original.isActive),
    }),
    cc({
      id: "serial",
      header: "Nomor seri",
      cell: ({ row }) => (row.original.requiresSerial ? "Wajib" : "Opsional"),
    }),
    cc({
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
    <ListPanel
      toolbar={
        canManage ? (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Tambah kategori
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            Hanya SA atau HR dengan izin kelola aset yang bisa mengubah.
          </p>
        )
      }
    >
      <DataTable
        label="Kategori aset"
        columns={columns}
        data={list.data ?? []}
        loading={list.isPending}
        empty={{ icon: Laptop, title: "Belum ada kategori aset" }}
      />
      <MasterDialog
        kind="category"
        value={editing}
        onClose={() => setEditing(null)}
        pending={saveCategory.isPending}
        onSave={async (body, id) => {
          await saveCategory.mutateAsync(id ? { id, body } : { body });
        }}
      />
    </ListPanel>
  );
}

function PpeTypes({ canManage }: { canManage: boolean }) {
  const list = usePpeTypes();
  const { savePpeType } = useAssetMutations();
  const [editing, setEditing] = useState<PpeType | "new" | null>(null);
  const toggle = async (t: PpeType) => {
    try {
      await savePpeType.mutateAsync({
        id: t.id,
        body: {
          code: t.code,
          name: t.name,
          replaceAfterMonths: t.replaceAfterMonths,
          mustReturn: t.mustReturn,
          isActive: !t.isActive,
        },
      });
      toast.success(t.isActive ? "Jenis APD diarsipkan." : "Jenis APD dipulihkan.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  // Tabel master kecil: kolom dibuat langsung tiap render (tanpa useMemo).
  const columns: DataColumn<PpeType>[] = [
    pc({
      id: "name",
      header: "Jenis APD",
      cell: ({ row }) => nameCell(row.original.name, row.original.code, row.original.isActive),
    }),
    pc({
      id: "replace",
      header: "Masa ganti",
      cell: ({ row }) =>
        row.original.replaceAfterMonths ? `${row.original.replaceAfterMonths} bulan` : "—",
    }),
    pc({
      id: "return",
      header: "Saat keluar",
      cell: ({ row }) =>
        row.original.mustReturn ? (
          <Badge variant="warning">Wajib kembali</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">Habis pakai</span>
        ),
    }),
    pc({
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
    <ListPanel
      toolbar={
        canManage ? (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Tambah jenis APD
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            Hanya SA atau HR dengan izin kelola aset yang bisa mengubah.
          </p>
        )
      }
    >
      <DataTable
        label="Jenis APD"
        columns={columns}
        data={list.data ?? []}
        loading={list.isPending}
        empty={{ icon: HardHat, title: "Belum ada jenis APD" }}
      />
      <MasterDialog
        kind="ppe"
        value={editing}
        onClose={() => setEditing(null)}
        pending={savePpeType.isPending}
        onSave={async (body, id) => {
          await savePpeType.mutateAsync(id ? { id, body } : { body });
        }}
      />
    </ListPanel>
  );
}

function MasterDialog({
  kind,
  value,
  onClose,
  pending,
  onSave,
}: {
  kind: "category" | "ppe";
  value: AssetCategory | PpeType | "new" | null;
  onClose: () => void;
  pending: boolean;
  onSave: (body: Record<string, unknown>, id?: string) => Promise<void>;
}) {
  const id = useId();
  const existing = value && value !== "new" ? value : null;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [requiresSerial, setRequiresSerial] = useState(false);
  const [months, setMonths] = useState("");
  const [mustReturn, setMustReturn] = useState(false);
  useEffect(() => {
    if (!value) return;
    setCode(existing?.code ?? "");
    setName(existing?.name ?? "");
    setRequiresSerial(existing && "requiresSerial" in existing ? existing.requiresSerial : false);
    setMonths(
      existing && "replaceAfterMonths" in existing && existing.replaceAfterMonths
        ? String(existing.replaceAfterMonths)
        : "",
    );
    setMustReturn(existing && "mustReturn" in existing ? existing.mustReturn : false);
  }, [value, existing]);
  if (!value) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const base = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      ...(existing ? { isActive: existing.isActive } : {}),
    };
    try {
      await onSave(
        kind === "category"
          ? { ...base, requiresSerial }
          : { ...base, mustReturn, replaceAfterMonths: months ? Number(months) : null },
        existing?.id,
      );
      toast.success(existing ? "Perubahan disimpan." : "Ditambahkan.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const noun = kind === "category" ? "kategori aset" : "jenis APD";
  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{existing ? `Ubah ${noun}` : `Tambah ${noun}`}</DialogTitle>
            <DialogDescription>
              Kode 2–6 huruf/angka, dipakai di kode aset & nomor BAST.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Kode" htmlFor={`${id}-code`}>
              <Input
                id={`${id}-code`}
                required
                pattern="[A-Za-z0-9]{2,6}"
                maxLength={6}
                className="font-mono uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <div className="col-span-2">
              <Field label="Nama" htmlFor={`${id}-name`}>
                <Input
                  id={`${id}-name`}
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            </div>
          </div>
          {kind === "category" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={requiresSerial}
                onChange={(e) => setRequiresSerial(e.target.checked)}
              />
              Nomor seri wajib diisi
            </label>
          ) : (
            <>
              <Field
                label="Masa ganti (bulan, opsional)"
                htmlFor={`${id}-months`}
                hint="Mis. sepatu safety 12. Kosong = tanpa pengingat ganti."
              >
                <Input
                  id={`${id}-months`}
                  type="number"
                  min={1}
                  max={120}
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={mustReturn}
                  onChange={(e) => setMustReturn(e.target.checked)}
                />
                Wajib dikembalikan saat karyawan keluar
              </label>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
