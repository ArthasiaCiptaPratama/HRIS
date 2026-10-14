import {
  ASSET_STATUS_LABELS,
  ASSET_STATUSES,
  type AssetStatus,
  MANUAL_ASSET_STATUSES,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import {
  HardHat,
  Laptop,
  MoreHorizontal,
  Package,
  PackageX,
  Pencil,
  Plus,
  SearchX,
  UserRoundCheck,
} from "lucide-react";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useCompanyScope } from "@/features/employee/api";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useAsset,
  useAssetCategories,
  useAssetMutations,
  useAssets,
  usePendingReturns,
  usePpeIssues,
  usePpeTypes,
} from "../api";
import { BastButtons, LostAssetDialog, ReturnAssetDialog } from "../components/asset-actions";
import { AssetFormDialog, AssignAssetDialog, PpeIssueDialog } from "../components/asset-forms";
import {
  AckBadge,
  AssetStatusBadge,
  ConditionBadge,
  formatPrice,
  LoanBadge,
  ReplacementBadge,
} from "../components/display";
import { EmployeeAssetsTab, HoldingsList } from "../components/holdings";
import type { Asset, AssetAssignment, PpeIssue } from "../schemas";

// ARS-D1–D6: Personal Management › Arsip › Data Assets — aset per unit, pembagian APD, dan belum
// kembali dari karyawan keluar. Cakupan dari API (SA semua, HR PT, MANAGER tim); harga hanya pengelola.

const TABS = ["aset", "apd", "belum-kembali"] as const;
type Tab = (typeof TABS)[number];
const assetCol = createColumnHelper<typeof tableFeaturesNone, Asset>();
const ac = (def: Parameters<typeof assetCol.display>[0]) =>
  assetCol.display(def) as DataColumn<Asset>;
const ppeCol = createColumnHelper<typeof tableFeaturesNone, PpeIssue>();
const pc = (def: Parameters<typeof ppeCol.display>[0]) =>
  ppeCol.display(def) as DataColumn<PpeIssue>;
const muted = (value: ReactNode) => <span className="text-muted-foreground">{value ?? "—"}</span>;

export function AssetsPage() {
  const me = useMe().data as Me;
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "aset";
  const setTab = (next: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", next);
      return p;
    });
  const manage = access.manageAssets(me);
  const admin = access.manageEmployees(me);
  const [creating, setCreating] = useState(false);
  const [issuing, setIssuing] = useState(false);
  return (
    <div>
      <PageHeader
        title="Data Assets"
        description="Aset per unit yang dipinjamkan ke karyawan (serah-terima & BAST) dan pembagian APD/seragam. Harga hanya terlihat oleh pengelola aset."
        actions={
          manage ? (
            tab === "apd" ? (
              <Button onClick={() => setIssuing(true)}>
                <HardHat /> Catat pembagian APD
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Tambah aset
              </Button>
            )
          ) : null
        }
      />
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="aset">
            <Laptop /> Aset
          </TabsTrigger>
          <TabsTrigger value="apd">
            <HardHat /> Pembagian APD
          </TabsTrigger>
          {admin ? (
            <TabsTrigger value="belum-kembali">
              <PackageX /> Belum kembali
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="aset">
          <AssetsTab />
        </TabsContent>
        <TabsContent value="apd">
          <PpeTab />
        </TabsContent>
        {admin ? (
          <TabsContent value="belum-kembali">
            <PendingTab />
          </TabsContent>
        ) : null}
      </Tabs>
      <AssetFormDialog asset={null} open={creating} onClose={() => setCreating(false)} />
      <PpeIssueDialog open={issuing} onClose={() => setIssuing(false)} />
      <AssetDetailSheet />
    </div>
  );
}

function useOpenAsset() {
  const [, setParams] = useSearchParams();
  return (id: string | null) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (id) p.set("asset", id);
      else p.delete("asset");
      return p;
    });
}

