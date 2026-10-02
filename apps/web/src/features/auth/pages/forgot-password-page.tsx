import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { type ForgotPasswordForm, forgotPasswordFormSchema } from "../schemas";
import { AuthCard } from "./login-page";

const acceptedSchema = z.object({ data: z.object({ accepted: z.literal(true) }) });

// D-048: lupa password lewat API — NIK atau email; tautan dikirim ke email pribadi karyawan.
export function ForgotPasswordPage() {
  const nik = Boolean(env.VITE_LOGIN_EMAIL_DOMAIN);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { identifier: "" },
  });

  const onSubmit = form.handleSubmit(async (body) => {
    setError(null);
    try {
      await api("/auth/password-reset", { method: "POST", body, schema: acceptedSchema });
      // Selalu pesan yang sama: tidak membocorkan apakah akun terdaftar.
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      title="Lupa password"
      description="Kami kirim tautan untuk mengatur password baru ke email pribadi Anda."
    >
      {sent ? (
        <Alert>
          <AlertDescription>
            Jika akun tersebut terdaftar, tautan atur ulang password sudah dikirim ke email pribadi
            Anda. Periksa kotak masuk (dan folder spam).
          </AlertDescription>
        </Alert>
      ) : (
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
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            Kirim tautan
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link className="text-muted-foreground underline-offset-4 hover:underline" to="/login">
          Kembali ke halaman masuk
        </Link>
      </p>
    </AuthCard>
  );
}
