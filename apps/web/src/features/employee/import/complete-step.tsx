import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { FormSelect, type SelectOption } from "@/components/form-select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MasterData } from "../schemas";
import type { ImportPreview, UnitChoice } from "./api";
import { type MasterMap, masterKey, positionKey } from "./preview-step";
import { needsUnitChoice, UnitMatching } from "./unit-matching";

// Langkah "Lengkapi data" (Unggah → Pemetaan → Lengkapi → Pratinjau): semua pilihan yang berlaku untuk
// BANYAK baris sekaligus — PT, unit organisasi (D-064), status kepegawaian (D-062) — dikumpulkan di
// sini sebagai daftar tugas bernomor, supaya Pratinjau tinggal memeriksa & menyimpan.

const hasIssue = (preview: ImportPreview, code: string) =>
  preview.rows.filter((r) => r.issues.some((i) => i.code === code)).length;

export function completionState(preview: ImportPreview) {
  const needCompany = hasIssue(preview, "COMPANY_REQUIRED");
  const needStatus = hasIssue(preview, "CATEGORY_REQUIRED");
  const pendingUnits = preview.units.filter(needsUnitChoice).length;
  return {
    needCompany,
    needStatus,
    pendingUnits,
    /** Langkah Lengkapi perlu ditampilkan (ada yang wajib dipilih). */
    needed: needCompany > 0 || needStatus > 0 || pendingUnits > 0,
  };
}

type TaskState = "done" | "todo" | "skip";

