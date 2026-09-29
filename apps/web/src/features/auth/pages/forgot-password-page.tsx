import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { type ForgotPasswordForm, forgotPasswordFormSchema } from "../schemas";
import { AuthCard } from "./login-page";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    // Selalu pesan yang sama: tidak membocorkan apakah email terdaftar.
    setSent(true);
  });

  return (
    <AuthCard title="Lupa password" description="Kami kirim tautan untuk mengatur password baru.">
      {sent ? (
        <Alert>
          <AlertDescription>
            Jika email tersebut terdaftar, tautan atur ulang password sudah dikirim. Periksa kotak
            masuk (dan folder spam).
          </AlertDescription>
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
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
