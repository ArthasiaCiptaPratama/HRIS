import {
  applyCellEdits,
  contractStageLabel,
  EXIT_REASON_LABELS,
  type ImportCellEdits,
  type ImportFieldKey,
  type ImportRowIssue,
  normalizeImportRow,
  type RawImportRow,
} from "@hris/shared";
import { Columns3 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { formatThlWage } from "../../components/thl-section";
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
  "dailyWage",
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
  toolbar,
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
  /** Toolbar di atas grid; menerima tombol "Tampilkan kolom lain" untuk diletakkan di kanan. */
  toolbar: (columnsButton: ReactNode) => ReactNode;
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
    if (preview.rows.some((row) => row.dailyWage))
      out.push({
        key: "dailyWagePlan",
        label: "Upah harian · rencana",
        width: 230,
        kind: "readonly",
      });
    for (const field of shownFields.slice(1)) out.push(fieldColumn(field, locked.has(field)));
    return out;
  }, [
    shownFields.join(","),
    preview.rows,
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
        cells.dailyWagePlan = {
          text: r.dailyWage
            ? `${r.dailyWage.action === "SET" ? "SET · Diisi" : "KEEP · Dibiarkan"}: ${formatThlWage(r.dailyWage.amount)} · ${formatDate(r.dailyWage.effectiveFrom)}`
            : "—",
        };
        const rowLevel = r.issues.filter((i) => i.severity === "ERROR" && !i.field);
        cells.result = {
          text: RESULT[r.action].label,
          tone: RESULT[r.action].tone,
          error: errorText(rowLevel),
          // Rincian non-error (Diisi/Dibiarkan/nonaktif/catatan) di tooltip sel Hasil (pengguna 19 Nov).
          hint: rowInfo(r, fillEmpty, columnOf),
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

  // Pengguna 19 Nov ("Ganti jadi pesan error"): di bawah grid hanya pesan untuk sel terpilih yang bermasalah.
  const [active, setActive] = useState<{ row: number; column: string } | null>(null);
  const activeError = active
    ? sheetRows[active.row]?.cells[active.column]?.error?.replace(/\n/g, " · ")
    : undefined;

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

  const columnsButton =
    otherFields.length > 0 ? (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="shrink-0 rounded-full">
            <Columns3 aria-hidden /> + Tampilkan kolom lain ({otherFields.length})
          </Button>
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
                    setExtra((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))
                  }
                />
                <span className="truncate">{fieldLabel(f)}</span>
                {locked.has(f) ? <span title="Tidak tersimpan untuk akun Anda">🔒</span> : null}
              </label>
            ))}
          </fieldset>
        </PopoverContent>
      </Popover>
    ) : null;

  return (
    <div className="space-y-2">
      <div className="pb-1">{toolbar(columnsButton)}</div>
      <SheetGrid
        label="Pratinjau baris import"
        columns={columns}
        rows={sheetRows}
        onChange={onChange}
        onActiveChange={(row, column) => setActive({ row, column })}
        jumpTo={gridJump}
      />
      <p className="text-destructive text-sm" aria-live="polite">
        {activeError ? `⚠ ${activeError}` : ""}
      </p>
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

/** KTR-D12: "Kontrak: PKWT 1 · 21 Nov 2026–20 Feb 2027 (baru)". */
function contractInfo(contract: NonNullable<Row["contract"]>): string {
  const period = (p: { startDate: string; endDate: string }) =>
    `${formatDate(p.startDate)}–${formatDate(p.endDate)}`;
  const stage = contractStageLabel(contract.kind, contract.sequence);
  const note =
    contract.action === "CREATE"
      ? "baru"
      : contract.action === "CORRECT"
        ? `koreksi dari ${contract.previous ? period(contract.previous) : "—"}`
        : `dibiarkan, tetap ${contract.previous ? period(contract.previous) : "—"}`;
  return `Kontrak: ${stage} · ${period(contract)} (${note})`;
}

/** Rincian baris yang bukan error: yang akan berubah/dibiarkan/dinonaktifkan, catatan, lampiran. */
function rowInfo(
  row: Row,
  fillEmpty: boolean,
  columnOf: (field: ImportFieldKey) => number | undefined,
): string | undefined {
  const lines = [
    row.deactivate
      ? `Akan dinonaktifkan: ${EXIT_REASON_LABELS[row.deactivate.reason]} per ${formatDate(row.deactivate.date)}`
      : null,
    row.contract ? contractInfo(row.contract) : null,
    row.dailyWage
      ? `Upah harian: ${row.dailyWage.action === "SET" ? "Diisi" : "Dibiarkan"} ${formatThlWage(row.dailyWage.amount)}`
      : null,
    row.action === "UPDATE" && row.changes.length > 0
      ? `${fillEmpty ? "Diisi" : "Berubah"}: ${row.changes.map(fieldLabel).join(", ")}`
      : null,
    row.kept.length > 0
      ? `Dibiarkan (sudah berisi, beda): ${row.kept.map(fieldLabel).join(", ")}`
      : null,
    ...row.issues
      .filter((i) => i.severity === "WARNING")
      .map((i) => `Catatan — ${issueText(i, columnOf)}`),
    row.attachments > 0 ? `${row.attachments} lampiran Google Drive` : null,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
}
