import {
  applySavedMapping,
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
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CloudDownload,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Users,
} from "lucide-react";
import { type DragEvent, useCallback, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
  importKeys,
  saveMapping,
  type UnitChoice,
  useCommitImport,
  usePreviewImport,
} from "./api";
import { AttachmentsPanel, type AttachmentsState } from "./attachments-panel";
import { CompleteStep, completionState } from "./complete-step";
import { ImportGuide } from "./import-guide";
import { fieldLabel } from "./labels";
import { MappingStep } from "./mapping-step";
import { OpenAttachments } from "./open-attachments";
import { type ParsedWorkbook, parseImportFile, serializeCell, signatureOf } from "./parse-file";
import { type MasterMap, PreviewStep } from "./preview-step";
import { suggestedChoices } from "./unit-matching";

// D-042: halaman import karyawan (Unggah → Pemetaan → Lengkapi data → Pratinjau → Selesai). File
// diurai di browser, server memvalidasi ulang & menulis dalam satu transaksi. "Lengkapi data" hanya
// dibuka bila ada pilihan wajib untuk banyak baris (PT, unit organisasi, status). Dibuka dari Data
// Karyawan Aktif.

type Step = "upload" | "mapping" | "complete" | "preview" | "done";
const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Unggah" },
  { key: "mapping", label: "Pemetaan kolom" },
  { key: "complete", label: "Lengkapi data" },
  { key: "preview", label: "Pratinjau" },
  { key: "done", label: "Selesai" },
];
const EMPTY_MAP: MasterMap = { departments: {}, positions: {}, grades: {}, workLocations: {} };

type Choices = {
  masterMap: MasterMap;
  defaultStatusId: string;
  /** Nomor baris file → id status kepegawaian. */
  statusOverrides: Record<string, string>;
  /** D-064: PT bawaan (kosong = PT top bar / satu-satunya), PT per baris, pilihan unit organisasi. */
  companyId: string;
  companyOverrides: Record<string, string>;
  unitChoices: Record<string, UnitChoice>;
};

