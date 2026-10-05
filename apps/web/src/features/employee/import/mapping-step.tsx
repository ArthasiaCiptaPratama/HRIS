import {
  type ColumnSuggestion,
  type DataRow,
  IMPORT_FIELD_KEYS,
  IMPORT_FIELDS,
  type ImportFieldKey,
} from "@hris/shared";
import { ArrowLeft, ArrowRight, Info, TriangleAlert } from "lucide-react";
import { FormSelect } from "@/components/form-select";
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
};

const FIELD_OPTIONS = IMPORT_FIELD_KEYS.map((key) => ({
  value: key,
  label: IMPORT_FIELDS[key].label,
  hint: SECTION_HINT[IMPORT_FIELDS[key].section],
}));

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
}: {
  suggestion: ColumnSuggestion;
  field: ImportFieldKey | null;
}) {
  if (suggestion.derived && !field) return <Badge variant="muted">Dihitung sistem</Badge>;
  if (!field) return <Badge variant="muted">Diabaikan</Badge>;
  if (field !== suggestion.field) return <Badge variant="secondary">Dipilih manual</Badge>;
  if (suggestion.confidence >= 0.85) return <Badge variant="success">Tinggi</Badge>;
  if (suggestion.confidence >= 0.6) return <Badge variant="warning">Sedang</Badge>;
  return <Badge variant="warning">Rendah</Badge>;
}

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
  onMappingChange: (mapping: (ImportFieldKey | null)[]) => void;
  savedProfile: boolean;
  saveProfile: boolean;
  onSaveProfileChange: (value: boolean) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  const mapped = mapping.filter(Boolean).length;
  const hasNumber = mapping.includes("employeeNumber");
  const setField = (column: number, value: string) => {
    const field = value === IGNORE || value === "" ? null : (value as ImportFieldKey);
    // Satu field hanya untuk satu kolom: kolom lain yang memakai field itu dilepas.
    onMappingChange(
      mapping.map((current, c) => (c === column ? field : current === field ? null : current)),
    );
  };

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
                Sheet
              </Label>
              <FormSelect
                id="import-sheet"
                value={String(sheetIndex)}
                onChange={(v) => onSheetChange(Number(v))}
                placeholder="Pilih sheet"
                options={sheets.map((name, i) => ({ value: String(i), label: name }))}
              />
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">Sheet</p>
              <p className="truncate text-sm font-medium">{sheets[0]}</p>
            </>
          )}
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Struktur terdeteksi</p>
          <p className="text-sm font-medium">
            Header baris {headerRow} · {rows.length} baris data · {mapped} kolom dipetakan
          </p>
        </div>
      </div>

      {savedProfile ? (
        <Alert>
          <Info />
          <AlertDescription>
            Pemetaan tersimpan untuk susunan kolom ini dipakai otomatis. Anda tetap bisa
            mengubahnya.
          </AlertDescription>
        </Alert>
      ) : null}
      {!hasNumber ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            Kolom <strong>Nomor induk karyawan</strong> wajib dipetakan — dipakai untuk mengenali
            karyawan yang sudah ada.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-card overflow-hidden rounded-2xl border">
        <div className="overflow-x-auto">
          <Table aria-label="Pemetaan kolom">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Kolom</TableHead>
                <TableHead>Header di file</TableHead>
                <TableHead className="hidden md:table-cell">Contoh isi</TableHead>
                <TableHead className="min-w-[240px]">Dipetakan ke</TableHead>
                <TableHead>Keyakinan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((s) => {
                const field = mapping[s.column] ?? null;
                return (
                  <TableRow key={s.column}>
                    <TableCell className="font-mono text-xs">{s.letter}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium" title={s.header}>
                      {s.header || <span className="text-muted-foreground">(tanpa header)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-[220px] truncate text-xs md:table-cell">
                      {sampleOf(rows, s.column, field)}
                    </TableCell>
                    <TableCell>
                      <FormSelect
                        aria-label={`Field untuk kolom ${s.letter}`}
                        value={field ?? IGNORE}
                        onChange={(v) => setField(s.column, v)}
                        placeholder="Pilih field"
                        options={[{ value: IGNORE, label: "Abaikan kolom ini" }, ...FIELD_OPTIONS]}
                      />
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge suggestion={s} field={field} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

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
            Ingat pemetaan untuk file berformat sama
          </label>
          <Button variant="brand" onClick={onNext} disabled={!hasNumber || busy}>
            {busy ? "Memeriksa…" : "Lanjut ke pratinjau"} <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
