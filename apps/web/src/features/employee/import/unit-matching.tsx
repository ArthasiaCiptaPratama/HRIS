import {
  ORG_UNIT_TYPE_LABELS,
  ORG_UNIT_TYPES,
  type OrgUnitType,
  UNIT_SIMILARITY_LABELS,
} from "@hris/shared";
import { CheckCheck, ListFilter } from "lucide-react";
import { useMemo, useState } from "react";
import { FormSelect, type SelectOption } from "@/components/form-select";
import { LazySelect } from "@/components/lazy-select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MasterData } from "../schemas";
import type { UnitChoice, UnitPreview } from "./api";

// D-064: nilai kolom Departemen/Divisi → unit organisasi, per PT. Satu daftar dengan urutan tetap dari
// server (baris tidak berpindah setelah dipilih). Nilai dropdown: "" = otomatis, "u:<id>" = unit yang
// ada, "k:<kunci>" = sama dengan nilai lain di file, "new" = buat unit baru (jenis & induk di bawahnya).

const AUTO = "";
const NEW = "new";
const NO_PARENT = "none";

const COLUMN_LABELS = { departmentName: "Departemen", divisionName: "Divisi" } as const;

const STATUS: Record<UnitPreview["status"], { label: string; className: string }> = {
  NEEDS_REVIEW: {
    label: "Perlu dipilih",
    className: "bg-warning-soft text-warning-soft-foreground",
  },
  INVALID: { label: "Pilih ulang", className: "bg-destructive/10 text-destructive" },
  MATCHED: { label: "Sudah ada", className: "bg-success-soft text-success-soft-foreground" },
  CHOSEN: { label: "Dipilih", className: "bg-success-soft text-success-soft-foreground" },
  NEW: { label: "Unit baru", className: "bg-muted text-foreground" },
};

function choiceValue(unit: UnitPreview, choice: UnitChoice | undefined): string {
  if (!choice) return unit.status === "NEW" ? NEW : AUTO;
  if ("unitId" in choice) return `u:${choice.unitId}`;
  if ("sameAs" in choice) return `k:${choice.sameAs}`;
  return NEW;
}

export const needsUnitChoice = (u: UnitPreview) =>
  u.status === "NEEDS_REVIEW" || u.status === "INVALID";

/** Saran pertama yang aman diterapkan otomatis (tidak saling menunjuk). */
export function suggestedChoices(
  units: UnitPreview[],
  current: Record<string, UnitChoice>,
): Record<string, UnitChoice> {
  const next = { ...current };
  for (const unit of units) {
    if (unit.status !== "NEEDS_REVIEW" || next[unit.key]) continue;
    const top = unit.suggestions[0];
    if (!top) continue;
    if (top.unitId) next[unit.key] = { unitId: top.unitId };
    else if (top.key) {
      const back = next[top.key];
      if (back && "sameAs" in back && back.sameAs === unit.key) continue;
      next[unit.key] = { sameAs: top.key };
    }
  }
  return next;
}

type Department = MasterData["departments"][number];

