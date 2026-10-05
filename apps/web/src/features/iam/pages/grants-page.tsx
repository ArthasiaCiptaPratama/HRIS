import { zodResolver } from "@hookform/resolvers/zod";
import {
  isPermissionGrantableTo,
  PERMISSION_LABELS,
  PERMISSIONS,
  type Permission,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { KeyRound, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useAccounts, useCreateGrant, useGrants, useRevokeGrant } from "../api";
import { type Grant, type GrantForm, grantFormSchema } from "../schemas";

const grantColumnHelper = createColumnHelper<typeof tableFeaturesNone, Grant>();

export function GrantsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<"active" | "all">("active");
  const grants = useGrants({ page, pageSize, active: status === "active" ? true : undefined });
  // Penerima grant hanya HR_ADMIN/MANAGER aktif (PLAN §4.2).
  const hr = useAccounts({ page: 1, pageSize: 100, role: "HR_ADMIN", isActive: true });
  const managers = useAccounts({ page: 1, pageSize: 100, role: "MANAGER", isActive: true });
  const recipients = useMemo(
    () => [...(hr.data?.data ?? []), ...(managers.data?.data ?? [])],
    [hr.data, managers.data],
  );
  const emailOf = (id: string) => recipients.find((a) => a.id === id)?.email ?? id.slice(0, 8);
  const [open, setOpen] = useState(false);
  const revoke = useRevokeGrant();
  const total = grants.data?.meta.total ?? 0;

  const onRevoke = async (id: string) => {
    const reason = window.prompt("Alasan pencabutan (opsional):") ?? undefined;
    try {
      await revoke.mutateAsync({ id, ...(reason ? { reason } : {}) });
      toast.success("Grant dicabut; berlaku di request berikutnya.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: DataColumn<Grant>[] = [
    grantColumnHelper.display({
      id: "account",
      header: "Akun",
      meta: { className: "min-w-[200px] font-medium" },
      cell: ({ row }) => emailOf(row.original.accountId),
    }) as DataColumn<Grant>,
    grantColumnHelper.display({
      id: "permission",
      header: "Izin",
      meta: { className: "min-w-[200px]" },
      cell: ({ row }) => PERMISSION_LABELS[row.original.permission],
    }) as DataColumn<Grant>,
    grantColumnHelper.display({
      id: "expiresAt",
      header: "Berlaku sampai",
      meta: { className: "whitespace-nowrap tabular-nums text-muted-foreground" },
      cell: ({ row }) =>
        row.original.expiresAt ? formatDate(row.original.expiresAt) : "Tanpa batas",
    }) as DataColumn<Grant>,
    grantColumnHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="muted">{row.original.revokedAt ? "Dicabut" : "Kedaluwarsa"}</Badge>
        ),
    }) as DataColumn<Grant>,
    grantColumnHelper.display({
      id: "action",
      header: () => <span className="sr-only">Aksi</span>,
      meta: { className: "text-right" },
      cell: ({ row }) =>
        row.original.isActive ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRevoke(row.original.id)}
            disabled={revoke.isPending}
          >
            Cabut
          </Button>
        ) : null,
    }) as DataColumn<Grant>,
  ];

  return (
    <div>
      <PageHeader
        title="Grant izin"
        description="Izin tambahan untuk HR Admin & Manager. Data gaji tidak pernah bisa di-grant."
        actions={
          <Button variant="brand" onClick={() => setOpen(true)}>
            <KeyRound /> Beri grant
          </Button>
        }
      />
      <ListPanel
        toolbar={
          <FormSelect
            aria-label="Filter status grant"
            className="h-9 sm:w-48"
            value={status}
            onChange={(value) => {
              setStatus(value === "all" ? "all" : "active");
              setPage(1);
            }}
            placeholder="Hanya yang aktif"
            options={[
              { value: "active", label: "Hanya yang aktif" },
              { value: "all", label: "Semua (termasuk dicabut)" },
            ]}
          />
        }
        footer={
          total > 0 ? (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null
        }
      >
        <DataTable
          label="Daftar grant"
          columns={columns}
          data={grants.data?.data ?? []}
          loading={grants.isPending}
          fetching={grants.isFetching}
          skeletonRows={Math.min(pageSize, 8)}
          skeletonAvatar={false}
          empty={
            grants.isError
              ? {
                  icon: SearchX,
                  title: "Gagal memuat data",
                  description: errorMessage(grants.error),
                }
              : {
                  icon: KeyRound,
                  title: status === "active" ? "Tidak ada grant aktif" : "Belum ada grant",
                  description: "Grant memberi HR Admin/Manager akses data sensitif sementara.",
                }
          }
        />
      </ListPanel>
      <CreateGrantDialog open={open} onOpenChange={setOpen} recipients={recipients} />
    </div>
  );
}

function CreateGrantDialog({
  open,
  onOpenChange,
  recipients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: {
    id: string;
    email: string;
    role: "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE";
  }[];
}) {
  const create = useCreateGrant();
  const form = useForm<GrantForm>({
    resolver: zodResolver(grantFormSchema),
    defaultValues: { accountId: "", permission: "employee.personal.read", reason: "" },
  });
  const accountId = form.watch("accountId");
  const recipientRole = recipients.find((a) => a.id === accountId)?.role;
  const permissions = recipientRole
    ? PERMISSIONS.filter((p) => isPermissionGrantableTo(p, recipientRole))
    : PERMISSIONS;

  const onSubmit = form.handleSubmit(async ({ accountId: id, permission, expiresOn, reason }) => {
    try {
      await create.mutateAsync({
        accountId: id,
        permission,
        // Berakhir di akhir hari yang dipilih, zona Asia/Jakarta (UTC+7).
        ...(expiresOn ? { expiresAt: new Date(`${expiresOn}T23:59:59+07:00`).toISOString() } : {}),
        ...(reason ? { reason } : {}),
      });
      toast.success("Grant diberikan.");
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Beri grant izin</DialogTitle>
          <DialogDescription>
            HR Admin: berlaku atas karyawan di perusahaan yang ditugaskan. Manager: hanya timnya.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="grant-account">Akun</Label>
            <Controller
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormSelect
                  id="grant-account"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Pilih HR Admin / Manager"
                  invalid={Boolean(form.formState.errors.accountId)}
                  options={recipients.map((a) => ({
                    value: a.id,
                    label: a.email,
                    hint: a.role === "HR_ADMIN" ? "HR Admin" : "Manager",
                  }))}
                />
              )}
            />
            {form.formState.errors.accountId ? (
              <p className="text-destructive text-xs">{form.formState.errors.accountId.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant-permission">Izin</Label>
            <Controller
              control={form.control}
              name="permission"
              render={({ field }) => (
                <FormSelect
                  id="grant-permission"
                  value={field.value}
                  onChange={(v) => field.onChange(v as Permission)}
                  placeholder="Pilih izin"
                  options={permissions.map((p) => ({ value: p, label: PERMISSION_LABELS[p] }))}
                />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresOn">Berlaku sampai (opsional)</Label>
            <Input id="expiresOn" type="date" {...form.register("expiresOn")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Alasan (opsional)</Label>
            <Textarea id="reason" rows={2} {...form.register("reason")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" variant="brand" disabled={create.isPending}>
              {create.isPending ? "Menyimpan…" : "Beri grant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
