import { PERMISSION_LABELS, PERMISSIONS } from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { KeyRound, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyScope } from "@/features/employee/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useAccounts, useGrants, useRevokeGrant, useRevokeGrantBatch } from "../api";
import { GrantBatchDialog } from "../components/grant-batch-dialog";
import type { Grant } from "../schemas";

const grantColumnHelper = createColumnHelper<typeof tableFeaturesNone, Grant>();

export function GrantsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<"active" | "all">("active");
  const [accountFilter, setAccountFilter] = useState("");
  const [permissionFilter, setPermissionFilter] = useState("");
  const grants = useGrants({
    page,
    pageSize,
    active: status === "active" ? true : undefined,
    accountIds: accountFilter || undefined,
    permissions: permissionFilter || undefined,
  });
  const scope = useCompanyScope();
  // IAM-D2: centang banyak baris → "Cabut terpilih".
  const [selected, setSelected] = useState<string[]>([]);
  const [revoking, setRevoking] = useState(false);
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

  const rows = grants.data?.data ?? [];
  const selectable = rows.filter((g) => g.isActive).map((g) => g.id);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));
  const resetPage = () => {
    setPage(1);
    setSelected([]);
  };
  const columns: DataColumn<Grant>[] = [
    grantColumnHelper.display({
      id: "select",
      header: () => (
        <input
          type="checkbox"
          aria-label="Pilih semua grant aktif di halaman ini"
          className="accent-brand size-4"
          checked={allSelected}
          disabled={selectable.length === 0}
          onChange={() =>
            setSelected((prev) =>
              allSelected
                ? prev.filter((id) => !selectable.includes(id))
                : [...new Set([...prev, ...selectable])],
            )
          }
        />
      ),
      meta: { className: "w-10" },
      cell: ({ row }) =>
        row.original.isActive ? (
          <input
            type="checkbox"
            aria-label={`Pilih grant ${emailOf(row.original.accountId)} · ${PERMISSION_LABELS[row.original.permission]}`}
            className="accent-brand size-4"
            checked={selected.includes(row.original.id)}
            onChange={() =>
              setSelected((prev) =>
                prev.includes(row.original.id)
                  ? prev.filter((id) => id !== row.original.id)
                  : [...prev, row.original.id],
              )
            }
          />
        ) : null,
    }) as DataColumn<Grant>,
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
          <div className="flex w-full flex-wrap items-center gap-2">
            <FormSelect
              aria-label="Filter status grant"
              className="h-9 sm:w-48"
              value={status}
              onChange={(value) => {
                setStatus(value === "all" ? "all" : "active");
                resetPage();
              }}
              placeholder="Hanya yang aktif"
              options={[
                { value: "active", label: "Hanya yang aktif" },
                { value: "all", label: "Semua (termasuk dicabut)" },
              ]}
            />
            <FormSelect
              aria-label="Filter akun"
              className="h-9 sm:w-60"
              value={accountFilter}
              onChange={(value) => {
                setAccountFilter(value);
                resetPage();
              }}
              placeholder="Semua akun"
              noneLabel="Semua akun"
              options={recipients.map((a) => ({ value: a.id, label: a.email }))}
            />
            <FormSelect
              aria-label="Filter izin"
              className="h-9 sm:w-60"
              value={permissionFilter}
              onChange={(value) => {
                setPermissionFilter(value);
                resetPage();
              }}
              placeholder="Semua izin"
              noneLabel="Semua izin"
              options={PERMISSIONS.map((p) => ({ value: p, label: PERMISSION_LABELS[p] }))}
            />
            {selected.length ? (
              <div className="flex items-center gap-2 sm:ml-auto">
                <span className="text-muted-foreground text-sm">{selected.length} dipilih</span>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setRevoking(true)}
                >
                  Cabut terpilih ({selected.length})
                </Button>
              </div>
            ) : null}
          </div>
        }
        footer={
          total > 0 ? (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(next) => {
                setPage(next);
                setSelected([]);
              }}
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
          data={rows}
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
      <GrantBatchDialog
        open={open}
        onOpenChange={setOpen}
        recipients={recipients}
        companies={scope.companies}
      />
      {revoking ? (
        <RevokeBatchDialog
          ids={selected}
          describe={(id) => {
            const grant = rows.find((g) => g.id === id);
            return grant
              ? `${emailOf(grant.accountId)} · ${PERMISSION_LABELS[grant.permission]}`
              : id.slice(0, 8);
          }}
          onClose={(done) => {
            setRevoking(false);
            if (done) setSelected([]);
          }}
        />
      ) : null}
    </div>
  );
}

/** IAM-D2: konfirmasi "Cabut terpilih" + alasan untuk semua; yang sudah tidak aktif dilewati. */
function RevokeBatchDialog({
  ids,
  describe,
  onClose,
}: {
  ids: string[];
  describe: (id: string) => string;
  onClose: (done: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const revoke = useRevokeGrantBatch();
  const submit = async () => {
    try {
      const res = await revoke.mutateAsync({
        ids,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success(
        `${res.data.revoked} grant dicabut${res.data.skipped ? `; ${res.data.skipped} dilewati (sudah tidak aktif)` : ""}. Berlaku di request berikutnya.`,
      );
      onClose(true);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !revoke.isPending && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cabut {ids.length} grant?</DialogTitle>
          <DialogDescription>
            Izin hilang di request berikutnya. Pemilik grant mendapat satu notifikasi.
          </DialogDescription>
        </DialogHeader>
        <ul className="bg-muted/40 max-h-48 space-y-1 overflow-y-auto rounded-md p-3 text-sm">
          {ids.map((id) => (
            <li key={id} className="break-words">
              {describe(id)}
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <Label htmlFor="revoke-reason">Alasan (opsional, berlaku untuk semua)</Label>
          <Textarea
            id="revoke-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={revoke.isPending} onClick={() => onClose(false)}>
            Batal
          </Button>
          <Button variant="destructive" disabled={revoke.isPending} onClick={() => void submit()}>
            {revoke.isPending ? "Mencabut…" : `Cabut ${ids.length} grant`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
