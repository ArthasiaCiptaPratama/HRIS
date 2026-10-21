import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access as appAccess } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import {
  useCompanyScope,
  useCreateEmployee,
  useEmployee,
  useUpdateEmployee,
  useUpdateEmployeeProfile,
} from "../api";
import {
  emptyProfile,
  type ProfileState,
  profileFromDetail,
  toProfileUpdate,
  validateProfileUpdate,
} from "../create/profile-form";
import { BankStep, EmergencyStep, FamilyStep, PersonalStep } from "../create/profile-steps";
import { todayIso } from "../labels";
import { type EmployeeDetail, type EmployeeForm, employeeFormSchema } from "../schemas";
import {
  EMPTY_EMPLOYEE_FORM,
  EmployeeWorkFields,
  toEmployeeWriteBody,
} from "./employee-work-fields";

// Ubah data karyawan dari detail (EMP-D4): tab Kepegawaian (data kerja) + Pribadi & alamat, Kontak darurat,
// Keluarga, Rekening (data sensitif, butuh izin baca & tulis bagian itu). Tambah dari daftar memakai halaman
// bertahap (EMP-D2, `create/employee-create-page.tsx`); mode tambah di sini tetap untuk tambah cepat.

function fromDetail(employee: EmployeeDetail): EmployeeForm {
  return {
    employeeNumber: employee.employeeNumber ?? "",
    fullName: employee.fullName,
    workEmail: employee.workEmail ?? "",
    phoneNumber: employee.phoneNumber ?? "",
    emergencyPhone: employee.emergencyPhone ?? "",
    emergencyContactName: employee.emergencyContactName ?? "",
    emergencyContactRelationship: employee.emergencyContactRelationship ?? "",
    gender: employee.gender ?? "",
    joinDate: employee.joinDate,
    companyId: employee.company.id,
    employmentStatusId: employee.employmentStatus.id,
    departmentId: employee.department?.id ?? "",
    positionId: employee.position.id,
    workLocationId: employee.workLocation?.id ?? "",
    gradeId: employee.grade?.id ?? "",
    managerId: employee.manager?.id ?? "",
    orgPostId: employee.orgPostId ?? "",
    // Data lama tanpa pos = atasan selalu manual.
    managerManual: employee.orgPostId ? Boolean(employee.managerOverride) : true,
  };
}

