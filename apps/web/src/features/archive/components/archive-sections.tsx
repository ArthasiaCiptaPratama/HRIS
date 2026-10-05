import {
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  educationInputSchema,
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TYPES,
  positionHistoryInputSchema,
  positionHistoryMetaSchema,
  TRAINING_TYPE_LABELS,
  TRAINING_TYPES,
  trainingInputSchema,
  workExperienceInputSchema,
} from "@hris/shared";
import {
  Award,
  BriefcaseBusiness,
  GraduationCap,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMasterData } from "@/features/employee/api";
import type { EmployeeDetail } from "@/features/employee/schemas";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatRupiah } from "@/lib/format";
import { type ItemCategory, useArchiveItem } from "../api";

// D-054 (Arsip 1a): kelola pendidikan, pelatihan, riwayat kerja, riwayat jabatan di detail karyawan.
// Tombol kelola hanya untuk SA/HR (access.manage); API tetap penentu akses.

type Values = Record<string, string>;
type FieldDef = {
  name: string;
  label: string;
  kind?: "text" | "number" | "date" | "textarea" | "select";
  options?: { value: string; label: string; hint?: string }[];
  optional?: boolean;
  noneLabel?: string;
  hint?: string;
  placeholder?: string;
};

const s = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);
const textOrNull = (value: string | undefined) => (value?.trim() ? value.trim() : null);
const numberOrNull = (value: string | undefined) => {
  const raw = value?.trim().replace(/\./g, "").replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

function issuesOf(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

/** Dialog form generik: field → nilai teks → body lewat `toBody`, divalidasi skema shared. */
function ItemDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  validate,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FieldDef[];
  initial: Values;
  validate: (
    values: Values,
  ) => { ok: true; body: Record<string, unknown> } | { ok: false; errors: Record<string, string> };
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  pending: boolean;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset hanya saat dialog dibuka
  useEffect(() => {
    if (open) {
      setValues(initial);
      setErrors({});
    }
  }, [open]);
  const set = (name: string) => (value: string) => setValues((v) => ({ ...v, [name]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = validate(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    await onSubmit(result.body);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const id = `ai-${field.name}`;
            const wide =
              field.kind === "textarea" || field.kind === undefined || field.kind === "text";
            const input =
              field.kind === "select" ? (
                <FormSelect
                  id={id}
                  value={values[field.name] ?? ""}
                  onChange={set(field.name)}
                  placeholder={field.placeholder ?? "Pilih"}
                  {...(field.noneLabel ? { noneLabel: field.noneLabel } : {})}
                  options={field.options ?? []}
                  invalid={Boolean(errors[field.name])}
                />
              ) : field.kind === "textarea" ? (
                <Textarea
                  id={id}
                  rows={2}
                  value={values[field.name] ?? ""}
                  onChange={(event) => set(field.name)(event.target.value)}
                />
              ) : (
                <Input
                  id={id}
                  type={field.kind === "date" ? "date" : "text"}
                  inputMode={field.kind === "number" ? "numeric" : undefined}
                  value={values[field.name] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) => set(field.name)(event.target.value)}
                  aria-invalid={Boolean(errors[field.name])}
                />
              );
            return (
              <div key={field.name} className={wide ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                <Label htmlFor={id}>
                  {field.label}
                  {field.optional ? (
                    <span className="text-muted-foreground font-normal"> (opsional)</span>
                  ) : null}
                </Label>
                {input}
                {errors[field.name] ? (
                  <p className="text-destructive text-xs">{errors[field.name]}</p>
                ) : field.hint ? (
                  <p className="text-muted-foreground text-xs">{field.hint}</p>
                ) : null}
              </div>
            );
          })}
          <DialogFooter className="sm:col-span-2">
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

function ConfirmDelete({
  open,
  onOpenChange,
  what,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  what: string;
  onConfirm: () => Promise<void>;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hapus {what}?</DialogTitle>
          <DialogDescription>Data ini dihapus permanen dari arsip karyawan.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => void onConfirm()}>
            {pending ? "Menghapus…" : "Hapus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowMenu({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete?: (() => void) | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Aksi untuk ${label}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Ubah
        </DropdownMenuItem>
        {onDelete ? (
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Hapus
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Section({
  title,
  addLabel,
  canManage,
  onAdd,
  empty,
  children,
}: {
  title: string;
  addLabel: string;
  canManage: boolean;
  onAdd: () => void;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {title}
        </h3>
        {canManage ? (
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus /> {addLabel}
          </Button>
        ) : null}
      </div>
      {/* Dialog tambah ikut di children → tetap dirender walau daftar masih kosong. */}
      {empty ? <p className="text-muted-foreground text-sm">{empty}</p> : null}
      {children}
    </section>
  );
}

function Item({
  icon: Icon,
  title,
  meta,
  actions,
}: {
  icon: typeof Award;
  title: ReactNode;
  meta: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="bg-muted text-muted-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{meta}</p>
      </div>
      {actions}
    </li>
  );
}

/** Pola umum: dialog tambah/ubah + konfirmasi hapus untuk satu kategori. */
function useItemEditor<T extends { id: string }>(
  category: ItemCategory,
  employeeId: string,
  noun: string,
) {
  const { save, remove } = useArchiveItem(category, employeeId);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const submit = async (body: Record<string, unknown>) => {
    try {
      await save.mutateAsync({ ...(editing && editing !== "new" ? { id: editing.id } : {}), body });
      toast.success(editing === "new" ? `${noun} ditambahkan.` : `${noun} diperbarui.`);
      setEditing(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(`${noun} dihapus.`);
      setDeleting(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return { save, remove, editing, setEditing, deleting, setDeleting, submit, confirmDelete };
}

const check =
  <S extends z.ZodType>(schema: S, toBody: (v: Values) => Record<string, unknown>) =>
  (values: Values) => {
    const body = toBody(values);
    const result = schema.safeParse(body);
    return result.success
      ? ({ ok: true, body } as const)
      : ({ ok: false, errors: issuesOf(result.error) } as const);
  };

// ── Pendidikan ─────────────────────────────────────────────────────────────

type Education = EmployeeDetail["educations"][number];
const EDUCATION_FIELDS: FieldDef[] = [
  {
    name: "level",
    label: "Jenjang",
    kind: "select",
    options: EDUCATION_LEVELS.map((l) => ({ value: l, label: EDUCATION_LEVEL_LABELS[l] })),
  },
  { name: "schoolName", label: "Nama sekolah / kampus" },
  { name: "major", label: "Jurusan", optional: true },
  { name: "graduationYear", label: "Tahun lulus", kind: "number", optional: true },
];

export function EducationSection({
  employee,
  canManage,
}: {
  employee: EmployeeDetail;
  canManage: boolean;
}) {
  const editor = useItemEditor<Education>("educations", employee.id, "Pendidikan");
  const current = editor.editing && editor.editing !== "new" ? editor.editing : null;
  return (
    <Section
      title="Pendidikan"
      addLabel="Tambah"
      canManage={canManage}
      onAdd={() => editor.setEditing("new")}
      empty={employee.educations.length === 0 ? "Belum ada data pendidikan." : null}
    >
      <ul className="space-y-3 empty:hidden">
        {employee.educations.map((edu) => (
          <Item
            key={edu.id}
            icon={GraduationCap}
            title={
              <>
                {edu.level ? (
                  <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                    {EDUCATION_LEVEL_LABELS[edu.level]}
                  </span>
                ) : null}
                {edu.schoolName}
              </>
            }
            meta={[edu.major, edu.graduationYear ? `Lulus ${edu.graduationYear}` : null]
              .filter(Boolean)
              .join(" · ")}
            actions={
              canManage ? (
                <RowMenu
                  label={edu.schoolName}
                  onEdit={() => editor.setEditing(edu)}
                  onDelete={() => editor.setDeleting(edu)}
                />
              ) : null
            }
          />
        ))}
      </ul>
      <ItemDialog
        open={editor.editing !== null}
        onOpenChange={(open) => !open && editor.setEditing(null)}
        title={current ? "Ubah pendidikan" : "Tambah pendidikan"}
        fields={EDUCATION_FIELDS}
        initial={{
          level: s(current?.level),
          schoolName: s(current?.schoolName),
          major: s(current?.major),
          graduationYear: s(current?.graduationYear),
        }}
        validate={check(educationInputSchema, (v) => ({
          level: v.level || undefined,
          schoolName: v.schoolName ?? "",
          major: textOrNull(v.major),
          graduationYear: numberOrNull(v.graduationYear),
        }))}
        onSubmit={editor.submit}
        pending={editor.save.isPending}
      />
      <ConfirmDelete
        open={editor.deleting !== null}
        onOpenChange={(open) => !open && editor.setDeleting(null)}
        what="data pendidikan"
        onConfirm={editor.confirmDelete}
        pending={editor.remove.isPending}
      />
    </Section>
  );
}

// ── Pelatihan ───────────────────────────────────────────────────────────────

type Training = EmployeeDetail["trainings"][number];
const TRAINING_FIELDS: FieldDef[] = [
  { name: "trainingField", label: "Nama pelatihan / sertifikasi" },
  { name: "organizer", label: "Penyelenggara", optional: true },
  {
    name: "type",
    label: "Jenis",
    kind: "select",
    optional: true,
    noneLabel: "Belum ditentukan",
    options: TRAINING_TYPES.map((t) => ({ value: t, label: TRAINING_TYPE_LABELS[t] })),
  },
  { name: "hours", label: "Jumlah jam", kind: "number", optional: true },
  { name: "startDate", label: "Tanggal mulai", kind: "date", optional: true },
  { name: "endDate", label: "Tanggal selesai", kind: "date", optional: true },
  { name: "cost", label: "Biaya (Rp)", kind: "number", optional: true, placeholder: "1.500.000" },
];

function trainingMeta(t: Training) {
  const period =
    t.startDate && t.endDate
      ? `${formatDate(t.startDate)} – ${formatDate(t.endDate)}`
      : t.startDate
        ? formatDate(t.startDate)
        : t.trainingYear
          ? String(t.trainingYear)
          : null;
  return [
    t.type ? TRAINING_TYPE_LABELS[t.type] : null,
    t.organizer,
    period,
    t.hours ? `${t.hours} jam` : t.duration,
    t.cost !== undefined && t.cost !== null ? formatRupiah(t.cost) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function TrainingSection({
  employee,
  canManage,
}: {
  employee: EmployeeDetail;
  canManage: boolean;
}) {
  const editor = useItemEditor<Training>("trainings", employee.id, "Pelatihan");
  const current = editor.editing && editor.editing !== "new" ? editor.editing : null;
  return (
    <Section
      title="Pelatihan"
      addLabel="Tambah"
      canManage={canManage}
      onAdd={() => editor.setEditing("new")}
      empty={employee.trainings.length === 0 ? "Belum ada data pelatihan." : null}
    >
      <ul className="space-y-3 empty:hidden">
        {employee.trainings.map((training) => (
          <Item
            key={training.id}
            icon={Award}
            title={training.trainingField}
            meta={trainingMeta(training)}
            actions={
              canManage ? (
                <RowMenu
                  label={training.trainingField}
                  onEdit={() => editor.setEditing(training)}
                  onDelete={() => editor.setDeleting(training)}
                />
              ) : null
            }
          />
        ))}
      </ul>
      <ItemDialog
        open={editor.editing !== null}
        onOpenChange={(open) => !open && editor.setEditing(null)}
        title={current ? "Ubah pelatihan" : "Tambah pelatihan"}
        description="Sertifikat (mis. POP/POM/K3) bisa dilampirkan setelah fitur Data File tersedia."
        fields={TRAINING_FIELDS}
        initial={{
          trainingField: s(current?.trainingField),
          organizer: s(current?.organizer),
          type: s(current?.type),
          hours: s(current?.hours),
          startDate: s(current?.startDate),
          endDate: s(current?.endDate),
          cost: s(current?.cost),
        }}
        validate={check(trainingInputSchema, (v) => ({
          trainingField: v.trainingField ?? "",
          organizer: textOrNull(v.organizer),
          type: v.type || null,
          hours: numberOrNull(v.hours),
          startDate: v.startDate || null,
          endDate: v.endDate || null,
          cost: numberOrNull(v.cost),
          trainingYear: current?.trainingYear ?? null,
          duration: current?.duration ?? null,
        }))}
        onSubmit={editor.submit}
        pending={editor.save.isPending}
      />
      <ConfirmDelete
        open={editor.deleting !== null}
        onOpenChange={(open) => !open && editor.setDeleting(null)}
        what="data pelatihan"
        onConfirm={editor.confirmDelete}
        pending={editor.remove.isPending}
      />
    </Section>
  );
}

// ── Riwayat kerja ─────────────────────────────────────────────────────────────

type WorkExperience = NonNullable<EmployeeDetail["workExperiences"]>[number];
const WORK_FIELDS: FieldDef[] = [
  { name: "companyName", label: "Perusahaan" },
  { name: "position", label: "Jabatan" },
  { name: "startYear", label: "Tahun mulai", kind: "number" },
  {
    name: "endYear",
    label: "Tahun selesai",
    kind: "number",
    optional: true,
    hint: "Kosongkan bila masih.",
  },
  { name: "description", label: "Keterangan", kind: "textarea", optional: true },
];

export function WorkExperienceSection({
  employee,
  canManage,
}: {
  employee: EmployeeDetail;
  canManage: boolean;
}) {
  const items = employee.workExperiences ?? [];
  const editor = useItemEditor<WorkExperience>("work-experiences", employee.id, "Riwayat kerja");
  const current = editor.editing && editor.editing !== "new" ? editor.editing : null;
  return (
    <Section
      title="Riwayat kerja sebelumnya"
      addLabel="Tambah"
      canManage={canManage}
      onAdd={() => editor.setEditing("new")}
      empty={items.length === 0 ? "Belum ada riwayat kerja." : null}
    >
      <ul className="space-y-3 empty:hidden">
        {items.map((work) => (
          <Item
            key={work.id}
            icon={BriefcaseBusiness}
            title={`${work.position} · ${work.companyName}`}
            meta={[`${work.startYear}–${work.endYear ?? "sekarang"}`, work.description]
              .filter(Boolean)
              .join(" · ")}
            actions={
              canManage ? (
                <RowMenu
                  label={work.companyName}
                  onEdit={() => editor.setEditing(work)}
                  onDelete={() => editor.setDeleting(work)}
                />
              ) : null
            }
          />
        ))}
      </ul>
      <ItemDialog
        open={editor.editing !== null}
        onOpenChange={(open) => !open && editor.setEditing(null)}
        title={current ? "Ubah riwayat kerja" : "Tambah riwayat kerja"}
        fields={WORK_FIELDS}
        initial={{
          companyName: s(current?.companyName),
          position: s(current?.position),
          startYear: s(current?.startYear),
          endYear: s(current?.endYear),
          description: s(current?.description),
        }}
        validate={check(workExperienceInputSchema, (v) => ({
          companyName: v.companyName ?? "",
          position: v.position ?? "",
          startYear: numberOrNull(v.startYear),
          endYear: numberOrNull(v.endYear),
          description: textOrNull(v.description),
        }))}
        onSubmit={editor.submit}
        pending={editor.save.isPending}
      />
      <ConfirmDelete
        open={editor.deleting !== null}
        onOpenChange={(open) => !open && editor.setDeleting(null)}
        what="riwayat kerja"
        onConfirm={editor.confirmDelete}
        pending={editor.remove.isPending}
      />
    </Section>
  );
}

// ── Riwayat jabatan ───────────────────────────────────────────────────────────

type History = EmployeeDetail["histories"][number];
const todayJakarta = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const MOVEMENT_OPTIONS = MOVEMENT_TYPES.map((m) => ({ value: m, label: MOVEMENT_TYPE_LABELS[m] }));

/** Tombol "Tambah riwayat lama" + dialog ubah/hapus untuk tab Riwayat. */
export function usePositionHistoryEditor(employee: EmployeeDetail) {
  const master = useMasterData();
  const editor = useItemEditor<History>("position-histories", employee.id, "Riwayat jabatan");
  const current = editor.editing && editor.editing !== "new" ? editor.editing : null;
  const manual = editor.editing === "new" || current?.source === "MANUAL";
  const positionOptions = (master.data?.positions ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    hint: master.data?.departments.find((d) => d.id === p.departmentId)?.name ?? "",
  }));
  const manualFields: FieldDef[] = [
    { name: "effectiveDate", label: "Tanggal efektif", kind: "date" },
    { name: "movementType", label: "Jenis perpindahan", kind: "select", options: MOVEMENT_OPTIONS },
    {
      name: "toPositionId",
      label: "Jabatan (dari master)",
      kind: "select",
      optional: true,
      noneLabel: "Tidak ada di master",
      options: positionOptions,
    },
    {
      name: "toPositionName",
      label: "Atau nama jabatan lama",
      optional: true,
      hint: "Isi bila jabatannya sudah tidak ada di master data.",
    },
    { name: "toDepartmentName", label: "Unit lama", optional: true },
    { name: "decreeNumber", label: "No. SK", optional: true },
    { name: "note", label: "Catatan", kind: "textarea", optional: true },
  ];
  const metaFields: FieldDef[] = [
    {
      name: "movementType",
      label: "Jenis perpindahan",
      kind: "select",
      optional: true,
      noneLabel: "Tidak ditentukan",
      options: MOVEMENT_OPTIONS,
    },
    { name: "decreeNumber", label: "No. SK", optional: true },
    { name: "note", label: "Catatan", kind: "textarea", optional: true },
  ];
  const dialog = (
    <>
      <ItemDialog
        open={editor.editing !== null}
        onOpenChange={(open) => !open && editor.setEditing(null)}
        title={
          editor.editing === "new"
            ? "Tambah riwayat jabatan lama"
            : manual
              ? "Ubah riwayat jabatan lama"
              : "Lengkapi keterangan riwayat"
        }
        description={
          manual
            ? "Untuk mutasi/promosi sebelum memakai HRIS. Perubahan sesudahnya tercatat otomatis."
            : "Riwayat ini dicatat otomatis; isinya tetap, hanya keterangan yang bisa dilengkapi."
        }
        fields={manual ? manualFields : metaFields}
        initial={{
          effectiveDate: s(current?.effectiveDate),
          movementType: s(current?.movementType),
          toPositionId: s(current?.source === "MANUAL" ? current?.toPosition?.id : ""),
          toPositionName: s(current?.toPositionName),
          toDepartmentName: s(current?.toDepartmentName),
          decreeNumber: s(current?.decreeNumber),
          note: s(current?.note),
        }}
        validate={
          manual
            ? check(positionHistoryInputSchema(todayJakarta()), (v) => ({
                effectiveDate: v.effectiveDate ?? "",
                movementType: v.movementType || undefined,
                toPositionId: v.toPositionId || null,
                toPositionName: textOrNull(v.toPositionName),
                toDepartmentName: textOrNull(v.toDepartmentName),
                decreeNumber: textOrNull(v.decreeNumber),
                note: textOrNull(v.note),
              }))
            : check(positionHistoryMetaSchema, (v) => ({
                movementType: v.movementType || null,
                decreeNumber: textOrNull(v.decreeNumber),
                note: textOrNull(v.note),
              }))
        }
        onSubmit={editor.submit}
        pending={editor.save.isPending}
      />
      <ConfirmDelete
        open={editor.deleting !== null}
        onOpenChange={(open) => !open && editor.setDeleting(null)}
        what="riwayat jabatan lama"
        onConfirm={editor.confirmDelete}
        pending={editor.remove.isPending}
      />
    </>
  );
  return {
    add: () => editor.setEditing("new"),
    menu: (h: History, label: string) => (
      <RowMenu
        label={label}
        onEdit={() => editor.setEditing(h)}
        onDelete={h.source === "MANUAL" ? () => editor.setDeleting(h) : undefined}
      />
    ),
    dialog,
  };
}
