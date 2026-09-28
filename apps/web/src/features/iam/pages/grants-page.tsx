import { zodResolver } from "@hookform/resolvers/zod";
import {
  isPermissionGrantableTo,
  PERMISSION_LABELS,
  PERMISSIONS,
  type Permission,
} from "@hris/shared";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pagination } from "@/components/pagination";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useAccounts, useCreateGrant, useGrants, useRevokeGrant } from "../api";
import { type GrantForm, grantFormSchema } from "../schemas";

export function GrantsPage() {
  const [page, setPage] = useState(1);
  const [onlyActive, setOnlyActive] = useState(true);
  const grants = useGrants({ page, active: onlyActive ? true : undefined });
  // Penerima grant hanya HR_ADMIN/MANAGER aktif (PLAN §4.2).
  const hr = useAccounts({ page: 1, role: "HR_ADMIN", isActive: true });
  const managers = useAccounts({ page: 1, role: "MANAGER", isActive: true });
  const recipients = useMemo(
    () => [...(hr.data?.data ?? []), ...(managers.data?.data ?? [])],
    [hr.data, managers.data],
  );
  const emailOf = (id: string) => recipients.find((a) => a.id === id)?.email ?? id.slice(0, 8);
  const [open, setOpen] = useState(false);
  const revoke = useRevokeGrant();

  const onRevoke = async (id: string) => {
    const reason = window.prompt("Alasan pencabutan (opsional):") ?? undefined;
    try {
      await revoke.mutateAsync({ id, ...(reason ? { reason } : {}) });
      toast.success("Grant dicabut; berlaku di request berikutnya.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Grant izin</h1>
          <p className="text-muted-foreground text-sm">
            Izin tambahan untuk HR Admin & Manager. Data gaji tidak pernah bisa di-grant.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Beri grant</Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyActive}
          onChange={(e) => {
            setOnlyActive(e.target.checked);
            setPage(1);
          }}
        />
        Hanya yang aktif
      </label>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Akun</TableHead>
              <TableHead>Izin</TableHead>
              <TableHead>Berlaku sampai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Memuat…
                </TableCell>
              </TableRow>
            ) : grants.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="text-destructive">
                  {errorMessage(grants.error)}
                </TableCell>
              </TableRow>
            ) : grants.data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Belum ada grant.
                </TableCell>
              </TableRow>
            ) : (
              grants.data.data.map((grant) => (
                <TableRow key={grant.id}>
                  <TableCell>{emailOf(grant.accountId)}</TableCell>
                  <TableCell>{PERMISSION_LABELS[grant.permission]}</TableCell>
                  <TableCell>
                    {grant.expiresAt ? formatDate(grant.expiresAt) : "Tanpa batas"}
                  </TableCell>
                  <TableCell>
                    {grant.isActive ? (
                      <Badge variant="outline">Aktif</Badge>
                    ) : (
                      <Badge variant="secondary">
                        {grant.revokedAt ? "Dicabut" : "Kedaluwarsa"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {grant.isActive ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRevoke(grant.id)}
                        disabled={revoke.isPending}
                      >
                        Cabut
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {grants.data ? (
        <Pagination
          page={page}
          pageSize={grants.data.meta.pageSize}
          total={grants.data.meta.total}
          onPageChange={setPage}
        />
      ) : null}
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
            Untuk HR Admin berlaku atas semua karyawan; untuk Manager hanya timnya.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label>Akun</Label>
            <Controller
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Akun penerima">
                    <SelectValue placeholder="Pilih HR Admin / Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {recipients.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.email} ({a.role === "HR_ADMIN" ? "HR Admin" : "Manager"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.accountId ? (
              <p className="text-destructive text-xs">{form.formState.errors.accountId.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Izin</Label>
            <Controller
              control={form.control}
              name="permission"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => field.onChange(v as Permission)}>
                  <SelectTrigger aria-label="Izin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {permissions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PERMISSION_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <Button type="submit" disabled={create.isPending}>
              Beri grant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
