import {
  DEFAULT_REMINDER_DAYS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_FILE_LABELS,
  DOCUMENT_MAX_SIZE_MB,
  DOCUMENT_REQUIREMENT_LABELS,
  DOCUMENT_REQUIREMENTS,
  type DocumentCategory,
  type DocumentRequirement,
  documentTypeInputSchema,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  FileText,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useMasterData } from "@/features/employee/api";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { useDocumentTypeMutations, useDocumentTypes } from "../api";
import type { DocumentType } from "../schemas";

// D-055: Administrasi › Master Data › Jenis dokumen — katalog dokumen karyawan (masa berlaku,
// pengingat, wajib, sensitif, format & ukuran file). SA kelola, HR lihat.

const column = createColumnHelper<typeof tableFeaturesNone, DocumentType>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<DocumentType>;
const muted = (value: ReactNode) => <span className="text-muted-foreground">{value ?? "—"}</span>;
const MIME_TYPES = Object.keys(DOCUMENT_FILE_LABELS) as (keyof typeof DOCUMENT_FILE_LABELS)[];

type Confirm = { type: DocumentType; action: "archive" | "restore" | "delete" };

export function DocumentTypesPage() {
  const me = useMe().data as Me;
  const canManage = access.manageMasterData(me);
  const types = useDocumentTypes(canManage);
  const { setArchived, remove } = useDocumentTypeMutations();
  const [view, setView] = useState<"active" | "archived">("active");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const [editing, setEditing] = useState<DocumentType | "new" | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const rows = (types.data ?? []).filter(
    (t) =>
      (view === "archived" ? t.archived : !t.archived) &&
      (!category || t.category === category) &&
      (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)),
  );

  const columns = useMemo<DataColumn<DocumentType>[]>(
    () => [
      col({
        id: "name",
        header: "Jenis dokumen",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium">
              {row.original.sensitive ? (
                <Lock className="text-muted-foreground size-3.5 shrink-0" aria-label="Sensitif" />
              ) : null}
              <span className="truncate">{row.original.name}</span>
            </p>
            <p className="text-muted-foreground truncate font-mono text-xs">{row.original.code}</p>
          </div>
        ),
      }),
      col({
        id: "category",
        header: "Kategori",
        cell: ({ row }) => (
          <Badge variant="secondary">{DOCUMENT_CATEGORY_LABELS[row.original.category]}</Badge>
        ),
      }),
      col({
        id: "expiry",
        header: "Masa berlaku",
        cell: ({ row }) =>
          row.original.hasExpiry ? (
            <div className="text-xs">
              <p>
                {row.original.defaultValidityMonths
                  ? `${row.original.defaultValidityMonths} bulan`
                  : "Wajib diisi"}
              </p>
              <p className="text-muted-foreground">
                Pengingat {row.original.reminderDays.join("/")} hari
              </p>
            </div>
          ) : (
            muted("Tidak ada")
          ),
      }),
      col({
        id: "required",
        header: "Wajib",
        cell: ({ row }) =>
          row.original.requiredScope === "NONE"
            ? muted("—")
            : DOCUMENT_REQUIREMENT_LABELS[row.original.requiredScope],
      }),
      col({
        id: "count",
        header: "Dokumen",
        cell: ({ row }) => <span className="tabular-nums">{row.original.documentCount}</span>,
      }),
      col({
        id: "actions",
        header: () => <span className="sr-only">Aksi</span>,
        cell: ({ row }) =>
          canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Aksi untuk ${row.original.name}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(row.original)}>
                  <Pencil /> Ubah
                </DropdownMenuItem>
                {row.original.archived ? (
                  <DropdownMenuItem
                    onSelect={() => setConfirm({ type: row.original, action: "restore" })}
                  >
                    <ArchiveRestore /> Pulihkan
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => setConfirm({ type: row.original, action: "archive" })}
                  >
                    <Archive /> Arsipkan
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirm({ type: row.original, action: "delete" })}
                >
                  <Trash2 /> Hapus permanen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      }),
    ],
    [canManage],
  );

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === "delete") await remove.mutateAsync(confirm.type.id);
      else
        await setArchived.mutateAsync({
          id: confirm.type.id,
          archived: confirm.action === "archive",
        });
      toast.success(
        `"${confirm.type.name}" ${
          confirm.action === "delete"
            ? "dihapus"
            : confirm.action === "archive"
              ? "diarsipkan"
              : "dipulihkan"
        }.`,
      );
      setConfirm(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div>
      <PageHeader
        title="Jenis dokumen"
        description="Katalog dokumen karyawan: masa berlaku & pengingat kedaluwarsa, siapa yang wajib, sensitif (butuh izin lihat), format & ukuran file."
        actions={
          canManage ? (
            <Button variant="brand" onClick={() => setEditing("new")}>
              <Plus /> Tambah jenis
            </Button>
          ) : null
        }
      />
      {!canManage ? (
        <Alert className="mb-4">
          <AlertDescription>Hanya Super Admin yang dapat mengubah jenis dokumen.</AlertDescription>
        </Alert>
      ) : null}
      <ListPanel
        toolbar={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Cari nama atau kode…"
              aria-label="Cari jenis dokumen"
            />
            <FormSelect
              aria-label="Kategori"
              className="h-9 sm:w-56"
              value={category}
              onChange={setCategory}
              placeholder="Semua kategori"
              noneLabel="Semua kategori"
              options={DOCUMENT_CATEGORIES.map((c) => ({
                value: c,
                label: DOCUMENT_CATEGORY_LABELS[c],
              }))}
            />
            {canManage ? (
              <FormSelect
                aria-label="Tampilkan"
                className="h-9 sm:w-44"
                value={view}
                onChange={(value) => setView(value as "active" | "archived")}
                placeholder="Aktif"
                options={[
                  { value: "active", label: "Aktif" },
                  { value: "archived", label: "Diarsipkan" },
                ]}
              />
            ) : null}
          </div>
        }
      >
        <DataTable
          label="Daftar jenis dokumen"
          columns={columns}
          data={rows}
          loading={types.isPending}
          empty={{
            icon: FileText,
            title: types.isError
              ? "Gagal memuat jenis dokumen"
              : view === "archived"
                ? "Tidak ada yang diarsipkan"
                : "Tidak ada yang cocok",
            ...(types.isError ? { description: errorMessage(types.error) } : {}),
          }}
        />
      </ListPanel>
      <DocumentTypeDialog editing={editing} onClose={() => setEditing(null)} />
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm?.action === "delete"
                ? "Hapus permanen"
                : confirm?.action === "archive"
                  ? "Arsipkan"
                  : "Pulihkan"}{" "}
              "{confirm?.type.name}"?
            </DialogTitle>
            <DialogDescription>
              {confirm?.action === "delete"
                ? "Hanya bisa bila belum pernah dipakai dokumen mana pun — selain itu arsipkan saja."
                : confirm?.action === "archive"
                  ? "Jenis ini tidak bisa dipilih untuk unggahan baru; dokumen yang sudah ada tetap tersimpan."
                  : "Jenis ini bisa dipilih lagi untuk unggahan baru."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Batal
            </Button>
            <Button
              variant={confirm?.action === "delete" ? "destructive" : "brand"}
              disabled={remove.isPending || setArchived.isPending}
              onClick={() => void runConfirm()}
            >
              Ya, lanjutkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FormValues {
  code: string;
  name: string;
  category: DocumentCategory | "";
  hasExpiry: boolean;
  defaultValidityMonths: string;
  reminderDays: string;
  requiredScope: DocumentRequirement;
  requiredPositionIds: string[];
  multiple: boolean;
  employeeCanUpload: boolean;
  sensitive: boolean;
  maxSizeMb: string;
  allowedMimeTypes: string[];
}

const blank: FormValues = {
  code: "",
  name: "",
  category: "",
  hasExpiry: false,
  defaultValidityMonths: "",
  reminderDays: DEFAULT_REMINDER_DAYS.join(", "),
  requiredScope: "NONE",
  requiredPositionIds: [],
  multiple: false,
  employeeCanUpload: false,
  sensitive: false,
  maxSizeMb: String(DOCUMENT_MAX_SIZE_MB),
  allowedMimeTypes: [...MIME_TYPES],
};

const fromType = (t: DocumentType): FormValues => ({
  code: t.code,
  name: t.name,
  category: t.category,
  hasExpiry: t.hasExpiry,
  defaultValidityMonths: t.defaultValidityMonths ? String(t.defaultValidityMonths) : "",
  reminderDays: (t.reminderDays.length > 0 ? t.reminderDays : DEFAULT_REMINDER_DAYS).join(", "),
  requiredScope: t.requiredScope,
  requiredPositionIds: t.requiredPositionIds,
  multiple: t.multiple,
  employeeCanUpload: t.employeeCanUpload,
  sensitive: t.sensitive,
  maxSizeMb: String(t.maxSizeMb),
  allowedMimeTypes: t.allowedMimeTypes,
});

function DocumentTypeDialog({
  editing,
  onClose,
}: {
  editing: DocumentType | "new" | null;
  onClose: () => void;
}) {
  const { save } = useDocumentTypeMutations();
  const master = useMasterData();
  const [values, setValues] = useState<FormValues>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const current = editing && editing !== "new" ? editing : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset hanya saat dialog dibuka
  useEffect(() => {
    if (editing) {
      setValues(current ? fromType(current) : blank);
      setErrors({});
    }
  }, [editing]);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const toggle = (key: "requiredPositionIds" | "allowedMimeTypes", value: string) =>
    setValues((v) => ({
      ...v,
      [key]: v[key].includes(value) ? v[key].filter((x) => x !== value) : [...v[key], value],
    }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = {
      code: values.code,
      name: values.name,
      category: values.category || undefined,
      hasExpiry: values.hasExpiry,
      defaultValidityMonths: values.defaultValidityMonths.trim()
        ? Number(values.defaultValidityMonths)
        : null,
      reminderDays: values.reminderDays
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number),
      requiredScope: values.requiredScope,
      requiredPositionIds: values.requiredPositionIds,
      multiple: values.multiple,
      employeeCanUpload: values.employeeCanUpload,
      sensitive: values.sensitive,
      maxSizeMb: Number(values.maxSizeMb),
      allowedMimeTypes: values.allowedMimeTypes,
    };
    const result = documentTypeInputSchema.safeParse(body);
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((i) => [
            String(i.path[0]),
            i.path[0] === "category" ? "Pilih kategori." : i.message,
          ]),
        ),
      );
      return;
    }
    try {
      await save.mutateAsync({ ...(current ? { id: current.id } : {}), body });
      toast.success(current ? "Jenis dokumen diperbarui." : "Jenis dokumen ditambahkan.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const error = (key: string) =>
    errors[key] ? <p className="text-destructive text-xs">{errors[key]}</p> : null;
  const check = (
    key: "hasExpiry" | "multiple" | "employeeCanUpload" | "sensitive",
    label: string,
    hint: string,
  ) => (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="accent-brand mt-0.5 size-4"
        checked={values[key]}
        onChange={(event) => set(key, event.target.checked)}
      />
      <span>
        {label}
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
    </label>
  );

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{current ? `Ubah ${current.name}` : "Tambah jenis dokumen"}</DialogTitle>
          <DialogDescription>
            {current && current.documentCount > 0
              ? `Sudah dipakai ${current.documentCount} dokumen — kode terkunci.`
              : "Kode dipakai laporan & impor (huruf besar, angka, garis bawah)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dt-code">Kode</Label>
            <Input
              id="dt-code"
              value={values.code}
              disabled={Boolean(current && current.documentCount > 0)}
              onChange={(event) => set("code", event.target.value.toUpperCase())}
              aria-invalid={Boolean(errors.code)}
            />
            {error("code")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="dt-category">Kategori</Label>
            <FormSelect
              id="dt-category"
              value={values.category}
              onChange={(value) => set("category", value as DocumentCategory)}
              placeholder="Pilih kategori"
              options={DOCUMENT_CATEGORIES.map((c) => ({
                value: c,
                label: DOCUMENT_CATEGORY_LABELS[c],
              }))}
              invalid={Boolean(errors.category)}
            />
            {error("category")}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dt-name">Nama</Label>
            <Input
              id="dt-name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              aria-invalid={Boolean(errors.name)}
            />
            {error("name")}
          </div>
          <div className="sm:col-span-2">
            {check(
              "hasExpiry",
              "Punya masa berlaku",
              "Tanggal kedaluwarsa wajib diisi saat unggah; pengingat dikirim ke karyawan & HR.",
            )}
          </div>
          {values.hasExpiry ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="dt-months">
                  Masa berlaku bawaan (bulan)
                  <span className="text-muted-foreground font-normal"> (opsional)</span>
                </Label>
                <Input
                  id="dt-months"
                  inputMode="numeric"
                  value={values.defaultValidityMonths}
                  onChange={(event) => set("defaultValidityMonths", event.target.value)}
                />
                {error("defaultValidityMonths") ?? (
                  <p className="text-muted-foreground text-xs">
                    Mengisi otomatis tanggal kedaluwarsa dari tanggal terbit.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dt-reminder">Pengingat (hari sebelum)</Label>
                <Input
                  id="dt-reminder"
                  value={values.reminderDays}
                  onChange={(event) => set("reminderDays", event.target.value)}
                />
                {error("reminderDays") ?? (
                  <p className="text-muted-foreground text-xs">Pisahkan koma, mis. 60, 30, 7.</p>
                )}
              </div>
            </>
          ) : null}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dt-required">Wajib dimiliki</Label>
            <FormSelect
              id="dt-required"
              value={values.requiredScope}
              onChange={(value) => set("requiredScope", value as DocumentRequirement)}
              placeholder="Tidak wajib"
              options={DOCUMENT_REQUIREMENTS.map((r) => ({
                value: r,
                label: DOCUMENT_REQUIREMENT_LABELS[r],
              }))}
            />
            <p className="text-muted-foreground text-xs">Dipakai laporan kelengkapan dokumen.</p>
          </div>
          {values.requiredScope === "POSITIONS" ? (
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">Jabatan yang wajib</legend>
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                {(master.data?.positions ?? []).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-brand size-4"
                      checked={values.requiredPositionIds.includes(p.id)}
                      onChange={() => toggle("requiredPositionIds", p.id)}
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
              </div>
              {error("requiredPositionIds")}
            </fieldset>
          ) : null}
          <div className="space-y-3 sm:col-span-2">
            {check(
              "sensitive",
              "Sensitif",
              "Hanya Super Admin, pemilik, dan pemegang izin lihat/unggah dokumen; membuka file tercatat di audit log.",
            )}
            {check(
              "multiple",
              "Boleh lebih dari satu aktif",
              "Mis. sertifikat lain, SK, SP. Tanpa centang: unggahan baru menjadi versi baru.",
            )}
            {check(
              "employeeCanUpload",
              "Karyawan boleh mengunggah (lewat pengajuan)",
              "Berlaku setelah fitur pengajuan perubahan data tersedia.",
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="dt-size">Ukuran maksimal (MB)</Label>
            <Input
              id="dt-size"
              inputMode="numeric"
              value={values.maxSizeMb}
              onChange={(event) => set("maxSizeMb", event.target.value)}
              aria-invalid={Boolean(errors.maxSizeMb)}
            />
            {error("maxSizeMb")}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Format file</legend>
            <div className="flex flex-wrap gap-4 pt-1">
              {MIME_TYPES.map((mime) => (
                <label key={mime} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-brand size-4"
                    checked={values.allowedMimeTypes.includes(mime)}
                    onChange={() => toggle("allowedMimeTypes", mime)}
                  />
                  {DOCUMENT_FILE_LABELS[mime]}
                </label>
              ))}
            </div>
            {error("allowedMimeTypes")}
          </fieldset>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="brand" disabled={save.isPending}>
              {save.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
