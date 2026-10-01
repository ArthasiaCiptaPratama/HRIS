import type { EmploymentCategory, EmploymentCategoryGroup } from "@hris/shared";
import { ORG_UNIT_TYPE_LABELS } from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { Search, SearchX, Users, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  type DataColumn,
  DataTable,
  parseSort,
  type tableFeaturesNone,
} from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate } from "@/lib/format";
import { type EmployeeListParams, useCompanyScope, useEmployees, useMasterData } from "../api";
import { tenure } from "../labels";
import type { EmployeeListItem } from "../schemas";
import { EmployeeAvatar } from "./employee-avatar";
import { ExitReasonBadge, StatusBadge } from "./status-badge";

const helper = createColumnHelper<typeof tableFeaturesNone, EmployeeListItem>();

export type ListVariant = "active" | "inactive";

/** Kolom pegawai; `action` = kolom tombol paling kanan (mis. "Aktifkan"). */
export function employeeColumns(
  variant: ListVariant,
  action?: (row: EmployeeListItem) => ReactNode,
  options: { showCompany?: boolean } = {},
): DataColumn<EmployeeListItem>[] {
  const columns: DataColumn<EmployeeListItem>[] = [
    helper.display({
      id: "name",
      header: "Karyawan",
      meta: { sortKey: "fullName", className: "min-w-[220px]" },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <EmployeeAvatar
            name={row.original.fullName}
            photoUrl={row.original.photoUrl}
            inactive={!row.original.isActive}
          />
          <div className="min-w-0">
            <p className="group-hover:text-brand truncate font-medium transition-colors">
              {row.original.fullName}
            </p>
            <p className="text-muted-foreground font-mono text-xs">{row.original.employeeNumber}</p>
          </div>
        </div>
      ),
    }) as DataColumn<EmployeeListItem>,
    helper.display({
      id: "position",
      header: "Jabatan",
      meta: { className: "min-w-[180px]" },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate">{row.original.position.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {row.original.department?.name ?? "—"}
          </p>
        </div>
      ),
    }) as DataColumn<EmployeeListItem>,
    helper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          name={row.original.employmentStatus.name}
          category={row.original.employmentStatus.category}
        />
      ),
    }) as DataColumn<EmployeeListItem>,
  ];

  // D-040: kolom perusahaan hanya bila pengguna melihat lebih dari satu PT.
  if (options.showCompany) {
    columns.push(
      helper.display({
        id: "company",
        header: "Perusahaan",
        cell: ({ row }) => (
          <span
            className="bg-muted rounded-md px-1.5 py-0.5 font-mono text-xs"
            title={row.original.company.name}
          >
            {row.original.company.code}
          </span>
        ),
      }) as DataColumn<EmployeeListItem>,
    );
  }

  if (variant === "active") {
    columns.push(
      helper.display({
        id: "location",
        header: "Lokasi",
        meta: { headerClassName: "hidden lg:table-cell", className: "hidden lg:table-cell" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.workLocation?.name ?? "—"}</span>
        ),
      }) as DataColumn<EmployeeListItem>,
      helper.display({
        id: "joinDate",
        header: "Masuk",
        meta: { sortKey: "joinDate", className: "whitespace-nowrap" },
        cell: ({ row }) => (
          <div>
            <p className="tabular-nums">{formatDate(row.original.joinDate)}</p>
            <p className="text-muted-foreground text-xs">{tenure(row.original.joinDate)}</p>
          </div>
        ),
      }) as DataColumn<EmployeeListItem>,
      helper.display({
        id: "manager",
        header: "Atasan",
        meta: { headerClassName: "hidden xl:table-cell", className: "hidden xl:table-cell" },
        cell: ({ row }) =>
          row.original.manager ? (
            <div className="flex items-center gap-2">
              <EmployeeAvatar name={row.original.manager.name} size="sm" />
              <span className="truncate text-sm">{row.original.manager.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }) as DataColumn<EmployeeListItem>,
    );
  } else {
    columns.push(
      helper.display({
        id: "endDate",
        header: "Tanggal keluar",
        meta: { sortKey: "endDate", className: "whitespace-nowrap" },
        cell: ({ row }) => (
          <div>
            <p className="tabular-nums">{formatDate(row.original.endDate)}</p>
            <p className="text-muted-foreground text-xs">
              Masa kerja {tenure(row.original.joinDate, row.original.endDate)}
            </p>
          </div>
        ),
      }) as DataColumn<EmployeeListItem>,
      helper.display({
        id: "reason",
        header: "Alasan",
        cell: ({ row }) => <ExitReasonBadge reason={row.original.exitReason} />,
      }) as DataColumn<EmployeeListItem>,
    );
  }

  if (action) {
    columns.push(
      helper.display({
        id: "action",
        header: () => <span className="sr-only">Aksi</span>,
        meta: { className: "text-right" },
        cell: ({ row }) => action(row.original),
      }) as DataColumn<EmployeeListItem>,
    );
  }
  return columns;
}

