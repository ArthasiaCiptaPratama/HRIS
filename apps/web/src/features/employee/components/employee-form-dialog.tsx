import { zodResolver } from "@hookform/resolvers/zod";
import { GENDER_LABELS } from "@hris/shared";
import { Info } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  type EmployeeWriteBody,
  useCreateEmployee,
  useManagerOptions,
  useMasterData,
  useUpdateEmployee,
} from "../api";
import { todayIso } from "../labels";
import { type EmployeeDetail, type EmployeeForm, employeeFormSchema } from "../schemas";

const EMPTY: EmployeeForm = {
  employeeNumber: "",
  fullName: "",
  workEmail: "",
  phoneNumber: "",
  emergencyPhone: "",
  gender: "",
  joinDate: todayIso(),
  employmentStatusId: "",
  departmentId: "",
  positionId: "",
  workLocationId: "",
  gradeId: "",
  managerId: "",
};

function fromDetail(employee: EmployeeDetail): EmployeeForm {
  return {
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    workEmail: employee.workEmail ?? "",
    phoneNumber: employee.phoneNumber ?? "",
    emergencyPhone: employee.emergencyPhone ?? "",
    gender: employee.gender ?? "",
    joinDate: employee.joinDate,
    employmentStatusId: employee.employmentStatus.id,
    departmentId: employee.department?.id ?? "",
    positionId: employee.position.id,
    workLocationId: employee.workLocation?.id ?? "",
    gradeId: employee.grade?.id ?? "",
    managerId: employee.manager?.id ?? "",
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

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
  const master = useMasterData();
  const managers = useManagerOptions(open);
  const create = useCreateEmployee();
  const update = useUpdateEmployee();

  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: EMPTY,
    mode: "onTouched",
  });
  const { register, handleSubmit, control, watch, setValue, reset, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (open) {
      reset(
        employee
          ? fromDetail(employee)
          : { ...EMPTY, joinDate: todayIso(), employmentStatusId: defaultStatusId ?? "" },
      );
    }
  }, [open, employee, defaultStatusId, reset]);

  const departmentId = watch("departmentId");
  const positions = useMemo(
    () => (master.data?.positions ?? []).filter((p) => p.departmentId === departmentId),
    [master.data, departmentId],
  );

  const onSubmit = handleSubmit(async (values) => {
    const body: EmployeeWriteBody = {
      employeeNumber: values.employeeNumber.trim(),
      fullName: values.fullName.trim(),
      workEmail: orNull(values.workEmail),
      phoneNumber: orNull(values.phoneNumber),
      emergencyPhone: orNull(values.emergencyPhone),
      gender: values.gender === "" ? null : values.gender,
      joinDate: values.joinDate,
      positionId: values.positionId,
      workLocationId: orNull(values.workLocationId),
      gradeId: orNull(values.gradeId),
      managerId: orNull(values.managerId),
    };
    try {
      if (employee) {
        await update.mutateAsync({ id: employee.id, body });
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
      toast.error(errorMessage(error));
    }
  });

  const statusOptions = (master.data?.employmentStatuses ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{editing ? "Ubah data karyawan" : "Tambah karyawan"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Perbarui data kerja. Status kepegawaian diubah lewat menu Ubah Status Karyawan supaya tercatat di riwayat."
              : "Data kerja inti. Data pribadi, rekening, dan dokumen dilengkapi terpisah (butuh izin khusus)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-col">
          <div className="max-h-[calc(92dvh-11rem)] space-y-7 overflow-y-auto px-6 py-6">
            <FormSection title="Identitas">
              <FormField
                label="Nomor induk karyawan"
                error={errors.employeeNumber?.message}
                htmlFor="f-number"
              >
                <Input
                  id="f-number"
                  placeholder="ACP-2026-0022"
                  className="font-mono"
                  aria-invalid={Boolean(errors.employeeNumber)}
                  {...register("employeeNumber")}
                />
              </FormField>
              <FormField label="Nama lengkap" error={errors.fullName?.message} htmlFor="f-name">
                <Input
                  id="f-name"
                  aria-invalid={Boolean(errors.fullName)}
                  {...register("fullName")}
                />
              </FormField>
              <FormField label="Jenis kelamin" htmlFor="f-gender" optional>
                <Controller
                  control={control}
                  name="gender"
                  render={({ field }) => (
                    <FormSelect
                      id="f-gender"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Pilih"
                      noneLabel="Tidak diisi"
                      options={(["MALE", "FEMALE"] as const).map((g) => ({
                        value: g,
                        label: GENDER_LABELS[g],
                      }))}
                    />
                  )}
                />
              </FormField>
              <FormField label="Tanggal masuk" error={errors.joinDate?.message} htmlFor="f-join">
                <Input
                  id="f-join"
                  type="date"
                  aria-invalid={Boolean(errors.joinDate)}
                  {...register("joinDate")}
                />
              </FormField>
            </FormSection>

            <FormSection title="Penempatan">
              {editing ? (
                <div className="sm:col-span-2">
                  <Alert>
                    <Info />
                    <AlertDescription>
                      <p>
                        Status saat ini: <strong>{employee?.employmentStatus.name}</strong>. Ubah
                        lewat menu Ubah Status Karyawan.
                      </p>
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <FormField
                  label="Status kepegawaian"
                  error={errors.employmentStatusId?.message}
                  htmlFor="f-status"
                >
                  <Controller
                    control={control}
                    name="employmentStatusId"
                    render={({ field }) => (
                      <FormSelect
                        id="f-status"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Pilih status"
                        options={statusOptions}
                        invalid={Boolean(errors.employmentStatusId)}
                      />
                    )}
                  />
                </FormField>
              )}
              <FormField label="Departemen" error={errors.departmentId?.message} htmlFor="f-dept">
                <Controller
                  control={control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormSelect
                      id="f-dept"
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        setValue("positionId", "", { shouldValidate: false });
                      }}
                      placeholder="Pilih departemen"
                      options={(master.data?.departments ?? []).map((d) => ({
                        value: d.id,
                        label: d.name,
                      }))}
                      invalid={Boolean(errors.departmentId)}
                    />
                  )}
                />
              </FormField>
              <FormField label="Jabatan" error={errors.positionId?.message} htmlFor="f-position">
                <Controller
                  control={control}
                  name="positionId"
                  render={({ field }) => (
                    <FormSelect
                      id="f-position"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={departmentId ? "Pilih jabatan" : "Pilih departemen dulu"}
                      disabled={!departmentId}
                      options={positions.map((p) => ({ value: p.id, label: p.name }))}
                      invalid={Boolean(errors.positionId)}
                    />
                  )}
                />
              </FormField>
              <FormField label="Grade" htmlFor="f-grade" optional>
                <Controller
                  control={control}
                  name="gradeId"
                  render={({ field }) => (
                    <FormSelect
                      id="f-grade"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Pilih grade"
                      noneLabel="Tanpa grade"
                      options={(master.data?.grades ?? []).map((g) => ({
                        value: g.id,
                        label: g.name,
                      }))}
                    />
                  )}
                />
              </FormField>
              <FormField label="Lokasi kerja" htmlFor="f-location" optional>
                <Controller
                  control={control}
                  name="workLocationId"
                  render={({ field }) => (
                    <FormSelect
                      id="f-location"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Pilih lokasi"
                      noneLabel="Belum ditentukan"
                      options={(master.data?.workLocations ?? []).map((l) => ({
                        value: l.id,
                        label: l.name,
                        ...(l.city ? { hint: l.city } : {}),
                      }))}
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Atasan langsung"
                htmlFor="f-manager"
                optional
                hint="Hanya karyawan yang punya akun Manager/Super Admin."
              >
                <Controller
                  control={control}
                  name="managerId"
                  render={({ field }) => (
                    <FormSelect
                      id="f-manager"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={managers.isPending ? "Memuat…" : "Pilih atasan"}
                      noneLabel="Tanpa atasan"
                      options={(managers.data ?? [])
                        .filter((m) => m.id !== employee?.id)
                        .map((m) => ({ value: m.id, label: m.fullName, hint: m.position }))}
                    />
                  )}
                />
              </FormField>
            </FormSection>

            <FormSection title="Kontak kerja">
              <FormField
                label="Email kantor"
                error={errors.workEmail?.message}
                htmlFor="f-email"
                optional
              >
                <Input
                  id="f-email"
                  type="email"
                  autoComplete="off"
                  placeholder="nama@arthasia.co.id"
                  aria-invalid={Boolean(errors.workEmail)}
                  {...register("workEmail")}
                />
              </FormField>
              <FormField
                label="No. HP"
                error={errors.phoneNumber?.message}
                htmlFor="f-phone"
                optional
              >
                <Input
                  id="f-phone"
                  inputMode="tel"
                  className="font-mono"
                  aria-invalid={Boolean(errors.phoneNumber)}
                  {...register("phoneNumber")}
                />
              </FormField>
              <FormField
                label="Kontak darurat"
                error={errors.emergencyPhone?.message}
                htmlFor="f-emergency"
                optional
              >
                <Input
                  id="f-emergency"
                  inputMode="tel"
                  className="font-mono"
                  aria-invalid={Boolean(errors.emergencyPhone)}
                  {...register("emergencyPhone")}
                />
              </FormField>
            </FormSection>
          </div>
          <DialogFooter className="bg-muted/30 border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
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

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-muted-foreground mb-4 text-[11px] font-medium tracking-wider uppercase">
        {title}
      </legend>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-[13px]">
        {label}
        {optional ? <span className="text-muted-foreground font-normal">(opsional)</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
