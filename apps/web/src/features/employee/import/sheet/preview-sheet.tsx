import {
  applyCellEdits,
  EXIT_REASON_LABELS,
  type ImportCellEdits,
  type ImportFieldKey,
  type ImportRowIssue,
  normalizeImportRow,
  type RawImportRow,
} from "@hris/shared";
import { Columns3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import type { ImportPreview } from "../api";
import { fieldLabel, issueText, maskValue } from "../labels";
import { FIXED_CHOICES } from "../template/build-template";
import {
  type SheetCell,
  type SheetChange,
  type SheetColumn,
  SheetGrid,
  type SheetOption,
  type SheetRowData,
} from "./sheet-grid";

// Paket B (IMP-D6): Pratinjau seperti spreadsheet. Semua sel isian bisa diubah langsung; perubahan disimpan
// induk sebagai `edits[sourceRow][field]` dan dikirim lewat raw di pratinjau/simpan (aturan server sama).
// "Sekali lihat": bawaan hanya kolom penting + kolom yang punya error; kolom lain lewat "Kolom lain".

type Row = ImportPreview["rows"][number];

export const CHART_NEW = "NEW";
const RESULT = {
  CREATE: { label: "Baru", tone: "success" },
  UPDATE: { label: "Diperbarui", tone: "neutral" },
  SKIP: { label: "Dilewati", tone: "muted" },
  ERROR: { label: "Perbaiki", tone: "danger" },
} as const;

/** Kolom penting yang selalu tampil bila ada di file (selain Nama, Hasil, PT, Status). */
const IMPORTANT: ImportFieldKey[] = [
  "employeeNumber",
  "positionName",
  "departmentName",
  "phoneNumber",
];
/** Isian yang punya kolom khusus (PT/Status per baris), bukan kolom isian biasa. */
const SPECIAL: ImportFieldKey[] = ["companyCode", "employmentStatusText"];
const WIDTH: Partial<Record<ImportFieldKey, number>> = {
  fullName: 210,
  employeeNumber: 140,
  phoneNumber: 150,
  personalEmail: 200,
  workEmail: 200,
  ktpNumber: 170,
  ktpAddress: 240,
};
const STORAGE_KEY = "hris.import.sheet.extraColumns";

const isoDate = /^(\d{4})-(\d{2})-(\d{2})T/;
/** Tampilan nilai mentah: tanggal ISO (dari Excel) → 31/01/2026. */
export function displayRaw(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const m = isoDate.exec(text);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : text;
}

const fieldKey = (field: ImportFieldKey) => `f:${field}`;
const cellId = (sourceRow: number, field: string) => `${sourceRow}:${field}`;

function readExtra(): ImportFieldKey[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function PreviewSheet({
  preview,
  rows,
  rawBySource,
  fields,
  edits,
  pending,
  onEdit,
  fillEmpty,
  columnOf,
  companyOptions,
  companyOverrides,
  onCompanyOverride,
  statusOptions,
  statusOverrides,
  onStatusOverride,
  holders,
  holderOptions,
  onChartHolderChoice,
  jumpTo,
}: {
  preview: ImportPreview;
  /** Baris yang tampil (sudah disaring). */
  rows: Row[];
  /** Isi file per baris (sebelum diubah di layar). */
  rawBySource: ReadonlyMap<number, RawImportRow>;
  /** Isian yang ada di file (urutan kolom file). */
  fields: ImportFieldKey[];
  edits: ImportCellEdits;
  /** Sel yang diubah setelah pratinjau terakhir (`baris:isian`) → dicek di browser dulu. */
  pending: ReadonlySet<string>;
  onEdit: (changes: { sourceRow: number; field: ImportFieldKey; value: string }[]) => void;
  fillEmpty: boolean;
  columnOf: (field: ImportFieldKey) => number | undefined;
  companyOptions: SheetOption[];
  companyOverrides: Record<string, string>;
  onCompanyOverride: (sourceRow: number, id: string) => void;
  statusOptions: SheetOption[];
  statusOverrides: Record<string, string>;
  onStatusOverride: (sourceRow: number, id: string) => void;
  /** IMP-D1: kolom Struktur Organisasi tampil · pilihan dibuka untuk semua baris (bukan hanya yang mirip). */
  holders: { column: boolean; all: boolean };
  holderOptions: (row: Row) => SheetOption[];
  onChartHolderChoice: (sourceRow: number, value: string) => void;
  jumpTo?: { sourceRow: number; field: string | null; nonce: number } | null;
}) {
  const locked = useMemo(() => new Set(preview.skippedFields), [preview.skippedFields]);
  // Pilihan per baris dibaca lewat ref → daftar kolom tidak dihitung ulang tiap render.
  const latest = useRef({ rows, holderOptions });
  latest.current = { rows, holderOptions };
  const choosePt = companyOptions.length > 1;
  const hasNewRows = preview.rows.some((r) => r.newEmployee);

  // Validasi instan (aturan shared yang sama dengan server) untuk baris yang punya ubahan belum diperiksa.
  const clientIssues = useMemo(() => {
    const out = new Map<number, ImportRowIssue[]>();
    const rowsWithPending = new Set([...pending].map((id) => Number(id.split(":")[0])));
    for (const sourceRow of rowsWithPending) {
      const [applied] = applyCellEdits(
        [{ sourceRow, raw: rawBySource.get(sourceRow) ?? {} }],
        edits,
      );
      out.set(sourceRow, normalizeImportRow(applied?.raw ?? {}).issues);
    }
    return out;
  }, [pending, edits, rawBySource]);

  const issuesFor = (row: Row, field: ImportFieldKey | null): ImportRowIssue[] => {
    if (field && pending.has(cellId(row.sourceRow, field)))
      return (clientIssues.get(row.sourceRow) ?? []).filter(
        (i) => i.field === field && i.severity === "ERROR",
      );
    return row.issues.filter((i) => i.field === field && i.severity === "ERROR");
  };
  const errorText = (issues: ImportRowIssue[]) =>
    issues.length > 0 ? issues.map((i) => issueText(i, columnOf)).join("\n") : undefined;

  // Kolom isian: penting + yang punya error + pilihan pengguna ("Kolom lain").
  const errorFields = useMemo(() => {
    const set = new Set<ImportFieldKey>();
    for (const r of preview.rows)
      for (const i of r.issues)
        if (i.severity === "ERROR" && i.field && !SPECIAL.includes(i.field as ImportFieldKey))
          set.add(i.field as ImportFieldKey);
    for (const list of clientIssues.values())
      for (const i of list) if (i.severity === "ERROR" && i.field) set.add(i.field);
    return set;
  }, [preview.rows, clientIssues]);
  const [extra, setExtra] = useState<ImportFieldKey[]>(readExtra);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
    } catch {
      // Hanya kenyamanan per pengguna.
    }
  }, [extra]);
  const fileFields = fields.filter((f) => f !== "fullName" && !SPECIAL.includes(f));
  const shownFields = [
    ...IMPORTANT.filter((f) => f === "employeeNumber" || fileFields.includes(f)),
    ...fileFields.filter(
      (f) => !IMPORTANT.includes(f) && (errorFields.has(f) || extra.includes(f)),
    ),
    ...[...errorFields].filter((f) => !IMPORTANT.includes(f) && !fileFields.includes(f)),
  ];
  const otherFields = fileFields.filter((f) => !IMPORTANT.includes(f) && !errorFields.has(f));

  // biome-ignore lint/correctness/useExhaustiveDependencies: daftar kolom dihitung dari kunci string (shownFields)
  const columns = useMemo<SheetColumn[]>(() => {
    const out: SheetColumn[] = [
      { key: fieldKey("fullName"), label: "Nama lengkap", width: 210, kind: "text" },
      { key: "result", label: "Hasil", width: 104, kind: "readonly" },
    ];
    for (const field of shownFields.slice(0, 1)) out.push(fieldColumn(field, locked.has(field)));
    out.push(
      choosePt
        ? {
            key: "company",
            label: "PT",
            width: 110,
            kind: "select",
            options: () => [{ value: "", label: "Ikuti kolom file / bawaan" }, ...companyOptions],
          }
        : {
            // Satu PT dalam cakupan: sel PT mengubah isi kolom PT file (mis. "PNR" yang belum terdaftar).
            key: "company",
            label: "PT",
            width: 90,
            kind: "select",
            options: () => companyOptions.map((c) => ({ ...c, value: c.label })),
          },
    );
    if (hasNewRows)
      out.push({
        key: "status",
        label: "Status",
        width: 150,
        kind: "select",
        hint: "Status kepegawaian karyawan baru",
        options: () => [{ value: "", label: "Ikuti kolom file / bawaan" }, ...statusOptions],
      });
    if (holders.column)
      out.push({
        key: "holder",
        label: "Struktur Organisasi",
        width: 200,
        kind: "select",
        hint: "Orang yang sama di Struktur Organisasi, atau karyawan baru",
        options: (i) => {
          const row = latest.current.rows[i];
          return row ? latest.current.holderOptions(row) : [];
        },
      });
    for (const field of shownFields.slice(1)) out.push(fieldColumn(field, locked.has(field)));
    return out;
  }, [
    shownFields.join(","),
    locked,
    choosePt,
    hasNewRows,
    holders.column,
    companyOptions,
    statusOptions,
  ]);

  const statusName = useMemo(
    () => new Map(statusOptions.map((s) => [s.value, s.label])),
    [statusOptions],
  );
  const companyName = useMemo(
    () => new Map(companyOptions.map((c) => [c.value, c.label])),
    [companyOptions],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: issuesFor/errorText turunan dari clientIssues & pending
  const sheetRows = useMemo<SheetRowData[]>(
    () =>
      rows.map((r) => {
        const raw = rawBySource.get(r.sourceRow) ?? {};
        const changed = edits[r.sourceRow] ?? {};
        const cells: Record<string, SheetCell> = {};
        for (const column of columns) {
          if (!column.key.startsWith("f:")) continue;
          const field = column.key.slice(2) as ImportFieldKey;
          const isEdited = field in changed;
          const value = isEdited ? (changed[field] ?? "") : displayRaw(raw[field]);
          cells[column.key] = {
            text: locked.has(field) && value ? maskValue(value) : value,
            value,
            edited: isEdited,
            error: locked.has(field) ? undefined : errorText(issuesFor(r, field)),
          };
        }
        const rowLevel = r.issues.filter((i) => i.severity === "ERROR" && !i.field);
        cells.result = {
          text: RESULT[r.action].label,
          tone: RESULT[r.action].tone,
          error: errorText(rowLevel),
        };
        const companyOverride = companyOverrides[String(r.sourceRow)];
        const fileCompany =
          "companyCode" in changed ? changed.companyCode : displayRaw(raw.companyCode);
        cells.company = choosePt
          ? {
              text:
                (companyOverride ? companyName.get(companyOverride) : r.companyCode) ?? "Pilih PT",
              value: companyOverride ?? "",
              muted: !r.companyCode && !companyOverride,
              error: errorText(issuesFor(r, "companyCode")),
            }
          : {
              text: fileCompany || r.companyCode || "Pilih PT",
              value: fileCompany ?? "",
              edited: "companyCode" in changed,
              muted: !fileCompany,
              error: errorText(issuesFor(r, "companyCode")),
            };
        const statusOverride = statusOverrides[String(r.sourceRow)];
        cells.status = r.newEmployee
          ? {
              text:
                (statusOverride
                  ? statusName.get(statusOverride)
                  : r.employmentStatusId
                    ? statusName.get(r.employmentStatusId)
                    : undefined) ?? "Pilih status",
              value: statusOverride ?? "",
              muted: !statusOverride && !r.employmentStatusId,
              error: errorText(issuesFor(r, "employmentStatusText")),
            }
          : { text: "Sudah ada", muted: true, disabled: true };
        const holder = r.chartHolder;
        const holderOpen =
          holder &&
          preview.chartHolders.length > 0 &&
          (holder.candidates.length > 0 || holder.choice || holders.all);
        const chosen = holder?.choice
          ? holder.choice === CHART_NEW
            ? "Karyawan baru"
            : preview.chartHolders.find((h) => h.id === holder.choice)?.fullName
          : undefined;
        cells.holder = holderOpen
          ? {
              text: chosen ?? (holder.candidates.length > 0 ? "Pilih: mirip" : "—"),
              value: holder.choice ?? "",
              muted: !chosen,
              error:
                holder.candidates.length > 0 && !holder.choice
                  ? "Nama mirip orang di Struktur Organisasi — pilih dulu"
                  : errorText(r.issues.filter((i) => i.code.startsWith("CHART_HOLDER"))),
            }
          : { text: "", disabled: true };
        return { key: String(r.sourceRow), label: String(r.sourceRow), cells };
      }),
    [
      rows,
      columns,
      rawBySource,
      edits,
      locked,
      clientIssues,
      pending,
      companyOverrides,
      statusOverrides,
      companyName,
      statusName,
      preview.chartHolders,
      holders.all,
    ],
  );

  const onChange = (changes: SheetChange[]) => {
    const fieldChanges: { sourceRow: number; field: ImportFieldKey; value: string }[] = [];
    for (const ch of changes) {
      const row = rows[ch.row];
      if (!row) continue;
      if (ch.column === "company" && choosePt) onCompanyOverride(row.sourceRow, ch.value);
      else if (ch.column === "company")
        fieldChanges.push({ sourceRow: row.sourceRow, field: "companyCode", value: ch.value });
      else if (ch.column === "status") onStatusOverride(row.sourceRow, ch.value);
      else if (ch.column === "holder") onChartHolderChoice(row.sourceRow, ch.value);
      else if (ch.column.startsWith("f:"))
        fieldChanges.push({
          sourceRow: row.sourceRow,
          field: ch.column.slice(2) as ImportFieldKey,
          value: ch.value,
        });
    }
    if (fieldChanges.length > 0) onEdit(fieldChanges);
  };

  // Keterangan baris aktif (satu baris di bawah grid): alasan error lengkap + perubahan yang akan terjadi.
  const [active, setActive] = useState<{ row: number; column: string } | null>(null);
  const activeRow = active ? rows[active.row] : undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu nonce
  const gridJump = useMemo(() => {
    if (!jumpTo) return null;
    const index = rows.findIndex((r) => r.sourceRow === jumpTo.sourceRow);
    if (index < 0) return null;
    const column =
      jumpTo.field === "companyCode"
        ? "company"
        : jumpTo.field === "employmentStatusText"
          ? "status"
          : jumpTo.field
            ? fieldKey(jumpTo.field as ImportFieldKey)
            : "result";
    return { row: index, column, nonce: jumpTo.nonce };
  }, [jumpTo?.nonce]);

  return (
    <div className="space-y-2">
      <SheetGrid
        label="Pratinjau baris import"
        columns={columns}
        rows={sheetRows}
        onChange={onChange}
        onActiveChange={(row, column) => setActive({ row, column })}
        jumpTo={gridJump}
      />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        {activeRow ? (
          <RowDetails
            row={activeRow}
            activeField={active?.column.startsWith("f:") ? active.column.slice(2) : null}
            issues={[
              ...activeRow.issues.filter(
                (i) => !(i.field && pending.has(cellId(activeRow.sourceRow, i.field))),
              ),
              ...(clientIssues.get(activeRow.sourceRow) ?? []).filter(
                (i) => i.field && pending.has(cellId(activeRow.sourceRow, i.field)),
              ),
            ]}
            fillEmpty={fillEmpty}
            columnOf={columnOf}
          />
        ) : (
          <span />
        )}
        {otherFields.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-sm underline-offset-4 hover:underline"
              >
                <Columns3 className="size-3.5" aria-hidden /> Kolom lain ({otherFields.length})
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-80 w-64 overflow-auto p-2">
              <fieldset className="space-y-1">
                <legend className="text-muted-foreground px-1 pb-1 text-xs">Tampilkan kolom</legend>
                {otherFields.map((f) => (
                  <label
                    key={f}
                    className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={extra.includes(f)}
                      onChange={(e) =>
                        setExtra((cur) =>
                          e.target.checked ? [...cur, f] : cur.filter((x) => x !== f),
                        )
                      }
                    />
                    <span className="truncate">{fieldLabel(f)}</span>
                    {locked.has(f) ? <span title="Tidak tersimpan untuk akun Anda">🔒</span> : null}
                  </label>
                ))}
              </fieldset>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

function fieldColumn(field: ImportFieldKey, isLocked: boolean): SheetColumn {
  const choices = FIXED_CHOICES[field];
  return {
    key: fieldKey(field),
    label: fieldLabel(field).replace(/\s*\([^)]*\)$/, ""),
    width: WIDTH[field] ?? 150,
    kind: choices ? "select" : "text",
    allowFree: Boolean(choices),
    options: choices ? () => choices.map((c) => ({ value: c, label: c })) : undefined,
    locked: isLocked,
    hint: isLocked ? "Tidak tersimpan: akun Anda belum punya izin data pribadi" : undefined,
  };
}

function RowDetails({
  row,
  activeField,
  issues,
  fillEmpty,
  columnOf,
}: {
  row: Row;
  activeField: string | null;
  issues: ImportRowIssue[];
  fillEmpty: boolean;
  columnOf: (field: ImportFieldKey) => number | undefined;
}) {
  const errors = issues
    .filter((i) => i.severity === "ERROR")
    .sort((a, b) => Number(b.field === activeField) - Number(a.field === activeField));
  const warnings = issues.filter((i) => i.severity === "WARNING");
  return (
    <div className="min-w-0 space-y-0.5 text-sm" aria-live="polite">
      <p className="text-muted-foreground">
        Baris {row.sourceRow} · <span className="text-foreground">{row.fullName ?? "-"}</span>
        {row.attachments > 0 ? ` · ${row.attachments} lampiran Google Drive` : ""}
      </p>
      {errors.map((i) => (
        <p key={`${i.field}-${i.code}`} className="text-destructive">
          {issueText(i, columnOf)}
        </p>
      ))}
      {row.deactivate ? (
        <p>
          Akan dinonaktifkan: {EXIT_REASON_LABELS[row.deactivate.reason]} per{" "}
          {formatDate(row.deactivate.date)}
        </p>
      ) : null}
      {row.action === "UPDATE" && row.changes.length > 0 ? (
        <p className="text-muted-foreground">
          {fillEmpty ? "Diisi" : "Berubah"}: {row.changes.map(fieldLabel).join(", ")}
        </p>
      ) : null}
      {row.kept.length > 0 ? (
        <p className="text-muted-foreground">
          Dibiarkan (sudah berisi, beda): {row.kept.map(fieldLabel).join(", ")}
        </p>
      ) : null}
      {warnings.map((i) => (
        <p key={`w-${i.field}-${i.code}`} className="text-warning-soft-foreground text-xs">
          {issueText(i, columnOf)}
        </p>
      ))}
    </div>
  );
}
