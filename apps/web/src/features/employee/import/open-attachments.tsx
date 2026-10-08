import { CloudDownload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { useOpenAttachmentJobs } from "./api";

// D-060: import sebelumnya yang lampiran Google Drive-nya belum selesai/gagal → bisa dilanjutkan.
export function OpenAttachments({
  activeJobId,
  onOpen,
}: {
  activeJobId: string | null;
  onOpen: (jobId: string) => void;
}) {
  const { data } = useOpenAttachmentJobs();
  const jobs = (data ?? []).filter((job) => job.jobId !== activeJobId);
  if (jobs.length === 0) return null;
  return (
    <Alert className="mb-5">
      <CloudDownload />
      <AlertDescription className="space-y-2">
        <p className="text-foreground font-medium">Lampiran Google Drive belum selesai</p>
        <ul className="space-y-1.5">
          {jobs.map((job) => (
            <li key={job.jobId} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {job.fileName} · {formatDateTime(job.createdAt)} ·{" "}
                {job.pending > 0 ? `${job.pending} menunggu` : ""}
                {job.pending > 0 && job.failed > 0 ? " · " : ""}
                {job.failed > 0 ? `${job.failed} gagal` : ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => onOpen(job.jobId)}>
                Lanjutkan
              </Button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
