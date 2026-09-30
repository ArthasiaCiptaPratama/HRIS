import { zodResolver } from "@hookform/resolvers/zod";
import { ROLE_LABELS, ROLES, type Role } from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { SearchX, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import {
  useAccounts,
  useChangeRole,
  useInviteAccount,
  useSetActive,
  useTransferPrimary,
} from "../api";
import { type Account, type InviteForm, inviteFormSchema } from "../schemas";

const accountColumnHelper = createColumnHelper<typeof tableFeaturesNone, Account>();

export function AccountsPage() {
  const me = useMe().data as Me;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 300);
  const accounts = useAccounts({
    page,
    pageSize,
    role: (role || undefined) as Role | undefined,
    isActive: status === "" ? undefined : status === "active",
    q: q || undefined,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Account | null>(null);
  const [transferTarget, setTransferTarget] = useState<Account | null>(null);
  const setActive = useSetActive();
  const filtered = Boolean(q || role || status);
  const total = accounts.data?.meta.total ?? 0;

  const toggleActive = async (account: Account) => {
    const verb = account.isActive ? "menonaktifkan" : "mengaktifkan kembali";
    if (!window.confirm(`Yakin ${verb} akun ${account.email}?`)) return;
    try {
      await setActive.mutateAsync({ id: account.id, active: !account.isActive });
      toast.success(account.isActive ? "Akun dinonaktifkan." : "Akun diaktifkan kembali.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: DataColumn<Account>[] = [
    accountColumnHelper.display({
      id: "email",
      header: "Akun",
      meta: { className: "min-w-[220px]" },
      cell: ({ row }) => (
        <p className="truncate font-medium">
          {row.original.email}
          {row.original.id === me.id ? (
            <span className="text-muted-foreground font-normal"> (Anda)</span>
          ) : null}
        </p>
      ),
    }) as DataColumn<Account>,
    accountColumnHelper.display({
      id: "role",
      header: "Role",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Badge variant="secondary">{ROLE_LABELS[row.original.role]}</Badge>
          {row.original.isPrimarySuperAdmin ? <Badge variant="brand">Utama</Badge> : null}
        </div>
      ),
    }) as DataColumn<Account>,
    accountColumnHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="destructive">Nonaktif</Badge>
        ),
    }) as DataColumn<Account>,
    accountColumnHelper.display({
      id: "lastLogin",
      header: "Login terakhir",
      meta: {
        headerClassName: "hidden md:table-cell",
        className: "hidden md:table-cell whitespace-nowrap text-muted-foreground tabular-nums",
      },
      cell: ({ row }) => formatDateTime(row.original.lastLoginAt),
    }) as DataColumn<Account>,
    accountColumnHelper.display({
      id: "action",
      header: () => <span className="sr-only">Aksi</span>,
      meta: { className: "text-right whitespace-nowrap" },
      cell: ({ row }) => {
        const account = row.original;
        return (
          <div className="flex justify-end gap-1">
            {access.changeRole(me) && account.id !== me.id && !account.isPrimarySuperAdmin ? (
              <Button size="sm" variant="outline" onClick={() => setRoleTarget(account)}>
                Ubah role
              </Button>
            ) : null}
            {access.setActive(me, account) ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleActive(account)}
                disabled={setActive.isPending}
              >
                {account.isActive ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            ) : null}
            {access.transferPrimary(me) &&
            account.role === "SUPER_ADMIN" &&
            account.isActive &&
            account.id !== me.id ? (
              <Button size="sm" variant="outline" onClick={() => setTransferTarget(account)}>
                Jadikan Utama
              </Button>
            ) : null}
          </div>
        );
      },
    }) as DataColumn<Account>,
  ];

  return (
    <div>
      <PageHeader
        title="Akun"
        description="Kelola akun login, role, dan status aktif."
        actions={
          access.inviteRoles(me).length > 0 ? (
            <Button variant="brand" onClick={() => setInviteOpen(true)}>
              <UserPlus /> Undang akun
            </Button>
          ) : null
        }
      />
      <ListPanel
        toolbar={
          <>
            <SearchField
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Cari email…"
              aria-label="Cari email"
            />
            <div className="grid grid-cols-1 gap-2 sm:flex">
              <FormSelect
                aria-label="Filter role"
                className="h-9 sm:w-44"
                value={role}
                onChange={(value) => {
                  setRole(value);
                  setPage(1);
                }}
                placeholder="Semua role"
                noneLabel="Semua role"
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              />
              <FormSelect
                aria-label="Filter status"
                className="h-9 sm:w-40"
                value={status}
                onChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
                placeholder="Semua status"
                noneLabel="Semua status"
                options={[
                  { value: "active", label: "Aktif" },
                  { value: "inactive", label: "Nonaktif" },
                ]}
              />
            </div>
          </>
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
          label="Daftar akun"
          columns={columns}
          data={accounts.data?.data ?? []}
          loading={accounts.isPending}
          fetching={accounts.isFetching}
          skeletonRows={Math.min(pageSize, 8)}
          skeletonAvatar={false}
          empty={
            accounts.isError
              ? {
                  icon: SearchX,
                  title: "Gagal memuat data",
                  description: errorMessage(accounts.error),
                }
              : filtered
                ? {
                    icon: SearchX,
                    title: "Tidak ada yang cocok",
                    description: "Coba kata kunci lain atau hapus filter.",
                  }
                : { icon: Users, title: "Belum ada akun" }
          }
        />
      </ListPanel>

      <InviteDialog me={me} open={inviteOpen} onOpenChange={setInviteOpen} />
      <ChangeRoleDialog me={me} account={roleTarget} onClose={() => setRoleTarget(null)} />
      <TransferPrimaryDialog
        me={me}
        account={transferTarget}
        onClose={() => setTransferTarget(null)}
      />
    </div>
  );
}

