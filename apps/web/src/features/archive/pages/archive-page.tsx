import { FileDown, Loader2, SearchX } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useCompanyScope, useMasterData } from "@/features/employee/api";
import { EmployeeDetailSheet } from "@/features/employee/components/employee-detail-sheet";
import { MaintenancePage } from "@/features/system/pages/maintenance-page";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { type ArchiveParams, useArchiveExport, useArchiveList } from "../api";
import { type ArchiveFilter, type ArchiveSectionConfig, archivePage } from "../config";

// D-054 (Arsip 1a): Personal Management › Arsip › <menu>. Tabel lintas karyawan (cakupan API:
// SA semua PT, HR PT ditugaskan, MANAGER tim); klik baris → detail karyawan di tab terkait.
// Menu Arsip yang belum dikerjakan (Keluarga, File, Bank, Aset, Peringatan) tetap Maintenance.

export function ArchivePage() {
  const { section } = useParams();
  const config = archivePage(section);
  if (!config) return <MaintenancePage />;
  return <ArchiveScreen key={config.slug} config={config} />;
}

function ArchiveScreen({ config }: { config: ArchiveSectionConfig }) {
  const me = useMe().data as Me;
  const scope = useCompanyScope();
  const master = useMasterData();
  const [, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [departmentId, setDepartmentId] = useState("");
  const [employees, setEmployees] = useState<ArchiveParams["employees"]>("active");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params: ArchiveParams = {
    page,
    pageSize,
    q: q || undefined,
    companyId: scope.selectedId,
    departmentId: departmentId || undefined,
    employees,
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
  };
  const list = useArchiveList(config.category, params);
  const exporter = useArchiveExport(config.category);
  const exportXlsx = () =>
    exporter.mutate(params, {
      onSuccess: (file) => toast.success(`${file.rows} baris diekspor (${file.fileName}).`),
      onError: (error) => toast.error(errorMessage(error)),
    });
  const columns = useMemo(
    () => config.columns({ showCost: access.manageEmployees(me) }),
    [config, me],
  );
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };

  const open = (employeeId: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("pegawai", employeeId);
      next.set("tab", config.tab);
      return next;
    });

  return (
    <div>
      <PageHeader
        title={config.label}
        description={config.description}
        actions={
          // D-058: ekspor SA/HR saja (isi sebatas hak lihat; filter tabel ikut).
          access.manageEmployees(me) ? (
            <Button variant="outline" onClick={exportXlsx} disabled={exporter.isPending}>
              {exporter.isPending ? <Loader2 className="animate-spin" /> : <FileDown />}
              {exporter.isPending ? "Menyiapkan…" : "Ekspor Excel"}
            </Button>
          ) : null
        }
      />
      <ListPanel
        toolbar={
          <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
            <SearchField
              value={search}
              onChange={reset(setSearch)}
              placeholder={`Cari nama, NIP, ${config.noun}…`}
              aria-label={`Cari ${config.noun}`}
            />
            <FormSelect
              aria-label="Unit organisasi"
              className="h-9 lg:w-56"
              value={departmentId}
              onChange={reset(setDepartmentId)}
              placeholder="Semua unit"
              noneLabel="Semua unit"
              options={(master.data?.departments ?? []).map((d) => ({
                value: d.id,
                label: d.name,
              }))}
            />
            {(config.filters ?? []).map((filter) => (
              <ArchiveFilterSelect
                key={filter.key}
                filter={filter}
                value={filters[filter.key] ?? ""}
                onChange={(value) => {
                  setFilters((current) => ({ ...current, [filter.key]: value }));
                  setPage(1);
                }}
              />
            ))}
            <FormSelect
              aria-label="Status karyawan"
              className="h-9 lg:w-44"
              value={employees}
              onChange={(value) => reset(setEmployees)(value as ArchiveParams["employees"])}
              placeholder="Karyawan aktif"
              options={[
                { value: "active", label: "Karyawan aktif" },
                { value: "inactive", label: "Tidak aktif" },
                { value: "all", label: "Semua karyawan" },
              ]}
            />
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
          label={`Daftar ${config.label.toLowerCase()}`}
          columns={columns}
          data={list.data?.data ?? []}
          loading={list.isPending}
          fetching={list.isFetching}
          onRowClick={(row) => open(row.employee.id)}
          empty={
            list.isError
              ? { icon: SearchX, title: "Gagal memuat data", description: errorMessage(list.error) }
              : {
                  icon: config.icon,
                  title:
                    q || Object.values(filters).some(Boolean) || departmentId
                      ? "Tidak ada yang cocok"
                      : `Belum ada ${config.noun}`,
                  description:
                    config.category === "contacts"
                      ? undefined
                      : config.category === "documents"
                        ? "Unggah dari detail karyawan (tab Dokumen)."
                        : "Tambahkan dari detail karyawan (tab Pendidikan / Riwayat).",
                }
          }
        />
      </ListPanel>
      <EmployeeDetailSheet />
    </div>
  );
}

function ArchiveFilterSelect({
  filter,
  value,
  onChange,
}: {
  filter: ArchiveFilter;
  value: string;
  onChange: (value: string) => void;
}) {
  const dynamic = filter.useOptions?.();
  return (
    <FormSelect
      aria-label={filter.label}
      className="h-9 lg:w-48"
      value={value}
      onChange={onChange}
      placeholder={`Semua ${filter.label.toLowerCase()}`}
      noneLabel={`Semua ${filter.label.toLowerCase()}`}
      options={dynamic ?? filter.options ?? []}
    />
  );
}