type TabKey = "work" | "personal" | "emergency" | "family" | "bank";
const TABS: { key: TabKey; label: string }[] = [
  { key: "work", label: "Kepegawaian" },
  { key: "personal", label: "Pribadi & alamat" },
  { key: "emergency", label: "Kontak darurat" },
  { key: "family", label: "Keluarga" },
  { key: "bank", label: "Rekening" },
];

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  defaultStatusId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ada = mode ubah; kosong = tambah. */
  employee?: EmployeeDetail | null;
  defaultStatusId?: string | undefined;
  onSaved?: (id: string) => void;
}) {
  const editing = Boolean(employee);
  const me = useMe().data as Me;
  const scope = useCompanyScope();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const updateProfile = useUpdateEmployeeProfile();
  const [tab, setTab] = useState<TabKey>("work");
  const [problem, setProblem] = useState<{ tab: TabKey; message: string } | null>(null);
  // Data sensitif: perlu izin baca (supaya isian lama terlihat & tidak terhapus) dan izin tulis.
  // D-054: data sensitif milik sendiri tetap lewat pengajuan (Layanan Mandiri).
  const self = Boolean(employee && me.employeeId === employee.id);
  const allowed = {
    personal: !self && Boolean(employee?.access.personal) && appAccess.writePersonalOnCreate(me),
    bank: !self && Boolean(employee?.access.bank) && appAccess.writeBankOnCreate(me),
  };
  // Panel detail memakai view "work" (tanpa data sensitif): isian pribadi/keluarga/rekening WAJIB dari view
  // "full", kalau tidak menyimpan satu kolom akan mengosongkan kolom lain (temuan QA 2026-10-19).
  const full = useEmployee(
    employee?.id ?? null,
    "full",
    open && (allowed.personal || allowed.bank),
  );
  // Nilai awal dikunci sekali per dialog dibuka; refetch di latar tidak menimpa isian yang sedang diubah.
  const [baseline, setBaseline] = useState<ProfileState | null>(null);
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  useEffect(() => {
    if (!open) setBaseline(null);
  }, [open]);
  useEffect(() => {
    if (open && !baseline && full.data && full.data.id === employee?.id) {
      const initial = profileFromDetail(full.data);
      setBaseline(initial);
      setProfile(initial);
    }
  }, [open, baseline, full.data, employee?.id]);
  const loadingSensitive = (allowed.personal || allowed.bank) && !baseline;
  const can = {
    personal: allowed.personal && baseline !== null,
    bank: allowed.bank && baseline !== null,
  };
  const initialProfile = baseline ?? emptyProfile();

  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: EMPTY_EMPLOYEE_FORM,
    mode: "onTouched",
  });
  const { handleSubmit, setValue, reset, formState } = form;

  // Hanya saat dialog dibuka / data dasar berubah — nilai scope dibaca saat reset saja.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scope sengaja tidak jadi pemicu reset
  useEffect(() => {
    if (open) {
      setTab("work");
      setProblem(null);
      reset(
        employee
          ? fromDetail(employee)
          : {
              ...EMPTY_EMPLOYEE_FORM,
              joinDate: todayIso(),
              employmentStatusId: defaultStatusId ?? "",
              // D-040: perusahaan terpilih di top bar; satu-satunya PT dalam cakupan diisi otomatis.
              companyId:
                scope.selectedId ??
                (scope.companies.length === 1 ? (scope.companies[0]?.id ?? "") : ""),
            },
      );
    }
  }, [open, employee, defaultStatusId, reset]);

  // Master data datang setelah dialog terbuka: isi PT otomatis bila hanya ada satu pilihan.
  useEffect(() => {
    if (open && !editing && !form.getValues("companyId") && scope.companies.length === 1) {
      setValue("companyId", scope.companies[0]?.id ?? "");
    }
  }, [open, editing, scope.companies, form, setValue]);

  const set =
    <K extends keyof ProfileState>(key: K) =>
    (value: ProfileState[K]) =>
      setProfile((prev) => ({ ...prev, [key]: value }));

  const onSubmit = handleSubmit(
    async (values) => {
      setProblem(null);
      const body = toEmployeeWriteBody(values);
      try {
        if (employee) {
          const profileBody = toProfileUpdate(profile, initialProfile, can);
          if (profileBody) {
            const invalid = validateProfileUpdate(profileBody);
            if (invalid) {
              const target = (invalid.step === "education" ? "personal" : invalid.step) as TabKey;
              setTab(target);
              setProblem({ tab: target, message: invalid.message });
              return;
            }
          }
          if (formState.isDirty) await update.mutateAsync({ id: employee.id, body });
          if (profileBody) await updateProfile.mutateAsync({ id: employee.id, body: profileBody });
          toast.success("Data karyawan diperbarui.");
          onSaved?.(employee.id);
        } else {
          const created = (await create.mutateAsync({
            ...body,
            employmentStatusId: values.employmentStatusId,
          })) as { data: { id: string } };
          toast.success(`${body.fullName} ditambahkan.`);
          onSaved?.(created.data.id);
        }
        onOpenChange(false);
      } catch (error) {
        setProblem({ tab, message: errorMessage(error) });
        toast.error(errorMessage(error));
      }
    },
    () => {
      setTab("work");
      setProblem({ tab: "work", message: "Lengkapi data kepegawaian dulu." });
    },
  );

  const sensitiveTab = (key: TabKey) => key === "personal" || key === "family" || key === "bank";
  const locked = (key: TabKey) =>
    key === "personal" || key === "family" ? !can.personal : key === "bank" ? !can.bank : false;

  const notice = (key: TabKey) =>
    problem && problem.tab === key ? (
      <p
        role="alert"
        className="border-destructive/30 bg-destructive/5 text-destructive mb-5 rounded-xl border px-4 py-3 text-sm"
      >
        {problem.message}
      </p>
    ) : null;

  const body = (key: TabKey, content: ReactNode) => (
    <TabsContent value={key} className="mt-0">
      {notice(key)}
      {loadingSensitive &&
      sensitiveTab(key) &&
      (key === "bank" ? allowed.bank : allowed.personal) ? (
        <p className="text-muted-foreground py-10 text-center text-sm">Memuat data karyawan…</p>
      ) : locked(key) ? (
        <LockedNotice bank={key === "bank"} />
      ) : (
        content
      )}
    </TabsContent>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 pt-6 pr-12 pb-4">
          <DialogTitle>{editing ? "Ubah data karyawan" : "Tambah karyawan"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Status kepegawaian diubah lewat menu Ubah Status Karyawan supaya tercatat di riwayat. Data pribadi, keluarga, dan rekening butuh izin khusus; perubahan rekening diberitahukan ke karyawan."
              : "Data kerja inti. Data pribadi, rekening, dan dokumen dilengkapi terpisah (butuh izin khusus)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          {editing ? (
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as TabKey)}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              {/* Gaya garis bawah seperti tab panel detail: jarak antar tab lega, satu garis batas. */}
              <div className="px-6 pt-2">
                <TabsList className="gap-6">
                  {TABS.map((t) => (
                    <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                      {locked(t.key) ? <Lock className="size-3" aria-hidden /> : null}
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {body(
                  "work",
                  <EmployeeWorkFields
                    form={form}
                    employee={employee}
                    enabled={open}
                    showEmergency={false}
                  />,
                )}
                {body(
                  "personal",
                  <PersonalStep value={profile.personal} onChange={set("personal")} />,
                )}
                <TabsContent value="emergency" className="mt-0">
                  {notice("emergency")}
                  <EmergencyStep
                    form={form}
                    value={profile.emergency}
                    onChange={set("emergency")}
                    canPersonal={can.personal}
                  />
                </TabsContent>
                {body("family", <FamilyStep value={profile.family} onChange={set("family")} />)}
                {body("bank", <BankStep value={profile.bank} onChange={set("bank")} />)}
              </div>
            </Tabs>
          ) : (
            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6">
              {notice("work")}
              <EmployeeWorkFields form={form} employee={employee} enabled={open} />
            </div>
          )}
          <DialogFooter className="bg-muted/30 border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={formState.isSubmitting || update.isPending || updateProfile.isPending}
            >
              {formState.isSubmitting
                ? "Menyimpan…"
                : editing
                  ? "Simpan perubahan"
                  : "Tambah karyawan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LockedNotice({ bank }: { bank: boolean }) {
  return (
    <div className="bg-muted text-muted-foreground flex gap-3 rounded-xl px-4 py-3 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        Mengubah bagian ini butuh izin baca dan tulis{" "}
        <span className="font-mono">
          {bank ? "employee.bank.read/write" : "employee.personal.read/write"}
        </span>
        . Minta Super Admin memberi grant, atau karyawan mengajukan perubahan dari Layanan Mandiri.
      </p>
    </div>
  );
}