function Stepper({ current, processing }: { current: Step; processing?: boolean }) {
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
            {step.key === "done" && processing ? "Memproses lampiran" : step.label}
          </span>
          {step.key === "done" && processing ? (
            <Loader2 className="text-brand size-3.5 animate-spin" aria-hidden />
          ) : null}
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
  // Hanya hasil pratinjau TERAKHIR yang dipakai (pilihan cepat berturut-turut tidak saling menimpa).
  const previewSeq = useRef(0);

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
  // D-062: status kepegawaian untuk baris yang belum ada di sistem (bawaan & per baris).
  const [defaultStatusId, setDefaultStatusId] = useState("");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [companyOverrides, setCompanyOverrides] = useState<Record<string, string>>({});
  const [unitChoices, setUnitChoices] = useState<Record<string, UnitChoice>>({});
  // Lengkapi data pernah dibuka → "Kembali" dari Pratinjau ke sana (bukan melompati ke Pemetaan).
  const [visitedComplete, setVisitedComplete] = useState(false);
  const [result, setResult] = useState<ImportPreview["counts"] | null>(null);
  // D-060: import yang lampirannya sedang diproses (hasil simpan, atau dilanjutkan dari langkah Unggah).
  const [attachmentJobId, setAttachmentJobId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentsState | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const queryClient = useQueryClient();
  const onAttachmentsState = useCallback((next: AttachmentsState) => setAttachments(next), []);
  // Lampiran masih diunduh di langkah Selesai → stepper & judul tidak menyatakan "selesai" dulu.
  const attachmentsBusy =
    step === "done" && attachmentJobId !== null && (attachments?.pending ?? 1) > 0;

  const companyFor = (chosen: string) =>
    chosen ||
    scope.selectedId ||
    (scope.companies.length === 1 ? scope.companies[0]?.id : "") ||
    "";
  const effectiveCompany = companyFor(companyId);

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
    let savedUnits: Record<string, UnitChoice> = {};
    try {
      const saved = await fetchSavedMapping(sig);
      if (saved) {
        // Kunci per kemunculan (D-059): profil lama tanpa "#n" hanya berlaku untuk kemunculan pertama.
        // D-060: profil sebelum ada field lampiran tidak mematikan kolom tautan Drive.
        next = applySavedMapping(chosen.detected.headers, saved.mapping, next);
        // D-064: pilihan unit organisasi yang pernah dibuat untuk Form ini.
        savedUnits = saved.unitChoices;
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
    // Status & PT per baris berkunci nomor baris sheet sebelumnya.
    setStatusOverrides({});
    setCompanyOverrides({});
    setUnitChoices(savedUnits);
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

  const statusOptions = useMemo(
    () => (master.data?.employmentStatuses ?? []).map((s) => ({ value: s.id, label: s.name })),
    [master.data?.employmentStatuses],
  );
  const choices: Choices = {
    masterMap,
    defaultStatusId,
    statusOverrides,
    companyId,
    companyOverrides,
    unitChoices,
  };
  const companyOptions = useMemo(
    () => scope.companies.map((c) => ({ value: c.id, label: c.code, hint: c.name })),
    [scope.companies],
  );

  /** Pilihan di pratinjau berubah → simpan & ulangi pratinjau dengan nilai baru (state belum terbarui). */
  function changeChoices(patch: Partial<Choices>) {
    const next = { ...choices, ...patch };
    if (patch.masterMap) setMasterMap(patch.masterMap);
    if (patch.defaultStatusId !== undefined) setDefaultStatusId(patch.defaultStatusId);
    if (patch.statusOverrides) setStatusOverrides(patch.statusOverrides);
    if (patch.companyId !== undefined) setCompanyId(patch.companyId);
    if (patch.companyOverrides) setCompanyOverrides(patch.companyOverrides);
    if (patch.unitChoices) setUnitChoices(patch.unitChoices);
    void runPreview(next, "stay");
  }

  function buildRequest(c: Choices = choices): ImportRequest | null {
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
      ...(companyFor(c.companyId) ? { companyId: companyFor(c.companyId) } : {}),
      ...(Object.keys(c.companyOverrides).length > 0
        ? { companyOverrides: c.companyOverrides }
        : {}),
      ...(Object.keys(c.unitChoices).length > 0 ? { unitMapping: c.unitChoices } : {}),
      ...(c.defaultStatusId ? { defaultEmploymentStatusId: c.defaultStatusId } : {}),
      ...(Object.keys(c.statusOverrides).length > 0
        ? { employmentStatusOverrides: c.statusOverrides }
        : {}),
      rows,
      masterDataMapping: c.masterMap,
    };
  }

  /**
   * `next`: dari Pemetaan → Lengkapi data bila ada pilihan wajib, selain itu langsung Pratinjau;
   * `stay`: pilihan berubah di Lengkapi/Pratinjau → tetap di langkah itu (data lama tetap tampil).
   */
  async function runPreview(c: Choices = choices, go: "next" | "stay" = "next") {
    const request = buildRequest(c);
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
        void saveMapping(signature, profile, c.unitChoices).catch(() => undefined);
      }
      const seq = ++previewSeq.current;
      const result = await previewMutation.mutateAsync(request);
      if (seq !== previewSeq.current) return;
      setPreview(result);
      if (go === "next") {
        const needed = completionState(result).needed;
        if (needed) setVisitedComplete(true);
        setStep(needed ? "complete" : "preview");
      }
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
      setAttachmentJobId(saved.counts.attachments > 0 ? saved.jobId : null);
      setAttachments(null);
      setStep("done");
      toast.success(
        saved.counts.attachments > 0
          ? "Data tersimpan. Lampiran Google Drive sedang diproses."
          : "Import selesai.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.warning(
          "Data berubah sejak pratinjau. Pratinjau diperbarui — periksa lalu simpan lagi.",
        );
        await runPreview(choices, "stay");
        return;
      }
      toast.error(errorMessage(error));
    }
  }

  /** Ringkasan pilihan Lengkapi data untuk Pratinjau. */
  function settingsSummary(p: ImportPreview): string[] {
    const company = scope.companies.find((c) => c.id === effectiveCompany)?.code;
    const status = statusOptions.find((s) => s.value === defaultStatusId)?.label;
    const created = p.units.filter((u) => u.create).length;
    return [
      company ? `PT ${company}` : "PT dari kolom file",
      p.units.length > 0
        ? `${p.units.length} nilai unit${created > 0 ? ` (${created} unit baru)` : ""}`
        : "tanpa kolom unit",
      status ? `status baru: ${status}` : "status dari kolom file",
    ];
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
    setAttachmentJobId(null);
    setAttachments(null);
    setConfirmReset(false);
    // Pemrosesan lampiran berhenti saat panel dilepas → daftar "belum selesai" disegarkan.
    void queryClient.invalidateQueries({ queryKey: importKeys.openAttachments });
    setMasterMap(EMPTY_MAP);
    setStatusOverrides({});
    setCompanyOverrides({});
    setUnitChoices({});
    setVisitedComplete(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Opsi A: lampiran masih diunduh → konfirmasi dulu; proses dijeda & bisa dilanjutkan nanti. */
  function requestReset() {
    if (attachments?.active) setConfirmReset(true);
    else reset();
  }

  /** Panel lampiran yang dibuka dari langkah Unggah (lembar samping) ditutup → proses dijeda. */
  function closeUploadAttachments() {
    setAttachmentJobId(null);
    setAttachments(null);
    void queryClient.invalidateQueries({ queryKey: importKeys.openAttachments });
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
        description="Unggah file data karyawan (.xlsx atau .csv) apa adanya. Sistem mengenali kolomnya, lalu Anda memeriksa hasilnya sebelum data disimpan."
        actions={
          <div className="flex gap-2">
            <ImportGuide current={step} />
            <Button variant="outline" asChild>
              <Link to={`/personal/pegawai-aktif/${back}`}>
                <Users /> Data Karyawan Aktif
              </Link>
            </Button>
          </div>
        }
      />
      <Stepper current={step} processing={attachmentsBusy} />

      {step === "upload" ? <OpenAttachments onOpen={setAttachmentJobId} /> : null}
      <Sheet
        open={step === "upload" && attachmentJobId !== null}
        onOpenChange={(open) => {
          if (!open) closeUploadAttachments();
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Lampiran Google Drive</SheetTitle>
          {step === "upload" && attachmentJobId ? (
            <AttachmentsPanel
              key={attachmentJobId}
              jobId={attachmentJobId}
              onStateChange={onAttachmentsState}
              className="rounded-none border-0 bg-transparent pt-14"
            />
          ) : null}
        </SheetContent>
      </Sheet>

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
                {parsing ? (
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet className="size-6" aria-hidden />
                )}
              </span>
              <span className="text-sm font-medium" aria-live="polite">
                {parsing
                  ? "Membaca & mengenali struktur file…"
                  : "Tarik file ke sini atau klik untuk memilih"}
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
            <p className="text-muted-foreground text-xs">
              PT, unit organisasi, dan status kepegawaian ditentukan setelah kolom file diperiksa.
            </p>
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

      {step === "complete" && preview ? (
        <CompleteStep
          preview={preview}
          master={master.data}
          companyOptions={companyOptions}
          defaultCompanyId={effectiveCompany}
          onDefaultCompanyChange={(id) => changeChoices({ companyId: id })}
          statusOptions={statusOptions}
          defaultStatusId={defaultStatusId}
          onDefaultStatusChange={(id) => changeChoices({ defaultStatusId: id })}
          unitChoices={unitChoices}
          onUnitChoice={(key, choice) => {
            const next = { ...unitChoices };
            if (choice) next[key] = choice;
            else delete next[key];
            changeChoices({ unitChoices: next });
          }}
          onApplyUnitSuggestions={() =>
            changeChoices({ unitChoices: suggestedChoices(preview.units, unitChoices) })
          }
          masterMap={masterMap}
          onMasterMapChange={(next) => changeChoices({ masterMap: next })}
          onBack={() => setStep("mapping")}
          onNext={() => setStep("preview")}
          updating={previewMutation.isPending}
        />
      ) : null}

      {step === "preview" && preview ? (
        <PreviewStep
          preview={preview}
          settings={settingsSummary(preview)}
          statusOptions={statusOptions}
          statusOverrides={statusOverrides}
          onStatusOverride={(sourceRow, id) => {
            const next = { ...statusOverrides };
            if (id) next[String(sourceRow)] = id;
            else delete next[String(sourceRow)];
            changeChoices({ statusOverrides: next });
          }}
          companyOptions={companyOptions}
          companyOverrides={companyOverrides}
          onCompanyOverride={(sourceRow, id) => {
            const next = { ...companyOverrides };
            if (id) next[String(sourceRow)] = id;
            else delete next[String(sourceRow)];
            changeChoices({ companyOverrides: next });
          }}
          columnOf={columnOf}
          onEditSettings={() => {
            setVisitedComplete(true);
            setStep("complete");
          }}
          onBack={() =>
            setStep(visitedComplete || completionState(preview).needed ? "complete" : "mapping")
          }
          onCommit={() => void commit()}
          onDownloadIssues={downloadIssues}
          saving={commitMutation.isPending}
          updating={previewMutation.isPending}
        />
      ) : null}

      {step === "done" && result ? (
        <div
          className={cn(
            "grid items-start gap-5",
            attachmentJobId && "lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]",
          )}
        >
          <section
            aria-labelledby="import-done-title"
            className={cn(
              "bg-card space-y-5 rounded-2xl border p-6",
              !attachmentJobId && "max-w-2xl",
            )}
          >
            <div className="flex items-start gap-3">
              <span className="bg-success-soft text-success-soft-foreground grid size-10 shrink-0 place-items-center rounded-xl">
                <CheckCircle2 className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="import-done-title" className="text-lg font-semibold">
                  {attachmentsBusy ? "Data karyawan tersimpan" : "Import selesai"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {attachmentsBusy
                    ? "Lampiran Google Drive masih diunduh di panel samping."
                    : `${result.create + result.update} karyawan berhasil diproses dari file.`}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              {(
                [
                  ["Dibuat", result.create],
                  ["Diperbarui", result.update],
                  ["Dilewati", result.skip],
                  ["Error", result.error],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="bg-background rounded-xl border px-3 py-2.5">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd
                    className={cn(
                      "mt-0.5 text-xl font-semibold tabular-nums",
                      label === "Error" && value > 0 && "text-destructive",
                    )}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {result.attachments > 0 ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <CloudDownload className="size-4 shrink-0" aria-hidden />
                {result.attachments} lampiran Google Drive ikut diproses.
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
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
              <Button variant="ghost" onClick={requestReset}>
                <RotateCcw /> Import file lain
              </Button>
            </div>
          </section>

          {attachmentJobId ? (
            <AttachmentsPanel
              key={attachmentJobId}
              jobId={attachmentJobId}
              onStateChange={onAttachmentsState}
            />
          ) : null}
        </div>
      ) : null}

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lampiran masih diproses</DialogTitle>
            <DialogDescription>
              {attachments
                ? `${attachments.handled} dari ${attachments.total} lampiran sudah diproses. `
                : ""}
              Bila Anda mulai import file lain, pengunduhan dijeda. Sisa lampiran bisa dilanjutkan
              kapan saja dari halaman Unggah.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Tetap di sini
            </Button>
            <Button variant="brand" onClick={reset}>
              Jeda & import file lain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
