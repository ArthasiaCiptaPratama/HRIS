import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../auth-provider";
import { AuthCard } from "./login-page";

// Tujuan tautan undangan & reset password (redirect dari Supabase). supabase-js membaca token
// dari URL (detectSessionInUrl); setelah sesi terbentuk, pengguna diminta mengatur password.
export function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const [expired, setExpired] = useState(false);
  const linkError = new URLSearchParams(window.location.hash.slice(1)).get("error_description");

  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  if (session) return <Navigate to="/auth/atur-password" replace />;
  if (linkError || (!loading && expired)) {
    return (
      <AuthCard
        title="Tautan tidak valid"
        description="Tautan sudah kedaluwarsa atau sudah dipakai."
      >
        <p className="text-sm">
          Minta tautan baru lewat{" "}
          <Link className="underline underline-offset-4" to="/lupa-password">
            lupa password
          </Link>{" "}
          atau hubungi HR.
        </p>
      </AuthCard>
    );
  }
  return <AuthCard title="Memverifikasi tautan…">Mohon tunggu sebentar.</AuthCard>;
}
