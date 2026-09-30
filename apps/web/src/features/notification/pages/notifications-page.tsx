import { Bell, CheckCheck, SearchX } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState } from "@/components/empty-state";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMarkAllRead, useMarkRead, useNotifications } from "../api";

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const notifications = useNotifications(page, pageSize);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const items = notifications.data?.data ?? [];
  const total = notifications.data?.meta.total ?? 0;
  const unread = notifications.data?.meta.unreadCount ?? 0;

  return (
    <div>
      <PageHeader
        title="Notifikasi"
        description={`${unread} belum dibaca.`}
        actions={
          <Button variant="outline" onClick={() => markAll.mutate()} disabled={unread === 0}>
            <CheckCheck /> Tandai semua dibaca
          </Button>
        }
      />
      <ListPanel
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
        {notifications.isPending ? (
          <ul aria-busy className="divide-y">
            {Array.from({ length: 4 }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: baris kerangka statis
              <li key={index} className="space-y-2 p-4">
                <Skeleton className="h-3.5 w-56" />
                <Skeleton className="h-3 w-32" />
              </li>
            ))}
          </ul>
        ) : notifications.isError ? (
          <EmptyState
            icon={SearchX}
            title="Gagal memuat notifikasi"
            description={errorMessage(notifications.error)}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Belum ada notifikasi"
            description="Pemberitahuan tentang akun dan pengajuan Anda akan muncul di sini."
          />
        ) : (
          <ul aria-label="Daftar notifikasi" className="divide-y">
            {items.map((n, index) => (
              <li
                key={n.id}
                style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
                className={cn(
                  "animate-fade-up flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
                  !n.readAt && "bg-brand-soft/30",
                )}
              >
                <div className="flex min-w-0 gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-brand",
                    )}
                  />
                  <div className="min-w-0 space-y-0.5">
                    <p className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</p>
                    {n.body ? <p className="text-muted-foreground text-sm">{n.body}</p> : null}
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 pl-5 sm:pl-0">
                  {n.link ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link to={n.link}>Buka</Link>
                    </Button>
                  ) : null}
                  {!n.readAt ? (
                    <Button size="sm" variant="outline" onClick={() => markRead.mutate(n.id)}>
                      Tandai dibaca
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ListPanel>
    </div>
  );
}