function UnitRow({
  unit,
  units,
  choice,
  departments,
  showCompany,
  onChoice,
}: {
  unit: UnitPreview;
  units: UnitPreview[];
  choice: UnitChoice | undefined;
  departments: Department[];
  showCompany: boolean;
  onChoice: (key: string, choice: UnitChoice | null) => void;
}) {
  // Hanya unit milik PT baris ini atau unit grup (tanpa PT).
  const ownUnits: SelectOption[] = useMemo(
    () =>
      departments
        .filter((d) => !d.companyId || d.companyId === unit.companyId)
        .map((d) => ({
          value: `u:${d.id}`,
          label: d.name,
          hint: ORG_UNIT_TYPE_LABELS[d.unitType],
          group: "Unit yang sudah ada",
        })),
    [departments, unit.companyId],
  );
  const value = choiceValue(unit, choice);
  const pending = needsUnitChoice(unit);
  const options: SelectOption[] = [
    ...(unit.status === "NEW" || choice
      ? [{ value: AUTO, label: "Ikuti saran sistem", group: "Otomatis" }]
      : []),
    ...unit.suggestions.map((s) => ({
      value: s.unitId ? `u:${s.unitId}` : `k:${s.key}`,
      label: s.unitId ? s.name : `Samakan dengan "${s.name}"`,
      hint: s.unitId
        ? UNIT_SIMILARITY_LABELS[s.reason]
        : `${UNIT_SIMILARITY_LABELS[s.reason]}, nilai lain di file`,
      group: "Saran",
    })),
    { value: NEW, label: "Buat sebagai unit baru", group: "Unit baru" },
    ...ownUnits,
  ];
  const create = choice && "create" in choice ? choice.create : unit.create;
  const parentValue = create?.parentUnitId
    ? `u:${create.parentUnitId}`
    : create?.parentKey
      ? `k:${create.parentKey}`
      : NO_PARENT;
  const setCreate = (patch: { unitType?: OrgUnitType; parent?: string }) => {
    const unitType = patch.unitType ?? create?.unitType ?? "DEPARTMENT";
    const parent = patch.parent ?? parentValue;
    onChoice(unit.key, {
      create: {
        unitType,
        parentUnitId: parent.startsWith("u:") ? parent.slice(2) : null,
        parentKey: parent.startsWith("k:") ? parent.slice(2) : null,
      },
    });
  };
  const newSiblings = units.filter(
    (u) => u.create && u.key !== unit.key && u.companyId === unit.companyId,
  );

  return (
    <li
      className={cn(
        "grid gap-3 border-l-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]",
        pending ? "border-l-warning-soft-foreground bg-warning-soft/40" : "border-l-transparent",
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium" title={unit.name}>
            {unit.name}
          </p>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              STATUS[unit.status].className,
            )}
          >
            {STATUS[unit.status].label}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          {showCompany && unit.companyCode ? `PT ${unit.companyCode} · ` : ""}
          Kolom {unit.columns.map((c) => COLUMN_LABELS[c]).join(" & ")} · {unit.rows} karyawan
        </p>
        {pending ? (
          <p className="text-warning-soft-foreground text-xs">
            {unit.status === "INVALID"
              ? "Pilihan sebelumnya tidak berlaku lagi. Pilih ulang."
              : "Mirip unit lain. Pilih unit yang dimaksud atau buat sebagai unit baru."}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <LazySelect
          aria-label={`Unit untuk ${unit.name}${unit.companyCode ? ` (${unit.companyCode})` : ""}`}
          value={value}
          onChange={(v) => {
            if (v === AUTO) onChoice(unit.key, null);
            else if (v === NEW) setCreate({});
            else if (v.startsWith("u:")) onChoice(unit.key, { unitId: v.slice(2) });
            else if (v.startsWith("k:")) onChoice(unit.key, { sameAs: v.slice(2) });
          }}
          placeholder="Pilih unit"
          options={options}
          invalid={pending}
        />
        {value === NEW ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs">Jenis unit</span>
              <FormSelect
                aria-label={`Jenis unit baru ${unit.name}`}
                value={create?.unitType ?? "DEPARTMENT"}
                onChange={(v) => setCreate({ unitType: v as OrgUnitType })}
                placeholder="Jenis"
                options={ORG_UNIT_TYPES.map((t) => ({ value: t, label: ORG_UNIT_TYPE_LABELS[t] }))}
              />
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs">Di bawah</span>
              <LazySelect
                aria-label={`Induk unit baru ${unit.name}`}
                value={parentValue}
                onChange={(v) => setCreate({ parent: v })}
                placeholder="Induk"
                options={[
                  { value: NO_PARENT, label: "Tidak ada (unit teratas)" },
                  ...newSiblings.map((u) => ({
                    value: `k:${u.key}`,
                    label: u.newName ?? u.name,
                    hint: "unit baru",
                    group: "Unit baru dari file",
                  })),
                  ...ownUnits,
                ]}
              />
            </div>
            {unit.newName && unit.newName !== unit.name ? (
              <p className="text-muted-foreground col-span-2 text-xs">
                Disimpan dengan nama <span className="text-foreground">{unit.newName}</span> karena
                nama yang sama sudah dipakai.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function UnitMatching({
  units,
  master,
  choices,
  onChoice,
  onApplySuggestions,
  busy,
}: {
  units: UnitPreview[];
  master: MasterData | undefined;
  choices: Record<string, UnitChoice>;
  /** null = kembali otomatis. */
  onChoice: (key: string, choice: UnitChoice | null) => void;
  onApplySuggestions: () => void;
  busy: boolean;
}) {
  const [onlyPending, setOnlyPending] = useState(false);
  const departments = master?.departments ?? [];
  const pending = units.filter(needsUnitChoice).length;
  const created = units.filter((u) => u.create).length;
  const existing = units.length - pending - created;
  const suggestable = units.filter(
    (u) => u.status === "NEEDS_REVIEW" && u.suggestions.length > 0 && !choices[u.key],
  ).length;
  const showCompany = new Set(units.map((u) => u.companyId)).size > 1;
  const shown = onlyPending ? units.filter(needsUnitChoice) : units;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className={cn(pending > 0 && "text-warning-soft-foreground font-medium")}>
            {pending} perlu dipilih
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {existing} sudah ada · {created} unit baru
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {pending > 0 || onlyPending ? (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={onlyPending}
              onClick={() => setOnlyPending((v) => !v)}
            >
              <ListFilter /> {onlyPending ? "Tampilkan semua" : "Hanya yang perlu dipilih"}
            </Button>
          ) : null}
          {suggestable > 0 ? (
            <Button variant="outline" size="sm" onClick={onApplySuggestions} disabled={busy}>
              <CheckCheck /> Pakai saran untuk {suggestable} nilai
            </Button>
          ) : null}
        </div>
      </div>
      {shown.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {shown.map((unit) => (
            <UnitRow
              key={unit.key}
              unit={unit}
              units={units}
              choice={choices[unit.key]}
              departments={departments}
              showCompany={showCompany}
              onChoice={onChoice}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          Tidak ada lagi yang perlu dipilih.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Karyawan ditempatkan di unit paling bawah dari kolom Departemen dan Divisi. Nilai yang belum
        ada dibuat sebagai unit baru milik PT karyawannya.
      </p>
    </div>
  );
}
