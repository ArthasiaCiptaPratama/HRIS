import { useState } from "react";
import { Pagination } from "@/components/pagination";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useAuditLogs } from "../api";

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const logs = useAuditLogs({
    page,
    action: action || undefined,
    from: from ? new Date(`${from}T00:00:00+07:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59+07:00`).toISOString() : undefined,
  });
  const reset = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground text-sm">
          Jejak aksi sensitif. Nilai sensitif tidak pernah disimpan mentah.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="w-full sm:w-64"
          placeholder="Aksi, mis. iam.grant"
          aria-label="Filter aksi"
          value={action}
          onChange={reset(setAction)}
        />
        <Input
          className="w-40"
          type="date"
          aria-label="Dari tanggal"
          value={from}
          onChange={reset(setFrom)}
        />
        <Input
          className="w-40"
          type="date"
          aria-label="Sampai tanggal"
          value={to}
          onChange={reset(setTo)}
        />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Entitas</TableHead>
              <TableHead>Aktor</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Memuat…
                </TableCell>
              </TableRow>
            ) : logs.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="text-destructive">
                  {errorMessage(logs.error)}
                </TableCell>
              </TableRow>
            ) : logs.data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Tidak ada entri.
                </TableCell>
              </TableRow>
            ) : (
              logs.data.data.map((log) => (
                <TableRow key={log.id} className="align-top">
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(log.occurredAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="text-xs">
                    {log.entityType}
                    <br />
                    <span className="text-muted-foreground">{log.entityId?.slice(0, 8)}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.actorAccountId ? log.actorAccountId.slice(0, 8) : "sistem/script"}
                  </TableCell>
                  <TableCell>
                    <details className="text-xs">
                      <summary className="cursor-pointer">Lihat</summary>
                      <pre className="bg-muted mt-1 max-w-md overflow-auto rounded p-2">
                        {JSON.stringify(
                          { before: log.before, after: log.after, reason: log.reason },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {logs.data ? (
        <Pagination
          page={page}
          pageSize={logs.data.meta.pageSize}
          total={logs.data.meta.total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
