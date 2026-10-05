import {
  addMonths,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_FILE_LABELS,
  employeeDocumentInputSchema,
} from "@hris/shared";
import { FileUp } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
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
import { type DocumentMeta, useDocumentTypes, useEmployeeDocumentMutations } from "../api";
import type { DocumentType, EmployeeDocument } from "../schemas";

// D-055 (Arsip 1b): satu dialog untuk unggah dokumen baru, unggah versi baru, dan ubah keterangan.
// Format & ukuran dicek di browser lebih dulu; API tetap memeriksa ulang setelah unggah.

export type DocumentDialogMode =
  | {
      kind: "new";
      /** Batasi pilihan jenis (mis. lampiran pelatihan = sertifikat). */
      typeCodes?: readonly string[];
      link?: { trainingId?: string; historyId?: string };
      title?: string;
    }
  | { kind: "version"; document: EmployeeDocument }
  | { kind: "edit"; document: EmployeeDocument };

const todayJakarta = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const orNull = (value: string) => (value.trim() ? value.trim() : null);

export function DocumentDialog({
  employeeId,
  mode,
  onClose,
  canWriteSensitive,
  canWriteBankBook = false,
}: {
  employeeId: string;
  mode: DocumentDialogMode | null;
  onClose: () => void;
  canWriteSensitive: boolean;
  /** Buku tabungan boleh juga dengan grant tulis rekening. */
  canWriteBankBook?: boolean;
}) {
  const types = useDocumentTypes();
  const { upload, update } = useEmployeeDocumentMutations(employeeId);
  const fileId = useId();
  const doc = mode && mode.kind !== "new" ? mode.document : null;
  const [typeId, setTypeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [values, setValues] = useState({
    documentNumber: "",
    issuedAt: "",
    expiresAt: "",
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset hanya saat dialog dibuka
  useEffect(() => {
    if (!mode) return;
    setTypeId(doc?.documentType.id ?? "");
    setFile(null);
    setErrors({});
    setValues(
      mode.kind === "edit" && doc
        ? {
            documentNumber: doc.documentNumber ?? "",
            issuedAt: doc.issuedAt ?? "",
            expiresAt: doc.expiresAt ?? "",
            note: doc.note ?? "",
          }
        : { documentNumber: "", issuedAt: "", expiresAt: "", note: "" },
    );
  }, [mode]);

  const choices = useMemo(() => {
    const all = types.data ?? [];
    return all.filter(
      (t) =>
        (canWriteSensitive || !t.sensitive || (t.code === "BANK_BOOK" && canWriteBankBook)) &&
        (mode?.kind !== "new" || !mode.typeCodes || mode.typeCodes.includes(t.code)),
    );
  }, [types.data, canWriteSensitive, canWriteBankBook, mode]);
  const type: DocumentType | undefined = (types.data ?? []).find((t) => t.id === typeId);
  const needsFile = mode?.kind !== "edit";

  const set = (name: keyof typeof values) => (value: string) =>
    setValues((v) => {
      const next = { ...v, [name]: value };
      // Isi otomatis kedaluwarsa dari tanggal terbit + masa berlaku bawaan jenisnya.
      if (name === "issuedAt" && value && !v.expiresAt && type?.defaultValidityMonths) {
        next.expiresAt = addMonths(value, type.defaultValidityMonths);
      }
      return next;
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mode) return;
    const meta: DocumentMeta = {
      documentTypeId: typeId,
      documentNumber: orNull(values.documentNumber),
      issuedAt: orNull(values.issuedAt),
      expiresAt: orNull(values.expiresAt),
      note: orNull(values.note),
    };
    const result = employeeDocumentInputSchema(todayJakarta()).safeParse(meta);
    const next: Record<string, string> = result.success
      ? {}
      : Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message]));
    if (type?.hasExpiry && !meta.expiresAt) {
      next.expiresAt = "Tanggal kedaluwarsa wajib untuk jenis dokumen ini.";
    }
    if (needsFile) {
      if (!file) next.file = "Pilih file dokumen.";
      else if (type && !type.allowedMimeTypes.includes(file.type)) {
        next.file = `Format harus ${type.allowedMimeTypes.map((m) => DOCUMENT_FILE_LABELS[m as keyof typeof DOCUMENT_FILE_LABELS] ?? m).join(", ")}.`;
      } else if (type && file.size > type.maxSizeMb * 1024 * 1024) {
        next.file = `Ukuran maksimal ${type.maxSizeMb} MB.`;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      if (mode.kind === "edit" && doc) {
        await update.mutateAsync({ id: doc.id, meta });
        toast.success("Keterangan dokumen diperbarui.");
      } else if (file) {
        await upload.mutateAsync({
          file,
          meta,
          link:
            mode.kind === "version" && doc
              ? { replacesId: doc.id }
              : mode.kind === "new"
                ? (mode.link ?? {})
                : {},
        });
        toast.success(mode.kind === "version" ? "Versi baru tersimpan." : "Dokumen tersimpan.");
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const title =
    mode?.kind === "edit"
      ? `Ubah keterangan ${doc?.documentType.name ?? "dokumen"}`
      : mode?.kind === "version"
        ? `Unggah versi baru ${doc?.documentType.name ?? ""}`
        : (mode?.title ?? "Unggah dokumen");
  const pending = upload.isPending || update.isPending;
  const accept = (type?.allowedMimeTypes ?? ["application/pdf", "image/jpeg", "image/png"]).join(
    ",",
  );

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode?.kind === "version"
              ? "Versi lama tetap tersimpan dan bisa dilihat di riwayat versi."
              : "File disimpan privat; hanya bisa dibuka lewat tautan sementara."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          {mode?.kind === "new" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="doc-type">Jenis dokumen</Label>
              <FormSelect
                id="doc-type"
                value={typeId}
                onChange={(value) => {
                  setTypeId(value);
                  setErrors({});
                }}
                placeholder={types.isPending ? "Memuat…" : "Pilih jenis dokumen"}
                options={choices.map((t) => ({
                  value: t.id,
                  label: t.name,
                  hint: DOCUMENT_CATEGORY_LABELS[t.category],
                }))}
                invalid={Boolean(errors.documentTypeId)}
              />
              {errors.documentTypeId ? (
                <p className="text-destructive text-xs">Pilih jenis dokumen.</p>
              ) : type ? (
                <p className="text-muted-foreground text-xs">
                  {type.multiple
                    ? "Boleh lebih dari satu dokumen aktif."
                    : "Dokumen aktif sebelumnya otomatis menjadi versi lama."}
                  {type.sensitive ? " Jenis sensitif: setiap pembukaan file tercatat." : ""}
                </p>
              ) : null}
            </div>
          ) : null}
          {needsFile ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={fileId}>File</Label>
              <Input
                id={fileId}
                type="file"
                accept={accept}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                aria-invalid={Boolean(errors.file)}
              />
              {errors.file ? (
                <p className="text-destructive text-xs">{errors.file}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {(type?.allowedMimeTypes ?? ["application/pdf", "image/jpeg", "image/png"])
                    .map((m) => DOCUMENT_FILE_LABELS[m as keyof typeof DOCUMENT_FILE_LABELS] ?? m)
                    .join(", ")}{" "}
                  · maks {type?.maxSizeMb ?? 5} MB
                </p>
              )}
            </div>
          ) : null}
          <Field
            id="doc-number"
            label="Nomor dokumen"
            optional
            error={errors.documentNumber}
            className="sm:col-span-2"
          >
            <Input
              id="doc-number"
              value={values.documentNumber}
              onChange={(event) => set("documentNumber")(event.target.value)}
            />
          </Field>
          <Field id="doc-issued" label="Tanggal terbit" optional error={errors.issuedAt}>
            <Input
              id="doc-issued"
              type="date"
              value={values.issuedAt}
              onChange={(event) => set("issuedAt")(event.target.value)}
            />
          </Field>
          <Field
            id="doc-expires"
            label="Berlaku sampai"
            optional={!type?.hasExpiry}
            error={errors.expiresAt}
            hint={
              type?.defaultValidityMonths
                ? `Bawaan ${type.defaultValidityMonths} bulan dari tanggal terbit.`
                : undefined
            }
          >
            <Input
              id="doc-expires"
              type="date"
              value={values.expiresAt}
              onChange={(event) => set("expiresAt")(event.target.value)}
            />
          </Field>
          <Field
            id="doc-note"
            label="Catatan"
            optional
            error={errors.note}
            className="sm:col-span-2"
          >
            <Textarea
              id="doc-note"
              rows={2}
              value={values.note}
              onChange={(event) => set("note")(event.target.value)}
            />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="brand" disabled={pending}>
              {needsFile ? <FileUp /> : null}
              {pending ? "Menyimpan…" : needsFile ? "Unggah" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  optional,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ? `space-y-2 ${className}` : "space-y-2"}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="text-muted-foreground font-normal"> (opsional)</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
