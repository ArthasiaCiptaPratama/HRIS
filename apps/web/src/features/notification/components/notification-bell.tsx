import { Bell } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";
import { useMarkAllRead, useMarkRead, useNotifications } from "../api";

export function NotificationBell() {
  const notifications = useNotifications(1, 5);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();
  const unread = notifications.data?.meta.unreadCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifikasi, ${unread} belum dibaca`}
          className="relative"
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 ? (
            <span className="bg-destructive absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4 text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifikasi</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            disabled={unread === 0}
            onClick={() => markAll.mutate()}
          >
            Tandai semua dibaca
          </Button>
        </div>
        <ul className="max-h-80 overflow-auto">
          {(notifications.data?.data ?? []).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="hover:bg-muted w-full px-3 py-2 text-left"
                onClick={() => {
                  if (!n.readAt) markRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
              >
                <p className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.title}</p>
                {n.body ? (
                  <p className="text-muted-foreground line-clamp-2 text-xs">{n.body}</p>
                ) : null}
                <p className="text-muted-foreground text-[11px]">{formatDateTime(n.createdAt)}</p>
              </button>
            </li>
          ))}
          {notifications.data?.data.length === 0 ? (
            <li className="text-muted-foreground px-3 py-4 text-sm">Belum ada notifikasi.</li>
          ) : null}
        </ul>
        <div className="border-t px-3 py-2 text-right">
          <Link to="/notifikasi" className="text-sm underline-offset-4 hover:underline">
            Lihat semua
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
