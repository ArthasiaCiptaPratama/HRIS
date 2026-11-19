import { EXIT_REASON_LABELS, type ImportFieldKey } from "@hris/shared";
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CloudDownload,
  Loader2,
  Save,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SelectOption } from "@/components/form-select";
import { LazySelect } from "@/components/lazy-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ImportPreview } from "./api";
import { fieldLabel, issueHint, issueShort, issueText } from "./labels";

// Pratinjau (langkah terakhir sebelum simpan): ringkasan, pengaturan yang dipakai (ubah → kembali ke
// Lengkapi data), daftar "Perlu diperbaiki", dan tabel baris. Pilihan untuk banyak baris ada di langkah
// Lengkapi data. IMP-D5: bahasa sehari-hari; alasan error di bawah nama (tanpa kolom Keterangan di ujung
// kanan) supaya terbaca di laptop tanpa menggeser tabel.

export type MasterMap = {
  departments: Record<string, string>;
  positions: Record<string, string>;
  grades: Record<string, string>;
  workLocations: Record<string, string>;
  homebases: Record<string, string>;
};
export const masterKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export const positionKey = (department: string, name: string) =>
  `${masterKey(department)}|${masterKey(name)}`;

type Filter = "ALL" | "READY" | "SKIP" | "ERROR";

const FILTER_LABELS: Record<Filter, string> = {
  ALL: "Semua",
  READY: "Siap disimpan",
  ERROR: "Perlu diperbaiki",
  SKIP: "Dilewati",
};

const matchesFilter = (filter: Filter, action: ImportPreview["rows"][number]["action"]) =>
  filter === "ALL" ||
  (filter === "READY" ? action === "CREATE" || action === "UPDATE" : action === filter);

const AUTO = "__auto__";

const ACTION_BADGE = {
  CREATE: "success",
  UPDATE: "secondary",
  SKIP: "muted",
  ERROR: "destructive",
} as const;

function Summary({ counts }: { counts: ImportPreview["counts"] }) {
  const ready = counts.create + counts.update;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base font-semibold">
      <span className="inline-flex items-center gap-1.5">
        <CircleCheck className="text-success-soft-foreground size-5" aria-hidden />
        <span className="tabular-nums">{ready}</span> siap disimpan
      </span>
      {counts.error > 0 ? (
        <span className="text-destructive inline-flex items-center gap-1.5">
          <CircleAlert className="size-5" aria-hidden />
          <span className="tabular-nums">{counts.error}</span> perlu diperbaiki
        </span>
      ) : null}
      {counts.skip > 0 ? (
        <span className="text-muted-foreground text-sm font-normal">
          {counts.skip} tanpa perubahan
        </span>
      ) : null}
    </p>
  );
}

// D-060: baris tanpa perubahan data tetap bisa disimpan bila membawa lampiran Google Drive.
function saveLabel(writable: number, attachments: number) {
  if (writable === 0) return `Simpan ${attachments} lampiran`;
  return `Simpan ${writable} karyawan${attachments > 0 ? ` + ${attachments} lampiran` : ""}`;
}

type Row = ImportPreview["rows"][number];

