import {
  applyCellEdits,
  applySavedMapping,
  buildRawRows,
  type ColumnSuggestion,
  type DetectedSheet,
  detectSheet,
  editedCellList,
  headerSignatureSource,
  IMPORT_ISSUE_MESSAGES,
  IMPORT_MAX_ROWS,
  type ImportCellEdits,
  type ImportFieldKey,
  pickSheet,
  profileKeys,
  type RawImportRow,
  suggestMapping,
} from "@hris/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Users } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { buildXlsx, downloadBytes } from "@/lib/xlsx-write";
import { useCompanyScope, useMasterData } from "../api";
import { ChoiceCard } from "../components/choice-card";
import {
  fetchSavedMapping,
  type ImportMode,
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
import { MappingStep, mappingHasIdentity, mappingReviewColumns } from "./mapping-step";
import { OpenAttachments } from "./open-attachments";
import { type ParsedWorkbook, parseImportFile, serializeCell, signatureOf } from "./parse-file";
import { type MasterMap, PreviewStep } from "./preview-step";
import { displayRaw } from "./sheet/preview-sheet";
import { buildImportTemplate, IMPORT_TEMPLATE_FILE_NAME } from "./template/build-template";
import { suggestedChoices } from "./unit-matching";

// D-042: halaman import karyawan (Unggah → Pemetaan → Lengkapi data → Pratinjau → Selesai). File
// diurai di browser, server memvalidasi ulang & menulis dalam satu transaksi. "Lengkapi data" hanya
// dibuka bila ada pilihan wajib untuk banyak baris (PT, unit organisasi, status). Dibuka dari Data
// Karyawan Aktif.

type Step = "upload" | "mapping" | "complete" | "preview" | "done";
const MODE_LABEL: Record<ImportMode, string> = {
  UPSERT: "Tambah + perbarui",
  FILL_EMPTY: "Isi yang kosong saja",
  CREATE_ONLY: "Tambah baru saja",
};

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Unggah" },
  { key: "mapping", label: "Pemetaan kolom" },
  { key: "complete", label: "Lengkapi data" },
  { key: "preview", label: "Pratinjau" },
  { key: "done", label: "Selesai" },
];
const EMPTY_MAP: MasterMap = {
  departments: {},
  positions: {},
  grades: {},
  workLocations: {},
  homebases: {},
};

type Choices = {
  masterMap: MasterMap;
  defaultStatusId: string;
  /** Nomor baris file → id status kepegawaian. */
  statusOverrides: Record<string, string>;
  /** D-064: PT bawaan (kosong = PT top bar / satu-satunya), PT per baris, pilihan unit organisasi. */
  companyId: string;
  companyOverrides: Record<string, string>;
  unitChoices: Record<string, UnitChoice>;
  /** IMP-D1: nomor baris → id pemegang bagan ASLI- yang dilengkapi, atau "NEW". */
  chartHolderChoices: Record<string, string>;
};

