import { zodResolver } from "@hookform/resolvers/zod";
import { resolveLoginEmail } from "@hris/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useSearchParams } from "react-router";
import { BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../auth-provider";
import { type LoginForm, loginFormSchema } from "../schemas";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <BrandLogo className="h-32" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {/* Judul halaman sebagai heading (aksesibilitas & pembaca layar). */}
            <h1>{title}</h1>
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

// Hanya path internal yang diizinkan sebagai tujuan setelah login (cegah open redirect).
export function safeNext(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginPage() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { identifier: "", password: "" },
  });

  if (session) return <Navigate to={safeNext(params.get("next"))} replace />;

  const nik = Boolean(env.VITE_LOGIN_EMAIL_DOMAIN);
  const onSubmit = form.handleSubmit(async ({ identifier, password }) => {
    setError(null);
    // D-048: NIK → alamat login turunan; email → apa adanya. Password langsung ke Supabase (D-033).
    const email = resolveLoginEmail(identifier, env.VITE_LOGIN_EMAIL_DOMAIN);
    if (!email) {
      form.setError("identifier", {
        message: nik ? "Masukkan NIK atau email yang valid." : "Email tidak valid.",
      });
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    // Pesan generik: tidak membedakan akun tidak terdaftar vs password salah.
    if (signInError)
      setError(`${nik ? "NIK/email" : "Email"} atau password salah, atau akun belum aktif.`);
  });

  return (
    <AuthCard
      title="Masuk ke Akselerasi Arthasia"
      description={
        nik
          ? "Gunakan NIK (nomor induk karyawan) atau email, dan password akun Anda."
          : "Gunakan email dan password akun Anda."
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="identifier">{nik ? "NIK atau email" : "Email"}</Label>
          <Input
            id="identifier"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            {...form.register("identifier")}
          />
          {form.formState.errors.identifier ? (
            <p className="text-destructive text-xs">{form.formState.errors.identifier.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Memproses…" : "Masuk"}
        </Button>
        <p className="text-center text-sm">
          <Link
            className="text-muted-foreground underline-offset-4 hover:underline"
            to="/lupa-password"
          >
            Lupa password?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