function Task({
  n,
  title,
  state,
  summary,
  children,
}: {
  n: number;
  title: string;
  state: TaskState;
  summary: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={`${n}. ${title}`}
      className={cn(
        "bg-card rounded-2xl border p-5",
        state === "todo" && "border-warning-soft-foreground/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold",
            state === "done" && "bg-success-soft text-success-soft-foreground",
            state === "todo" && "bg-warning-soft text-warning-soft-foreground",
            state === "skip" && "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {state === "done" ? <CircleCheck className="size-4" /> : n}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium">
              {n}. {title}
            </p>
            <p
              className={cn(
                "text-sm",
                state === "todo" ? "text-warning-soft-foreground" : "text-muted-foreground",
              )}
            >
              {state === "todo" ? (
                <CircleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
              ) : null}
              {summary}
            </p>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

export function CompleteStep({
  preview,
  master,
  companyOptions,
  defaultCompanyId,
  onDefaultCompanyChange,
  statusOptions,
  defaultStatusId,
  onDefaultStatusChange,
  unitChoices,
  onUnitChoice,
  onApplyUnitSuggestions,
  masterMap,
  onMasterMapChange,
  onBack,
  onNext,
  updating,
}: {
  preview: ImportPreview;
  master: MasterData | undefined;
  companyOptions: SelectOption[];
  defaultCompanyId: string;
  onDefaultCompanyChange: (id: string) => void;
  statusOptions: SelectOption[];
  defaultStatusId: string;
  onDefaultStatusChange: (id: string) => void;
  unitChoices: Record<string, UnitChoice>;
  onUnitChoice: (key: string, choice: UnitChoice | null) => void;
  onApplyUnitSuggestions: () => void;
  masterMap: MasterMap;
  onMasterMapChange: (next: MasterMap) => void;
  onBack: () => void;
  onNext: () => void;
  /** Pratinjau sedang dihitung ulang setelah pilihan berubah. */
  updating: boolean;
}) {
  const state = completionState(preview);
  const newRows = preview.rows.filter((r) => r.newEmployee).length;
  const companyName = companyOptions.find((c) => c.value === defaultCompanyId)?.label;
  const statusName = statusOptions.find((s) => s.value === defaultStatusId)?.label;

  // PT: dari kolom file / data karyawan lama, atau PT bawaan untuk baris tanpa kolom PT.
  const fromFile = new Map<string, number>();
  let byDefault = 0;
  for (const r of preview.rows) {
    if (r.companySource === "DEFAULT") byDefault++;
    else if (r.companyCode && r.companySource)
      fromFile.set(r.companyCode, (fromFile.get(r.companyCode) ?? 0) + 1);
  }
  const needDefaultPt = byDefault > 0 || state.needCompany > 0;
  const ptState: TaskState =
    companyOptions.length <= 1 ? "skip" : state.needCompany > 0 ? "todo" : "done";
  const ptSummary = [
    fromFile.size > 0
      ? `Dari kolom PT di file: ${[...fromFile].map(([code, n]) => `${code} ${n} karyawan`).join(", ")}.`
      : "",
    byDefault > 0
      ? `${byDefault} karyawan tanpa kolom PT masuk ke ${companyName ?? "PT bawaan"}.`
      : "",
    state.needCompany > 0 ? `${state.needCompany} karyawan belum punya PT. Pilih PT di bawah.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const unitState: TaskState =
    preview.units.length === 0 ? "skip" : state.pendingUnits > 0 ? "todo" : "done";
  const statusState: TaskState = newRows === 0 ? "skip" : state.needStatus > 0 ? "todo" : "done";
  const tasks = [ptState, unitState, statusState];
  const done = tasks.filter((t) => t !== "todo").length;

  const { masterData } = preview;
  const optional =
    masterData.positions.length + masterData.grades.length + masterData.workLocations.length;
  const departmentsById = new Map((master?.departments ?? []).map((d) => [d.id, d.name]));
  const pick = (group: keyof MasterMap, key: string, label: string, options: SelectOption[]) => (
    <div
      key={`${group}-${key}`}
      className="grid gap-1.5 sm:grid-cols-[1fr_minmax(0,280px)] sm:items-center"
    >
      <p className="truncate text-sm" title={label}>
        {label}
      </p>
      <FormSelect
        aria-label={`Pemetaan ${label}`}
        value={masterMap[group][key] ?? ""}
        onChange={(value) => {
          const next = { ...masterMap[group] };
          if (value) next[key] = value;
          else delete next[key];
          onMasterMapChange({ ...masterMap, [group]: next });
        }}
        noneLabel="Buat baru"
        placeholder="Buat baru"
        options={options}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Lengkapi data</h2>
          <p className="text-muted-foreground text-sm">
            {done} dari 3 selesai. Pilihan di sini berlaku untuk semua karyawan di file.
          </p>
        </div>
        <p
          className={cn(
            "text-muted-foreground flex items-center gap-1.5 text-xs transition-opacity",
            updating ? "opacity-100" : "opacity-0",
          )}
          aria-live="polite"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {updating ? "Memperbarui…" : ""}
        </p>
      </div>

      <Task
        n={1}
        title="Perusahaan (PT)"
        state={ptState}
        summary={
          ptState === "skip"
            ? `Semua karyawan masuk ke ${companyName ?? "PT Anda"}.`
            : ptSummary || "Semua karyawan sudah punya PT."
        }
      >
        {ptState !== "skip" && needDefaultPt ? (
          <div className="grid max-w-xs gap-1">
            <span className="text-muted-foreground text-xs">PT untuk karyawan tanpa kolom PT</span>
            <FormSelect
              aria-label="Perusahaan bawaan"
              value={defaultCompanyId}
              onChange={onDefaultCompanyChange}
              noneLabel="Belum dipilih"
              placeholder="Pilih PT"
              options={companyOptions}
              invalid={state.needCompany > 0}
            />
          </div>
        ) : null}
      </Task>

      <Task
        n={2}
        title="Unit organisasi (Departemen & Divisi)"
        state={unitState}
        summary={
          unitState === "skip"
            ? "File tidak berisi kolom Departemen/Divisi."
            : state.pendingUnits > 0
              ? `${state.pendingUnits} nilai belum jelas unitnya. Pilih unit yang dimaksud.`
              : "Semua nilai sudah punya unit. Periksa unit baru sebelum lanjut."
        }
      >
        {unitState !== "skip" ? (
          <UnitMatching
            units={preview.units}
            master={master}
            choices={unitChoices}
            onChoice={onUnitChoice}
            onApplySuggestions={onApplyUnitSuggestions}
            busy={updating}
          />
        ) : null}
      </Task>

      <Task
        n={3}
        title="Status kepegawaian"
        state={statusState}
        summary={
          statusState === "skip"
            ? "Semua karyawan di file sudah ada di sistem. Statusnya tidak diubah."
            : state.needStatus > 0
              ? `${state.needStatus} karyawan baru belum punya status. Pilih status bawaan.`
              : `Karyawan baru tanpa kolom status: ${statusName ?? "mengikuti kolom file"}. Bisa diubah per karyawan di Pratinjau.`
        }
      >
        {statusState !== "skip" ? (
          <div className="max-w-xs">
            <FormSelect
              aria-label="Status kepegawaian bawaan"
              value={defaultStatusId}
              onChange={onDefaultStatusChange}
              noneLabel="Belum dipilih"
              placeholder="Pilih status"
              options={statusOptions}
              invalid={state.needStatus > 0}
            />
          </div>
        ) : null}
      </Task>

      {optional > 0 ? (
        <details className="bg-card group rounded-2xl border p-5">
          <summary className="cursor-pointer text-sm font-medium">
            Opsional: {optional} jabatan, grade, atau lokasi baru akan dibuat.
            <span className="text-muted-foreground font-normal">
              {" "}
              Buka bila ada yang sebenarnya sama dengan data yang sudah ada.
            </span>
          </summary>
          <div className="mt-4 space-y-2">
            {masterData.positions.map((p) =>
              pick(
                "positions",
                positionKey(p.department, p.name),
                `Jabatan: ${p.name} (${p.department})`,
                (master?.positions ?? []).map((pos) => ({
                  value: pos.id,
                  label: pos.name,
                  hint: departmentsById.get(pos.departmentId),
                })),
              ),
            )}
            {masterData.grades.map((name) =>
              pick(
                "grades",
                masterKey(name),
                `Grade: ${name}`,
                (master?.grades ?? []).map((g) => ({ value: g.id, label: g.name })),
              ),
            )}
            {masterData.workLocations.map((name) =>
              pick(
                "workLocations",
                masterKey(name),
                `Lokasi kerja: ${name}`,
                (master?.workLocations ?? []).map((l) => ({ value: l.id, label: l.name })),
              ),
            )}
          </div>
        </details>
      ) : null}

      {/* Bilah aksi menempel di bawah layar: sisa pekerjaan & tombol lanjut selalu terlihat. */}
      <div className="bg-background/95 sticky bottom-0 z-10 -mx-1 flex flex-col-reverse gap-3 border-t px-1 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Kembali ke pemetaan
        </Button>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <p
            className={cn(
              "text-sm",
              done < 3 ? "text-warning-soft-foreground font-medium" : "text-muted-foreground",
            )}
          >
            {done < 3 ? `${3 - done} bagian lagi perlu diselesaikan` : "Semua bagian sudah lengkap"}
          </p>
          <Button variant="brand" onClick={onNext} disabled={done < 3 || updating}>
            Lanjut ke pratinjau <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