function Stepper({
  current,
  processing,
  skipMapping,
}: {
  current: Step;
  processing?: boolean;
  /** IMP-D5: Pemetaan tidak tampil (belum/tidak perlu) → stepper 4 langkah. */
  skipMapping?: boolean;
}) {
  const steps = skipMapping ? STEPS.filter((s) => s.key !== "mapping") : STEPS;
  // Sedang memeriksa file (Pemetaan belum/tidak tampil) → masih di langkah Unggah.
  const shown = skipMapping && current === "mapping" ? "upload" : current;
  const index = steps.findIndex((s) => s.key === shown);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm" aria-label="Langkah import">
      {steps.map((step, i) => (
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
          {i < steps.length - 1 ? (
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
  const me = useMe().data as Me | undefined;
  const scope = useCompanyScope();
  const master = useMasterData();
  // IMP-D5: akun tanpa izin tulis data pribadi/rekening → kolom 🔒 dilewati (izin tidak berubah); diberi
  // tahu sejak langkah Unggah dan ditandai di template.
  const canWritePersonal = me ? access.writePersonalOnCreate(me) : true;
  const canWriteBank = me ? access.writeBankOnCreate(me) : true;
  const previewMutation = usePreviewImport();
  const commitMutation = useCommitImport();
  const fileInput = useRef<HTMLInputElement>(null);
  // Hanya hasil pratinjau TERAKHIR yang dipakai (pilihan cepat berturut-turut tidak saling menimpa).
  const previewSeq = useRef(0);

  const [step, setStep] = useState<Step>("upload");
  const [mode, setMode] = useState<ImportMode>("UPSERT");
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
  const [chartHolderChoices, setChartHolderChoices] = useState<Record<string, string>>({});
  // Lengkapi data pernah dibuka → "Kembali" dari Pratinjau ke sana (bukan melompati ke Pemetaan).
  const [visitedComplete, setVisitedComplete] = useState(false);
  const [result, setResult] = useState<ImportPreview["counts"] | null>(null);
  // D-060: import yang lampirannya sedang diproses (hasil simpan, atau dilanjutkan dari langkah Unggah).
  const [attachmentJobId, setAttachmentJobId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentsState | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // IMP-D5 (pengguna 19 Nov, a + b): konfirmasi hanya saat berisiko.
  const [confirmChangeFile, setConfirmChangeFile] = useState(false);
  // IMP-D5 (pengguna 11:40 WIB): semua kolom dikenali + ada NIP/NIK → langkah Pemetaan dilewati otomatis.
  const [autoPreview, setAutoPreview] = useState(false);
  const [mappingSkipped, setMappingSkipped] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  // Paket B (IMP-D6): sel yang diubah di Pratinjau. Cap waktu per sel → sel yang belum diperiksa server
  // dicek di browser dulu (aturan shared yang sama).
  const [edits, setEdits] = useState<ImportCellEdits>({});
  const editSeq = useRef(0);
  const editStamps = useRef(new Map<string, number>());
  const [appliedStamp, setAppliedStamp] = useState(0);
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

  // Isi file per baris (nilai siap kirim; tanggal = ISO) — dasar Pratinjau spreadsheet & ubahan sel.
  const rawRows = useMemo(
    () =>
      detected
        ? buildRawRows(detected.rows, mapping).map(({ sourceRow, raw }) => ({
            sourceRow,
            raw: Object.fromEntries(
              Object.entries(raw).map(([k, v]) => [k, serializeCell(v ?? null)]),
            ) as ImportRequest["rows"][number]["raw"],
          }))
        : [],
    [detected, mapping],
  );
  const rawBySource = useMemo(
    () => new Map(rawRows.map((r) => [r.sourceRow, r.raw as RawImportRow])),
    [rawRows],
  );
  const fileFields = useMemo(
    () => [...new Set(mapping.filter((f): f is ImportFieldKey => f !== null))],
    [mapping],
  );
  const editCount = Object.values(edits).reduce((n, row) => n + Object.keys(row).length, 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: cap waktu dibaca dari ref saat ubahan/pratinjau berubah
  const pendingCells = useMemo(() => {
    const out = new Set<string>();
    for (const [key, stamp] of editStamps.current) if (stamp > appliedStamp) out.add(key);
    return out;
  }, [edits, appliedStamp]);

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
        "Daftar karyawan tidak ditemukan di file ini. Pastikan ada baris judul kolom (mis. NAMA, NIP, JABATAN) di atas data, atau pakai Unduh template Excel.",
      );
      return false;
    }
    if (chosen.detected.rows.length > IMPORT_MAX_ROWS) {
      setFileError(
        `File berisi ${chosen.detected.rows.length.toLocaleString("id-ID")} baris; maksimal ${IMPORT_MAX_ROWS.toLocaleString("id-ID")} baris sekali import. Bagi menjadi beberapa file.`,
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
    setChartHolderChoices({});
    setUnitChoices(savedUnits);
    setEdits({});
    editStamps.current.clear();
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
        setAutoPreview(true);
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
    chartHolderChoices,
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
    if (patch.chartHolderChoices) setChartHolderChoices(patch.chartHolderChoices);
    void runPreview(next, "stay");
  }

  /** Paket B: ubahan sel dari grid Pratinjau → disimpan, pratinjau diulang 1 dtk setelah ketikan terakhir. */
  function editCells(changes: { sourceRow: number; field: ImportFieldKey; value: string }[]) {
    const original = new Map(rawRows.map((r) => [r.sourceRow, r.raw]));
    for (const { sourceRow, field } of changes)
      editStamps.current.set(`${sourceRow}:${field}`, ++editSeq.current);
    setEdits((prev) => {
      const next = { ...prev };
      for (const { sourceRow, field, value } of changes) {
        const row = { ...(next[sourceRow] ?? {}) };
        const before = original.get(sourceRow)?.[field];
        // Dikembalikan ke isi file → bukan ubahan lagi.
        if (value === displayRaw(before)) delete row[field];
        else row[field] = value;
        if (Object.keys(row).length > 0) next[sourceRow] = row;
        else delete next[sourceRow];
      }
      return next;
    });
  }

  function buildRequest(c: Choices = choices): ImportRequest | null {
    if (!workbook || !detected) return null;
    const rows = applyCellEdits(rawRows, edits);
    return {
      fileName: workbook.fileName,
      fileSha256: workbook.sha256,
      mode,
      ...(companyFor(c.companyId) ? { companyId: companyFor(c.companyId) } : {}),
      ...(Object.keys(c.companyOverrides).length > 0
        ? { companyOverrides: c.companyOverrides }
        : {}),
      ...(Object.keys(c.unitChoices).length > 0 ? { unitMapping: c.unitChoices } : {}),
      ...(Object.keys(c.chartHolderChoices).length > 0
        ? { chartHolderChoices: c.chartHolderChoices }
        : {}),
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
      toast.error("File tidak berisi data karyawan (semua baris kosong).");
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
      const stamp = editSeq.current;
      const result = await previewMutation.mutateAsync(request);
      if (seq !== previewSeq.current) return;
      setPreview(result);
      setAppliedStamp(stamp);
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
      const edited = editedCellList(edits);
      const saved = await commitMutation.mutateAsync({
        ...request,
        previewHash: preview.previewHash,
        ...(edited.length > 0 ? { editedCells: edited } : {}),
      });
      setResult(saved.counts);
      setAttachmentJobId(saved.counts.attachments > 0 ? saved.jobId : null);
      setAttachments(null);
      setStep("done");
      toast.success(
        saved.counts.attachments > 0
          ? "Data karyawan tersimpan. Foto & dokumen dari Google Drive sedang diambil — biarkan halaman ini terbuka."
          : "Data karyawan tersimpan.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.warning(
          "Ada data karyawan yang berubah sejak Anda memeriksa. Daftar sudah diperbarui — periksa lagi lalu klik Simpan.",
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
      MODE_LABEL[mode],
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

  /** Baris asli yang error (tidak ikut disimpan) + kolom "Yang perlu diperbaiki" → .xlsx untuk diperbaiki
   *  lalu diunggah ulang (IMP-D5: hanya baris error, jumlahnya = angka "perlu diperbaiki"). */
  function downloadIssues() {
    if (!detected || !preview || !workbook) return;
    const byRow = new Map(preview.rows.map((r) => [r.sourceRow, r]));
    // Paket B: nilai yang sudah diubah di layar ikut terunduh; isian tanpa kolom di file → kolom tambahan.
    const extraFields = [
      ...new Set(Object.values(edits).flatMap((row) => Object.keys(row) as ImportFieldKey[])),
    ].filter((f) => !mapping.includes(f));
    const header = [...detected.headers, ...extraFields.map(fieldLabel), "Yang perlu diperbaiki"];
    const body = detected.rows
      .filter((row) => byRow.get(row.sourceRow)?.action === "ERROR")
      .map((row) => {
        const changed = edits[row.sourceRow] ?? {};
        const cells = row.cells.map((cell, column) => {
          const field = mapping[column];
          return field && field in changed ? (changed[field] ?? "") : cell;
        });
        const result = byRow.get(row.sourceRow);
        const notes = (result?.issues ?? [])
          .map(
            (i) =>
              `${i.severity === "ERROR" ? "Perbaiki" : "Catatan"} — ${fieldLabel(i.field)}: ${IMPORT_ISSUE_MESSAGES[i.code] ?? i.code}`,
          )
          .join("; ");
        return [
          ...cells,
          ...extraFields.map((f) => changed[f] ?? ""),
          `Baris ${row.sourceRow}: ${notes}`,
        ];
      });
    const name = workbook.fileName.replace(/\.[^.]+$/, "");
    downloadBytes(
      buildXlsx("Perlu diperbaiki", [header, ...body]),
      `${name} - perlu diperbaiki.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  /** IMP-D5: template HRIS dibangun di browser (dropdown PT dalam cakupan & status aktif). */
  function downloadTemplate() {
    const bytes = buildImportTemplate({
      companies: scope.companies.map((c) => ({ code: c.code, name: c.name })),
      statuses: (master.data?.employmentStatuses ?? []).map((s) => s.name),
      canWriteSensitive: canWritePersonal && canWriteBank,
    });
    downloadBytes(
      bytes,
      IMPORT_TEMPLATE_FILE_NAME,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  // Setelah state pemetaan terisi (render berikutnya), lewati langkah Pemetaan bila tidak ada yang perlu dicek.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dijalankan sekali per file (autoPreview)
  useEffect(() => {
    if (!autoPreview || step !== "mapping" || !detected) return;
    setAutoPreview(false);
    const clean =
      mappingHasIdentity(mapping) &&
      mappingReviewColumns(suggestions, mapping, detected.rows).size === 0;
    setMappingSkipped(clean);
    if (clean) void runPreview();
  }, [autoPreview, step, detected]);

  /** Kembali ke Pemetaan (juga setelah dilewati otomatis) → langkahnya tampil lagi di stepper. */
  // Paket B: ubahan sel → pratinjau server diulang 1 dtk setelah ketikan terakhir (permintaan lama diabaikan
  // lewat previewSeq). Sementara itu sel diperiksa di browser.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat ubahan berubah
  useEffect(() => {
    if (step !== "preview" || editSeq.current <= appliedStamp) return;
    const timer = setTimeout(() => void runPreview(choices, "stay"), 1000);
    return () => clearTimeout(timer);
  }, [edits]);

  // Ubahan sel belum disimpan → tanya dulu sebelum halaman ditutup/dimuat ulang.
  useEffect(() => {
    if (editCount === 0 || step === "done") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editCount, step]);

  function goMapping() {
    setMappingSkipped(false);
    setStep("mapping");
  }

  // IMP-D5 (supervisor 19 Nov): stepper 4 langkah sejak awal; "Pemetaan kolom" disisipkan hanya bila langkah itu
  // benar-benar tampil (ada kolom yang kurang yakin / NIP & No. KTP tidak ada, atau dibuka lewat "Ubah").
  const mappingChecking =
    step === "mapping" && (autoPreview || (mappingSkipped && previewMutation.isPending));
  const mappingShown = step !== "upload" && !mappingSkipped && !mappingChecking;

  function reset() {
    setStep("upload");
    setWorkbook(null);
    setDetected(null);
    setPreview(null);
    setResult(null);
    setAttachmentJobId(null);
    setAttachments(null);
    setConfirmReset(false);
    setConfirmChangeFile(false);
    // Pemrosesan lampiran berhenti saat panel dilepas → daftar "belum selesai" disegarkan.
    void queryClient.invalidateQueries({ queryKey: importKeys.openAttachments });
    setMasterMap(EMPTY_MAP);
    setStatusOverrides({});
    setCompanyOverrides({});
    setChartHolderChoices({});
    setUnitChoices({});
    setVisitedComplete(false);
    setAutoPreview(false);
    setMappingSkipped(false);
    setEdits({});
    editStamps.current.clear();
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Opsi A: lampiran masih diunduh → konfirmasi dulu; proses dijeda & bisa dilanjutkan nanti. */
  function requestReset() {
    if (attachments?.active) setConfirmReset(true);
    else reset();
  }

  /** Sudah ada pilihan yang dibuat di Lengkapi data / Pratinjau → "Ganti file" minta konfirmasi. */
  const hasChoices =
    visitedComplete ||
    Object.keys(statusOverrides).length > 0 ||
    Object.keys(companyOverrides).length > 0 ||
    Object.keys(chartHolderChoices).length > 0 ||
    Object.values(masterMap).some((group) => Object.keys(group).length > 0);

  function requestChangeFile() {
    if (hasChoices) setConfirmChangeFile(true);
    else reset();
  }

  /** Ada baris yang perlu diperbaiki → konfirmasi dulu bahwa baris itu tidak ikut disimpan. */
  function requestCommit() {
    if (preview && preview.counts.error > 0) setConfirmSave(true);
    else void commit();
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
        description="Unggah file Excel karyawan, periksa, lalu simpan."
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
      <Stepper current={step} processing={attachmentsBusy} skipMapping={!mappingShown} />
      {mappingSkipped && (step === "complete" || step === "preview") ? (
        <p className="text-muted-foreground -mt-3 mb-4 text-sm">
          ✔ {mapping.filter(Boolean).length} kolom dikenali ·{" "}
          <button
            type="button"
            onClick={goMapping}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Ubah
          </button>
        </p>
      ) : null}

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
        <div className="space-y-4">
          {/* IMP-D5: mode di atas kotak unggah (begitu file dipilih halaman pindah). Pengguna 2026-11-24:
              tiga pilihan selalu tampil (tidak lagi dilipat di balik "Ubah") agar terlihat sejak awal. */}
          <div className="space-y-2">
            <p id="import-mode-label" className="text-muted-foreground text-sm font-medium">
              Mode import
            </p>
            <div
              role="radiogroup"
              aria-labelledby="import-mode-label"
              className="grid gap-2 md:grid-cols-3"
            >
              {(["UPSERT", "FILL_EMPTY", "CREATE_ONLY"] as const).map((m) => (
                <ChoiceCard
                  key={m}
                  selected={mode === m}
                  onSelect={() => setMode(m)}
                  title={MODE_LABELS[m]}
                  description={MODE_HINTS[m]}
                />
              ))}
            </div>
          </div>

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
            Belum punya file?{" "}
            <button
              type="button"
              onClick={downloadTemplate}
              className="text-foreground inline-flex items-center gap-1 font-medium underline underline-offset-4"
            >
              <Download className="size-3.5" aria-hidden /> Unduh template Excel
            </button>
          </p>
          {!canWritePersonal || !canWriteBank ? (
            <details className="text-muted-foreground text-sm">
              <summary className="cursor-pointer">
                🔒 Data pribadi tidak tersimpan untuk akun Anda ·{" "}
                <span className="text-foreground underline underline-offset-4">Rincian</span>
              </summary>
              <p className="mt-1 pl-5">
                {`Akun Anda belum punya izin ${
                  !canWritePersonal && !canWriteBank
                    ? "data pribadi & rekening"
                    : !canWritePersonal
                      ? "data pribadi"
                      : "rekening"
                }: kolom bertanda 🔒 (${
                  !canWritePersonal ? "No. KTP, NPWP, tanggal lahir, alamat, keluarga" : ""
                }${!canWritePersonal && !canWriteBank ? ", " : ""}${
                  !canWriteBank ? "nama bank, No. rekening" : ""
                }) dilewati; kolom lain tetap masuk.`}
              </p>
            </details>
          ) : null}
        </div>
      ) : null}

      {mappingChecking ? (
        <p
          className="text-muted-foreground flex items-center gap-2 py-10 text-sm"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden /> Memeriksa isi file…
        </p>
      ) : step === "mapping" && workbook && detected ? (
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
          onBack={requestChangeFile}
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
          onBack={goMapping}
          onNext={() => setStep("preview")}
          updating={previewMutation.isPending}
        />
      ) : null}

      {step === "preview" && preview ? (
        <PreviewStep
          preview={preview}
          settings={settingsSummary(preview)}
          fillEmpty={mode === "FILL_EMPTY"}
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
          chartHolderChoices={chartHolderChoices}
          onChartHolderChoice={(sourceRow, value) => {
            const next = { ...chartHolderChoices };
            if (value) next[String(sourceRow)] = value;
            else delete next[String(sourceRow)];
            changeChoices({ chartHolderChoices: next });
          }}
          columnOf={columnOf}
          rawBySource={rawBySource}
          fields={fileFields}
          edits={edits}
          pending={pendingCells}
          onEdit={editCells}
          onEditSettings={() => {
            setVisitedComplete(true);
            setStep("complete");
          }}
          onBack={() =>
            visitedComplete || completionState(preview).needed ? setStep("complete") : goMapping()
          }
          onCommit={requestCommit}
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
            {/* IMP-D5 "sekali lihat": judul + satu baris angka; aksi lain berupa tautan kecil. */}
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="text-success-soft-foreground mt-0.5 size-6 shrink-0"
                aria-hidden
              />
              <div className="min-w-0 space-y-1">
                <h2 id="import-done-title" className="text-lg font-semibold">
                  {attachmentsBusy ? "Data karyawan tersimpan" : "Import selesai"}
                </h2>
                <p className="text-sm">
                  {result.create} baru · {result.update} diperbarui
                  {result.skip > 0 ? ` · ${result.skip} tanpa perubahan` : ""}
                  {result.error > 0 ? (
                    <span className="text-destructive">
                      {" "}
                      · {result.error} perlu diperbaiki (tidak disimpan)
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button variant="brand" asChild>
                <Link to={`/personal/pegawai-aktif/${back}`}>
                  <Users /> Lihat Data Karyawan Aktif
                </Link>
              </Button>
              <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm">
                {result.error ? (
                  <>
                    <button
                      type="button"
                      onClick={downloadIssues}
                      className="text-foreground font-medium underline-offset-4 hover:underline"
                    >
                      Unduh {result.error} baris yang perlu diperbaiki
                    </button>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={requestReset}
                  className="text-foreground inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Import file lain
                </button>
              </p>
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

      <Dialog open={confirmChangeFile} onOpenChange={setConfirmChangeFile}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ganti file?</DialogTitle>
            <DialogDescription>
              Pilihan yang sudah Anda buat untuk file ini (departemen, status, PT, dan lainnya) akan
              hilang.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmChangeFile(false)}>
              Batal
            </Button>
            <Button variant="brand" onClick={reset}>
              Ya, ganti file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {preview ? (
        <Dialog open={confirmSave} onOpenChange={setConfirmSave}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{saveQuestion(preview.counts)}</DialogTitle>
              <DialogDescription>
                {preview.counts.error} baris yang perlu diperbaiki tidak ikut disimpan. Bisa
                diunggah lagi nanti tanpa dobel.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:flex-wrap">
              <Button variant="outline" onClick={() => setConfirmSave(false)}>
                Batal
              </Button>
              <Button variant="outline" onClick={downloadIssues}>
                <Download /> Unduh {preview.counts.error} baris
              </Button>
              <Button
                variant="brand"
                onClick={() => {
                  setConfirmSave(false);
                  void commit();
                }}
              >
                {saveConfirmLabel(preview.counts)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Foto & dokumen masih diambil</DialogTitle>
            <DialogDescription>
              Pengambilan dijeda dan bisa dilanjutkan nanti dari halaman ini.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Tetap di sini
            </Button>
            <Button variant="brand" onClick={reset}>
              Ya, import file lain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type SaveCounts = { create: number; update: number; attachments: number };

/** Judul dialog konfirmasi simpan — sama dengan tombol Simpan (karyawan dan/atau lampiran). */
function saveQuestion(c: SaveCounts): string {
  const writable = c.create + c.update;
  if (writable === 0) return `Simpan ${c.attachments} lampiran?`;
  return `Simpan ${writable} karyawan${c.attachments > 0 ? ` + ${c.attachments} lampiran` : ""}?`;
}

function saveConfirmLabel(c: SaveCounts): string {
  const writable = c.create + c.update;
  return writable === 0 ? `Ya, simpan ${c.attachments} lampiran` : `Ya, simpan ${writable}`;
}

const MODE_LABELS = {
  UPSERT: "Tambah + perbarui",
  FILL_EMPTY: "Isi yang kosong saja",
  CREATE_ONLY: "Tambah baru saja",
} as const;

const MODE_HINTS = {
  UPSERT: "Karyawan baru dibuat, yang sudah ada diperbarui.",
  FILL_EMPTY: "Yang sudah ada hanya diisi bagian yang masih kosong.",
  CREATE_ONLY: "Hanya karyawan baru; yang sudah ada dilewati.",
} as const;
