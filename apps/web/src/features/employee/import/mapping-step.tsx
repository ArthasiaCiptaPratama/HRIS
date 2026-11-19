import {
  type ColumnSuggestion,
  type DataRow,
  IMPORT_FIELD_KEYS,
  IMPORT_FIELDS,
  type ImportFieldKey,
} from "@hris/shared";
import { ArrowLeft, ArrowRight, Info, TriangleAlert } from "lucide-react";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import { FormSelect } from "@/components/form-select";
import { LazySelect } from "@/components/lazy-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { isSensitiveField, maskValue } from "./labels";

const IGNORE = "__ignore__";

const SECTION_HINT: Record<string, string> = {
  identity: "Identitas",
  work: "Data kerja",
  contact: "Kontak",
  personal: "Data pribadi · butuh izin",
  bank: "Rekening · butuh izin",
  education: "Pendidikan",
  exit: "Keluar/resign",
  contract: "Kontrak · belum disimpan",
  family: "Keluarga · butuh izin",
  training: "Pelatihan",
  attachment: "Lampiran Drive",
};

// D-059: field berkelompok (keluarga, pendidikan 1–3, sertifikasi, SIM) tampil di bawah judul grupnya;
// field lain dikelompokkan per bagian. Urutan kunci kamus field menjaga grup tetap berurutan.
const FIELD_OPTIONS = IMPORT_FIELD_KEYS.map((key) => {
  const def = IMPORT_FIELDS[key];
  return {
    value: key,
    // Label lengkap ("Ayah: Usia") supaya kolom terpilih tetap jelas di tabel pemetaan.
    label: def.label,
    hint: def.group ? undefined : SECTION_HINT[def.section],
    group: def.group ?? "Data karyawan",
  };
});
const PICKER_OPTIONS = [{ value: IGNORE, label: "Abaikan kolom ini" }, ...FIELD_OPTIONS];

function sampleOf(rows: DataRow[], column: number, field: ImportFieldKey | null): string {
  const values: string[] = [];
  for (const row of rows) {
    const cell = row.cells[column];
    if (cell === null || cell === undefined || cell === "") continue;
    const text = cell instanceof Date ? formatDate(cell.toISOString().slice(0, 10)) : String(cell);
    values.push(isSensitiveField(field) ? maskValue(text) : text);
    if (values.length === 2) break;
  }
  return values.length ? values.join(" · ") : "—";
}

function ConfidenceBadge({
  suggestion,
  field,
  merged,
}: {
  suggestion: ColumnSuggestion;
  field: ImportFieldKey | null;
  merged: boolean;
}) {
  if (suggestion.derived && !field) return <Badge variant="muted">Dihitung sistem</Badge>;
  if (!field) return <Badge variant="muted">Diabaikan</Badge>;
  // D-061: pertanyaan Form versi lama & baru ke field yang sama → nilai pertama yang terisi dipakai.
  if (merged)
    return (
      <Badge
        variant="secondary"
        title="Kolom lain berisi field yang sama; nilai pertama yang terisi dipakai"
      >
        Digabung
      </Badge>
    );
  if (field !== suggestion.field) return <Badge variant="secondary">Dipilih manual</Badge>;
  if (suggestion.confidence >= 0.85) return <Badge variant="success">Ya</Badge>;
  if (suggestion.confidence >= 0.6) return <Badge variant="warning">Mungkin</Badge>;
  return <Badge variant="warning">Kurang yakin</Badge>;
}

