import { CheckCheck, FileDown, FileUp, Loader2, Send, ShieldAlert } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTypes, useEmployeeDocumentMutations } from "@/features/documents/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import {
  downloadWarningLetter,
  useDisciplineMutations,
  useEmployeeWarningLetters,
  useSelfWarningLetters,
} from "../api";
import type { WarningLetter } from "../schemas";
import { ConfirmBadge, LevelBadge, StateBadge } from "./letter-display";

// ARS-D7–D13: daftar SP satu karyawan — tab "SP" di detail karyawan (HR/MANAGER) dan Layanan Mandiri ›
// SP saya (konfirmasi "Sudah menerima"). Tidak mengimpor fitur employee (cegah dependensi melingkar).

/** Kode jenis dokumen scan SP di katalog D-055. */
const WARNING_LETTER_TYPE = "WARNING_LETTER";

const run = async (action: () => Promise<unknown>, success: string) => {
  try {
    await action();
    toast.success(success);
  } catch (error) {
    toast.error(errorMessage(error));
  }
};

export function PdfButton({ letter }: { letter: Pick<WarningLetter, "id" | "number"> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await run(() => downloadWarningLetter(letter.id), "PDF surat diunduh.");
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <FileDown />}
      {letter.number ? "PDF surat" : "Pratinjau PDF"}
    </Button>
  );
}

/**
 * ARS-D7: unggah scan surat bertanda tangan sebagai dokumen karyawan WARNING_LETTER (berlaku s/d = masa
 * berlaku SP) lalu tautkan ke SP.
 */
export function ScanButton({ letter }: { letter: WarningLetter }) {
  const types = useDocumentTypes();
  const { upload } = useEmployeeDocumentMutations(letter.employee.employeeId);
  const { attachScan } = useDisciplineMutations();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const type = types.data?.find((t) => t.code === WARNING_LETTER_TYPE);
  if (!letter.can.attachScan) return null;
  const onFile = async (file: File | undefined) => {
    if (!file || !type) return;
    setBusy(true);
    await run(async () => {
      const doc = await upload.mutateAsync({
        file,
        meta: {
          documentTypeId: type.id,
          documentNumber: letter.number,
          issuedAt: letter.issuedAt,
          expiresAt: letter.effectiveUntil,
          note: `Scan ${letter.level} bertanda tangan`,
        },
      });
      await attachScan.mutateAsync({ id: letter.id, body: { documentId: doc.data.id } });
    }, "Scan SP tersimpan di dokumen karyawan dan ditautkan.");
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        aria-label={`Scan ${letter.number ?? "SP"}`}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        size="sm"
        variant={letter.scanDocumentId ? "ghost" : "outline"}
        onClick={() => input.current?.click()}
        disabled={busy || !type}
      >
        {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
        {letter.scanDocumentId ? "Ganti scan" : "Unggah scan bertanda tangan"}
      </Button>
    </>
  );
}

export function ConfirmButtons({ letter }: { letter: WarningLetter }) {
  const { deliver, acknowledge } = useDisciplineMutations();
  return (
    <>
      {letter.can.deliver ? (
        <Button
          type="button"
          size="sm"
          disabled={deliver.isPending}
          onClick={() =>
            run(
              () => deliver.mutateAsync({ id: letter.id }),
              "Ditandai sudah disampaikan ke karyawan.",
            )
          }
        >
          {deliver.isPending ? <Loader2 className="animate-spin" /> : <Send />} Sudah disampaikan
        </Button>
      ) : null}
      {letter.can.acknowledge ? (
        <Button
          type="button"
          size="sm"
          disabled={acknowledge.isPending}
          onClick={() =>
            run(
              () => acknowledge.mutateAsync({ id: letter.id }),
              "Terima kasih, penerimaan surat dikonfirmasi.",
            )
          }
        >
          {acknowledge.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />} Sudah
          menerima
        </Button>
      ) : null}
    </>
  );
}

/** Ringkasan masa berlaku & nomor satu SP. */
export function letterPeriod(letter: WarningLetter): string {
  if (!letter.issuedAt) return "Draft — belum diterbitkan";
  return `Terbit ${formatDate(letter.issuedAt)} · berlaku s/d ${formatDate(letter.effectiveUntil)}`;
}

export function LetterCard({
  letter,
  actions,
  onOpen,
}: {
  letter: WarningLetter;
  actions?: ReactNode;
  onOpen?: () => void;
}) {
  const live = letter.status === "ISSUED" || letter.status === "EXPIRED";
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="bg-muted text-muted-foreground mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg">
          <ShieldAlert className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          {onOpen ? (
            <button
              type="button"
              className="truncate text-left font-medium hover:underline"
              onClick={onOpen}
            >
              {letter.violationType.name}
            </button>
          ) : (
            <p className="truncate font-medium">{letter.violationType.name}</p>
          )}
          <p className="text-muted-foreground text-xs">
            {letter.number ? <span className="font-mono">{letter.number} · </span> : null}
            {letterPeriod(letter)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LevelBadge level={letter.level} />
            <StateBadge state={letter.state} />
            {live ? (
              <>
                <ConfirmBadge label="Disampaikan" at={letter.deliveredAt} />
                <ConfirmBadge label="Diterima" at={letter.acknowledgedAt} />
              </>
            ) : null}
          </div>
          {letter.revokeReason ? (
            <p className="text-muted-foreground text-xs">Dicabut: {letter.revokeReason}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
    </li>
  );
}

function LettersList({ letters, mode }: { letters: WarningLetter[]; mode: "employee" | "self" }) {
  if (letters.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Tidak ada surat peringatan"
        description={
          mode === "self"
            ? "Surat peringatan yang diterbitkan untuk Anda tampil di sini beserta riwayatnya."
            : undefined
        }
      />
    );
  }
  return (
    <ul className="divide-y">
      {letters.map((letter) => (
        <LetterCard
          key={letter.id}
          letter={letter}
          actions={
            letter.status === "DRAFT" ? null : (
              <>
                <ConfirmButtons letter={letter} />
                <PdfButton letter={letter} />
                {mode === "employee" ? <ScanButton letter={letter} /> : null}
              </>
            )
          }
        />
      ))}
    </ul>
  );
}

/** Tab "SP" di detail karyawan (SA, HR ber-grant, MANAGER tim; cakupan dicek API). */
export function EmployeeWarningLettersTab({ employeeId }: { employeeId: string }) {
  const query = useEmployeeWarningLetters(employeeId);
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.isError)
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Surat peringatan tidak bisa ditampilkan"
        description={errorMessage(query.error)}
      />
    );
  return <LettersList letters={query.data} mode="employee" />;
}

/** Layanan Mandiri › SP saya (ARS-D9/D13): aktif + riwayat, konfirmasi "Sudah menerima". */
export function MyWarningLetters() {
  const query = useSelfWarningLetters();
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.isError)
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Gagal memuat surat"
        description={errorMessage(query.error)}
      />
    );
  return <LettersList letters={query.data} mode="self" />;
}