function RowMessages({
  row,
  columnOf,
  fillEmpty,
}: {
  row: Row;
  columnOf: (field: ImportFieldKey) => number | undefined;
  fillEmpty: boolean;
}) {
  const [showWarnings, setShowWarnings] = useState(false);
  const errors = row.issues.filter((i) => i.severity === "ERROR");
  const warnings = row.issues.filter((i) => i.severity === "WARNING");
  const hint = issueHint(row.issues);
  return (
    <div className="space-y-1 text-sm">
      {row.deactivate ? (
        <p className="text-foreground">
          Akan dinonaktifkan: {EXIT_REASON_LABELS[row.deactivate.reason]} per{" "}
          {formatDate(row.deactivate.date)}
        </p>
      ) : null}
      {row.action === "UPDATE" && row.changes.length > 0 ? (
        <p className="text-muted-foreground">
          {fillEmpty ? "Diisi" : "Berubah"}: {row.changes.map(fieldLabel).join(", ")}
        </p>
      ) : null}
      {/* IMP-D2: info konflik, bukan error — nilai di sistem dipertahankan. */}
      {row.kept.length > 0 ? (
        <p className="text-muted-foreground">
          Dibiarkan (sudah berisi, beda): {row.kept.map(fieldLabel).join(", ")}
        </p>
      ) : null}
      {row.action === "SKIP" && row.issues.length === 0 && row.kept.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada perubahan data</p>
      ) : null}
      {row.attachments > 0 ? (
        <p className="text-muted-foreground">Lampiran Google Drive: {row.attachments}</p>
      ) : null}
      {errors.map((i) => (
        <p
          key={`${i.field}-${i.code}`}
          className="text-destructive"
          title={`${issueText(i, columnOf)}${hint ? `\n${hint}` : ""}`}
        >
          {issueShort(i)}
        </p>
      ))}
      {warnings.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowWarnings((v) => !v)}
            aria-expanded={showWarnings}
            className="text-warning-soft-foreground inline-flex items-center gap-1 text-xs hover:underline"
          >
            {warnings.length} catatan (tetap disimpan)
            <ChevronDown
              className={cn("size-3.5 transition-transform", showWarnings && "rotate-180")}
              aria-hidden
            />
          </button>
          {showWarnings
            ? warnings.map((i) => (
                <p key={`${i.field}-${i.code}`} className="text-warning-soft-foreground text-xs">
                  {issueText(i, columnOf)}
                </p>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

export function PreviewStep({
  preview,
  settings,
  fillEmpty = false,
  statusOptions,
  statusOverrides,
  onStatusOverride,
  companyOptions,
  companyOverrides,
  onCompanyOverride,
  chartHolderChoices,
  onChartHolderChoice,
  columnOf,
  onEditSettings,
  onBack,
  onCommit,
  onDownloadIssues,
  saving,
  updating,
}: {
  preview: ImportPreview;
  /** Ringkasan pilihan di langkah Lengkapi data (mis. "PT ACP", "10 nilai unit dicocokkan"). */
  settings: string[];
  /** IMP-D2: mode "Isi yang kosong saja" → label "Diisi" untuk field yang akan ditulis. */
  fillEmpty?: boolean;
  statusOptions: SelectOption[];
  statusOverrides: Record<string, string>;
  /** id kosong = kembali ikut kolom file / status bawaan. */
  onStatusOverride: (sourceRow: number, id: string) => void;
  /** Pilihan PT dalam cakupan (kosong/satu = tanpa pilihan PT per baris). */
  companyOptions: SelectOption[];
  companyOverrides: Record<string, string>;
  /** id kosong = kembali ikut kolom file / PT bawaan. */
  onCompanyOverride: (sourceRow: number, id: string) => void;
  /** IMP-D1: pilihan pemegang bagan per baris (id karyawan ASLI- atau "NEW"). */
  chartHolderChoices: Record<string, string>;
  /** Nilai kosong = belum memilih (kembali ke saran). */
  onChartHolderChoice: (sourceRow: number, value: string) => void;
  columnOf: (field: ImportFieldKey) => number | undefined;
  /** Kembali ke langkah Lengkapi data. */
  onEditSettings: () => void;
  onBack: () => void;
  onCommit: () => void;
  onDownloadIssues: () => void;
  saving: boolean;
  /** Pratinjau sedang dihitung ulang setelah pilihan berubah (data lama tetap tampil). */
  updating: boolean;
}) {
  const { counts } = preview;
  // Dibuka dengan "Semua" (urutan baris file) supaya terlihat bahwa PT & status setiap baris bisa diubah.
  const [filter, setFilter] = useState<Filter>("ALL");
  const writable = counts.create + counts.update;
  const errorRows = useMemo(() => preview.rows.filter((r) => r.action === "ERROR"), [preview.rows]);
  const rows = useMemo(
    () => preview.rows.filter((r) => matchesFilter(filter, r.action)),
    [preview.rows, filter],
  );
  // IMP-D5 (pengguna 19 Nov, opsi a): pilihan pemegang bagan hanya tampil di baris yang namanya mirip
  // (atau sudah dipilih); baris lain lewat satu tautan di atas tabel, bukan tautan per baris.
  const [showAllHolders, setShowAllHolders] = useState(false);
  const canPickOtherHolder =
    preview.chartHolders.length > 0 &&
    preview.rows.some((r) => r.chartHolder && r.chartHolder.candidates.length === 0);
  const similarHolderRows = preview.rows.filter(
    (r) => (r.chartHolder?.candidates.length ?? 0) > 0,
  ).length;
  const hasNewRows = preview.rows.some((r) => r.newEmployee);
  const rowStatusOptions = useMemo(
    () => [{ value: AUTO, label: "Ikuti kolom file / bawaan" }, ...statusOptions],
    [statusOptions],
  );
  const choosePt = companyOptions.length > 1;
  const rowCompanyOptions = useMemo(
    () => [{ value: AUTO, label: "Ikuti kolom file / bawaan" }, ...companyOptions],
    [companyOptions],
  );
  const companyIdByCode = new Map(companyOptions.map((c) => [c.label, c.value]));
  // IMP-D1: pemegang bagan ber-NIP sementara — saran per baris + pilihan manual (PT baris sama).
  const holderById = useMemo(
    () => new Map(preview.chartHolders.map((h) => [h.id, h])),
    [preview.chartHolders],
  );
  const chosenHolders = new Set(
    Object.values(chartHolderChoices).filter((v) => v !== "NEW" && holderById.has(v)),
  );
  const pendingHolders = preview.chartHolders.filter((h) => !chosenHolders.has(h.id));
  const holderOptions = (row: ImportPreview["rows"][number]) => {
    const company = row.companyCode ? companyIdByCode.get(row.companyCode) : undefined;
    const suggested = new Map(row.chartHolder?.candidates.map((c) => [c.id, c.match]) ?? []);
    const label = (h: ImportPreview["chartHolders"][number]) =>
      `${h.fullName} · ${h.employeeNumber}`;
    const pool = preview.chartHolders.filter(
      (h) => suggested.has(h.id) || !company || h.companyId === company,
    );
    return [
      { value: CHART_NEW, label: "Buat karyawan baru" },
      ...pool
        .filter((h) => suggested.has(h.id))
        .map((h) => ({
          value: h.id,
          label: label(h),
          hint: h.postLabel ?? undefined,
          group: suggested.get(h.id) === "NAME" ? "Saran: nama sama" : "Saran: cocok inisial",
        })),
      ...pool
        .filter((h) => !suggested.has(h.id))
        .map((h) => ({
          value: h.id,
          label: label(h),
          hint: h.postLabel ?? undefined,
          group: "Pemegang bagan lain",
        })),
    ];
  };

  return (
    <div className="space-y-5">
      {/* IMP-D5 "sekali lihat": ringkasan + pengaturan dalam satu baris. */}
      <div className="bg-card flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Summary counts={counts} />
        <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
          {updating ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-label="Memperbarui…" />
          ) : null}
          <span className="truncate" title={settings.join(" · ")}>
            {settings.join(" · ")}
          </span>
          <button
            type="button"
            onClick={onEditSettings}
            className="text-foreground shrink-0 font-medium underline-offset-4 hover:underline"
          >
            Ubah pengaturan
          </button>
        </div>
      </div>

      {similarHolderRows > 0 ? (
        <details className="bg-card rounded-2xl border px-4 py-3 text-sm">
          <summary className="cursor-pointer">
            <span className="font-medium">
              {similarHolderRows} nama mirip orang di Struktur Organisasi
            </span>{" "}
            <span className="text-muted-foreground">
              — data mereka belum lengkap. Pilih di bawah nama: orang yang sama, atau karyawan baru
              {chosenHolders.size > 0 ? ` · ${chosenHolders.size} dilengkapi import ini` : ""}
            </span>
          </summary>
          <ul className="text-muted-foreground mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {pendingHolders.map((h) => (
              <li key={h.id}>
                <span className="text-foreground">{h.fullName}</span>
                {h.postLabel ? ` · ${h.postLabel}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {counts.attachments > 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CloudDownload className="size-4 shrink-0" aria-hidden />
          {counts.attachments} foto/dokumen dari Google Drive diambil setelah disimpan.
        </p>
      ) : null}

      {preview.skippedFields.length > 0 ? (
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer">
            🔒 {preview.skippedFields.length} kolom data pribadi tidak tersimpan untuk akun Anda ·{" "}
            <span className="text-foreground underline underline-offset-4">Rincian</span>
          </summary>
          <p className="mt-1 pl-5">
            {preview.skippedFields.map(fieldLabel).join(", ")}. Minta Super Admin memberi izin data
            pribadi bila data ini perlu masuk.
          </p>
        </details>
      ) : null}

      {errorRows.length > 0 ? (
        <section
          aria-label="Perlu diperbaiki"
          className="border-destructive/30 bg-destructive/5 rounded-2xl border px-4 py-3"
        >
          <h3 className="text-destructive flex items-center gap-2 text-sm font-semibold">
            <CircleAlert className="size-4" aria-hidden />
            Perlu diperbaiki ({errorRows.length} baris)
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {errorRows.map((r) => {
              const errors = r.issues.filter((i) => i.severity === "ERROR");
              return (
                <li
                  key={r.sourceRow}
                  className="truncate"
                  title={errors.map((i) => issueText(i, columnOf)).join("\n")}
                >
                  <span className="text-muted-foreground">Baris {r.sourceRow} · </span>
                  <span className="font-medium">{r.fullName ?? "(tanpa nama)"}</span>
                  <span className="text-destructive"> — {errors.map(issueShort).join("; ")}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            {errorRows.some((r) => issueHint(r.issues)?.includes("Excel"))
              ? "Perbaiki di Excel lalu unggah lagi · "
              : ""}
            <button
              type="button"
              onClick={onDownloadIssues}
              className="text-foreground font-medium underline underline-offset-4"
            >
              Unduh {errorRows.length} baris
            </button>
          </p>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Saring baris" className="flex flex-wrap gap-1.5">
          {(["ALL", "READY", "ERROR", "SKIP"] as const).map((key) => {
            const count = preview.rows.filter((r) => matchesFilter(key, r.action)).length;
            if (key === "SKIP" && count === 0) return null;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                  filter === key
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {FILTER_LABELS[key]}
                <span className="font-mono text-xs tabular-nums">{count}</span>
              </button>
            );
          })}
        </nav>
        {canPickOtherHolder ? (
          <button
            type="button"
            aria-expanded={showAllHolders}
            onClick={() => setShowAllHolders((v) => !v)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-left text-sm underline-offset-4 hover:underline"
          >
            {showAllHolders
              ? "Sembunyikan pilihan Struktur Organisasi"
              : "Nama lain di Struktur Organisasi?"}
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                showAllHolders && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "bg-card overflow-hidden rounded-2xl border transition-opacity",
          updating && "opacity-70",
        )}
      >
        <div className="max-h-[60vh] overflow-auto">
          <Table aria-label="Pratinjau baris import">
            <TableHeader className="bg-card sticky top-0 z-10">
              <TableRow>
                <TableHead className="min-w-[220px]">Karyawan</TableHead>
                <TableHead className={choosePt ? "w-[150px]" : "w-16"}>PT</TableHead>
                {hasNewRows ? <TableHead className="w-[170px]">Status</TableHead> : null}
                <TableHead className="w-24">Hasil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.sourceRow} className="align-top">
                  <TableCell className="whitespace-normal">
                    <p className="font-medium">{r.fullName ?? "-"}</p>
                    <p className="text-muted-foreground text-xs">
                      Baris {r.sourceRow} ·{" "}
                      <span className="font-mono">{r.employeeNumber ?? "NIP belum ada"}</span>
                    </p>
                    {r.chartHolder &&
                    preview.chartHolders.length > 0 &&
                    (r.chartHolder.candidates.length > 0 ||
                      r.chartHolder.choice ||
                      showAllHolders) ? (
                      <div className="mt-1.5 max-w-64">
                        <LazySelect
                          aria-label={`Pemegang bagan baris ${r.sourceRow}`}
                          value={r.chartHolder.choice ?? ""}
                          onChange={(v) => onChartHolderChoice(r.sourceRow, v)}
                          placeholder={
                            r.chartHolder.candidates.length > 0
                              ? "Pilih: orang yang sama atau karyawan baru"
                              : "Pilih orang di Struktur Organisasi…"
                          }
                          options={holderOptions(r)}
                          searchable
                          invalid={r.issues.some((i) => i.code.startsWith("CHART_HOLDER"))}
                        />
                        {r.chartHolder.choice && r.chartHolder.choice !== "NEW" ? (
                          <p className="text-brand mt-1 text-xs">
                            Melengkapi data orang di Struktur Organisasi (posisinya tetap)
                          </p>
                        ) : r.chartHolder.candidates.length > 0 && !r.chartHolder.choice ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            Nama mirip orang di Struktur Organisasi — pilih dulu
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-1.5">
                      <RowMessages row={r} columnOf={columnOf} fillEmpty={fillEmpty} />
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {choosePt ? (
                      <LazySelect
                        aria-label={`PT baris ${r.sourceRow}`}
                        value={
                          companyOverrides[String(r.sourceRow)] ??
                          (r.companyCode ? companyIdByCode.get(r.companyCode) : undefined) ??
                          AUTO
                        }
                        onChange={(v) => onCompanyOverride(r.sourceRow, v === AUTO ? "" : v)}
                        placeholder="Pilih PT"
                        options={rowCompanyOptions}
                        invalid={r.issues.some((i) => i.field === "companyCode")}
                      />
                    ) : (
                      (r.companyCode ?? "—")
                    )}
                  </TableCell>
                  {hasNewRows ? (
                    <TableCell>
                      {r.newEmployee ? (
                        <LazySelect
                          aria-label={`Status kepegawaian baris ${r.sourceRow}`}
                          value={
                            statusOverrides[String(r.sourceRow)] ?? r.employmentStatusId ?? AUTO
                          }
                          onChange={(v) => onStatusOverride(r.sourceRow, v === AUTO ? "" : v)}
                          placeholder="Pilih status"
                          options={rowStatusOptions}
                          invalid={r.issues.some((i) => i.field === "employmentStatusText")}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">Sudah ada</span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Badge variant={ACTION_BADGE[r.action]}>{RESULT_LABELS[r.action]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={hasNewRows ? 4 : 3}
                    className="text-muted-foreground py-10 text-center"
                  >
                    Tidak ada baris pada kategori ini.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Kembali
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:ml-auto sm:flex-wrap sm:justify-end">
          <Button
            variant="brand"
            onClick={onCommit}
            disabled={(writable === 0 && counts.attachments === 0) || saving || updating}
          >
            <Save /> {saving ? "Menyimpan…" : saveLabel(writable, counts.attachments)}
          </Button>
        </div>
      </div>
    </div>
  );
}

const CHART_NEW = "NEW";

/** Label hasil per baris di Pratinjau (IMP-D5: bahasa sehari-hari). */
const RESULT_LABELS = {
  CREATE: "Baru",
  UPDATE: "Diperbarui",
  SKIP: "Dilewati",
  ERROR: "Perbaiki",
} as const;
