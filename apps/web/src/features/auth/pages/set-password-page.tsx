import { zodResolver } from "@hookform/resolvers/zod";
import { Circle, CircleCheck, CircleX, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth-provider";
import { type SetPasswordForm, setPasswordFormSchema } from "../schemas";
import { AuthCard } from "./login-page";

/** Input password dengan tombol tampilkan/sembunyikan (ikon mata). */
function PasswordInput({
  id,
  registration,
  invalid,
  describedBy,
}: {
  id: string;
  registration: ReturnType<ReturnType<typeof useForm<SetPasswordForm>>["register"]>;
  invalid: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="pr-10"
        {...registration}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={visible}
        aria-controls={id}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md outline-none focus-visible:ring-[3px]"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Syarat wajib (≥ 12 karakter) + saran kekuatan; dicentang langsung saat mengetik. */
const PASSWORD_CHECKS: { label: string; test: (v: string) => boolean; required: boolean }[] = [
  { label: "Minimal 12 karakter", test: (v) => v.length >= 12, required: true },
  {
    label: "Huruf besar & huruf kecil",
    test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v),
    required: false,
  },
  { label: "Angka", test: (v) => /\d/.test(v), required: false },
  { label: "Simbol (mis. ! @ # -)", test: (v) => /[^A-Za-z0-9]/.test(v), required: false },
];

function strengthOf(value: string) {
  if (value.length < 12) return { label: "Terlalu pendek", tone: "bg-destructive", score: 1 };
  const extras = PASSWORD_CHECKS.filter((c) => !c.required && c.test(value)).length;
  if (extras >= 3 || (extras >= 2 && value.length >= 16))
    return { label: "Kuat", tone: "bg-success", score: 4 };
  if (extras >= 1) return { label: "Cukup", tone: "bg-warning", score: 3 };
  return { label: "Lemah", tone: "bg-warning", score: 2 };
}

export function SetPasswordFields({ form }: { form: ReturnType<typeof useForm<SetPasswordForm>> }) {
  const password = form.watch("password") ?? "";
  const confirm = form.watch("confirm") ?? "";
  const strength = strengthOf(password);
  const matches = confirm.length > 0 && confirm === password;
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="password">Password baru</Label>
        <PasswordInput
          id="password"
          registration={form.register("password")}
          invalid={Boolean(form.formState.errors.password)}
          describedBy="password-rules"
        />
        {form.formState.errors.password ? (
          <p className="text-destructive text-xs">{form.formState.errors.password.message}</p>
        ) : null}
        <div id="password-rules" className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    password && i <= strength.score ? strength.tone : "bg-muted",
                  )}
                />
              ))}
            </div>
            <span className="text-muted-foreground w-24 text-right text-xs" aria-live="polite">
              {password ? `Kekuatan: ${strength.label}` : "Belum diisi"}
            </span>
          </div>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {PASSWORD_CHECKS.map((c) => {
              const ok = c.test(password);
              return (
                <li
                  key={c.label}
                  className={cn(
                    "flex items-center gap-1.5",
                    ok ? "text-success-soft-foreground" : "text-muted-foreground",
                  )}
                >
                  {ok ? (
                    <CircleCheck className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Circle className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span>
                    {c.label}
                    {c.required ? <span className="font-medium"> (wajib)</span> : null}
                  </span>
                  <span className="sr-only">{ok ? "— terpenuhi" : "— belum"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Ulangi password</Label>
        <PasswordInput
          id="confirm"
          registration={form.register("confirm")}
          invalid={Boolean(form.formState.errors.confirm) || (confirm.length > 0 && !matches)}
          describedBy="confirm-status"
        />
        <p
          id="confirm-status"
          aria-live="polite"
          className={cn(
            "flex items-center gap-1.5 text-xs",
            !confirm && "text-muted-foreground",
            confirm && matches && "text-success-soft-foreground",
            confirm && !matches && "text-destructive",
          )}
        >
          {!confirm ? (
            "Ketik ulang password yang sama."
          ) : matches ? (
            <>
              <CircleCheck className="size-3.5" aria-hidden /> Password cocok
            </>
          ) : (
            <>
              <CircleX className="size-3.5" aria-hidden /> Belum sama dengan password baru
            </>
          )}
        </p>
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
      description="Buat password untuk akun Akselerasi Arthasia Anda. Gunakan kombinasi yang sulit ditebak."
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
