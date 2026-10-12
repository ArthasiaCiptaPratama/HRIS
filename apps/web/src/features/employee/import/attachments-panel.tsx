import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  CloudDownload,
  Loader2,
  MoveHorizontal,
  Pause,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { employeeKeys } from "../api";
import { type ImportAttachments, useAttachmentActions, useImportAttachments } from "./api";
import { attachmentTargetLabel } from "./labels";

// D-060: lampiran Google Drive dari Import diproses bertahap setelah data tersimpan. Panel memanggil
// API berulang (±8 dtk per panggilan) sampai antrean habis; halaman boleh ditutup — sisa antrean bisa
// dilanjutkan dari halaman Import. Pemrosesan hidup selama panel ini terpasang.

type Item = ImportAttachments["items"][number];

const STATUS: Record<
  Item["status"],
  { label: string; variant: "success" | "muted" | "warning" | "destructive" | "brand" }
> = {
  PENDING: { label: "Menunggu", variant: "muted" },
  PROCESSING: { label: "Diproses", variant: "brand" },
  DONE: { label: "Masuk", variant: "success" },
  SKIPPED: { label: "Dilewati", variant: "warning" },
  FAILED: { label: "Gagal", variant: "destructive" },
};

/**
 * Coba ulang otomatis untuk gangguan sementara (koneksi putus, server restart, gateway sibuk): jeda
 * eksponensial + jitter. Aman karena pemrosesan idempoten — lampiran diklaim per baris & klaim yang
 * terputus kedaluwarsa sendiri di server. Error lain (403/404/422…) langsung ditampilkan.
 */
export const RETRY = { attempts: 4, baseMs: 2000, jitterMs: 500 };
const TRANSIENT_STATUS = new Set([0, 408, 429, 502, 503, 504]);
const isTransient = (e: unknown) => e instanceof ApiError && TRANSIENT_STATUS.has(e.status);
const retryDelay = (attempt: number) =>
  RETRY.baseMs * 2 ** attempt + Math.round(Math.random() * RETRY.jitterMs);

/** Ringkasan untuk halaman induk (stepper, konfirmasi sebelum import file lain). */
export type AttachmentsState = { total: number; handled: number; pending: number; active: boolean };

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-background rounded-xl border px-3 py-2.5">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <span className={cn("size-1.5 rounded-full", tone)} aria-hidden />
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ItemLine({ item }: { item: Item }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.fullName}</p>
        <p className="text-muted-foreground truncate text-xs">
          {attachmentTargetLabel(item.field)}
          {item.fileCount > 1 ? ` · ${item.fileCount} file` : ""}
        </p>
      </div>
      <Badge variant={STATUS[item.status].variant}>
        {item.status === "PROCESSING" ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {STATUS[item.status].label}
      </Badge>
    </li>
  );
}

/** Tepi yang masih bisa digeser — dipakai untuk bayangan tepi & petunjuk geser. */
function useScrollEdges() {
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    // ResizeObserver tidak ada di sebagian lingkungan (jsdom, peramban lama) → cukup ukuran jendela.
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [update]);
  return { ref, edges, update };
}

/**
 * Lampiran yang dilewati/gagal. Satu wadah gulir (tegak + mendatar) supaya scrollbar mendatar selalu
 * terlihat di bawah tabel; bayangan tepi + petunjuk muncul hanya bila isi lebih lebar dari panel.
 */
