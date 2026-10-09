import {
  DATA_CHANGE_SECTION_LABELS,
  DATA_CHANGE_SECTIONS,
  DATA_CHANGE_STATUS_LABELS,
  DATA_CHANGE_STATUSES,
  type DataChangeSection,
  type DataChangeStatus,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { Check, FilePen, Lock, SearchX, X } from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { TablePagination } from "@/components/table-pagination";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyScope } from "@/features/employee/api";
import { EmployeeAvatar } from "@/features/employee/components/employee-avatar";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useDataChange, useDataChangeQueue, useDecideDataChange } from "../api";
import { AttachmentLink, ChangeComparison, StatusBadge } from "../components/change-comparison";
import { FIELD_LABELS } from "../labels";
import type { DataChangeQueueRow } from "../schemas";

// D-054 / OD-6 (Arsip 1c): Administrasi › Pengajuan Perubahan Data. SA semua PT; HR ber-grant
// `employee.changes.review` PT-nya. Bagian sensitif hanya bisa dibuka & diputuskan bila HR juga punya
// grant lihat & ubah bagian itu (dicek API; tombol mengikuti `canReview`).

const column = createColumnHelper<typeof tableFeaturesNone, DataChangeQueueRow>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<DataChangeQueueRow>;

export function DataChangesPage() {
  const scope = useCompanyScope();
  const [params, setParams] = useSearchParams();
  const openId = params.get("id");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<DataChangeStatus | "">("PENDING");
  const [section, setSection] = useState<DataChangeSection | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const list = useDataChangeQueue({
    page,
    pageSize,
    q: q || undefined,
    status: status || undefined,
    section: section || undefined,
    companyId: scope.selectedId,
  });
  const open = useCallback(
    (id: string | null) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("id", id);
        else next.delete("id");
        return next;
      }),
    [setParams],
  );

  const columns = useMemo<DataColumn<DataChangeQueueRow>[]>(
    () => [
      col({
        id: "employee",
        header: "Karyawan",
        cell: ({ row }) => {
          const e = row.original.employee;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <EmployeeAvatar name={e.fullName} photoUrl={e.photoUrl} inactive={!e.isActive} />
              <div className="min-w-0">
                <p className="truncate font-medium">{e.fullName}</p>
                <p className="text-muted-foreground truncate text-xs">
                  <span className="font-mono">{e.employeeNumber ?? "—"}</span> · {e.company.code}
                </p>
              </div>
            </div>
          );
        },
      }),
      col({
        id: "section",
        header: "Bagian",
        cell: ({ row }) => (
          <div className="min-w-0 text-sm">
            <p>
              {DATA_CHANGE_SECTION_LABELS[row.original.section]}
              {row.original.documentType ? ` · ${row.original.documentType.name}` : ""}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {row.original.section === "DOCUMENT" || row.original.section === "FAMILY"
                ? ""
                : row.original.fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}
            </p>
          </div>
        ),
      }),
      col({
        id: "createdAt",
        header: "Diajukan",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      }),
      col({
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      }),
      col({
        id: "action",
        header: () => <span className="sr-only">Aksi</span>,
        cell: ({ row }) =>
          row.original.canReview ? (
            <Button size="sm" variant="outline" onClick={() => open(row.original.id)}>
              Periksa
            </Button>
          ) : row.original.status === "PENDING" ? (
            <span
              className="text-muted-foreground flex items-center gap-1 text-xs"
              title="Butuh grant lihat & ubah bagian ini"
            >
              <Lock className="size-3.5" /> Butuh izin
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => open(row.original.id)}>
              Lihat
            </Button>
          ),
      }),
    ],
    [open],
  );

  return (
    <div>
      <PageHeader
        title="Pengajuan Perubahan Data"
        description="Perubahan data diri yang diajukan karyawan lewat Layanan Mandiri. Data baru berlaku saat disetujui; setiap pembukaan bagian sensitif tercatat di audit log."
      />
      <ListPanel
        toolbar={
          <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
            <SearchField
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Cari nama atau NIP…"
              aria-label="Cari pengajuan"
            />
            <FormSelect
              aria-label="Status"
              className="h-9 lg:w-56"
              value={status}
              onChange={(value) => {
                setStatus(value as DataChangeStatus | "");
                setPage(1);
              }}
              placeholder="Semua status"
              noneLabel="Semua status"
              options={DATA_CHANGE_STATUSES.map((s) => ({
                value: s,
                label: DATA_CHANGE_STATUS_LABELS[s],
              }))}
            />
            <FormSelect
              aria-label="Bagian"
              className="h-9 lg:w-48"
              value={section}
              onChange={(value) => {
                setSection(value as DataChangeSection | "");
                setPage(1);
              }}
              placeholder="Semua bagian"
              noneLabel="Semua bagian"
              options={DATA_CHANGE_SECTIONS.map((s) => ({
                value: s,
                label: DATA_CHANGE_SECTION_LABELS[s],
              }))}
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
          label="Daftar pengajuan perubahan data"
          columns={columns}
          data={list.data?.data ?? []}
          loading={list.isPending}
          fetching={list.isFetching}
          empty={
            list.isError
              ? {
                  icon: SearchX,
                  title: "Gagal memuat pengajuan",
                  description: errorMessage(list.error),
                }
              : {
                  icon: FilePen,
                  title:
                    status === "PENDING" ? "Tidak ada pengajuan menunggu" : "Tidak ada pengajuan",
                }
          }
        />
      </ListPanel>
      <ReviewDialog id={openId} onClose={() => open(null)} />
    </div>
  );
}

function ReviewDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useDataChange(id);
  const decide = useDecideDataChange();
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const run = async (decision: "APPROVE" | "REJECT") => {
    if (!id) return;
    if (decision === "REJECT" && !note.trim()) {
      setNoteError("Tulis alasan penolakan.");
      return;
    }
    try {
      await decide.mutateAsync({ id, decision, note: note.trim() || null });
      toast.success(
        decision === "APPROVE" ? "Pengajuan disetujui; data sudah berlaku." : "Pengajuan ditolak.",
      );
      setNote("");
      setNoteError("");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const d = detail.data;
  return (
    <Dialog
      open={id !== null}
      onOpenChange={(value) => {
        if (!value) {
          setNote("");
          setNoteError("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {d ? `${DATA_CHANGE_SECTION_LABELS[d.section]} · ${d.employee.fullName}` : "Pengajuan"}
          </DialogTitle>
          <DialogDescription>
            {d
              ? `Diajukan ${formatDateTime(d.createdAt)} · ${d.employee.employeeNumber ?? "NIP belum ada"}`
              : "Memuat…"}
          </DialogDescription>
        </DialogHeader>
        {detail.isPending ? (
          <Skeleton className="h-40" />
        ) : detail.isError || !d ? (
          <p className="text-destructive text-sm">{errorMessage(detail.error)}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={d.status} />
              {d.reviewNote ? (
                <span className="text-muted-foreground text-xs">Catatan: {d.reviewNote}</span>
              ) : null}
            </div>
            <ChangeComparison detail={d} />
            <AttachmentLink document={d.document} />
            {d.access.review ? (
              <div className="space-y-2">
                <Label htmlFor="dc-note">
                  Catatan{" "}
                  <span className="text-muted-foreground font-normal">(wajib bila ditolak)</span>
                </Label>
                <Textarea
                  id="dc-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-invalid={Boolean(noteError)}
                />
                {noteError ? <p className="text-destructive text-xs">{noteError}</p> : null}
              </div>
            ) : null}
          </div>
        )}
        {d?.access.review ? (
          <DialogFooter>
            <Button
              variant="outline"
              disabled={decide.isPending}
              onClick={() => void run("REJECT")}
            >
              <X /> Tolak
            </Button>
            <Button variant="brand" disabled={decide.isPending} onClick={() => void run("APPROVE")}>
              <Check /> Setujui
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
