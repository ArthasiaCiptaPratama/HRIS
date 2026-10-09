import type { ImportFieldKey } from "@hris/shared";
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  CloudDownload,
  Download,
  Info,
  Loader2,
  Save,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SelectOption } from "@/components/form-select";
import { LazySelect } from "@/components/lazy-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { cn } from "@/lib/utils";
import type { ImportPreview } from "./api";
import { ACTION_LABELS, fieldLabel, issueHint, issueText } from "./labels";

// Pratinjau (langkah terakhir sebelum simpan): ringkasan, pengaturan yang dipakai (ubah → kembali ke
// Lengkapi data), dan tabel baris. Pilihan untuk banyak baris ada di langkah Lengkapi data.

export type MasterMap = {
  departments: Record<string, string>;
  positions: Record<string, string>;
  grades: Record<string, string>;
  workLocations: Record<string, string>;
};
export const masterKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export const positionKey = (department: string, name: string) =>
  `${masterKey(department)}|${masterKey(name)}`;

type Filter = "ALL" | "CREATE" | "UPDATE" | "SKIP" | "ERROR";

const AUTO = "__auto__";

const ACTION_BADGE = {
  CREATE: "success",
  UPDATE: "secondary",
  SKIP: "muted",
  ERROR: "destructive",
} as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
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
}: {
  row: Row;
  columnOf: (field: ImportFieldKey) => number | undefined;
}) {
  const [showWarnings, setShowWarnings] = useState(false);
  const errors = row.issues.filter((i) => i.severity === "ERROR");
  const warnings = row.issues.filter((i) => i.severity === "WARNING");
  const hint = issueHint(row.issues);
  return (
    <div className="space-y-1 text-sm">
      {row.action === "UPDATE" && row.changes.length > 0 ? (
        <p className="text-muted-foreground">Berubah: {row.changes.map(fieldLabel).join(", ")}</p>
      ) : null}
      {row.action === "SKIP" && row.issues.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada perubahan data</p>
      ) : null}
      {row.action === "CREATE" && row.issues.length === 0 ? (
        <p className="text-muted-foreground">Siap dibuat</p>
      ) : null}
      {row.attachments > 0 ? (
        <p className="text-muted-foreground">Lampiran Google Drive: {row.attachments}</p>
      ) : null}
      {errors.map((i) => (
        <p key={`${i.field}-${i.code}`} className="text-destructive">
          {issueText(i, columnOf)}
        </p>
      ))}
      {hint ? (
        <p className="text-foreground text-xs">
          <span className="font-medium">Perbaikan:</span> {hint}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowWarnings((v) => !v)}
            aria-expanded={showWarnings}
            className="text-warning-soft-foreground inline-flex items-center gap-1 text-xs hover:underline"
          >
            {warnings.length} peringatan (baris tetap disimpan)
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
  statusOptions,
  statusOverrides,
  onStatusOverride,
  companyOptions,
  companyOverrides,
  onCompanyOverride,
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
  statusOptions: SelectOption[];
  statusOverrides: Record<string, string>;
  /** id kosong = kembali ikut kolom file / status bawaan. */
  onStatusOverride: (sourceRow: number, id: string) => void;
  /** Pilihan PT dalam cakupan (kosong/satu = tanpa pilihan PT per baris). */
  companyOptions: SelectOption[];
  companyOverrides: Record<string, string>;
  /** id kosong = kembali ikut kolom file / PT bawaan. */
  onCompanyOverride: (sourceRow: number, id: string) => void;
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
  const problems = preview.rows.filter((r) => r.issues.length > 0).length;
  const rows = useMemo(
    () => (filter === "ALL" ? preview.rows : preview.rows.filter((r) => r.action === filter)),
    [preview.rows, filter],
  );
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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 max-sm:[&>*:last-child]:col-span-2">
        <Stat label="Akan dibuat" value={counts.create} tone="text-success-soft-foreground" />
        <Stat label="Akan diperbarui" value={counts.update} />
        <Stat label="Dilewati" value={counts.skip} />
        <Stat
          label="Error (tidak diimpor)"
          value={counts.error}
          tone={counts.error ? "text-destructive" : ""}
        />
        <Stat label="Baris kosong" value={counts.blank} />
      </div>

      <div className="bg-card flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Settings2 className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">Pengaturan: </span>
            <span className="text-muted-foreground">{settings.join(" · ")}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-muted-foreground flex items-center gap-1.5 text-xs transition-opacity",
              updating ? "opacity-100" : "opacity-0",
            )}
            aria-live="polite"
          >
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {updating ? "Memperbarui…" : ""}
          </span>
          <Button variant="outline" size="sm" onClick={onEditSettings}>
            Ubah pengaturan
          </Button>
        </div>
      </div>

      {counts.attachments > 0 ? (
        <Alert>
          <CloudDownload />
          <AlertDescription>
            {counts.attachments} lampiran Google Drive (foto & dokumen) akan diambil setelah data
            disimpan. Lampiran yang sama dengan yang sudah pernah diimpor dilewati; file berbeda
            menjadi versi dokumen baru.
          </AlertDescription>
        </Alert>
      ) : null}

      {preview.skippedFields.length > 0 ? (
        <Alert>
          <ShieldAlert />
          <AlertTitle>Kolom sensitif dilewati</AlertTitle>
          <AlertDescription>
            Akun Anda tidak punya izin menulis data pribadi/rekening, jadi kolom berikut tidak
            diimpor: {preview.skippedFields.map(fieldLabel).join(", ")}. Minta Super Admin memberi
            grant bila perlu.
          </AlertDescription>
        </Alert>
      ) : null}

      {counts.error > 0 || choosePt || hasNewRows ? (
        <div className="grid gap-2 text-sm">
          {counts.error > 0 ? (
            <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2.5 rounded-xl border px-4 py-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                {counts.error} baris error tidak akan disimpan.{" "}
                <button
                  type="button"
                  onClick={() => setFilter("ERROR")}
                  className="font-medium underline underline-offset-4"
                >
                  Lihat baris error saja
                </button>
              </p>
            </div>
          ) : null}
          {choosePt || hasNewRows ? (
            <div className="bg-muted/40 text-muted-foreground flex items-start gap-2.5 rounded-xl border px-4 py-3">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                {choosePt && hasNewRows
                  ? "PT dan status karyawan baru bisa diubah langsung di tabel."
                  : choosePt
                    ? "PT bisa diubah langsung di tabel."
                    : "Status karyawan baru bisa diubah langsung di tabel."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <nav aria-label="Saring baris" className="flex flex-wrap gap-1.5">
        {(["ALL", "CREATE", "UPDATE", "SKIP", "ERROR"] as const).map((key) => {
          const count =
            key === "ALL"
              ? preview.rows.length
              : preview.rows.filter((r) => r.action === key).length;
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
              {key === "ALL" ? "Semua" : ACTION_LABELS[key]}
              <span className="font-mono text-xs tabular-nums">{count}</span>
            </button>
          );
        })}
      </nav>

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
                <TableHead className="w-16">Baris</TableHead>
                <TableHead>Karyawan</TableHead>
                <TableHead className={choosePt ? "min-w-[170px]" : "w-16"}>PT</TableHead>
                <TableHead className="w-28">Aksi</TableHead>
                {hasNewRows ? <TableHead className="min-w-[200px]">Status</TableHead> : null}
                <TableHead className="min-w-[260px]">Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.sourceRow} className="align-top">
                  <TableCell className="font-mono text-xs">{r.sourceRow}</TableCell>
                  <TableCell className="whitespace-normal">
                    <p className="font-medium">{r.fullName ?? "-"}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {r.employeeNumber ?? "NIP belum ada"}
                    </p>
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
                  <TableCell>
                    <Badge variant={ACTION_BADGE[r.action]}>{ACTION_LABELS[r.action]}</Badge>
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
                        <span className="text-muted-foreground text-xs">
                          Sudah ada · tidak diubah
                        </span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="min-w-[280px] whitespace-normal">
                    <RowMessages row={r} columnOf={columnOf} />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={hasNewRows ? 6 : 5}
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Kembali
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {problems > 0 ? (
            <Button variant="outline" onClick={onDownloadIssues}>
              <Download /> Unduh baris bermasalah ({problems})
            </Button>
          ) : null}
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
