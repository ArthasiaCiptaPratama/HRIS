import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../auth-provider";
import { type SetPasswordForm, setPasswordFormSchema } from "../schemas";
import { AuthCard } from "./login-page";

export function SetPasswordFields({ form }: { form: ReturnType<typeof useForm<SetPasswordForm>> }) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Ulangi password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...form.register("confirm")}
        />
        {form.formState.errors.confirm ? (
          <p className="text-destructive text-xs">{form.formState.errors.confirm.message}</p>
        ) : null}
      </div>
    </>
  );
}

export function SetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SetPasswordForm>({
    resolver: zodResolver(setPasswordFormSchema),
    defaultValues: { password: "", confirm: "" },
  });

  if (!loading && !session) return <Navigate to="/login" replace />;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError("Password gagal disimpan. Gunakan password lain yang lebih kuat, lalu coba lagi.");
      return;
    }
    toast.success("Password tersimpan.");
    navigate("/", { replace: true });
  });

  return (
    <AuthCard
      title="Atur password"
      description="Buat password untuk akun Akselerasi Arthasia Anda (minimal 12 karakter)."
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <SetPasswordFields form={form} />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          Simpan password
        </Button>
      </form>
    </AuthCard>
  );
}
