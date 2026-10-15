import { WARNING_LEVEL_LABELS, WARNING_LEVELS, type WarningLevel } from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { Ban, Pencil, Plus, SearchX, Send, ShieldAlert, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useCompanyScope } from "@/features/employee/api";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type LetterParams,
  useDisciplineMutations,
  useViolationTypes,
  useWarningLetter,
  useWarningLetters,
} from "../api";
import { ConfirmBadge, LevelBadge, StateBadge } from "../components/letter-display";
import { DraftDialog, IssueDialog, RevokeDialog } from "../components/letter-forms";
import { ConfirmButtons, PdfButton, ScanButton } from "../components/letter-list";
import type { WarningLetter, WarningLetterDetail } from "../schemas";

// D-057, ARS-D7–D13: Personal Management › Arsip › Riwayat Peringatan — daftar SP (SA semua, HR ber-grant
// PT ditugaskan, MANAGER tim; draft hanya penulis), draft → terbit → konfirmasi / cabut, PDF & scan.

const STATE_OPTIONS: { value: NonNullable<LetterParams["state"]>; label: string }[] = [
  { value: "ACTIVE", label: "Berlaku" },
  { value: "DRAFT", label: "Draft" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "REVOKED", label: "Dicabut" },
];
const col = createColumnHelper<typeof tableFeaturesNone, WarningLetter>();
const c = (def: Parameters<typeof col.display>[0]) => col.display(def) as DataColumn<WarningLetter>;

function useOpenLetter() {
  const [params, setParams] = useSearchParams();
  const open = (id: string | null) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (id) p.set("sp", id);
      else p.delete("sp");
      return p;
    });
  return [params.get("sp"), open] as const;
}

export function WarningLettersPage() {
  const me = useMe().data as Me;
  const manage = access.manageWarningLetters(me);
  const [creating, setCreating] = useState(false);
  const [, openLetter] = useOpenLetter();
  return (
    <div>
      <PageHeader
        title="Riwayat Peringatan"
        description="Surat peringatan (SP 1–3) dari template sistem: draft, terbitkan, cetak untuk ditandatangani, lalu atasan dan karyawan mengonfirmasi. SP berlaku 6 bulan sejak terbit (dapat diubah SA)."
        actions={
          manage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Buat SP
            </Button>
          ) : null
        }
      />
      <LettersTable />
      <DraftDialog
        open={creating}
        letter={null}
        onClose={() => setCreating(false)}
        onSaved={(letter) => openLetter(letter.id)}
      />
      <LetterDetailSheet />
    </div>
  );
}