// Satu baris pemetaan; memo → mencentang "Ingat pemetaan" atau mengubah satu kolom hanya menggambar
// ulang baris yang berubah (sebelumnya 171 baris × dropdown ±200 field ikut digambar ulang).
const MappingRow = memo(function MappingRow({
  suggestion: s,
  rows,
  field,
  merged,
  onSetField,
  needsReview,
}: {
  suggestion: ColumnSuggestion;
  rows: DataRow[];
  field: ImportFieldKey | null;
  merged: boolean;
  needsReview: boolean;
  onSetField: (column: number, value: string) => void;
}) {
  const sample = useMemo(() => sampleOf(rows, s.column, field), [rows, s.column, field]);
  const onChange = useCallback((v: string) => onSetField(s.column, v), [onSetField, s.column]);
  return (
    <TableRow
      className={needsReview ? "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/30" : undefined}
    >
      <TableCell className="font-mono text-xs">{s.letter}</TableCell>
      <TableCell className="truncate font-medium" title={s.header}>
        {s.header || <span className="text-muted-foreground">(tanpa header)</span>}
      </TableCell>
      <TableCell className="text-muted-foreground hidden truncate text-xs lg:table-cell">
        {sample}
      </TableCell>
      <TableCell>
        <LazySelect
          aria-label={`Field untuk kolom ${s.letter}`}
          value={field ?? IGNORE}
          onChange={onChange}
          placeholder="Pilih field"
          options={PICKER_OPTIONS}
        />
      </TableCell>
      <TableCell>
        <ConfidenceBadge suggestion={s} field={field} merged={merged} />
      </TableCell>
    </TableRow>
  );
});

