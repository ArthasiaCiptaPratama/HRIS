import { zodResolver } from "@hookform/resolvers/zod";
import {
  ROLE_LABELS,
  ROLES,
  type Role,
  requiresEmployeeLink,
  usesAssignedCompanies,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { Link2, SearchX, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
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
import { useCompanyScope, useEmployee } from "@/features/employee/api";
import { EmployeePicker } from "@/features/employee/components/employee-picker";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import {
  useAccounts,
  useAssignCompanies,
  useChangeRole,
  useInviteAccount,
  useLinkEmployee,
  useLinkSuggestions,
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
    isActive: status === "" || status === "unlinked" ? undefined : status === "active",
    unlinked: status === "unlinked" ? true : undefined,
    q: q || undefined,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteEmployeeId = searchParams.get("invite");
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteFromLink = Boolean(inviteEmployeeId && access.inviteRoles(me).includes("EMPLOYEE"));
  const changeInviteOpen = (open: boolean) => {
    setInviteOpen(open);
    if (!open && inviteEmployeeId) {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("invite");
          return next;
        },
        { replace: true },
      );
    }
  };
  const [roleTarget, setRoleTarget] = useState<Account | null>(null);
  const [companyTarget, setCompanyTarget] = useState<Account | null>(null);
  const scope = useCompanyScope();
  const companyCode = new Map(scope.companies.map((c) => [c.id, c.code]));
  const [transferTarget, setTransferTarget] = useState<Account | null>(null);
  const [linkTarget, setLinkTarget] = useState<Account | null>(null);
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
          {/* D-040: perusahaan yang ditugaskan ke akun HR. */}
          {usesAssignedCompanies(row.original.role) && access.assignCompanies(me) ? (
            row.original.companyIds.length > 0 ? (
              row.original.companyIds.map((id) => (
                <Badge key={id} variant="muted" className="font-mono">
                  {/* D-049: PT yang sudah diarsipkan tidak ada di /master-data. */}
                  {companyCode.get(id) ?? "PT diarsipkan"}
                </Badge>
              ))
            ) : (
              <Badge variant="warning">Tanpa PT</Badge>
            )
          ) : null}
        </div>
      ),
    }) as DataColumn<Account>,
    accountColumnHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.isActive ? (
            <Badge variant="success">Aktif</Badge>
          ) : (
            <Badge variant="destructive">Nonaktif</Badge>
          )}
          {/* ONB-D2: akun Karyawan/Manager tanpa data karyawan → absen & Layanan Mandiri tidak jalan. */}
          {row.original.needsEmployeeLink ? (
            <Badge variant="warning" title="Akun belum terhubung ke data karyawan">
              Belum tertaut
            </Badge>
          ) : null}
        </div>
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
            {access.linkEmployee(me, account) ? (
              <Button
                size="sm"
                variant={account.needsEmployeeLink ? "default" : "outline"}
                onClick={() => setLinkTarget(account)}
              >
                <Link2 /> Tautkan
              </Button>
            ) : null}
            {access.assignCompanies(me) && usesAssignedCompanies(account.role) ? (
              <Button size="sm" variant="outline" onClick={() => setCompanyTarget(account)}>
                Atur PT
              </Button>
            ) : null}
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
                  { value: "unlinked", label: "Belum tertaut karyawan" },
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

      <InviteDialog
        key={inviteEmployeeId ?? "manual"}
        me={me}
        open={inviteOpen || inviteFromLink}
        onOpenChange={changeInviteOpen}
        initialEmployeeId={inviteFromLink ? inviteEmployeeId : null}
      />
      <ChangeRoleDialog me={me} account={roleTarget} onClose={() => setRoleTarget(null)} />
      <AssignCompaniesDialog
        account={companyTarget}
        companies={scope.companies}
        onClose={() => setCompanyTarget(null)}
      />
      <TransferPrimaryDialog
        me={me}
        account={transferTarget}
        onClose={() => setTransferTarget(null)}
      />
      <LinkEmployeeDialog account={linkTarget} onClose={() => setLinkTarget(null)} />
    </div>
  );
}