function LettersTable() {
  const scope = useCompanyScope();
  const types = useViolationTypes();
  const [, openLetter] = useOpenLetter();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [state, setState] = useState("");
  const [level, setLevel] = useState("");
  const [violationTypeId, setViolationTypeId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const list = useWarningLetters({
    page,
    pageSize,
    q: q || undefined,
    state: (state || undefined) as LetterParams["state"],
    level: (level || undefined) as WarningLevel | undefined,
    violationTypeId: violationTypeId || undefined,
    companyId: scope.selectedId,
  });
  const columns = useMemo<DataColumn<WarningLetter>[]>(
    () => [
      c({
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
      c({
        id: "letter",
        header: "Surat",
        cell: ({ row }) => (
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <LevelBadge level={row.original.level} />
              <span className="truncate text-sm">{row.original.violationType.name}</span>
            </div>
            <p className="text-muted-foreground truncate font-mono text-xs">
              {row.original.number ?? "belum bernomor"}
            </p>
          </div>
        ),
      }),
      c({
        id: "period",
        header: "Berlaku",
        cell: ({ row }) =>
          row.original.issuedAt ? (
            <div className="text-xs">
              <p>{formatDate(row.original.issuedAt)}</p>
              <p className="text-muted-foreground">s/d {formatDate(row.original.effectiveUntil)}</p>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      c({
        id: "state",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StateBadge state={row.original.state} />
            {row.original.state === "ACTIVE" && !row.original.deliveredAt ? (
              <ConfirmBadge label="Disampaikan" at={null} />
            ) : null}
            {row.original.state === "ACTIVE" && !row.original.acknowledgedAt ? (
              <ConfirmBadge label="Diterima" at={null} />
            ) : null}
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
  const filtered = Boolean(q || state || level || violationTypeId);
  return (
    <ListPanel
      toolbar={
        <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
          <SearchField
            value={search}
            onChange={reset(setSearch)}
            placeholder="Cari nama/NIP karyawan atau nomor surat…"
            aria-label="Cari surat peringatan"
          />
          <FormSelect
            aria-label="Status"
            className="h-9 lg:w-40"
            value={state}
            onChange={reset(setState)}
            placeholder="Semua status"
            noneLabel="Semua status"
            options={STATE_OPTIONS}
          />
          <FormSelect
            aria-label="Tingkat"
            className="h-9 lg:w-36"
            value={level}
            onChange={reset(setLevel)}
            placeholder="Semua tingkat"
            noneLabel="Semua tingkat"
            options={WARNING_LEVELS.map((l) => ({ value: l, label: WARNING_LEVEL_LABELS[l] }))}
          />
          {types.data ? (
            <FormSelect
              aria-label="Jenis pelanggaran"
              className="h-9 lg:w-52"
              value={violationTypeId}
              onChange={reset(setViolationTypeId)}
              placeholder="Semua jenis"
              noneLabel="Semua jenis"
              options={types.data.map((t) => ({ value: t.id, label: t.name }))}
            />
          ) : null}
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
        label="Daftar surat peringatan"
        columns={columns}
        data={list.data?.data ?? []}
        loading={list.isPending}
        fetching={list.isFetching}
        onRowClick={(row) => openLetter(row.id)}
        empty={
          list.isError
            ? {
                icon: SearchX,
                title: "Gagal memuat surat peringatan",
                description: errorMessage(list.error),
              }
            : {
                icon: ShieldAlert,
                title: filtered ? "Tidak ada yang cocok" : "Belum ada surat peringatan",
                description: filtered ? undefined : "Surat peringatan yang terbit tampil di sini.",
              }
        }
      />
    </ListPanel>
  );
}

function LetterDetailSheet() {
  const [id, openLetter] = useOpenLetter();
  const query = useWarningLetter(id);
  const letter = query.data;
  return (
    <Sheet open={id !== null} onOpenChange={(open) => (open ? null : openLetter(null))}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {letter
              ? `${WARNING_LEVEL_LABELS[letter.level]} · ${letter.employee.fullName}`
              : "Detail surat peringatan"}
          </SheetTitle>
          <SheetDescription className="font-mono">
            {letter ? (letter.number ?? "Draft — belum bernomor") : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">
          {query.isPending && id ? <Skeleton className="h-64" /> : null}
          {query.isError ? (
            <EmptyState
              icon={SearchX}
              title="Surat tidak ditemukan"
              description={errorMessage(query.error)}
            />
          ) : null}
          {letter ? <LetterDetailBody letter={letter} onDeleted={() => openLetter(null)} /> : null}
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

function LetterDetailBody({
  letter,
  onDeleted,
}: {
  letter: WarningLetterDetail;
  onDeleted: () => void;
}) {
  const { removeDraft } = useDisciplineMutations();
  const [editing, setEditing] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const live = letter.status === "ISSUED" || letter.status === "EXPIRED";
  const remove = async () => {
    if (!window.confirm("Hapus draft surat ini?")) return;
    try {
      await removeDraft.mutateAsync(letter.id);
      toast.success("Draft dihapus.");
      onDeleted();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <LevelBadge level={letter.level} />
        <StateBadge state={letter.state} />
        {live ? (
          <>
            <ConfirmBadge label="Disampaikan" at={letter.deliveredAt} />
            <ConfirmBadge label="Diterima" at={letter.acknowledgedAt} />
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {letter.can.issue ? (
          <Button size="sm" onClick={() => setIssuing(true)}>
            <Send /> Terbitkan
          </Button>
        ) : null}
        {letter.can.edit ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Ubah draft
          </Button>
        ) : null}
        <PdfButton letter={letter} />
        <ScanButton letter={letter} />
        <ConfirmButtons letter={letter} />
        {letter.can.edit ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => void remove()}
            disabled={removeDraft.isPending}
          >
            <Trash2 /> Hapus draft
          </Button>
        ) : null}
        {letter.can.revoke ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setRevoking(true)}
          >
            <Ban /> Cabut
          </Button>
        ) : null}
      </div>
      {letter.level === "SP3" && letter.can.revoke ? (
        <p className="bg-warning-soft text-warning-soft-foreground rounded-lg p-3 text-sm">
          SP 3 adalah peringatan terakhir — pertimbangkan proses PHK sesuai Peraturan Perusahaan
          (tidak diproses otomatis).
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Info label="Karyawan">
          {letter.employee.fullName}
          {letter.employee.employeeNumber ? (
            <span className="text-muted-foreground block text-xs font-normal">
              {letter.employee.employeeNumber}
            </span>
          ) : null}
        </Info>
        <Info label="Perusahaan">{letter.companyName}</Info>
        <Info label="Atasan">{letter.manager?.fullName}</Info>
        <Info label="Jenis pelanggaran">{letter.violationType.name}</Info>
        <Info label="Tanggal kejadian">
          {letter.incidentDate ? formatDate(letter.incidentDate) : null}
        </Info>
        <Info label="Berlaku">
          {letter.issuedAt
            ? `${formatDate(letter.issuedAt)} – ${formatDate(letter.effectiveUntil)}`
            : null}
        </Info>
        <Info label="Uraian / kronologi" className="col-span-2 sm:col-span-3">
          <span className="font-normal whitespace-pre-line">{letter.description}</span>
        </Info>
        {letter.escalationReason ? (
          <Info
            label={`Alasan di atas saran (${letter.suggestedLevel ? WARNING_LEVEL_LABELS[letter.suggestedLevel] : "—"})`}
            className="col-span-2 sm:col-span-3"
          >
            {letter.escalationReason}
          </Info>
        ) : null}
        {letter.deliveredAt ? (
          <Info label="Disampaikan atasan">{formatDateTime(letter.deliveredAt)}</Info>
        ) : null}
        {letter.acknowledgedAt ? (
          <Info label="Diterima karyawan">{formatDateTime(letter.acknowledgedAt)}</Info>
        ) : null}
        {letter.revokedAt ? (
          <Info label="Dicabut" className="col-span-2 sm:col-span-3">
            {formatDateTime(letter.revokedAt)} — {letter.revokeReason}
          </Info>
        ) : null}
        <Info label="Scan bertanda tangan">
          {letter.scanDocumentId ? "Terlampir di dokumen karyawan" : null}
        </Info>
      </dl>
      {letter.alphaEvidence.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">
            Bukti hari ALPHA ({letter.alphaEvidence.length})
          </h3>
          <ul className="divide-y rounded-xl border">
            {letter.alphaEvidence.map((d) => (
              <li key={d.dayId} className="space-y-1 p-3 text-sm">
                <p className="font-medium">{formatDate(d.workDate)}</p>
                <p className="text-muted-foreground text-xs">
                  {d.statement
                    ? `Surat pernyataan: ${d.statement.reason}`
                    : "Tanpa surat pernyataan"}
                  {d.statement?.attachmentUrl ? (
                    <>
                      {" · "}
                      <a
                        href={d.statement.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        lampiran
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <DraftDialog open={editing} letter={letter} onClose={() => setEditing(false)} />
      <IssueDialog letter={issuing ? letter : null} onClose={() => setIssuing(false)} />
      <RevokeDialog letter={revoking ? letter : null} onClose={() => setRevoking(false)} />
    </div>
  );
}
