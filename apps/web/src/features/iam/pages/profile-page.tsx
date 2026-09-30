import { zodResolver } from "@hookform/resolvers/zod";
import { PERMISSION_LABELS, ROLE_LABELS } from "@hris/shared";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/features/auth/api";
import { SetPasswordFields } from "@/features/auth/pages/set-password-page";
import { type Me, type SetPasswordForm, setPasswordFormSchema } from "@/features/auth/schemas";
import { useEmployee } from "@/features/employee/api";
import { EmployeePhotoControl } from "@/features/employee/components/employee-photo-control";
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
    <div>
      <PageHeader title="Profil" description="Foto, akses, dan keamanan akun Anda." />
      <div className="animate-fade-up grid gap-4 lg:grid-cols-2">
        {me.employeeId ? <OwnPhotoCard employeeId={me.employeeId} /> : null}
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
            <p className="text-muted-foreground">
              Login terakhir: {formatDateTime(me.lastLoginAt)}
            </p>
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
    </div>
  );
}

/** D-037 + PLAN §4.3 "ubah data diri sendiri: … foto": setiap akun tertaut pegawai mengelola fotonya. */
function OwnPhotoCard({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId).data;
  return (
    <Card className="lg:col-span-2">
      <CardContent className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:text-left">
        {employee ? (
          <EmployeePhotoControl
            employeeId={employee.id}
            name={employee.fullName}
            photoUrl={employee.photoUrl}
            canEdit={employee.access.photo}
          />
        ) : (
          <div className="bg-muted size-24 animate-pulse rounded-full sm:size-28" />
        )}
        <div className="space-y-1">
          <p className="text-lg font-semibold">{employee?.fullName ?? "Memuat…"}</p>
          <p className="text-muted-foreground text-sm">
            Foto profil tampil di data pegawai dan formulir cetak. Klik ikon kamera untuk mengganti
            (JPG, PNG, atau WebP; otomatis dipotong 3:4 dan dikompres).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