export function MappingStep({
  fileName,
  sheets,
  sheetIndex,
  onSheetChange,
  headerRow,
  rows,
  suggestions,
  mapping,
  onMappingChange,
  savedProfile,
  saveProfile,
  onSaveProfileChange,
  onBack,
  onNext,
  busy,
}: {
  fileName: string;
  sheets: string[];
  sheetIndex: number;
  onSheetChange: (index: number) => void;
  headerRow: number;
  rows: DataRow[];
  suggestions: ColumnSuggestion[];
  mapping: (ImportFieldKey | null)[];
  onMappingChange: Dispatch<SetStateAction<(ImportFieldKey | null)[]>>;
  savedProfile: boolean;
  saveProfile: boolean;
  onSaveProfileChange: (value: boolean) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const mapped = mapping.filter(Boolean).length;
  const fieldCount = useMemo(() => {
    const count = new Map<ImportFieldKey, number>();
    for (const f of mapping) if (f) count.set(f, (count.get(f) ?? 0) + 1);
    return count;
  }, [mapping]);
  // D-063: karyawan dikenali lewat NIP atau NIK KTP — salah satu kolom harus dipetakan.
  const hasNumber = mappingHasIdentity(mapping);
  const reviewColumns = useMemo(
    () => mappingReviewColumns(suggestions, mapping, rows),
    [suggestions, mapping, rows],
  );
  const orderedSuggestions = useMemo(
    () =>
      [...suggestions].sort(
        (a, b) => Number(reviewColumns.has(b.column)) - Number(reviewColumns.has(a.column)),
      ),
    [suggestions, reviewColumns],
  );
  const unused = suggestions.filter((s) => !mapping[s.column]);
  const needsReview = reviewColumns.size > 0 || !hasNumber;
  const showTable = needsReview || detailsOpen;
  // Referensi stabil (updater fungsional) → baris yang tidak berubah tidak digambar ulang.
  const setField = useCallback(
    (column: number, value: string) => {
      const field = value === IGNORE || value === "" ? null : (value as ImportFieldKey);
      // Satu field hanya untuk satu kolom: kolom lain yang memakai field itu dilepas.
      onMappingChange((current) =>
        current.map((f, c) => (c === column ? field : f === field ? null : f)),
      );
    },
    [onMappingChange],
  );

  return (
    <div className="space-y-5">
      <div className="bg-card grid gap-4 rounded-2xl border p-5 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">File</p>
          <p className="truncate text-sm font-medium" title={fileName}>
            {fileName}
          </p>
        </div>
        <div className="min-w-0">
          {sheets.length > 1 ? (
            <div className="grid gap-1.5">
              <Label htmlFor="import-sheet" className="text-muted-foreground text-xs font-normal">
                Lembar
              </Label>
              <FormSelect
                id="import-sheet"
                value={String(sheetIndex)}
                onChange={(v) => onSheetChange(Number(v))}
                placeholder="Pilih lembar"
                options={sheets.map((name, i) => ({ value: String(i), label: name }))}
              />
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">Lembar</p>
              <p className="truncate text-sm font-medium">{sheets[0]}</p>
            </>
          )}
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Isi file</p>
          <p className="text-sm font-medium">
            {rows.length} baris data · judul kolom di baris {headerRow}
          </p>
        </div>
      </div>

      {savedProfile ? (
        <Alert>
          <Info />
          <AlertDescription>
            Pilihan kolom dari import sebelumnya dengan susunan kolom yang sama dipakai lagi. Anda
            tetap bisa mengubahnya.
          </AlertDescription>
        </Alert>
      ) : null}
      {!hasNumber ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            Pilih kolom mana yang berisi <strong>NIP</strong> atau <strong>No. KTP</strong> —
            dipakai untuk mengenali karyawan yang sudah ada.
          </AlertDescription>
        </Alert>
      ) : null}

      {needsReview ? (
        reviewColumns.size > 0 ? (
          <p className="text-sm">Periksa {reviewColumns.size} kolom yang ditandai kuning</p>
        ) : null
      ) : (
        <div className="bg-card space-y-3 rounded-2xl border p-5">
          <p className="font-medium">✔ {mapped} kolom dikenali otomatis</p>
          {unused.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              {unused.length} kolom tidak dipakai
              {unused.length > 0
                ? ` (${unused
                    .slice(0, 4)
                    .map((s) => s.header || "tanpa judul")
                    .join(", ")}${unused.length > 4 ? ", …" : ""})`
                : ""}{" "}
              — tidak apa-apa
            </p>
          ) : null}
          <Button
            variant="outline"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            Lihat / ubah rincian
          </Button>
        </div>
      )}

      {showTable ? (
        <div id={detailsId} className="bg-card overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <Table aria-label="Pemetaan kolom" className="table-fixed">
              <colgroup>
                <col className="w-12" />
                <col className="w-[28%]" />
                <col className="hidden w-[22%] lg:table-column" />
                <col />
                <col className="w-32" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Kolom</TableHead>
                  <TableHead className="whitespace-normal">Judul kolom di file</TableHead>
                  <TableHead className="hidden lg:table-cell">Contoh isi</TableHead>
                  <TableHead>Dipetakan ke</TableHead>
                  <TableHead>Yakin?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedSuggestions.map((s) => {
                  const field = mapping[s.column] ?? null;
                  return (
                    <MappingRow
                      key={s.column}
                      suggestion={s}
                      rows={rows}
                      field={field}
                      merged={field !== null && (fieldCount.get(field) ?? 0) > 1}
                      needsReview={reviewColumns.has(s.column)}
                      onSetField={setField}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Ganti file
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand size-4"
              checked={saveProfile}
              onChange={(e) => onSaveProfileChange(e.target.checked)}
            />
            Ingat pilihan kolom untuk file dengan susunan yang sama
          </label>
          <Button variant="brand" onClick={onNext} disabled={!hasNumber || busy}>
            {busy ? "Memeriksa…" : "Lanjut"} <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** D-063: karyawan dikenali lewat NIP atau NIK KTP — salah satu kolom harus dipetakan. */
export const mappingHasIdentity = (mapping: readonly (ImportFieldKey | null)[]) =>
  mapping.includes("employeeNumber") || mapping.includes("ktpNumber");

/**
 * Kolom yang perlu dicek pengguna: saran berkeyakinan < 0,85 yang belum diubah manual, atau kolom berisi
 * data yang tidak dikenali. Kosong + ada NIP/NIK → langkah Pemetaan dilewati otomatis (IMP-D5).
 */
export function mappingReviewColumns(
  suggestions: readonly ColumnSuggestion[],
  mapping: readonly (ImportFieldKey | null)[],
  rows: readonly DataRow[],
): Set<number> {
  const columns = new Set<number>();
  for (const s of suggestions) {
    const field = mapping[s.column] ?? null;
    // Pilihan manual (termasuk mengabaikan saran) tidak perlu diperiksa lagi.
    if (field !== s.field) continue;
    if (
      field
        ? s.confidence < 0.85
        : !s.derived &&
          rows.some((row) => {
            const cell = row.cells[s.column];
            return cell !== null && cell !== undefined && String(cell).trim() !== "";
          })
    )
      columns.add(s.column);
  }
  return columns;
}
