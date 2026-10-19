import { createColumnHelper } from "@tanstack/react-table";
import { SearchX, Users } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  type DataColumn,
  DataTable,
  type SortState,
  type tableFeaturesNone,
} from "@/components/data-table";
import { ListPanel } from "@/components/list-panel";
import { SearchField } from "@/components/search-field";
import { TablePagination } from "@/components/table-pagination";
import { EmployeeAvatar } from "@/features/employee/components/employee-avatar";

// ARS-D16: daftar per orang di Laporan memakai bentuk tabel yang sama dengan Data Karyawan Aktif
// (ListPanel + DataTable + SearchField + TablePagination); isinya khas laporan. Data laporan sudah
// lengkap di klien, jadi cari/urut/halaman dikerjakan di sini (bukan server).

type PersonRow = { employeeId: string; fullName: string; employeeNumber: string | null };

export interface PeopleColumn<T> {
  key: string;
  header: string;
  /** Kolom bisa diurutkan (klik header). */
  sortValue?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

/** Kolom "Karyawan": avatar inisial + nama + NIP (sama dengan daftar karyawan). */
export function personColumn<T extends PersonRow & { company?: string; unit?: string | null }>(
  options: { showCompany?: boolean } = {},
): PeopleColumn<T> {
  return {
    key: "name",
    header: "Karyawan",
    className: "min-w-[220px]",
    sortValue: (row) => row.fullName,
    cell: (row) => (
      <div className="flex items-center gap-3">
        <EmployeeAvatar name={row.fullName} />
        <div className="min-w-0">
          <p className="group-hover:text-brand truncate font-medium transition-colors">
            {row.fullName}
          </p>
          {row.employeeNumber ? (
            <p className="text-muted-foreground font-mono text-xs">
              {row.employeeNumber}
              {options.showCompany && row.company ? ` · ${row.company}` : ""}
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">NIP belum ada</p>
          )}
        </div>
      </div>
    ),
  };
}

/** Kolom "Unit": unit + PT kecil di bawah (seperti Jabatan/unit di daftar karyawan). */
export function unitColumn<
  T extends { unit: string | null; company: string; position?: string | null },
>(): PeopleColumn<T> {
  return {
    key: "unit",
    header: "Jabatan",
    className: "min-w-[180px]",
    sortValue: (row) => row.unit ?? "",
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate">{row.position ?? "—"}</p>
        <p className="text-muted-foreground truncate text-xs">
          {[row.unit, row.company].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
    ),
  };
}

export function PeopleList<T extends PersonRow>({
  label,
  rows,
  columns,
  rowKey,
  onRowClick,
  search,
  searchPlaceholder = "Cari nama atau NIP…",
  toolbar,
  initialSort,
  empty,
}: {
  label: string;
  rows: readonly T[];
  columns: PeopleColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  search?: (row: T) => string;
  searchPlaceholder?: string;
  /** Chip saringan / pilihan tampilan di samping kotak cari. */
  toolbar?: ReactNode;
  initialSort?: SortState;
  empty: { title: string; description?: ReactNode };
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | undefined>(initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const tableColumns = useMemo(() => {
    const helper = createColumnHelper<typeof tableFeaturesNone, T & { id: string }>();
    return columns.map(
      (c) =>
        helper.display({
          id: c.key,
          header: c.header,
          meta: {
            ...(c.sortValue ? { sortKey: c.key } : {}),
            ...(c.className ? { className: c.className } : {}),
            ...(c.headerClassName ? { headerClassName: c.headerClassName } : {}),
          },
          cell: ({ row }) => c.cell(row.original),
        }) as DataColumn<T & { id: string }>,
    );
  }, [columns]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q && search ? rows.filter((r) => search(r).toLowerCase().includes(q)) : [...rows];
    const value = sort && columns.find((c) => c.key === sort.field)?.sortValue;
    if (sort && value) {
      const dir = sort.direction === "asc" ? 1 : -1;
      list = list.sort((a, b) => {
        const x = value(a);
        const y = value(b);
        return (
          (typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y), "id")) * dir
        );
      });
    }
    return list;
  }, [rows, query, search, sort, columns]);

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages);
  const data = visible
    .slice((current - 1) * pageSize, current * pageSize)
    .map((row) => ({ ...row, id: rowKey(row) }));

  return (
    <ListPanel
      className="animate-none"
      toolbar={
        search || toolbar ? (
          <>
            {search ? (
              <SearchField
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                aria-label={`Cari di ${label}`}
              />
            ) : null}
            {toolbar ? (
              <div className="flex flex-wrap items-center gap-2 empty:hidden">{toolbar}</div>
            ) : null}
          </>
        ) : undefined
      }
      footer={
        visible.length > 0 ? (
          <TablePagination
            page={current}
            pageSize={pageSize}
            total={visible.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        ) : undefined
      }
    >
      <DataTable
        label={label}
        columns={tableColumns}
        data={data}
        loading={false}
        {...(sort ? { sort } : {})}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        {...(onRowClick ? { onRowClick: (row: T & { id: string }) => onRowClick(row) } : {})}
        empty={
          query
            ? {
                icon: SearchX,
                title: "Tidak ada yang cocok",
                description: `Tidak ada hasil untuk "${query}". Coba kata kunci lain atau hapus saringan.`,
              }
            : { icon: Users, ...empty }
        }
      />
    </ListPanel>
  );
}
