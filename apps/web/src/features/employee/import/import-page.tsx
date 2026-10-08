import {
  buildRawRows,
  type ColumnSuggestion,
  type DetectedSheet,
  detectSheet,
  headerSignatureSource,
  IMPORT_ISSUE_MESSAGES,
  IMPORT_MAX_ROWS,
  type ImportFieldKey,
  pickSheet,
  profileKeys,
  suggestMapping,
} from "@hris/shared";
import { CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload, Users } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { buildXlsx, downloadBytes } from "@/lib/xlsx-write";
import { useCompanyScope, useMasterData } from "../api";
import { ChoiceCard } from "../components/choice-card";
import {
  fetchSavedMapping,
  type ImportPreview,
  type ImportRequest,
  saveMapping,
  useCommitImport,
  usePreviewImport,
} from "./api";
import { fieldLabel } from "./labels";
import { MappingStep } from "./mapping-step";
import { type ParsedWorkbook, parseImportFile, serializeCell, signatureOf } from "./parse-file";
import { type MasterMap, PreviewStep } from "./preview-step";

// D-042: halaman import karyawan (Unggah → Pemetaan → Pratinjau → Selesai). File diurai di browser,
// server memvalidasi ulang & menulis dalam satu transaksi. Dibuka dari Data Karyawan Aktif.

type Step = "upload" | "mapping" | "preview" | "done";
const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Unggah" },
  { key: "mapping", label: "Pemetaan kolom" },
  { key: "preview", label: "Pratinjau" },
  { key: "done", label: "Selesai" },
];
const EMPTY_MAP: MasterMap = { departments: {}, positions: {}, grades: {}, workLocations: {} };

