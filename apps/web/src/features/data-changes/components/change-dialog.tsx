import {
  DATA_CHANGE_SECTION_LABELS,
  type DataChangeSection,
  DOCUMENT_FILE_LABELS,
  dataChangeInputSchema,
  FAMILY_RELATIONSHIP_LABELS,
  FAMILY_RELATIONSHIPS,
  MARITAL_STATUS_LABELS,
  MARITAL_STATUSES,
  PERSONAL_CHANGE_FIELDS,
  RELIGION_LABELS,
  RELIGIONS,
} from "@hris/shared";
import { Plus, Send, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
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
import { useDocumentTypes } from "@/features/documents/api";
import { errorMessage } from "@/lib/errors";
import { useSubmitDataChange } from "../api";
import { FIELD_LABELS } from "../labels";
import type { MyData } from "../schemas";

// D-054 / OD-6 (Arsip 1c): form pengajuan per bagian. Nilai awal = data sekarang; yang dikirim API
// hanya disimpan bila berbeda. Data baru berlaku setelah disetujui SA / HR.

type Values = Record<string, string>;
type Member = { name: string; relationship: string; birthDate: string; phoneNumber: string };

const TEXT_FIELDS = new Set(["ktpAddress", "domicileAddress"]);
const DATE_FIELDS = new Set(["birthDate"]);
const BOOL_FIELDS = new Set(["npwpAbsent", "bpjsEmploymentAbsent", "bpjsHealthAbsent"]);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const orNull = (v: string | undefined) => (v?.trim() ? v.trim() : null);

function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  // Path: ["data", field, ...] → kunci field (keluarga: "members.0.name").
  return Object.fromEntries(
    error.issues.map((i) => [i.path.slice(1).map(String).join("."), i.message]),
  );
}