/** Filter & paginasi disimpan di URL: bisa dibagikan, Back/Forward bekerja, refresh tidak hilang. */
export function useListParams(defaults: { sort: string }) {
  const [params, setParams] = useSearchParams();
  const get = (key: string) => params.get(key) ?? "";
  const update = (changes: Record<string, string | number | null>, resetPage = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, String(value));
        }
        if (resetPage && !("page" in changes)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  return {
    q: get("q"),
    page: Math.max(1, Number(get("page")) || 1),
    pageSize: [10, 20, 50, 100].includes(Number(get("size"))) ? Number(get("size")) : 20,
    departmentId: get("dept"),
    workLocationId: get("loc"),
    sort: get("sort") || defaults.sort,
    update,
  };
}

export function EmployeeListView({
  variant,
  category,
  group,
  columns,
  onRowClick,
  emptyTitle,
  emptyDescription,
  emptyAction,
  toolbarExtra,
}: {
  variant: ListVariant;
  category?: EmploymentCategory | undefined;
  group?: EmploymentCategoryGroup | undefined;
  columns: DataColumn<EmployeeListItem>[];
  onRowClick?: (row: EmployeeListItem) => void;
  emptyTitle: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  toolbarExtra?: ReactNode;
}) {
  const list = useListParams({ sort: variant === "active" ? "fullName:asc" : "endDate:desc" });
  const master = useMasterData();
  const { selectedId: companyId } = useCompanyScope();
  const [search, setSearch] = useState(list.q);
  const debounced = useDebouncedValue(search, 300);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ketikan → URL (setelah jeda); URL berubah dari luar (Back) → kotak pencarian ikut.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya bereaksi pada nilai debounce
  useEffect(() => {
    if (debounced !== list.q) list.update({ q: debounced });
  }, [debounced]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: sinkron dari URL saja
  useEffect(() => {
    if (list.q !== debounced) setSearch(list.q);
  }, [list.q]);

  // "/" memfokuskan pencarian (kecuali sedang mengetik di input lain).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const params: EmployeeListParams = useMemo(
    () => ({
      page: list.page,
      pageSize: list.pageSize,
      active: variant === "active",
      q: list.q || undefined,
      category,
      group,
      companyId,
      departmentId: list.departmentId || undefined,
      workLocationId: list.workLocationId || undefined,
      sort: list.sort,
    }),
    [
      list.page,
      list.pageSize,
      list.q,
      list.departmentId,
      list.workLocationId,
      list.sort,
      category,
      group,
      companyId,
      variant,
    ],
  );
  const query = useEmployees(params);
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const filtered = Boolean(list.q || list.departmentId || list.workLocationId);

  // Halaman di luar jangkauan (mis. setelah filter) → kembali ke halaman terakhir yang ada.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cukup saat total berubah
  useEffect(() => {
    const last = Math.max(1, Math.ceil(total / list.pageSize));
    if (query.data && list.page > last) list.update({ page: last }, false);
  }, [total]);

  return (
    <div className="bg-card animate-fade-up overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgb(24_24_27/0.04),0_12px_32px_-16px_rgb(24_24_27/0.08)]">
      <div className="flex flex-col gap-3 border-b p-3 sm:p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, nomor induk, email…"
            aria-label="Cari karyawan"
            className="h-9 pr-9 pl-9 sm:pr-16"
          />
          {search ? (
            <button
              type="button"
              aria-label="Hapus pencarian"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="text-muted-foreground bg-muted pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[10px] sm:inline">
              /
            </kbd>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          <FormSelect
            aria-label="Filter unit organisasi"
            className="h-9 sm:w-52"
            value={list.departmentId}
            onChange={(value) => list.update({ dept: value })}
            placeholder="Semua unit"
            noneLabel="Semua unit"
            options={(master.data?.departments ?? []).map((d) => ({
              value: d.id,
              label: d.name,
              hint: ORG_UNIT_TYPE_LABELS[d.unitType],
            }))}
          />
          <FormSelect
            aria-label="Filter lokasi"
            className="h-9 sm:w-48"
            value={list.workLocationId}
            onChange={(value) => list.update({ loc: value })}
            placeholder="Semua lokasi"
            noneLabel="Semua lokasi"
            options={(master.data?.workLocations ?? []).map((l) => ({
              value: l.id,
              label: l.name,
            }))}
          />
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setSearch("");
                list.update({ q: null, dept: null, loc: null });
              }}
            >
              <X /> Reset
            </Button>
          ) : null}
          {toolbarExtra}
        </div>
      </div>

      <DataTable
        label="Daftar karyawan"
        columns={columns}
        data={rows}
        loading={query.isPending}
        fetching={query.isFetching}
        sort={parseSort(list.sort)}
        onSortChange={(sort) => list.update({ sort: `${sort.field}:${sort.direction}` })}
        {...(onRowClick ? { onRowClick } : {})}
        skeletonRows={Math.min(list.pageSize, 8)}
        empty={
          query.isError
            ? { icon: SearchX, title: "Gagal memuat data", description: query.error.message }
            : filtered
              ? {
                  icon: SearchX,
                  title: "Tidak ada yang cocok",
                  description: "Coba kata kunci lain atau hapus filter.",
                }
              : {
                  icon: Users,
                  title: emptyTitle,
                  description: emptyDescription,
                  action: emptyAction,
                }
        }
      />

      {total > 0 ? (
        <div className="border-t">
          <TablePagination
            page={list.page}
            pageSize={list.pageSize}
            total={total}
            onPageChange={(page) => list.update({ page }, false)}
            onPageSizeChange={(size) => list.update({ size })}
          />
        </div>
      ) : null}
    </div>
  );
}
