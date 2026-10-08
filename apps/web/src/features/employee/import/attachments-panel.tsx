import { useQueryClient } from "@tanstack/react-query";
import { CloudDownload, Pause, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { errorMessage } from "@/lib/errors";
import { employeeKeys } from "../api";
import { type ImportAttachments, useAttachmentActions, useImportAttachments } from "./api";
import { attachmentTargetLabel } from "./labels";

// D-060: lampiran Google Drive dari Import diproses bertahap setelah data tersimpan. Panel memanggil
// API berulang (±20 dtk per panggilan) sampai antrean habis; halaman boleh ditutup — sisa antrean bisa
// dilanjutkan dari halaman Import.

const STATUS: Record<
  ImportAttachments["items"][number]["status"],
  { label: string; variant: "success" | "muted" | "warning" | "destructive" | "brand" }
> = {
  PENDING: { label: "Menunggu", variant: "muted" },
  PROCESSING: { label: "Diproses", variant: "brand" },
  DONE: { label: "Masuk", variant: "success" },
  SKIPPED: { label: "Dilewati", variant: "warning" },
  FAILED: { label: "Gagal", variant: "destructive" },
};

export function AttachmentsPanel({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const query = useImportAttachments(jobId);
  const { process, retry } = useAttachmentActions(jobId);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const data = query.data;
  const pending = data?.counts.pending ?? 0;
  const canRun = Boolean(data?.driveConfigured) && pending > 0;

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
            if (next.counts.total - next.counts.pending === handled)
              setIdleUntil(Date.now() + 3000);
          },
          onError: (e) => {
            setError(errorMessage(e));
            setRunning(false);
          },
        }),
      Math.max(0, idleUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [running, canRun, process, error, handled, idleUntil]);

  const finished = data !== undefined && data.counts.total > 0 && pending === 0;
  useEffect(() => {
    // Foto & dokumen karyawan berubah → daftar/detail disegarkan sekali saat antrean selesai.
    if (finished) {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["employee-documents"] });
    }
  }, [finished, queryClient]);

  if (query.isPending) {
    return <p className="text-muted-foreground text-sm">Memuat lampiran…</p>;
  }
  if (!data) {
    return <p className="text-destructive text-sm">{errorMessage(query.error)}</p>;
  }

  const { counts } = data;
  const percent = counts.total === 0 ? 100 : Math.round((handled / counts.total) * 100);
  const notes = data.items.filter((i) => i.status === "SKIPPED" || i.status === "FAILED");

  return (
    <section
      aria-labelledby="attachments-title"
      className="bg-card mx-auto max-w-3xl space-y-4 rounded-2xl border p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="attachments-title" className="flex items-center gap-2 font-semibold">
            <CloudDownload className="size-5" aria-hidden /> Lampiran Google Drive
          </h2>
          <p className="text-muted-foreground text-sm">
            Foto & dokumen dari tautan Drive diambil bertahap. Halaman ini boleh ditutup; sisa
            lampiran bisa dilanjutkan dari halaman Import.
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
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        <div
          className="bg-muted h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Progres lampiran"
        >
          <div className="bg-brand h-full transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-muted-foreground mt-2 text-sm" aria-live="polite">
          {handled} dari {counts.total} lampiran · {counts.done} masuk · {counts.skipped} dilewati ·{" "}
          {counts.failed} gagal
          {pending > 0 && running && data.driveConfigured ? " · memproses…" : ""}
        </p>
      </div>

      {notes.length > 0 ? (
        <div className="max-h-80 overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-card sticky top-0">
              <TableRow>
                <TableHead className="w-14">Baris</TableHead>
                <TableHead>Karyawan</TableHead>
                <TableHead>Lampiran</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="min-w-[200px]">Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.sourceRow}</TableCell>
                  <TableCell>
                    <p className="font-medium">{item.fullName}</p>
                    <p className="text-muted-foreground font-mono text-xs">{item.employeeNumber}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {attachmentTargetLabel(item.field)}
                    {item.fileCount > 1 ? ` (${item.fileCount} file)` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {item.reason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}