function AssetsTab() {
  const scope = useCompanyScope();
  const categories = useAssetCategories();
  const openAsset = useOpenAsset();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const list = useAssets({
    page,
    pageSize,
    q: q || undefined,
    status: (status || undefined) as AssetStatus | undefined,
    categoryId: categoryId || undefined,
    companyId: scope.selectedId,
    overdue,
  });
  const columns = useMemo<DataColumn<Asset>[]>(
    () => [
      ac({
        id: "asset",
        header: "Aset",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="text-muted-foreground truncate font-mono text-xs">
              {row.original.code}
              {row.original.serialNumber ? ` · SN ${row.original.serialNumber}` : ""}
            </p>
          </div>
        ),
      }),
      ac({ id: "category", header: "Kategori", cell: ({ row }) => row.original.category.name }),
      ac({
        id: "holder",
        header: "Pemegang",
        cell: ({ row }) =>
          row.original.holder ? (
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm">{row.original.holder.fullName}</p>
              <div className="flex flex-wrap gap-1">
                {row.original.assignment ? (
                  <LoanBadge state={row.original.assignment.loanState} />
                ) : null}
                {row.original.assignment && !row.original.assignment.acknowledgedAt ? (
                  <Badge variant="muted">Belum konfirmasi</Badge>
                ) : null}
              </div>
            </div>
          ) : (
            muted("—")
          ),
      }),
      ac({
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <AssetStatusBadge status={row.original.status} />
            {row.original.condition !== "GOOD" ? (
              <ConditionBadge condition={row.original.condition} />
            ) : null}
          </div>
        ),
      }),
      ac({
        id: "location",
        header: "PT / lokasi",
        cell: ({ row }) => (
          <div className="min-w-0 text-xs">
            <p className="truncate">{row.original.company.code}</p>
            <p className="text-muted-foreground truncate">
              {row.original.workLocation?.name ?? ""}
            </p>
          </div>
        ),
      }),
    ],
    [],
  );
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };
  return (
    <ListPanel
      toolbar={
        <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
          <SearchField
            value={search}
            onChange={reset(setSearch)}
            placeholder="Cari kode, nama, nomor seri, merek…"
            aria-label="Cari aset"
          />
          <FormSelect
            aria-label="Kategori"
            className="h-9 lg:w-48"
            value={categoryId}
            onChange={reset(setCategoryId)}
            placeholder="Semua kategori"
            noneLabel="Semua kategori"
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <FormSelect
            aria-label="Status"
            className="h-9 lg:w-44"
            value={status}
            onChange={reset(setStatus)}
            placeholder="Semua status"
            noneLabel="Semua status"
            options={ASSET_STATUSES.map((s) => ({ value: s, label: ASSET_STATUS_LABELS[s] }))}
          />
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={overdue}
              onChange={(e) => reset(setOverdue)(e.target.checked)}
            />
            Terlambat kembali
          </label>
        </div>
      }
      footer={
        list.data && list.data.meta.total > 0 ? (
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={list.data.meta.total}
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
        label="Daftar aset"
        columns={columns}
        data={list.data?.data ?? []}
        loading={list.isPending}
        fetching={list.isFetching}
        onRowClick={(row) => openAsset(row.id)}
        empty={
          list.isError
            ? { icon: SearchX, title: "Gagal memuat aset", description: errorMessage(list.error) }
            : {
                icon: Package,
                title:
                  q || status || categoryId || overdue ? "Tidak ada yang cocok" : "Belum ada aset",
                description: "Tambahkan aset per unit, lalu serahkan ke karyawan.",
              }
        }
      />
    </ListPanel>
  );
}

function PpeTab() {
  const types = usePpeTypes();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [ppeTypeId, setPpeTypeId] = useState("");
  const [params, setParams] = useSearchParams();
  // Tautan notifikasi cron: ?tab=apd&replacement=DUE (ARS-D5).
  const [due, setDue] = useState(params.get("replacement") === "DUE");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const list = usePpeIssues({
    page,
    pageSize,
    q: q || undefined,
    ppeTypeId: ppeTypeId || undefined,
    replacement: due ? "DUE" : undefined,
  });
  const openEmployee = (employeeId: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("pegawai", employeeId);
      return p;
    });
  const columns = useMemo<DataColumn<PpeIssue>[]>(
    () => [
      pc({
        id: "employee",
        header: "Karyawan",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.employee.fullName}</p>
            <p className="text-muted-foreground truncate text-xs">
              {row.original.employee.employeeNumber ?? "NIP belum ada"}
            </p>
          </div>
        ),
      }),
      pc({
        id: "type",
        header: "APD",
        cell: ({ row }) => (
          <div className="min-w-0 text-sm">
            <p className="truncate">{row.original.ppeType.name}</p>
            <p className="text-muted-foreground text-xs">
              × {row.original.quantity}
              {row.original.size ? ` · ukuran ${row.original.size}` : ""}
            </p>
          </div>
        ),
      }),
      pc({ id: "date", header: "Diterima", cell: ({ row }) => formatDate(row.original.issuedAt) }),
      pc({
        id: "replace",
        header: "Masa ganti",
        cell: ({ row }) => (
          <div className="space-y-1">
            <ReplacementBadge issue={row.original} />
            {row.original.replacementDue ? (
              <p className="text-muted-foreground text-xs">
                {formatDate(row.original.replacementDue)}
              </p>
            ) : null}
          </div>
        ),
      }),
      pc({
        id: "ack",
        header: "Konfirmasi",
        cell: ({ row }) => <AckBadge at={row.original.acknowledgedAt} />,
      }),
    ],
    [],
  );
  return (
    <ListPanel
      toolbar={
        <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cari nama atau NIP karyawan…"
            aria-label="Cari pembagian APD"
          />
          <FormSelect
            aria-label="Jenis APD"
            className="h-9 lg:w-52"
            value={ppeTypeId}
            onChange={(v) => {
              setPpeTypeId(v);
              setPage(1);
            }}
            placeholder="Semua jenis"
            noneLabel="Semua jenis"
            options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={due}
              onChange={(e) => {
                setDue(e.target.checked);
                setPage(1);
              }}
            />
            Jatuh tempo ganti
          </label>
        </div>
      }
      footer={
        list.data && list.data.meta.total > 0 ? (
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={list.data.meta.total}
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
        label="Daftar pembagian APD"
        columns={columns}
        data={list.data?.data ?? []}
        loading={list.isPending}
        fetching={list.isFetching}
        onRowClick={(row) => openEmployee(row.employee.employeeId)}
        empty={
          list.isError
            ? {
                icon: SearchX,
                title: "Gagal memuat pembagian APD",
                description: errorMessage(list.error),
              }
            : {
                icon: HardHat,
                title: q || ppeTypeId || due ? "Tidak ada yang cocok" : "Belum ada pembagian APD",
                description: "Klik baris untuk membuka aset & APD karyawan.",
              }
        }
      />
      <EmployeeHoldingsSheet />
    </ListPanel>
  );
}

/** Pegangan satu karyawan (dari tab APD) tanpa membuka detail karyawan penuh. */
function EmployeeHoldingsSheet() {
  const [params, setParams] = useSearchParams();
  const employeeId = params.get("pegawai");
  return (
    <Sheet
      open={employeeId !== null}
      onOpenChange={(open) =>
        open
          ? null
          : setParams((prev) => {
              const p = new URLSearchParams(prev);
              p.delete("pegawai");
              return p;
            })
      }
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Aset & APD karyawan</SheetTitle>
          <SheetDescription>Termasuk riwayat pengembalian.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">
          {employeeId ? <EmployeeAssetsTab employeeId={employeeId} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PendingTab() {
  const query = usePendingReturns();
  if (query.isPending) return <Skeleton className="h-48" />;
  if (query.isError)
    return (
      <EmptyState icon={SearchX} title="Gagal memuat" description={errorMessage(query.error)} />
    );
  if (!query.data?.length) {
    return (
      <EmptyState
        icon={UserRoundCheck}
        title="Semua aset karyawan keluar sudah kembali"
        description="Aset & APD wajib kembali yang masih dipegang karyawan nonaktif tampil di sini."
      />
    );
  }
  return (
    <div className="space-y-4">
      {query.data.map((row) => (
        <section key={row.employee.employeeId} className="bg-card rounded-xl border p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{row.employee.fullName}</h3>
            <Badge variant="muted">Tidak aktif</Badge>
            <span className="text-muted-foreground text-xs">
              {row.employee.employeeNumber ?? ""}
            </span>
          </div>
          <HoldingsList
            holdings={{
              employee: row.employee,
              assets: row.assets,
              ppe: row.ppe,
              canManage: row.canManage,
            }}
            mode="exit"
          />
        </section>
      ))}
    </div>
  );
}

function AssetDetailSheet() {
  const [params] = useSearchParams();
  const id = params.get("asset");
  const openAsset = useOpenAsset();
  const query = useAsset(id);
  const asset = query.data;
  return (
    <Sheet open={id !== null} onOpenChange={(open) => (open ? null : openAsset(null))}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{asset ? asset.name : "Detail aset"}</SheetTitle>
          <SheetDescription className="font-mono">{asset?.code ?? ""}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">
          {query.isPending && id ? <Skeleton className="h-64" /> : null}
          {query.isError ? (
            <EmptyState
              icon={SearchX}
              title="Aset tidak ditemukan"
              description={errorMessage(query.error)}
            />
          ) : null}
          {asset ? <AssetDetailBody asset={asset} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Info({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium break-words">
        {children === null || children === undefined || children === "" ? (
          <span className="text-muted-foreground font-normal">—</span>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}

function AssetDetailBody({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>["data"]> }) {
  const { setStatus } = useAssetMutations();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [returning, setReturning] = useState<AssetAssignment | null>(null);
  const [losing, setLosing] = useState<AssetAssignment | null>(null);
  const open = asset.assignment;
  const changeStatus = async (status: (typeof MANUAL_ASSET_STATUSES)[number]) => {
    try {
      await setStatus.mutateAsync({ id: asset.id, body: { status } });
      toast.success(`Status: ${ASSET_STATUS_LABELS[status]}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <AssetStatusBadge status={asset.status} />
        <ConditionBadge condition={asset.condition} />
        {open ? <LoanBadge state={open.loanState} /> : null}
        {asset.canManage ? (
          <div className="ml-auto flex flex-wrap gap-2">
            {asset.status === "AVAILABLE" ? (
              <Button size="sm" onClick={() => setAssigning(true)}>
                <UserRoundCheck /> Serahkan
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Ubah
            </Button>
            {asset.status !== "ASSIGNED" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" aria-label="Ubah status">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {MANUAL_ASSET_STATUSES.filter((s) => s !== asset.status).map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => void changeStatus(s)}>
                      Jadikan {ASSET_STATUS_LABELS[s]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Info label="Kategori">{asset.category.name}</Info>
        <Info label="Merek / model">{[asset.brand, asset.model].filter(Boolean).join(" · ")}</Info>
        <Info label="Nomor seri">{asset.serialNumber}</Info>
        <Info label="Perusahaan">{asset.company.name}</Info>
        <Info label="Lokasi kerja">{asset.workLocation?.name}</Info>
        {asset.canSeePrice ? (
          <>
            <Info label="Tanggal beli">
              {asset.purchaseDate ? formatDate(asset.purchaseDate) : null}
            </Info>
            <Info label="Harga beli">
              {asset.purchasePrice ? formatPrice(asset.purchasePrice) : null}
            </Info>
          </>
        ) : null}
        <Info label="Catatan" className="col-span-2 sm:col-span-3">
          {asset.note}
        </Info>
      </dl>
      {open ? (
        <section className="bg-muted/40 space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-muted-foreground text-xs">Dipegang</p>
              <p className="font-medium">{open.employee.fullName}</p>
              <p className="text-muted-foreground text-xs">
                sejak {formatDate(open.assignedAt)}
                {open.dueBackAt ? ` · kembali paling lambat ${formatDate(open.dueBackAt)}` : ""}
              </p>
            </div>
            <AckBadge at={open.acknowledgedAt} />
          </div>
          <BastButtons
            employeeId={open.employee.employeeId}
            target={{ assignmentId: open.id, kind: "HANDOVER" }}
            attachedId={open.handoverDocumentId}
            canManage={asset.canManage}
          />
          {asset.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setReturning(open)}>
                Terima pengembalian
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => setLosing(open)}
              >
                Tandai hilang
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Riwayat pemegang ({asset.history.length})</h3>
        {asset.history.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum pernah diserahkan.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {asset.history.map((h) => (
              <li
                key={h.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{h.employee.fullName}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(h.assignedAt)} – {h.closedAt ? formatDate(h.closedAt) : "sekarang"}
                    {h.outcome === "LOST" ? " · hilang" : ""}
                    {h.closeNote ? ` · ${h.closeNote}` : ""}
                  </p>
                </div>
                {h.closedAt && h.outcome === "RETURNED" ? (
                  <BastButtons
                    employeeId={h.employee.employeeId}
                    target={{ assignmentId: h.id, kind: "RETURN" }}
                    attachedId={h.returnDocumentId}
                    canManage={asset.canManage}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <AssetFormDialog asset={asset} open={editing} onClose={() => setEditing(false)} />
      <AssignAssetDialog asset={assigning ? asset : null} onClose={() => setAssigning(false)} />
      <ReturnAssetDialog assignment={returning} onClose={() => setReturning(null)} />
      <LostAssetDialog assignment={losing} onClose={() => setLosing(null)} />
    </div>
  );
}
