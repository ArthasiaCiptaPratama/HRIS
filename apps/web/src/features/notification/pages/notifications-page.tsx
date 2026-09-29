import { useState } from "react";
import { Link } from "react-router";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useMarkAllRead, useMarkRead, useNotifications } from "../api";

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const notifications = useNotifications(page);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifikasi</h1>
          <p className="text-muted-foreground text-sm">
            {notifications.data?.meta.unreadCount ?? 0} belum dibaca.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => markAll.mutate()}
          disabled={(notifications.data?.meta.unreadCount ?? 0) === 0}
        >
          Tandai semua dibaca
        </Button>
      </div>
      {notifications.isError ? (
        <p className="text-destructive text-sm">{errorMessage(notifications.error)}</p>
      ) : null}
      <ul className="divide-y rounded-md border">
        {(notifications.data?.data ?? []).map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-3 p-3">
            <div>
              <p className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.title}</p>
              {n.body ? <p className="text-muted-foreground text-sm">{n.body}</p> : null}
              <p className="text-muted-foreground text-xs">{formatDateTime(n.createdAt)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
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
        {notifications.data?.data.length === 0 ? (
          <li className="text-muted-foreground p-4 text-sm">Belum ada notifikasi.</li>
        ) : null}
      </ul>
      {notifications.data ? (
        <Pagination
          page={page}
          pageSize={notifications.data.meta.pageSize}
          total={notifications.data.meta.total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
