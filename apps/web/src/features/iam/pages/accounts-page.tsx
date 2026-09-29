import { zodResolver } from "@hookform/resolvers/zod";
import { ROLE_LABELS, ROLES, type Role } from "@hris/shared";
import { useState } from "react";
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
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
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

const ALL = "__all__";

export function AccountsPage() {
  const me = useMe().data as Me;
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<Role | undefined>();
  const [status, setStatus] = useState<"active" | "inactive" | undefined>();
  const [q, setQ] = useState("");
  const accounts = useAccounts({
    page,
    role,
    isActive: status === undefined ? undefined : status === "active",
    q: q || undefined,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Account | null>(null);
  const [transferTarget, setTransferTarget] = useState<Account | null>(null);
  const setActive = useSetActive();

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Akun</h1>
          <p className="text-muted-foreground text-sm">Kelola akun, role, dan status aktif.</p>
        </div>
        {access.inviteRoles(me).length > 0 ? (
          <Button onClick={() => setInviteOpen(true)}>Undang akun</Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="w-full sm:w-64"
          placeholder="Cari email…"
          aria-label="Cari email"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={role ?? ALL}
          onValueChange={(v) => {
            setRole(v === ALL ? undefined : (v as Role));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua role</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status ?? ALL}
          onValueChange={(v) => {
            setStatus(v === ALL ? undefined : (v as "active" | "inactive"));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" aria-label="Filter status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua status</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="inactive">Nonaktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Login terakhir</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Memuat…
                </TableCell>
              </TableRow>
            ) : accounts.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="text-destructive">
                  {errorMessage(accounts.error)}
                </TableCell>
              </TableRow>
            ) : accounts.data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Tidak ada akun.
                </TableCell>
              </TableRow>
            ) : (
              accounts.data.data.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">
                    {account.email}
                    {account.id === me.id ? (
                      <span className="text-muted-foreground"> (Anda)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge variant="secondary">{ROLE_LABELS[account.role]}</Badge>
                      {account.isPrimarySuperAdmin ? <Badge>Utama</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {account.isActive ? (
                      <Badge variant="outline">Aktif</Badge>
                    ) : (
                      <Badge variant="destructive">Nonaktif</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatDateTime(account.lastLoginAt)}</TableCell>
                  <TableCell className="space-x-1 text-right">
                    {access.changeRole(me) &&
                    account.id !== me.id &&
                    !account.isPrimarySuperAdmin ? (
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTransferTarget(account)}
                      >
                        Jadikan Utama
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {accounts.data ? (
        <Pagination
          page={page}
          pageSize={accounts.data.meta.pageSize}
          total={accounts.data.meta.total}
          onPageChange={setPage}
        />
      ) : null}

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
