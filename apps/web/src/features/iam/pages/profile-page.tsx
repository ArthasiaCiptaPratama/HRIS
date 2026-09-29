import { zodResolver } from "@hookform/resolvers/zod";
import { PERMISSION_LABELS, ROLE_LABELS } from "@hris/shared";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/features/auth/api";
import { SetPasswordFields } from "@/features/auth/pages/set-password-page";
import { type Me, type SetPasswordForm, setPasswordFormSchema } from "@/features/auth/schemas";
import { formatDate, formatDateTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";

export function ProfilePage() {
  const me = useMe().data as Me;
  const form = useForm<SetPasswordForm>({
    resolver: zodResolver(setPasswordFormSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const onSubmit = form.handleSubmit(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error("Password gagal diganti. Gunakan password lain yang lebih kuat.");
      return;
    }
    toast.success("Password diganti.");
    form.reset();
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profil akses</CardTitle>
          <CardDescription>{me.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-1">
            <Badge variant="secondary">{ROLE_LABELS[me.role]}</Badge>
            {me.isPrimarySuperAdmin ? <Badge>Super Admin Utama</Badge> : null}
          </div>
          <p className="text-muted-foreground">Login terakhir: {formatDateTime(me.lastLoginAt)}</p>
          <div>
            <p className="font-medium">Izin tambahan (grant)</p>
            {me.grants.length === 0 ? (
              <p className="text-muted-foreground">Tidak ada.</p>
            ) : (
              <ul className="list-disc pl-5">
                {me.grants.map((g) => (
                  <li key={g.permission}>
                    {PERMISSION_LABELS[g.permission]}
                    {g.expiresAt ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — sampai {formatDate(g.expiresAt)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ganti password</CardTitle>
          <CardDescription>Minimal 12 karakter.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <SetPasswordFields form={form} />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Simpan password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