export function DataChangeDialog({
  section,
  data,
  onClose,
}: {
  section: DataChangeSection | null;
  data: MyData;
  onClose: () => void;
}) {
  const submit = useSubmitDataChange();
  const types = useDocumentTypes();
  const uploadable = useMemo(
    () => (types.data ?? []).filter((t) => t.employeeCanUpload),
    [types.data],
  );
  const fileId = useId();
  const [values, setValues] = useState<Values>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset hanya saat dialog dibuka
  useEffect(() => {
    if (!section) return;
    setErrors({});
    setFile(null);
    if (section === "PERSONAL")
      setValues(Object.fromEntries(PERSONAL_CHANGE_FIELDS.map((f) => [f, s(data.personal[f])])));
    if (section === "EMERGENCY")
      setValues({
        name: s(data.emergency.name),
        relationship: s(data.emergency.relationship),
        phone: s(data.emergency.phone),
      });
    if (section === "BANK")
      // Nomor rekening sekarang tersamar → diisi ulang.
      setValues({
        bankName: s(data.bank.bankName),
        accountNumber: "",
        accountHolder: s(data.bank.accountHolder),
      });
    if (section === "DOCUMENT")
      setValues({ documentTypeId: "", documentNumber: "", issuedAt: "", expiresAt: "", note: "" });
    if (section === "FAMILY")
      setMembers(
        data.family.map((m) => ({
          name: s(m.name),
          relationship: s(m.relationship),
          birthDate: s(m.birthDate),
          phoneNumber: s(m.phoneNumber),
        })),
      );
  }, [section]);

  const set = (name: string) => (value: string) => setValues((v) => ({ ...v, [name]: value }));
  const type = uploadable.find((t) => t.id === values.documentTypeId);

  const body = (): Record<string, unknown> => {
    switch (section) {
      case "PERSONAL":
        return Object.fromEntries(
          PERSONAL_CHANGE_FIELDS.map((f) => [
            f,
            BOOL_FIELDS.has(f) ? values[f] === "true" : orNull(values[f]),
          ]),
        );
      case "EMERGENCY":
        return {
          name: orNull(values.name),
          relationship: orNull(values.relationship),
          phone: orNull(values.phone),
        };
      case "FAMILY":
        return {
          members: members.map((m) => ({
            name: m.name,
            relationship: m.relationship,
            birthDate: orNull(m.birthDate),
            phoneNumber: orNull(m.phoneNumber),
          })),
        };
      case "BANK":
        return {
          bankName: orNull(values.bankName),
          accountNumber: orNull(values.accountNumber),
          accountHolder: orNull(values.accountHolder),
          // Path sementara untuk validasi; diganti path unggahan sungguhan.
          bankBookPath: file ? "pending" : "",
        };
      case "DOCUMENT":
        return {
          documentTypeId: values.documentTypeId,
          path: file ? "pending" : "",
          documentNumber: orNull(values.documentNumber),
          issuedAt: orNull(values.issuedAt),
          expiresAt: orNull(values.expiresAt),
          note: orNull(values.note),
        };
      default:
        return {};
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!section) return;
    const data = body();
    const result = dataChangeInputSchema.safeParse({ section, data });
    const next: Record<string, string> = result.success ? {} : issuesOf(result.error);
    if (section === "DOCUMENT" && type?.hasExpiry && !data.expiresAt) {
      next.expiresAt = "Tanggal kedaluwarsa wajib untuk jenis dokumen ini.";
    }
    if (file && type && !type.allowedMimeTypes.includes(file.type))
      next.path = "Format file tidak diizinkan.";
    if (next.bankBookPath) next.file = "Lampirkan buku tabungan.";
    if (next.path) next.file = next.path;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const { bankBookPath: _b, path: _p, ...rest } = data;
    try {
      await submit.mutateAsync({ section, data: rest, ...(file ? { file } : {}) });
      toast.success("Pengajuan terkirim. Data berlaku setelah disetujui HR.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const field = (
    name: string,
    input: ReactNode,
    opts: { wide?: boolean; optional?: boolean; hint?: string } = {},
  ) => (
    <div key={name} className={opts.wide ? "space-y-2 sm:col-span-2" : "space-y-2"}>
      <Label htmlFor={`dc-${name}`}>
        {FIELD_LABELS[name] ?? name}
        {opts.optional ? (
          <span className="text-muted-foreground font-normal"> (opsional)</span>
        ) : null}
      </Label>
      {input}
      {errors[name] ? (
        <p className="text-destructive text-xs">{errors[name]}</p>
      ) : opts.hint ? (
        <p className="text-muted-foreground text-xs">{opts.hint}</p>
      ) : null}
    </div>
  );
  const text = (
    name: string,
    opts: { wide?: boolean; optional?: boolean; hint?: string; type?: string } = {},
  ) =>
    field(
      name,
      TEXT_FIELDS.has(name) ? (
        <Textarea
          id={`dc-${name}`}
          rows={2}
          value={values[name] ?? ""}
          onChange={(e) => set(name)(e.target.value)}
        />
      ) : (
        <Input
          id={`dc-${name}`}
          type={opts.type ?? (DATE_FIELDS.has(name) ? "date" : "text")}
          value={values[name] ?? ""}
          onChange={(e) => set(name)(e.target.value)}
          aria-invalid={Boolean(errors[name])}
        />
      ),
      opts,
    );
  const select = (name: string, options: { value: string; label: string }[]) =>
    field(
      name,
      <FormSelect
        id={`dc-${name}`}
        value={values[name] ?? ""}
        onChange={set(name)}
        placeholder="Pilih"
        noneLabel="—"
        options={options}
      />,
    );
  const check = (name: string) => (
    <label key={name} className="flex items-center gap-2 text-sm sm:col-span-2">
      <input
        type="checkbox"
        className="accent-brand size-4"
        checked={values[name] === "true"}
        onChange={(e) => set(name)(String(e.target.checked))}
      />
      {FIELD_LABELS[name]}
      {errors[name] ? <span className="text-destructive text-xs">{errors[name]}</span> : null}
    </label>
  );
  const fileInput = (label: string, accept: string, hint: string) => (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={fileId}>{label}</Label>
      <Input
        id={fileId}
        type="file"
        accept={accept}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        aria-invalid={Boolean(errors.file)}
      />
      {errors.file ? (
        <p className="text-destructive text-xs">{errors.file}</p>
      ) : (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );

  let form: ReactNode = null;
  if (section === "PERSONAL") {
    form = (
      <>
        {text("ktpNumber")}
        {text("kkNumber")}
        {text("birthPlace")}
        {text("birthDate")}
        {select(
          "religion",
          RELIGIONS.map((r) => ({ value: r, label: RELIGION_LABELS[r] })),
        )}
        {select(
          "maritalStatus",
          MARITAL_STATUSES.map((m) => ({ value: m, label: MARITAL_STATUS_LABELS[m] })),
        )}
        {text("ktpAddress", { wide: true })}
        {text("domicileAddress", { wide: true })}
        {text("originCity")}
        {text("phoneNumber")}
        {text("npwpNumber")}
        {text("bpjsEmploymentNumber")}
        {text("bpjsHealthNumber")}
        {check("npwpAbsent")}
        {check("bpjsEmploymentAbsent")}
        {check("bpjsHealthAbsent")}
      </>
    );
  } else if (section === "EMERGENCY") {
    form = (
      <>
        {text("name", { wide: true })}
        {text("relationship")}
        {text("phone")}
      </>
    );
  } else if (section === "BANK") {
    form = (
      <>
        {text("bankName")}
        {text("accountNumber", { hint: "Isi lengkap nomor rekening baru." })}
        {text("accountHolder", { wide: true, optional: true })}
        {fileInput(
          "Buku tabungan / bukti rekening",
          "application/pdf,image/jpeg,image/png",
          "PDF, JPG, PNG · maks 5 MB. Halaman yang memuat nama & nomor rekening.",
        )}
      </>
    );
  } else if (section === "DOCUMENT") {
    form = (
      <>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="dc-documentTypeId">Jenis dokumen</Label>
          <FormSelect
            id="dc-documentTypeId"
            value={values.documentTypeId ?? ""}
            onChange={set("documentTypeId")}
            placeholder={types.isPending ? "Memuat…" : "Pilih jenis dokumen"}
            options={uploadable.map((t) => ({ value: t.id, label: t.name }))}
            invalid={Boolean(errors.documentTypeId)}
          />
          {errors.documentTypeId ? (
            <p className="text-destructive text-xs">Pilih jenis dokumen.</p>
          ) : null}
        </div>
        {fileInput(
          "File",
          (type?.allowedMimeTypes ?? ["application/pdf", "image/jpeg", "image/png"]).join(","),
          `${(type?.allowedMimeTypes ?? ["application/pdf", "image/jpeg", "image/png"])
            .map((m) => DOCUMENT_FILE_LABELS[m as keyof typeof DOCUMENT_FILE_LABELS] ?? m)
            .join(", ")} · maks ${type?.maxSizeMb ?? 5} MB`,
        )}
        {field(
          "documentNumber",
          <Input
            id="dc-documentNumber"
            value={values.documentNumber ?? ""}
            onChange={(e) => set("documentNumber")(e.target.value)}
          />,
          { wide: true, optional: true },
        )}
        {field(
          "issuedAt",
          <Input
            id="dc-issuedAt"
            type="date"
            value={values.issuedAt ?? ""}
            onChange={(e) => set("issuedAt")(e.target.value)}
          />,
          { optional: true },
        )}
        {field(
          "expiresAt",
          <Input
            id="dc-expiresAt"
            type="date"
            value={values.expiresAt ?? ""}
            onChange={(e) => set("expiresAt")(e.target.value)}
          />,
          { optional: !type?.hasExpiry },
        )}
      </>
    );
  } else if (section === "FAMILY") {
    form = (
      <div className="space-y-3 sm:col-span-2">
        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada anggota keluarga.</p>
        ) : null}
        {members.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: baris form tanpa id
          <fieldset key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <legend className="sr-only">Anggota {i + 1}</legend>
            <Input
              aria-label={`Nama anggota ${i + 1}`}
              placeholder="Nama"
              value={m.name}
              onChange={(e) =>
                setMembers((list) =>
                  list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                )
              }
            />
            <FormSelect
              aria-label={`Hubungan anggota ${i + 1}`}
              value={m.relationship}
              onChange={(value) =>
                setMembers((list) =>
                  list.map((x, j) => (j === i ? { ...x, relationship: value } : x)),
                )
              }
              placeholder="Hubungan"
              options={FAMILY_RELATIONSHIPS.map((r) => ({
                value: r,
                label: FAMILY_RELATIONSHIP_LABELS[r],
              }))}
            />
            <Input
              aria-label={`Tanggal lahir anggota ${i + 1}`}
              type="date"
              value={m.birthDate}
              onChange={(e) =>
                setMembers((list) =>
                  list.map((x, j) => (j === i ? { ...x, birthDate: e.target.value } : x)),
                )
              }
            />
            <div className="flex gap-2">
              <Input
                aria-label={`No. HP anggota ${i + 1}`}
                placeholder="No. HP (opsional)"
                value={m.phoneNumber}
                onChange={(e) =>
                  setMembers((list) =>
                    list.map((x, j) => (j === i ? { ...x, phoneNumber: e.target.value } : x)),
                  )
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Hapus anggota ${i + 1}`}
                onClick={() => setMembers((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
            {Object.entries(errors)
              .filter(([key]) => key.startsWith(`members.${i}.`))
              .map(([key, message]) => (
                <p key={key} className="text-destructive text-xs sm:col-span-2">
                  {message}
                </p>
              ))}
          </fieldset>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setMembers((list) => [
              ...list,
              { name: "", relationship: "", birthDate: "", phoneNumber: "" },
            ])
          }
        >
          <Plus /> Tambah anggota
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={section !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {section === "DOCUMENT"
              ? "Ajukan unggah dokumen"
              : `Ajukan perubahan ${section ? DATA_CHANGE_SECTION_LABELS[section].toLowerCase() : ""}`}
          </DialogTitle>
          <DialogDescription>
            Perubahan berlaku setelah disetujui HR. Anda mendapat notifikasi saat pengajuan
            diproses.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {form}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="brand" disabled={submit.isPending}>
              <Send /> {submit.isPending ? "Mengirim…" : "Kirim pengajuan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
