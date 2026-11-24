import { findSimilarMaster } from "@hris/shared";
import { ArrowLeft, ArrowRight, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { FormSelect, type SelectOption } from "@/components/form-select";
import { Button } from "@/components/ui/button";
import type { MasterData } from "../schemas";
import type { ImportPreview, UnitChoice } from "./api";
import { InfoTip } from "./info-tip";
import { type MasterMap, masterKey, positionKey } from "./preview-step";
import { needsUnitChoice, UnitMatching } from "./unit-matching";

// Langkah "Lengkapi data" (Unggah → Pemetaan → Lengkapi → Pratinjau): semua pilihan yang berlaku untuk
// BANYAK baris sekaligus — PT, unit organisasi (D-064), status kepegawaian (D-062) — dikumpulkan di
// sini, supaya Pratinjau tinggal memeriksa & menyimpan. IMP-D5 "sekali lihat": yang wajib dipilih
// tampil sebagai kartu bernomor; yang sudah beres cukup satu baris "✔ PT: ACP".

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

/** Bagian yang sudah beres: satu baris "✔ PT: ACP" (+ pilihan kecil bila masih bisa diubah). */
function DoneLine({
  label,
  value,
  control,
  children,
}: {
  label: string;
  value: string;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section aria-label={label} className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <CircleCheck className="text-success-soft-foreground size-4 shrink-0" aria-hidden />
          <span className="text-muted-foreground">{label}:</span>
          {/* Ada pilihan → nilainya sudah terlihat di dropdown (tidak ditulis dua kali). */}
          {control ? null : <span className="font-medium">{value}</span>}
        </span>
        {control ? <div className="w-full max-w-60">{control}</div> : null}
      </div>
      {children ? <div className="pl-6">{children}</div> : null}
    </section>
  );
}

/** Bagian yang wajib dipilih: kartu bernomor dengan judul + jumlah dalam satu baris. */
function TodoCard({
  n,
  title,
  count,
  children,
}: {
  n: number;
  title: string;
  count: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="bg-card border-warning-soft-foreground/40 space-y-3 rounded-2xl border p-4"
    >
      <p className="flex flex-wrap items-center gap-x-2 font-medium">
        <span
          className="bg-warning-soft text-warning-soft-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold"
          aria-hidden
        >
          {n}
        </span>
        {title}
        <span className="text-warning-soft-foreground text-sm font-normal">— {count}</span>
      </p>
      {children}
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
  const server = completionState(preview);
  // Pilihan baru sedang dihitung ulang → hitungan langsung ikut pilihan (pratinjau lama masih tampil);
  // setelah pratinjau kembali, hasil server yang dipakai.
  const state = {
    ...server,
    needCompany: updating && defaultCompanyId ? 0 : server.needCompany,
    needStatus: updating && defaultStatusId ? 0 : server.needStatus,
  };
  const newRows = preview.rows.filter((r) => r.newEmployee).length;
  const companyName = companyOptions.find((c) => c.value === defaultCompanyId)?.label;
  const statusName = statusOptions.find((s) => s.value === defaultStatusId)?.label;

  // PT: dari kolom file / data karyawan lama, atau PT bawaan untuk baris tanpa kolom PT.
  const fromFile = new Set<string>();
  let byDefault = 0;
  for (const r of preview.rows) {
    if (r.companySource === "DEFAULT") byDefault++;
    else if (r.companyCode && r.companySource) fromFile.add(r.companyCode);
  }
  const needDefaultPt = byDefault > 0 || state.needCompany > 0;
  const ptState: TaskState =
    companyOptions.length <= 1 ? "skip" : state.needCompany > 0 ? "todo" : "done";
  const ptValue =
    [...fromFile, ...(byDefault > 0 && companyName ? [companyName] : [])].join(", ") ||
    companyName ||
    "PT Anda";
  const unitState: TaskState =
    preview.units.length === 0 ? "skip" : state.pendingUnits > 0 ? "todo" : "done";
  const statusState: TaskState = newRows === 0 ? "skip" : state.needStatus > 0 ? "todo" : "done";
  const todo = [ptState, unitState, statusState].filter((t) => t === "todo").length;
  const createdUnits = preview.units.filter((u) => u.create).length;

  const ptSelect =
    ptState !== "skip" && needDefaultPt ? (
      <FormSelect
        aria-label="Perusahaan bawaan"
        value={defaultCompanyId}
        onChange={onDefaultCompanyChange}
        noneLabel="Belum dipilih"
        placeholder="Pilih PT"
        options={companyOptions}
        invalid={state.needCompany > 0}
      />
    ) : null;
  const statusSelect = (
    <FormSelect
      aria-label="Status kepegawaian bawaan"
      value={defaultStatusId}
      onChange={onDefaultStatusChange}
      noneLabel="Belum dipilih"
      placeholder="Pilih status"
      options={statusOptions}
      invalid={state.needStatus > 0}
    />
  );
  const units = (
    <UnitMatching
      units={preview.units}
      master={master}
      choices={unitChoices}
      onChoice={onUnitChoice}
      onApplySuggestions={onApplyUnitSuggestions}
      busy={updating}
    />
  );

  // Kartu yang wajib dipilih di atas (bernomor), yang sudah beres jadi satu baris di bawahnya.
  let n = 0;
  const todos: ReactNode[] = [];
  const dones: ReactNode[] = [];
  if (ptState === "todo")
    todos.push(
      <TodoCard
        key="pt"
        n={++n}
        title="Perusahaan (PT)"
        count={`${state.needCompany} karyawan belum punya PT`}
      >
        <div className="max-w-xs">{ptSelect}</div>
      </TodoCard>,
    );
  else dones.push(<DoneLine key="pt" label="PT" value={ptValue} control={ptSelect} />);
  if (unitState === "todo")
    todos.push(
      <TodoCard
        key="unit"
        n={++n}
        title="Departemen & Divisi"
        count={`${state.pendingUnits} perlu dipilih`}
      >
        {units}
      </TodoCard>,
    );
  else if (unitState === "done")
    dones.push(
      <DoneLine
        key="unit"
        label="Departemen & Divisi"
        value={`${preview.units.length - createdUnits} sudah ada${createdUnits > 0 ? ` · ${createdUnits} baru` : ""}`}
      >
        {units}
      </DoneLine>,
    );
  if (statusState === "todo")
    todos.push(
      <TodoCard
        key="status"
        n={++n}
        title="Status karyawan baru"
        count={`${state.needStatus} karyawan baru belum punya status`}
      >
        <div className="max-w-xs">{statusSelect}</div>
      </TodoCard>,
    );
  else if (statusState === "done")
    dones.push(
      <DoneLine
        key="status"
        label="Status karyawan baru"
        value={statusName ?? "dari kolom file"}
        control={statusSelect}
      />,
    );

  const { masterData } = preview;
  const optional =
    masterData.positions.length +
    masterData.grades.length +
    masterData.workLocations.length +
    masterData.homebases.length;
  const departmentsById = new Map((master?.departments ?? []).map((d) => [d.id, d.name]));
  // IMP-D5: daftar "Akan dibuat baru" selalu terlihat; nilai yang mirip data lama diberi tanda +
  // "Pakai yang ada" dan ditaruh paling atas (tidak pernah dipilih otomatis — bawaan tetap Buat baru).
  const GROUP_TITLES: Record<keyof MasterMap, string> = {
    departments: "Unit",
    positions: "Jabatan",
    grades: "Grade",
    workLocations: "Lokasi kerja",
    homebases: "Homebase",
  };
  const setMaster = (group: keyof MasterMap, key: string, value: string) => {
    const next = { ...masterMap[group] };
    if (value) next[key] = value;
    else delete next[key];
    onMasterMapChange({ ...masterMap, [group]: next });
  };
  const group = (
    name: keyof MasterMap,
    entries: { key: string; name: string; label: string }[],
    options: SelectOption[],
  ) => {
    if (entries.length === 0) return null;
    const candidates = options.map((o) => ({ id: o.value, name: o.label }));
    const items = entries
      .map((e) => ({
        ...e,
        similar: masterMap[name][e.key] ? null : findSimilarMaster(e.name, candidates),
      }))
      .sort((a, b) => Number(Boolean(b.similar)) - Number(Boolean(a.similar)));
    return (
      <div className="space-y-2">
        <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {GROUP_TITLES[name]}
        </h4>
        {items.map(({ key, label, similar }) => (
          <div
            key={`${name}-${key}`}
            className="grid gap-1.5 sm:grid-cols-[1fr_minmax(0,280px)] sm:items-center"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
              <span className="truncate" title={label}>
                {label}
              </span>
              {similar ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 text-xs text-amber-700 dark:text-amber-300">
                  <span className="inline-flex items-center gap-1">
                    <TriangleAlert className="size-3.5" aria-hidden /> Mirip: {similar.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMaster(name, key, similar.id)}
                    className="text-foreground font-medium underline underline-offset-4"
                  >
                    Pakai yang ada
                  </button>
                </span>
              ) : null}
            </div>
            <FormSelect
              aria-label={`Pemetaan ${GROUP_TITLES[name]}: ${label}`}
              value={masterMap[name][key] ?? ""}
              onChange={(value) => setMaster(name, key, value)}
              noneLabel="Buat baru"
              placeholder="Buat baru"
              options={options}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Lengkapi data</h2>
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          {updating ? (
            <Loader2
              className="text-muted-foreground size-3.5 animate-spin"
              aria-label="Memperbarui…"
            />
          ) : null}
          {todo > 0 ? (
            <span className="text-warning-soft-foreground font-medium">
              {todo} hal perlu dipilih
            </span>
          ) : (
            <span className="text-muted-foreground">Semua sudah lengkap</span>
          )}
        </p>
      </div>

      {todos}
      {dones.length > 0 ? <div className="space-y-3 px-1">{dones}</div> : null}

      {optional > 0 ? (
        <section aria-label="Akan dibuat baru" className="bg-card space-y-4 rounded-2xl border p-4">
          <h3 className="flex items-center gap-1 text-sm font-semibold">
            Akan dibuat baru ({optional})
            <InfoTip label="Tentang Akan dibuat baru">
              Nilai ini belum ada di HRIS dan akan dibuat baru. Bila sebenarnya sudah ada, pilih
              yang ada.
            </InfoTip>
          </h3>
          {group(
            "positions",
            masterData.positions.map((p) => ({
              key: positionKey(p.department, p.name),
              name: p.name,
              label: `${p.name} (${p.department})`,
            })),
            (master?.positions ?? []).map((pos) => ({
              value: pos.id,
              label: pos.name,
              hint: departmentsById.get(pos.departmentId),
            })),
          )}
          {group(
            "grades",
            masterData.grades.map((name) => ({ key: masterKey(name), name, label: name })),
            (master?.grades ?? []).map((g) => ({ value: g.id, label: g.name })),
          )}
          {group(
            "workLocations",
            masterData.workLocations.map((name) => ({ key: masterKey(name), name, label: name })),
            (master?.workLocations ?? []).map((l) => ({ value: l.id, label: l.name })),
          )}
          {group(
            "homebases",
            masterData.homebases.map((name) => ({ key: masterKey(name), name, label: name })),
            (master?.homebases ?? []).map((h) => ({ value: h.id, label: h.name })),
          )}
        </section>
      ) : null}

      {/* Bilah aksi menempel di bawah layar: tombol lanjut selalu terlihat. */}
      <div className="bg-background/95 sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t px-1 py-3 backdrop-blur">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Kembali
        </Button>
        <Button variant="brand" onClick={onNext} disabled={todo > 0 || updating}>
          Lanjut <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
