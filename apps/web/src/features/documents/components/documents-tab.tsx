import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  EXPIRY_STATE_LABELS,
  type ExpiryState,
} from "@hris/shared";
import {
  ChevronDown,
  Eye,
  FileText,
  FileUp,
  History,
  Lock,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { openEmployeeDocument, useEmployeeDocumentMutations, useEmployeeDocuments } from "../api";
import type { EmployeeDocument } from "../schemas";
import { DocumentDialog, type DocumentDialogMode } from "./document-dialog";

// D-055 (Arsip 1b): tab Dokumen di detail karyawan — versi aktif per kategori, riwayat versi,
// lencana masa berlaku, unggah/ubah/hapus (SA/HR; jenis sensitif butuh grant tulis).

const EXPIRY_VARIANT: Record<ExpiryState, "muted" | "success" | "warning" | "destructive"> = {
  NONE: "muted",
  VALID: "success",
  EXPIRING: "warning",
  EXPIRED: "destructive",
};

export function ExpiryBadge({ state, daysLeft }: { state: ExpiryState; daysLeft: number | null }) {
  if (state === "NONE") return null;
  const label =
    state === "EXPIRING" && daysLeft !== null
      ? daysLeft === 0
        ? "Berakhir hari ini"
        : `${daysLeft} hari lagi`
      : EXPIRY_STATE_LABELS[state];
  return <Badge variant={EXPIRY_VARIANT[state]}>{label}</Badge>;
}

export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export async function openDocument(employeeId: string, documentId: string) {
  try {
    await openEmployeeDocument(employeeId, documentId);
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

function documentMeta(doc: EmployeeDocument) {
  return [
    doc.documentNumber,
    doc.issuedAt ? `terbit ${formatDate(doc.issuedAt)}` : null,
    doc.expiresAt ? `berlaku s.d. ${formatDate(doc.expiresAt)}` : null,
    fileSize(doc.sizeBytes),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function DocumentsTab({ employeeId }: { employeeId: string }) {
  const query = useEmployeeDocuments(employeeId);
  const { remove } = useEmployeeDocumentMutations(employeeId);
  const [mode, setMode] = useState<DocumentDialogMode | null>(null);
  const [deleting, setDeleting] = useState<EmployeeDocument | null>(null);

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <EmptyState
        icon={FileText}
        title="Gagal memuat dokumen"
        description={errorMessage(query.error)}
      />
    );
  }
  const { documents, access } = query.data;
  const current = documents.filter((d) => d.isCurrent);
  const olderOf = (doc: EmployeeDocument) => {
    const chain: EmployeeDocument[] = [];
    let next = doc.replacesId;
    while (next) {
      const prev = documents.find((d) => d.id === next);
      if (!prev) break;
      chain.push(prev);
      next = prev.replacesId;
    }
    return chain;
  };
  const canWrite = (doc: EmployeeDocument) =>
    doc.documentType.sensitive ? access.writeSensitive : access.write;

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Dokumen dihapus.");
      setDeleting(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Lock className="size-3.5" aria-hidden />
          File privat; dibuka lewat tautan 5 menit. Membuka dokumen sensitif tercatat di audit log.
        </p>
        {access.write ? (
          <Button size="sm" variant="outline" onClick={() => setMode({ kind: "new" })}>
            <FileUp /> Unggah dokumen
          </Button>
        ) : null}
      </div>
      {current.length === 0 ? (
        <EmptyState icon={FileText} title="Belum ada dokumen" />
      ) : (
        DOCUMENT_CATEGORIES.map((category) => {
          const rows = current.filter((d) => d.documentType.category === category);
          if (rows.length === 0) return null;
          return (
            <section key={category}>
              <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                {DOCUMENT_CATEGORY_LABELS[category]}
              </h3>
              <ul className="divide-y rounded-xl border">
                {rows.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    employeeId={employeeId}
                    doc={doc}
                    older={olderOf(doc)}
                    canWrite={canWrite(doc)}
                    onVersion={() => setMode({ kind: "version", document: doc })}
                    onEdit={(target) => setMode({ kind: "edit", document: target })}
                    onDelete={setDeleting}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
      <DocumentDialog
        employeeId={employeeId}
        mode={mode}
        onClose={() => setMode(null)}
        canWriteSensitive={access.writeSensitive}
      />
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Hapus {deleting?.documentType.name} versi {deleting?.version}?
            </DialogTitle>
            <DialogDescription>
              File dihapus permanen.{" "}
              {deleting?.isCurrent && deleting.replacesId
                ? "Versi sebelumnya akan menjadi versi aktif."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => void confirmDelete()}
            >
              {remove.isPending ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentRow({
  employeeId,
  doc,
  older,
  canWrite,
  onVersion,
  onEdit,
  onDelete,
}: {
  employeeId: string;
  doc: EmployeeDocument;
  older: EmployeeDocument[];
  canWrite: boolean;
  onVersion: () => void;
  onEdit: (doc: EmployeeDocument) => void;
  onDelete: (doc: EmployeeDocument) => void;
}) {
  const [showOlder, setShowOlder] = useState(false);
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
          {doc.documentType.sensitive ? (
            <Lock className="size-4" aria-hidden />
          ) : (
            <FileText className="size-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {doc.documentType.name}
            <ExpiryBadge state={doc.expiryState} daysLeft={doc.daysLeft} />
            {doc.version > 1 ? <Badge variant="outline">Versi {doc.version}</Badge> : null}
            {doc.trainingId || doc.historyId ? (
              <Badge variant="muted">
                <Paperclip /> Lampiran {doc.trainingId ? "pelatihan" : "riwayat jabatan"}
              </Badge>
            ) : null}
          </p>
          <p className="text-muted-foreground text-xs break-words">{documentMeta(doc)}</p>
          {doc.note ? (
            <p className="text-muted-foreground mt-1 text-xs italic">{doc.note}</p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void openDocument(employeeId, doc.id)}
          aria-label={`Lihat ${doc.documentType.name}`}
        >
          <Eye /> <span className="hidden sm:inline">Lihat</span>
        </Button>
        {canWrite ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Aksi untuk ${doc.documentType.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onVersion}>
                <FileUp /> Unggah versi baru
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit(doc)}>
                <Pencil /> Ubah keterangan
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(doc)}>
                <Trash2 /> Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {older.length > 0 ? (
        <div className="mt-2 pl-11">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-7 px-2 text-xs"
            onClick={() => setShowOlder((v) => !v)}
            aria-expanded={showOlder}
          >
            <History /> Versi sebelumnya ({older.length})
            <ChevronDown className={showOlder ? "rotate-180" : undefined} />
          </Button>
          {showOlder ? (
            <ul className="mt-1 space-y-1">
              {older.map((prev) => (
                <li key={prev.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">
                    Versi {prev.version} · {documentMeta(prev)} · diunggah{" "}
                    {formatDate(prev.uploadedAt.slice(0, 10))}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => void openDocument(employeeId, prev.id)}
                  >
                    Lihat
                  </Button>
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive h-7 px-2 text-xs"
                      onClick={() => onDelete(prev)}
                    >
                      Hapus
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Lampiran item Arsip (sertifikat pelatihan / SK riwayat jabatan): daftar file + tombol lampirkan.
 * Data dari daftar dokumen karyawan (satu query untuk seluruh tab).
 */
export function AttachmentList({
  employeeId,
  link,
  typeCodes,
  label,
}: {
  employeeId: string;
  link: { trainingId: string } | { historyId: string };
  typeCodes: readonly string[];
  label: string;
}) {
  const query = useEmployeeDocuments(employeeId);
  const [mode, setMode] = useState<DocumentDialogMode | null>(null);
  if (!query.data) return null;
  const { documents, access } = query.data;
  const attached = documents.filter(
    (d) =>
      d.isCurrent &&
      ("trainingId" in link ? d.trainingId === link.trainingId : d.historyId === link.historyId),
  );
  if (attached.length === 0 && !access.write) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {attached.map((doc) => (
        <Button
          key={doc.id}
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={() => void openDocument(employeeId, doc.id)}
        >
          <Paperclip /> {doc.documentType.name}
          {doc.documentNumber ? ` · ${doc.documentNumber}` : ""}
        </Button>
      ))}
      {access.write ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-6 px-2 text-xs"
          onClick={() => setMode({ kind: "new", typeCodes, link, title: `Lampirkan ${label}` })}
        >
          <FileUp /> Lampirkan {label}
        </Button>
      ) : null}
      <DocumentDialog
        employeeId={employeeId}
        mode={mode}
        onClose={() => setMode(null)}
        canWriteSensitive={access.writeSensitive}
      />
    </span>
  );
}
