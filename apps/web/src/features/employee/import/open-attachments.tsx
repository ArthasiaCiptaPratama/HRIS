import { CloudDownload, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { useOpenAttachmentJobs } from "./api";

// D-060: import sebelumnya yang lampiran Google Drive-nya belum selesai/gagal → bisa dilanjutkan.
// Kartu ringkas di atas langkah Unggah; panel prosesnya dibuka terpisah (tidak mendorong area unggah).
export function OpenAttachments({ onOpen }: { onOpen: (jobId: string) => void }) {
  const { data } = useOpenAttachmentJobs();
  const jobs = data ?? [];
  if (jobs.length === 0) return null;
  return (
    <section
      aria-labelledby="open-attachments-title"
      className="bg-card mb-5 rounded-2xl border px-5 py-4"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="bg-brand-soft text-brand-soft-foreground grid size-7 place-items-center rounded-lg">
          <CloudDownload className="size-4" aria-hidden />
        </span>
        <h2 id="open-attachments-title" className="text-sm font-semibold">
          Lampiran Google Drive belum selesai
        </h2>
      </div>
      <ul className="divide-y">
        {jobs.map((job) => (
          <li key={job.jobId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{job.fileName}</p>
              <p className="text-muted-foreground text-xs">{formatDateTime(job.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              {job.pending > 0 ? <Badge variant="muted">{job.pending} menunggu</Badge> : null}
              {job.failed > 0 ? <Badge variant="destructive">{job.failed} gagal</Badge> : null}
              <Button size="sm" variant="outline" onClick={() => onOpen(job.jobId)}>
                <Play /> Lanjutkan
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
