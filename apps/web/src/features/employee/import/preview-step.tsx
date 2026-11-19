import type { ImportCellEdits, ImportFieldKey, RawImportRow } from "@hris/shared";
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CloudDownload,
  Loader2,
  Save,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SelectOption } from "@/components/form-select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImportPreview } from "./api";
import { fieldLabel, issueShort, issueText } from "./labels";
import { CHART_NEW, PreviewSheet } from "./sheet/preview-sheet";

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
  rawBySource,
  fields,
  edits,
  pending,
  onEdit,
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
  /** Paket B: isi file per baris, isian yang ada di file, & ubahan sel di layar. */
  rawBySource: ReadonlyMap<number, RawImportRow>;
  fields: ImportFieldKey[];
  edits: ImportCellEdits;
  pending: ReadonlySet<string>;
  onEdit: (changes: { sourceRow: number; field: ImportFieldKey; value: string }[]) => void;
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
  // Paket B3: cari nama/NIP (nilai file atau yang sudah diubah di layar).
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return preview.rows.filter((r) => {
      if (!matchesFilter(filter, r.action)) return false;
      if (!q) return true;
      const changed = edits[r.sourceRow] ?? {};
      return [r.fullName, r.employeeNumber, changed.fullName, changed.employeeNumber].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [preview.rows, filter, query, edits]);
  // IMP-D5 (pengguna 19 Nov, opsi a): pilihan pemegang bagan hanya tampil di baris yang namanya mirip
  // (atau sudah dipilih); baris lain lewat satu tautan di atas tabel, bukan tautan per baris.
  const [showAllHolders, setShowAllHolders] = useState(false);
  const canPickOtherHolder =
    preview.chartHolders.length > 0 &&
    preview.rows.some((r) => r.chartHolder && r.chartHolder.candidates.length === 0);
  const similarHolderRows = preview.rows.filter(
    (r) => (r.chartHolder?.candidates.length ?? 0) > 0,
  ).length;
  const [jump, setJump] = useState<{
    sourceRow: number;
    field: string | null;
    nonce: number;
  } | null>(null);
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
                <li key={r.sourceRow} className="truncate">
                  {/* Paket B: klik → lompat ke sel yang salah di tabel. */}
                  <button
                    type="button"
                    title={errors.map((i) => issueText(i, columnOf)).join("\n")}
                    onClick={() => {
                      if (filter === "READY" || filter === "SKIP") setFilter("ALL");
                      setQuery("");
                      setJump((j) => ({
                        sourceRow: r.sourceRow,
                        field: errors[0]?.field ?? null,
                        nonce: (j?.nonce ?? 0) + 1,
                      }));
                    }}
                    className="hover:bg-destructive/10 max-w-full truncate rounded text-left"
                  >
                    <span className="text-muted-foreground">Baris {r.sourceRow} · </span>
                    <span className="font-medium">{r.fullName ?? "(tanpa nama)"}</span>
                    <span className="text-destructive"> — {errors.map(issueShort).join("; ")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            Klik untuk menuju selnya, lalu ketik isi yang benar ·{" "}
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
        <div className="flex flex-wrap items-center gap-2">
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
          <label className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden
            />
            <input
              type="search"
              aria-label="Cari nama atau NIP"
              placeholder="Cari nama/NIP"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-card focus-visible:ring-ring/50 h-8 w-44 rounded-full border pr-3 pl-8 text-sm outline-none focus-visible:ring-[3px]"
            />
          </label>
        </div>
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

      <div className={cn("transition-opacity", updating && "opacity-80")}>
        <PreviewSheet
          preview={preview}
          rows={rows}
          rawBySource={rawBySource}
          fields={fields}
          edits={edits}
          pending={pending}
          onEdit={onEdit}
          fillEmpty={fillEmpty}
          columnOf={columnOf}
          companyOptions={companyOptions}
          companyOverrides={companyOverrides}
          onCompanyOverride={onCompanyOverride}
          statusOptions={statusOptions}
          statusOverrides={statusOverrides}
          onStatusOverride={onStatusOverride}
          holders={{
            column: preview.chartHolders.length > 0 && (similarHolderRows > 0 || showAllHolders),
            all: showAllHolders,
          }}
          holderOptions={holderOptions}
          onChartHolderChoice={onChartHolderChoice}
          jumpTo={jump}
        />
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
