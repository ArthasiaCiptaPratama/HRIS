import { createColumnHelper } from "@tanstack/react-table";
import { History, SearchX, X } from "lucide-react";
import { useState } from "react";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useAuditLogs } from "../api";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from "../audit-labels";
import type { AuditLog } from "../schemas";

const helper = createColumnHelper<typeof tableFeaturesNone, AuditLog>();

const columns: DataColumn<AuditLog>[] = [
  helper.display({
    id: "occurredAt",
    header: "Waktu",
    meta: { className: "whitespace-nowrap tabular-nums align-top" },
    cell: ({ row }) => formatDateTime(row.original.occurredAt),
  }) as DataColumn<AuditLog>,
  helper.display({
    id: "action",
    header: "Aksi",
    meta: { className: "align-top min-w-[180px]" },
    cell: ({ row }) => (
      <div>
        <p className="text-sm">{AUDIT_ACTION_LABELS[row.original.action] ?? row.original.action}</p>
        <p className="text-muted-foreground font-mono text-[11px]">{row.original.action}</p>
      </div>
    ),
  }) as DataColumn<AuditLog>,
  helper.display({
    id: "entity",
    header: "Entitas",
    meta: { className: "text-sm align-top min-w-[180px]" },
    cell: ({ row }) => (
      <div>
        <p>
          {row.original.entityLabel ??
            AUDIT_ENTITY_LABELS[row.original.entityType] ??
            row.original.entityType}
        </p>
        <p className="text-muted-foreground text-xs">
          {AUDIT_ENTITY_LABELS[row.original.entityType] ?? row.original.entityType}
          {row.original.entityLabel ? null : (
            <span className="font-mono"> · {row.original.entityId?.slice(0, 8)}</span>
          )}
        </p>
      </div>
    ),
  }) as DataColumn<AuditLog>,
  helper.display({
    id: "actor",
    header: "Aktor",
    meta: {
      headerClassName: "hidden md:table-cell",
      className: "hidden md:table-cell text-sm align-top",
    },
    cell: ({ row }) =>
      row.original.actorEmail ??
      (row.original.actorAccountId ? (
        <span className="font-mono text-xs">{row.original.actorAccountId.slice(0, 8)}</span>
      ) : (
        <span className="text-muted-foreground">Sistem / script</span>
      )),
  }) as DataColumn<AuditLog>,
  helper.display({
    id: "detail",
    header: "Detail",
    meta: { className: "align-top" },
    cell: ({ row }) => (
      <details className="text-xs">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
          Lihat
        </summary>
        <pre className="bg-muted mt-1 max-w-md overflow-auto rounded-md p-2">
          {JSON.stringify(
            { before: row.original.before, after: row.original.after, reason: row.original.reason },
            null,
            2,
          )}
        </pre>
      </details>
    ),
  }) as DataColumn<AuditLog>,
];

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const action = useDebouncedValue(search, 300);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const logs = useAuditLogs({
    page,
    pageSize,
    action: action || undefined,
    from: from ? new Date(`${from}T00:00:00+07:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59+07:00`).toISOString() : undefined,
  });
  const filtered = Boolean(action || from || to);
  const total = logs.data?.meta.total ?? 0;
  const setDate = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Jejak aksi sensitif. Nilai sensitif tidak pernah disimpan mentah."
      />
      <ListPanel
        toolbar={
          <>
            <SearchField
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Aksi, mis. iam.grant"
              aria-label="Filter aksi"
            />
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Input
                className="h-9 sm:w-40"
                type="date"
                aria-label="Dari tanggal"
                value={from}
                onChange={setDate(setFrom)}
              />
              <Input
                className="h-9 sm:w-40"
                type="date"
                aria-label="Sampai tanggal"
                value={to}
                onChange={setDate(setTo)}
              />
              {filtered ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-span-2 h-9"
                  onClick={() => {
                    setSearch("");
                    setFrom("");
                    setTo("");
                    setPage(1);
                  }}
                >
                  <X /> Reset
                </Button>
              ) : null}
            </div>
          </>
        }
        footer={
          total > 0 ? (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null
        }
      >
        <DataTable
          label="Daftar audit log"
          columns={columns}
          data={logs.data?.data ?? []}
          loading={logs.isPending}
          fetching={logs.isFetching}
          skeletonRows={Math.min(pageSize, 8)}
          skeletonAvatar={false}
          empty={
            logs.isError
              ? { icon: SearchX, title: "Gagal memuat data", description: errorMessage(logs.error) }
              : filtered
                ? {
                    icon: SearchX,
                    title: "Tidak ada yang cocok",
                    description: "Coba aksi atau rentang tanggal lain.",
                  }
                : { icon: History, title: "Belum ada entri audit" }
          }
        />
      </ListPanel>
    </div>
  );
}
