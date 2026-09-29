import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { ApiError } from "@/lib/api-client";
import { useMe } from "../api";
import { useAuth } from "../auth-provider";
import type { Me } from "../schemas";

export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center p-6 text-sm">
      {children}
    </div>
  );
}

// Tampil selama modul route lazy pertama dimuat (BUG-001: tanpa ini React Router memberi warning).
export function RouteHydrateFallback() {
  return <FullPageMessage>Memuat halaman…</FullPageMessage>;
}

// Route guard (PROMPT §7): kenyamanan UI; API tetap menolak akses yang tidak berhak.
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const me = useMe();

  if (loading) return <FullPageMessage>Memuat sesi…</FullPageMessage>;
  if (!session) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  if (me.isPending) return <FullPageMessage>Memuat akun…</FullPageMessage>;
  if (me.isError) {
    // 401 ditangani global (keluar otomatis); error lain ditampilkan.
    const message =
      me.error instanceof ApiError
        ? me.error.message
        : "Tidak dapat memuat akun. Coba muat ulang halaman.";
    return <FullPageMessage>{message}</FullPageMessage>;
  }
  return <Outlet />;
}

export function ForbiddenMessage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Akses ditolak</h1>
      <p className="text-muted-foreground text-sm">Anda tidak memiliki akses ke halaman ini.</p>
    </div>
  );
}

export function RequireAccess({
  check,
  children,
}: {
  check: (me: Me) => boolean;
  children: ReactNode;
}) {
  const me = useMe();
  if (!me.data) return null;
  return check(me.data) ? children : <ForbiddenMessage />;
}

/** Guard sebagai layout route: melindungi sekelompok rute (termasuk rute `lazy`). */
export function RequireAccessRoute({ check }: { check: (me: Me) => boolean }) {
  const me = useMe();
  if (!me.data) return null;
  return check(me.data) ? <Outlet /> : <ForbiddenMessage />;
}
