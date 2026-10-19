import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
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
import { errorMessage } from "@/lib/errors";
import { useCompanyScope, useCreateEmployee, useUpdateEmployee } from "../api";
import { todayIso } from "../labels";
import { type EmployeeDetail, type EmployeeForm, employeeFormSchema } from "../schemas";
import {
  EMPTY_EMPLOYEE_FORM,
  EmployeeWorkFields,
  toEmployeeWriteBody,
} from "./employee-work-fields";

// Ubah data kerja karyawan (dan tambah cepat tanpa profil). Tambah karyawan dari daftar memakai
// halaman bertahap (EMP-D2, `pages/employee-create-page.tsx`).

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
  const scope = useCompanyScope();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();

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

  const onSubmit = handleSubmit(async (values) => {
    const body = toEmployeeWriteBody(values);
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
            <EmployeeWorkFields form={form} employee={employee} enabled={open} />
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