function InviteDialog({
  initialEmployeeId,
  me,
  open,
  onOpenChange,
}: {
  initialEmployeeId: string | null;
  me: Me;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const roles = access.inviteRoles(me);
  const invite = useInviteAccount();
  const defaults = {
    email: "",
    role: roles.includes("EMPLOYEE") ? "EMPLOYEE" : (roles[0] ?? "EMPLOYEE"),
    employeeId: initialEmployeeId ?? undefined,
  } satisfies InviteForm;
  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: defaults,
  });
  const role = form.watch("role");
  const employeeId = form.watch("employeeId") ?? null;
  const [employeeName, setEmployeeName] = useState("");
  const selected = useEmployee(employeeId, "work", open && employeeId !== null);
  useEffect(() => {
    if (!initialEmployeeId || !selected.data || employeeId !== initialEmployeeId) return;
    setEmployeeName(selected.data.fullName);
    if (!form.getValues("email") && selected.data.workEmail) {
      form.setValue("email", selected.data.workEmail, { shouldValidate: true });
    }
  }, [initialEmployeeId, selected.data, employeeId, form]);
  // Karyawan yang sudah punya akun tidak bisa diundang lagi (API juga menolak, 409).
  const hasAccount = Boolean(selected.data?.account);
  const linkRequired = requiresEmployeeLink(role);
  const close = (next: boolean) => {
    if (!next) {
      form.reset(defaults);
      setEmployeeName("");
    }
    onOpenChange(next);
  };
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await invite.mutateAsync({
        ...values,
        employeeId: values.employeeId || undefined,
      });
      if ("queued" in result) {
        toast.success(`Undangan ${employeeName || values.email} masuk antrean.`, {
          description:
            "Karyawan menerima email undangan, lalu diminta melengkapi data yang masih kosong.",
        });
      } else {
        toast.success(`Undangan dikirim ke ${values.email}.`);
      }
      close(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Undang akun</DialogTitle>
          <DialogDescription>
            Email undangan berisi tautan untuk mengatur password. Akun Karyawan dan Manager harus
            ditautkan ke data karyawan.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
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
          <div className="space-y-2">
            <Label>
              Karyawan{" "}
              {linkRequired ? null : (
                <span className="text-muted-foreground font-normal">(opsional)</span>
              )}
            </Label>
            {employeeId && selected.data ? (
              // EMP-D8 T3: dibuka dari tautan "Undang akun" → karyawan terpilih bisa di luar layar daftar.
              <p className="text-sm">
                Terpilih: <b>{selected.data.fullName}</b>
                {selected.data.employeeNumber ? (
                  <span className="text-muted-foreground"> · {selected.data.employeeNumber}</span>
                ) : null}
              </p>
            ) : null}
            <EmployeePicker
              active
              selectedId={employeeId}
              onSelect={(id, row) => {
                form.setValue("employeeId", id, { shouldValidate: true });
                setEmployeeName(row.fullName);
                // Email kerja sebagai saran awal; ganti dengan email pribadi bila perlu.
                if (!form.getValues("email") && row.workEmail) {
                  form.setValue("email", row.workEmail, { shouldValidate: true });
                }
              }}
              title="Pilih karyawan"
              className="max-h-64 min-h-0"
            />
            {employeeId && hasAccount ? (
              <p className="text-destructive text-xs">
                {employeeName} sudah punya akun login — tidak perlu diundang.
              </p>
            ) : null}
            {form.formState.errors.employeeId ? (
              <p className="text-destructive text-xs">{form.formState.errors.employeeId.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">
              Email {role === "EMPLOYEE" ? "pribadi karyawan" : ""}
            </Label>
            <Input id="invite-email" type="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
            ) : null}
            {role === "EMPLOYEE" ? (
              <p className="text-muted-foreground text-xs">
                Sama seperti Undang Karyawan Terdaftar: undangan masuk antrean dan karyawan diminta
                melengkapi data yang masih kosong.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={invite.isPending || hasAccount}>
              Kirim undangan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ONB-D2: tautkan akun lama yang belum terhubung ke data karyawan (login tetap email, Q2a).
function LinkEmployeeDialog({
  account,
  onClose,
}: {
  account: Account | null;
  onClose: () => void;
}) {
  const link = useLinkEmployee();
  const suggestions = useLinkSuggestions(account?.id ?? null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const selected = useEmployee(employeeId, "work", employeeId !== null);
  const hasAccount = Boolean(selected.data?.account);
  const close = () => {
    setEmployeeId(null);
    setEmployeeName("");
    onClose();
  };
  const pick = (id: string, name: string) => {
    setEmployeeId(id);
    setEmployeeName(name);
  };
  const submit = async () => {
    if (!account || !employeeId) return;
    try {
      await link.mutateAsync({ id: account.id, employeeId });
      toast.success(`${account.email} ditautkan ke ${employeeName}.`);
      close();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tautkan ke karyawan</DialogTitle>
          <DialogDescription>
            {account?.email} akan terhubung ke data karyawan (absen, Layanan Mandiri, pengajuan).
            Cara login tidak berubah.
          </DialogDescription>
        </DialogHeader>
        {suggestions.data && suggestions.data.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Saran (email sama)</p>
            <ul className="space-y-1" aria-label="Saran karyawan">
              {suggestions.data.map((s) => (
                <li key={s.employeeId}>
                  <button
                    type="button"
                    aria-pressed={employeeId === s.employeeId}
                    onClick={() => pick(s.employeeId, s.fullName)}
                    className={
                      employeeId === s.employeeId
                        ? "bg-brand-soft flex w-full items-center justify-between rounded-lg border p-2 text-left text-sm"
                        : "hover:bg-muted/70 flex w-full items-center justify-between rounded-lg border p-2 text-left text-sm"
                    }
                  >
                    <span>
                      <span className="font-medium">{s.fullName}</span>{" "}
                      <span className="text-muted-foreground font-mono text-xs">
                        {s.employeeNumber ?? "NIP belum ada"}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {s.matchedBy === "PERSONAL_EMAIL" ? "email pribadi" : "email kerja"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <EmployeePicker
          active
          selectedId={employeeId}
          onSelect={(id, row) => pick(id, row.fullName)}
          title="Atau pilih karyawan"
          className="max-h-64 min-h-0"
        />
        {employeeId && hasAccount ? (
          <p className="text-destructive text-xs">{employeeName} sudah punya akun login lain.</p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={!employeeId || hasAccount || link.isPending}
            onClick={submit}
          >
            Tautkan{employeeName ? ` ke ${employeeName}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// D-040: centang perusahaan yang dikelola akun HR_ADMIN (menggantikan penugasan lama).
function AssignCompaniesDialog({
  account,
  companies,
  onClose,
}: {
  account: Account | null;
  companies: { id: string; code: string; name: string }[];
  onClose: () => void;
}) {
  const assign = useAssignCompanies();
  const [selected, setSelected] = useState<string[]>([]);
  const [prevAccount, setPrevAccount] = useState<Account | null>(null);
  // Isi ulang pilihan setiap kali dialog dibuka untuk akun lain.
  // D-049: PT yang diarsipkan tidak bisa dipilih lagi → tidak ikut dikirim (dilepas saat disimpan).
  const archived = (account?.companyIds ?? []).filter((id) => !companies.some((c) => c.id === id));
  if (account !== prevAccount) {
    setPrevAccount(account);
    setSelected((account?.companyIds ?? []).filter((id) => companies.some((c) => c.id === id)));
  }
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  const submit = async () => {
    if (!account) return;
    try {
      await assign.mutateAsync({ id: account.id, companyIds: selected });
      toast.success("Penugasan perusahaan diperbarui.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open={account !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atur perusahaan</DialogTitle>
          <DialogDescription>
            {account?.email} hanya melihat dan mengelola karyawan di perusahaan yang dicentang.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2" aria-label="Perusahaan yang dikelola">
          {companies.map((company) => (
            <label
              key={company.id}
              className="hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"
            >
              <input
                type="checkbox"
                className="accent-brand size-4"
                checked={selected.includes(company.id)}
                onChange={() => toggle(company.id)}
              />
              <span className="font-mono text-xs">{company.code}</span>
              <span className="text-muted-foreground truncate">{company.name}</span>
            </label>
          ))}
        </fieldset>
        {archived.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {archived.length} perusahaan yang ditugaskan sudah diarsipkan dan akan dilepas saat
            disimpan.
          </p>
        ) : null}
        {selected.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Tanpa perusahaan, akun ini tidak melihat karyawan mana pun.
          </p>
        ) : null}
        <DialogFooter>
          <Button onClick={submit} disabled={assign.isPending}>
            Simpan
          </Button>
        </DialogFooter>
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