function NotesTable({ notes }: { notes: Item[] }) {
  const { ref, edges, update } = useScrollEdges();
  const head = "text-muted-foreground h-10 px-3 text-left align-middle text-xs font-medium";
  return (
    <div className="border-t">
      {edges.right || edges.left ? (
        <p className="text-muted-foreground flex items-center gap-1.5 px-4 pt-2 text-xs">
          <MoveHorizontal className="size-3.5" aria-hidden /> Geser tabel ke samping untuk melihat
          keterangan lengkap.
        </p>
      ) : null}
      <div className="relative">
        <section
          ref={ref}
          onScroll={update}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: wadah gulir harus bisa digeser dengan keyboard
          tabIndex={0}
          aria-label="Daftar lampiran yang perlu dicek"
          className="focus-visible:ring-ring/50 max-h-80 overflow-auto outline-none focus-visible:ring-[3px] [scrollbar-width:thin]"
        >
          <table className="w-full min-w-max text-sm">
            <thead className="bg-card sticky top-0 z-10 border-b">
              <tr>
                <th className={head}>Karyawan</th>
                <th className={head}>Lampiran</th>
                <th className={head}>Status</th>
                <th className={head}>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <p className="font-medium">{item.fullName}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {item.employeeNumber ?? "NIP belum ada"}
                    </p>
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    {attachmentTargetLabel(item.field)}
                    {item.fileCount > 1 ? ` (${item.fileCount} file)` : ""}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 align-top whitespace-nowrap">
                    {item.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div
          aria-hidden
          className={cn(
            "from-card pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r to-transparent transition-opacity",
            edges.left ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "from-card pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent transition-opacity",
            edges.right ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}

export function AttachmentsPanel({
  jobId,
  className,
  onStateChange,
}: {
  jobId: string;
  className?: string;
  onStateChange?: (state: AttachmentsState) => void;
}) {
  const queryClient = useQueryClient();
  const query = useImportAttachments(jobId);
  const { process, retry } = useAttachmentActions(jobId);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(true);
  /** Jumlah coba ulang berturut-turut karena gangguan sementara (0 = koneksi normal). */
  const [retries, setRetries] = useState(0);
  const data = query.data;
  const pending = data?.counts.pending ?? 0;
  const canRun = Boolean(data?.driveConfigured) && pending > 0;
  const active = canRun && running && !error;

  // Satu panggilan pada satu waktu; berhenti bila error (tombol Lanjutkan) atau antrean habis. Panggilan
  // tanpa kemajuan (lampiran sedang diproses tab/pengguna lain) → tunggu 3 dtk sebelum mencoba lagi.
  const handled = data ? data.counts.total - data.counts.pending : 0;
  const [idleUntil, setIdleUntil] = useState(0);
  useEffect(() => {
    if (!running || !canRun || process.isPending || error) return;
    const timer = setTimeout(
      () =>
        process.mutate(undefined, {
          onSuccess: (next) => {
            setRetries(0);
            if (next.counts.total - next.counts.pending === handled)
              setIdleUntil(Date.now() + 3000);
          },
          onError: (e) => {
            if (isTransient(e) && retries < RETRY.attempts) {
              setIdleUntil(Date.now() + retryDelay(retries));
              setRetries(retries + 1);
              return;
            }
            setRetries(0);
            setError(errorMessage(e));
            setRunning(false);
          },
        }),
      Math.max(0, idleUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [running, canRun, process, error, handled, idleUntil, retries]);

  const total = data?.counts.total ?? 0;
  useEffect(() => {
    onStateChange?.({ total, handled, pending, active });
  }, [onStateChange, total, handled, pending, active]);

  const finished = data !== undefined && total > 0 && pending === 0;
  useEffect(() => {
    // Foto & dokumen karyawan berubah → daftar/detail disegarkan sekali saat antrean selesai.
    if (finished) {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["employee-documents"] });
    }
  }, [finished, queryClient]);

  const shell = cn("bg-card space-y-5 rounded-2xl border p-6", className);
  if (query.isPending) {
    return (
      <section className={shell}>
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Memuat lampiran…
        </p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className={shell}>
        <p className="text-destructive text-sm">{errorMessage(query.error)}</p>
      </section>
    );
  }

  const { counts } = data;
  const percent = counts.total === 0 ? 100 : Math.round((handled / counts.total) * 100);
  const notes = data.items.filter((i) => i.status === "SKIPPED" || i.status === "FAILED");
  // Yang sedang diproses (atau berikutnya di antrean) — supaya terlihat ada yang berjalan.
  const processing = data.items.filter((i) => i.status === "PROCESSING");
  const upcoming = (
    processing.length > 0 ? processing : data.items.filter((i) => i.status === "PENDING")
  ).slice(0, 4);

  const status = !data.driveConfigured
    ? { label: "Menunggu konfigurasi", variant: "warning" as const }
    : finished
      ? counts.failed > 0
        ? { label: "Selesai dengan catatan", variant: "warning" as const }
        : { label: "Selesai", variant: "success" as const }
      : active
        ? { label: "Mengunduh…", variant: "brand" as const }
        : { label: "Dijeda", variant: "muted" as const };

  return (
    <section aria-labelledby="attachments-title" className={shell}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="attachments-title" className="flex items-center gap-2 font-semibold">
              <CloudDownload className="size-5" aria-hidden /> Lampiran Google Drive
            </h2>
            <Badge variant={status.variant}>
              {active ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {finished && counts.failed === 0 ? <CheckCircle2 aria-hidden /> : null}
              {status.label}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {finished
              ? "Semua tautan Drive sudah diproses."
              : "Foto & dokumen diambil bertahap. Bila halaman ditutup, proses dijeda dan bisa dilanjutkan dari halaman Import."}
          </p>
        </div>
        <div className="flex gap-2">
          {canRun && running ? (
            <Button variant="outline" size="sm" onClick={() => setRunning(false)}>
              <Pause /> Jeda
            </Button>
          ) : null}
          {canRun && !running ? (
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                setError(null);
                setRunning(true);
              }}
            >
              <Play /> Lanjutkan
            </Button>
          ) : null}
          {counts.failed > 0 && pending === 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={retry.isPending}
              onClick={() =>
                retry.mutate(undefined, {
                  onSuccess: () => {
                    setError(null);
                    setRunning(true);
                  },
                  onError: (e) => setError(errorMessage(e)),
                })
              }
            >
              <RotateCcw /> Coba lagi yang gagal
            </Button>
          ) : null}
        </div>
      </div>

      {!data.driveConfigured ? (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            Google Drive belum dikonfigurasi di server. {counts.pending} lampiran tersimpan di
            antrean dan bisa diproses setelah admin mengisi kunci service account.
          </AlertDescription>
        </Alert>
      ) : null}
      {retries > 0 && !error ? (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertDescription>
            Koneksi ke server terputus — mencoba lagi otomatis ({retries}/{RETRY.attempts})…
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold tabular-nums">
            {percent}
            <span className="text-muted-foreground text-lg">%</span>
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {handled} / {counts.total} lampiran
          </p>
        </div>
        <div
          className="bg-muted h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Progres lampiran"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              finished && counts.failed === 0 ? "bg-success" : "bg-brand",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {handled} dari {counts.total} lampiran · {counts.done} masuk · {counts.skipped} dilewati ·{" "}
          {counts.failed} gagal
          {active ? " · memproses…" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Masuk" value={counts.done} tone="bg-success" />
        <Stat label="Menunggu" value={counts.pending} tone="bg-muted-foreground/50" />
        <Stat label="Dilewati" value={counts.skipped} tone="bg-warning" />
        <Stat label="Gagal" value={counts.failed} tone="bg-destructive" />
      </div>

      {upcoming.length > 0 ? (
        <div>
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {processing.length > 0 ? "Sedang diproses" : "Berikutnya di antrean"}
          </h3>
          <ul className="divide-y">
            {upcoming.map((item) => (
              <ItemLine key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className="rounded-xl border">
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            aria-expanded={showNotes}
            className="hover:bg-muted/50 flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium"
          >
            <span>Perlu dicek ({notes.length})</span>
            <ChevronDown
              className={cn("size-4 transition-transform", showNotes && "rotate-180")}
              aria-hidden
            />
          </button>
          {showNotes ? <NotesTable notes={notes} /> : null}
        </div>
      ) : null}
    </section>
  );
}