function Stepper({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm" aria-label="Langkah import">
      {STEPS.map((step, i) => (
        <li
          key={step.key}
          className="flex items-center gap-2"
          aria-current={i === index ? "step" : undefined}
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full border text-xs font-medium",
              i < index && "bg-brand border-brand text-brand-foreground",
              i === index && "border-foreground bg-foreground text-background",
              i > index && "text-muted-foreground",
            )}
          >
            {i + 1}
          </span>
          <span className={i === index ? "font-medium" : "text-muted-foreground"}>
            {step.label}
          </span>
          {i < STEPS.length - 1 ? (
            <span className="bg-border mx-1 hidden h-px w-8 sm:block" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function ImportEmployeesPage() {
  const [params] = useSearchParams();
  const back = params.get("dari") ?? "semua";
  const scope = useCompanyScope();
  const master = useMasterData();
  const previewMutation = usePreviewImport();
  const commitMutation = useCommitImport();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [mode, setMode] = useState<"UPSERT" | "CREATE_ONLY">("UPSERT");
  const [companyId, setCompanyId] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [detected, setDetected] = useState<DetectedSheet | null>(null);
  const [suggestions, setSuggestions] = useState<ColumnSuggestion[]>([]);
  const [mapping, setMapping] = useState<(ImportFieldKey | null)[]>([]);
  const [signature, setSignature] = useState("");
  const [savedProfile, setSavedProfile] = useState(false);
  const [saveProfile, setSaveProfile] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [masterMap, setMasterMap] = useState<MasterMap>(EMPTY_MAP);
  const [result, setResult] = useState<ImportPreview["counts"] | null>(null);

  const effectiveCompany =
    companyId ||
    scope.selectedId ||
    (scope.companies.length === 1 ? scope.companies[0]?.id : "") ||
    "";

  async function analyzeSheet(book: ParsedWorkbook, index: number | null) {
    const chosen =
      index === null
        ? pickSheet(book.sheets)
        : (() => {
            const sheet = book.sheets[index];
            const d = sheet ? detectSheet(sheet.grid) : null;
            return sheet && d ? { sheet, detected: d } : null;
          })();
    if (!chosen) {
      setFileError(
        "Tidak menemukan tabel data karyawan di file ini. Pastikan ada baris judul kolom (mis. NAMA, NIK, JABATAN).",
      );
      return false;
    }
    if (chosen.detected.rows.length > IMPORT_MAX_ROWS) {
      setFileError(
        `File berisi ${chosen.detected.rows.length} baris; maksimal ${IMPORT_MAX_ROWS} per import.`,
      );
      return false;
    }
    const auto = suggestMapping(chosen.detected);
    let next = auto.map((s) => s.field);
    const sig = await signatureOf(headerSignatureSource(chosen.detected.headers));
    let fromProfile = false;
    try {
      const saved = await fetchSavedMapping(sig);
      if (saved) {
        // Kunci per kemunculan (D-059): profil lama tanpa "#n" hanya berlaku untuk kemunculan pertama.
        const keys = profileKeys(chosen.detected.headers);
        next = keys.map((key, i) => (key in saved ? (saved[key] ?? null) : (next[i] ?? null)));
        fromProfile = true;
      }
    } catch {
      // Profil pemetaan hanya kenyamanan; kegagalan tidak menghalangi import.
    }
    setSheetIndex(book.sheets.indexOf(chosen.sheet));
    setDetected(chosen.detected);
    setSuggestions(auto);
    setMapping(next);
    setSignature(sig);
    setSavedProfile(fromProfile);
    return true;
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    setParsing(true);
    try {
      const book = await parseImportFile(file);
      if (await analyzeSheet(book, null)) {
        setWorkbook(book);
        setStep("mapping");
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "File tidak bisa dibaca.");
    } finally {
      setParsing(false);
    }
  }

  function buildRequest(map: MasterMap = masterMap): ImportRequest | null {
    if (!workbook || !detected) return null;
    const rows = buildRawRows(detected.rows, mapping).map(({ sourceRow, raw }) => ({
      sourceRow,
      raw: Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, serializeCell(v ?? null)]),
      ) as ImportRequest["rows"][number]["raw"],
    }));
    return {
      fileName: workbook.fileName,
      fileSha256: workbook.sha256,
      mode,
      ...(effectiveCompany ? { companyId: effectiveCompany } : {}),
      rows,
      masterDataMapping: map,
    };
  }

  async function runPreview(map: MasterMap = masterMap) {
    const request = buildRequest(map);
    if (!request) return;
    if (request.rows.length === 0) {
      toast.error("Tidak ada baris data yang bisa diimpor.");
      return;
    }
    try {
      if (saveProfile && detected) {
        const profile = Object.fromEntries(
          profileKeys(detected.headers).map((key, i) => [key, mapping[i] ?? null]),
        );
        void saveMapping(signature, profile).catch(() => undefined);
      }
      setPreview(await previewMutation.mutateAsync(request));
      setStep("preview");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function commit() {
    const request = buildRequest();
    if (!request || !preview) return;
    try {
      const saved = await commitMutation.mutateAsync({
        ...request,
        previewHash: preview.previewHash,
      });
      setResult(saved.counts);
      setStep("done");
      toast.success("Import selesai.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.warning(
          "Data berubah sejak pratinjau. Pratinjau diperbarui — periksa lalu simpan lagi.",
        );
        await runPreview();
        return;
      }
      toast.error(errorMessage(error));
    }
  }

  const columnOf = (field: ImportFieldKey) => {
    const index = mapping.indexOf(field);
    return index >= 0 ? index : undefined;
  };

  /** Baris asli bermasalah + kolom "Keterangan import" → .xlsx untuk diperbaiki lalu diimpor ulang. */
  function downloadIssues() {
    if (!detected || !preview || !workbook) return;
    const byRow = new Map(preview.rows.map((r) => [r.sourceRow, r]));
    const header = [...detected.headers, "Keterangan import"];
    const body = detected.rows
      .filter((row) => (byRow.get(row.sourceRow)?.issues.length ?? 0) > 0)
      .map((row) => {
        const result = byRow.get(row.sourceRow);
        const notes = (result?.issues ?? [])
          .map(
            (i) =>
              `${i.severity === "ERROR" ? "ERROR" : "Peringatan"} — ${fieldLabel(i.field)}: ${IMPORT_ISSUE_MESSAGES[i.code] ?? i.code}`,
          )
          .join("; ");
        return [...row.cells, `Baris ${row.sourceRow}: ${notes}`];
      });
    const name = workbook.fileName.replace(/\.[^.]+$/, "");
    downloadBytes(
      buildXlsx("Baris bermasalah", [header, ...body]),
      `${name} - baris bermasalah.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  function reset() {
    setStep("upload");
    setWorkbook(null);
    setDetected(null);
    setPreview(null);
    setResult(null);
    setMasterMap(EMPTY_MAP);
    if (fileInput.current) fileInput.current.value = "";
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void onFile(event.dataTransfer.files[0]);
  };

  return (
    <>
      <PageHeader
        title="Import Data Karyawan"
        description="Unggah file master data karyawan (.xlsx atau .csv) apa adanya — sistem mengenali kolomnya. Anda memeriksa pratinjau sebelum data disimpan."
        actions={
          <Button variant="outline" asChild>
            <Link to={`/personal/pegawai-aktif/${back}`}>
              <Users /> Data Karyawan Aktif
            </Link>
          </Button>
        }
      />
      <Stepper current={step} />

      {step === "upload" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_minmax(280px,360px)]">
          <div className="space-y-4">
            <label
              htmlFor="import-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "bg-card focus-within:ring-ring/50 flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors focus-within:ring-[3px]",
                dragging ? "border-brand bg-brand-soft" : "hover:border-foreground/30",
              )}
            >
              <span className="bg-muted grid size-12 place-items-center rounded-xl">
                <FileSpreadsheet className="size-6" aria-hidden />
              </span>
              <span className="text-sm font-medium">
                {parsing ? "Membaca file…" : "Tarik file ke sini atau klik untuk memilih"}
              </span>
              <span className="text-muted-foreground text-xs">
                .xlsx atau .csv · maks 5 MB · maks {IMPORT_MAX_ROWS.toLocaleString("id-ID")} baris
              </span>
              <input
                ref={fileInput}
                id="import-file"
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                aria-label="Pilih file import"
                onChange={(e) => void onFile(e.target.files?.[0])}
                disabled={parsing}
              />
            </label>
            {fileError ? (
              <Alert variant="destructive">
                <AlertDescription>{fileError}</AlertDescription>
              </Alert>
            ) : null}
            <p className="text-muted-foreground text-sm">
              Belum punya format?{" "}
              <a
                href="/template/Template-import-karyawan.xlsx"
                download
                className="text-foreground inline-flex items-center gap-1 font-medium underline underline-offset-4"
              >
                <Download className="size-3.5" aria-hidden /> Unduh template contoh
              </a>{" "}
              — file kantor dengan susunan kolom lain juga bisa langsung diunggah.
            </p>
          </div>

          <div className="bg-card space-y-5 rounded-2xl border p-5">
            <div className="space-y-2">
              <Label>Mode import</Label>
              <div role="radiogroup" aria-label="Mode import" className="grid gap-2">
                <ChoiceCard
                  selected={mode === "UPSERT"}
                  onSelect={() => setMode("UPSERT")}
                  title="Tambah + perbarui"
                  description="Karyawan baru dibuat; yang sudah ada diperbarui. Sel kosong tidak menghapus data."
                />
                <ChoiceCard
                  selected={mode === "CREATE_ONLY"}
                  onSelect={() => setMode("CREATE_ONLY")}
                  title="Tambah baru saja"
                  description="Karyawan yang NIP-nya sudah ada dilewati."
                />
              </div>
            </div>
            {scope.companies.length > 1 ? (
              <div className="grid gap-2">
                <Label htmlFor="import-company">Perusahaan bawaan</Label>
                <FormSelect
                  id="import-company"
                  value={effectiveCompany}
                  onChange={setCompanyId}
                  placeholder="Pilih perusahaan"
                  options={scope.companies.map((c) => ({
                    value: c.id,
                    label: c.code,
                    hint: c.name,
                  }))}
                />
                <p className="text-muted-foreground text-xs">
                  Dipakai untuk baris tanpa kolom perusahaan. Kolom perusahaan di file (mis. ACP)
                  tetap diutamakan.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "mapping" && workbook && detected ? (
        <MappingStep
          fileName={workbook.fileName}
          sheets={workbook.sheets.map((s) => s.name)}
          sheetIndex={sheetIndex}
          onSheetChange={(i) => void analyzeSheet(workbook, i)}
          headerRow={detected.headerRowIndex + 1}
          rows={detected.rows}
          suggestions={suggestions}
          mapping={mapping}
          onMappingChange={setMapping}
          savedProfile={savedProfile}
          saveProfile={saveProfile}
          onSaveProfileChange={setSaveProfile}
          onBack={reset}
          onNext={() => void runPreview()}
          busy={previewMutation.isPending}
        />
      ) : null}

      {step === "preview" && preview ? (
        <PreviewStep
          preview={preview}
          master={master.data}
          masterMap={masterMap}
          onMasterMapChange={(next) => {
            setMasterMap(next);
            void runPreview(next);
          }}
          columnOf={columnOf}
          onBack={() => setStep("mapping")}
          onCommit={() => void commit()}
          onDownloadIssues={downloadIssues}
          busy={commitMutation.isPending || previewMutation.isPending}
        />
      ) : null}

      {step === "done" && result ? (
        <div className="bg-card mx-auto max-w-xl space-y-5 rounded-2xl border p-8 text-center">
          <CheckCircle2 className="text-success-soft-foreground mx-auto size-10" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold">Import selesai</h2>
            <p className="text-muted-foreground text-sm">
              {result.create} karyawan dibuat · {result.update} diperbarui · {result.skip} dilewati
              {result.error ? ` · ${result.error} baris error tidak diimpor` : ""}.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="brand" asChild>
              <Link to={`/personal/pegawai-aktif/${back}`}>
                <Users /> Lihat Data Karyawan Aktif
              </Link>
            </Button>
            {result.error ? (
              <Button variant="outline" onClick={downloadIssues}>
                <Download /> Unduh baris bermasalah
              </Button>
            ) : null}
            <Button variant="ghost" onClick={reset}>
              <RotateCcw /> Import file lain
            </Button>
          </div>
        </div>
      ) : null}

      {step === "upload" && parsing ? (
        <p className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
          <Upload className="size-4 animate-pulse" aria-hidden /> Membaca & mengenali struktur file…
        </p>
      ) : null}
    </>
  );
}
