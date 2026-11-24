import { ROLE_LABELS, type Role } from "@hris/shared";
import { type ReactNode, useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { tmAccess } from "@/features/time-management/access";
import { ApiError } from "@/lib/api-client";
// Mengimpor lib/standalone memasang pendengar `beforeinstallprompt` sejak bundel awal (TM-D32).
import { isAbsenPath, isStandalone, openInBrowser } from "@/lib/standalone";
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
  // D-045 b: calon yang belum disetujui hanya memakai wizard (API juga menolak endpoint lain).
  if (me.data.onboarding?.locked && !location.pathname.startsWith("/onboarding")) {
    return <Navigate to="/onboarding" replace />;
  }
  // TM-D32: aplikasi layar utama hanya memakai Absen (login/atur password ada di luar guard ini).
  if (
    isStandalone() &&
    !isAbsenPath(location.pathname) &&
    !location.pathname.startsWith("/onboarding")
  ) {
    return <Navigate to="/absen" replace />;
  }
  return <Outlet />;
}

/**
 * Layar "Akses ditolak" (role non-karyawan). #102 susulan: tampilkan akun yang sedang aktif — sesi
 * Supabase dipakai bersama semua tab di satu browser, jadi akun bisa berganti tanpa disadari — dan
 * jalan keluar: ke Beranda atau masuk dengan akun lain.
 */
export function ForbiddenMessage({ me }: { me?: Me }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Akses ditolak</h1>
        <p className="text-muted-foreground text-sm">Anda tidak memiliki akses ke halaman ini.</p>
        {me ? (
          <p className="text-sm">
            Masuk sebagai: <span className="font-medium">{me.email}</span> (
            {ROLE_LABELS[me.role as Role] ?? me.role})
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/">Ke Beranda</Link>
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            navigate("/login", { replace: true });
          }}
        >
          Masuk dengan akun lain
        </Button>
      </div>
    </div>
  );
}

const EMPLOYEE_REDIRECT_TEXT =
  "Halaman itu tidak tersedia untuk akun Karyawan — dibuka halaman Absen.";

/**
 * #102 (TM-D30) susulan: akun Karyawan (beranda /absen) tidak diberi layar "Akses ditolak" — rute yang
 * ditolak (mis. ?next dari akun lain di browser yang sama, tab yang sesinya berganti) dialihkan ke /absen.
 */
function RedirectToAbsen() {
  useEffect(() => {
    toast.info(EMPLOYEE_REDIRECT_TEXT, { id: "employee-forbidden-redirect" });
  }, []);
  return <Navigate to="/absen" replace />;
}

/** TM-D32: aplikasi layar utama untuk akun tanpa data karyawan — web penuh dibuka lewat browser HP. */
export function StandaloneNoEmployee() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const url = `${window.location.origin}/`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tautan disalin. Tempel di browser HP.");
    } catch {
      toast.error("Tidak dapat menyalin tautan.");
    }
  };
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Akun belum terhubung</h1>
        <p className="text-muted-foreground text-sm">
          Akun ini belum terhubung ke data karyawan, jadi absen tidak tersedia di aplikasi ini.
        </p>
        <p className="text-muted-foreground text-xs">
          Jika tombol di bawah tidak membuka browser, buka alamat {window.location.host} langsung di
          browser HP Anda.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openInBrowser("/")}>Buka web di browser</Button>
        <Button variant="outline" onClick={() => void copy()}>
          Salin tautan
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await signOut();
            navigate("/login", { replace: true });
          }}
        >
          Keluar
        </Button>
      </div>
    </div>
  );
}

/** Tampilan saat `check` gagal: Karyawan → /absen; role lain → pesan Akses ditolak. */
function Denied({ me }: { me: Me }) {
  if (isStandalone() && !tmAccess.punch(me)) return <StandaloneNoEmployee />;
  return tmAccess.absenHome(me) ? <RedirectToAbsen /> : <ForbiddenMessage me={me} />;
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
  return check(me.data) ? children : <Denied me={me.data} />;
}

/** Guard sebagai layout route: melindungi sekelompok rute (termasuk rute `lazy`). */
export function RequireAccessRoute({ check }: { check: (me: Me) => boolean }) {
  const me = useMe();
  if (!me.data) return null;
  return check(me.data) ? <Outlet /> : <Denied me={me.data} />;
}