function InviteDialog({
  me,
  open,
  onOpenChange,
}: {
  me: Me;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const roles = access.inviteRoles(me);
  const invite = useInviteAccount();
  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      role: roles.includes("EMPLOYEE") ? "EMPLOYEE" : (roles[0] ?? "EMPLOYEE"),
    },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await invite.mutateAsync(values);
      toast.success(`Undangan dikirim ke ${values.email}.`);
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
          <DialogTitle>Undang akun</DialogTitle>
          <DialogDescription>
            Email undangan berisi tautan untuk mengatur password.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={invite.isPending}>
              Kirim undangan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleDialog({
  me,
  account,
  onClose,
}: {
  me: Me;
  account: Account | null;
  onClose: () => void;
}) {
  const change = useChangeRole();
  const [role, setRole] = useState<Role | undefined>();
  // Role SUPER_ADMIN hanya bisa diberikan/dicabut Utama (PLAN §4.4).
  const options = ROLES.filter(
    (r) => me.isPrimarySuperAdmin || (r !== "SUPER_ADMIN" && account?.role !== "SUPER_ADMIN"),
  );
  const submit = async () => {
    if (!account || !role) return;
    try {
      await change.mutateAsync({ id: account.id, role });
      toast.success("Role diubah. Grant yang tidak berlaku untuk role baru dicabut otomatis.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open={account !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah role</DialogTitle>
          <DialogDescription>
            {account?.email} — role saat ini {account ? ROLE_LABELS[account.role] : ""}. Satu akun
            hanya punya satu role.
          </DialogDescription>
        </DialogHeader>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger aria-label="Role baru">
            <SelectValue placeholder="Pilih role baru" />
          </SelectTrigger>
          <SelectContent>
            {options
              .filter((r) => r !== account?.role)
              .map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={submit} disabled={!role || change.isPending}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// D-033: serah-terima Utama = login ulang dengan password (klaim `amr` baru), baru panggil API.
function TransferPrimaryDialog({
  me,
  account,
  onClose,
}: {
  me: Me;
  account: Account | null;
  onClose: () => void;
}) {
  const transfer = useTransferPrimary();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!account) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: me.email, password });
      if (error) {
        toast.error("Password salah.");
        return;
      }
      await transfer.mutateAsync(account.id);
      toast.success(`Status Utama diserahkan ke ${account.email}.`);
      setPassword("");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={account !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Serahkan status Super Admin Utama</DialogTitle>
          <DialogDescription>
            {account?.email} akan menjadi Utama; Anda menjadi SUPER_ADMIN biasa. Masukkan password
            Anda untuk konfirmasi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Password Anda</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={!password || busy}>
            Serahkan status Utama
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
