import {
  ASSET_CONDITION_LABELS,
  ASSET_CONDITIONS,
  type AssetCondition,
  type BastKind,
} from "@hris/shared";
import { FileDown, FileUp, Loader2 } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
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
import { Textarea } from "@/components/ui/textarea";
import { useDocumentTypes, useEmployeeDocumentMutations } from "@/features/documents/api";
import { errorMessage } from "@/lib/errors";
import { downloadBast, useAssetMutations } from "../api";
import type { AssetAssignment, PpeIssue } from "../schemas";
import { todayIso } from "./display";

// ARS-D1–D6: dialog transaksi aset yang dipakai halaman Aset, tab Aset detail karyawan, dan dialog
// nonaktifkan. Tidak mengimpor fitur employee (cegah dependensi melingkar).

const CONDITION_OPTIONS = ASSET_CONDITIONS.map((value) => ({
  value,
  label: ASSET_CONDITION_LABELS[value],
}));

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function ActionDialog({
  open,
  onClose,
  title,
  description,
  pending,
  submitLabel,
  destructive,
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  pending: boolean;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: () => Promise<void>;
  children: ReactNode;
}) {
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSubmit();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const assetLabel = (a: AssetAssignment) => (a.asset ? `${a.asset.name} (${a.asset.code})` : "aset");

export function ReturnAssetDialog({
  assignment,
  onClose,
}: {
  assignment: AssetAssignment | null;
  onClose: () => void;
}) {
  const { returnAsset } = useAssetMutations();
  const [returnedAt, setReturnedAt] = useState(todayIso());
  const [condition, setCondition] = useState<AssetCondition>("GOOD");
  const [note, setNote] = useState("");
  const id = useId();
  if (!assignment) return null;
  return (
    <ActionDialog
      open
      onClose={onClose}
      title="Terima pengembalian aset"
      description={`${assetLabel(assignment)} dari ${assignment.employee.fullName}. Kondisi Rusak membuat aset berstatus Perbaikan.`}
      pending={returnAsset.isPending}
      submitLabel="Simpan pengembalian"
      onSubmit={async () => {
        await returnAsset.mutateAsync({
          id: assignment.id,
          body: { returnedAt, conditionIn: condition, note: note.trim() || null },
        });
        toast.success("Pengembalian dicatat. Cetak BAST pengembalian bila perlu.");
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tanggal kembali" htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            type="date"
            required
            min={assignment.assignedAt}
            value={returnedAt}
            onChange={(e) => setReturnedAt(e.target.value)}
          />
        </Field>
        <Field label="Kondisi saat kembali" htmlFor={`${id}-cond`}>
          <FormSelect
            id={`${id}-cond`}
            value={condition}
            onChange={(v) => setCondition(v as AssetCondition)}
            options={CONDITION_OPTIONS}
            placeholder="Pilih kondisi"
          />
        </Field>
      </div>
      <Field label="Catatan (opsional)" htmlFor={`${id}-note`}>
        <Textarea
          id={`${id}-note`}
          maxLength={500}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </ActionDialog>
  );
}

export function LostAssetDialog({
  assignment,
  onClose,
}: {
  assignment: AssetAssignment | null;
  onClose: () => void;
}) {
  const { markLost } = useAssetMutations();
  const [lostAt, setLostAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const id = useId();
  if (!assignment) return null;
  return (
    <ActionDialog
      open
      onClose={onClose}
      destructive
      title="Tandai aset hilang"
      description={`${assetLabel(assignment)} yang dipegang ${assignment.employee.fullName}. Aset berstatus Hilang; tindak lanjut (ganti rugi, laporan) di luar sistem.`}
      pending={markLost.isPending}
      submitLabel="Tandai hilang"
      onSubmit={async () => {
        await markLost.mutateAsync({ id: assignment.id, body: { lostAt, note: note.trim() } });
        toast.success("Aset ditandai hilang.");
      }}
    >
      <Field label="Tanggal diketahui hilang" htmlFor={`${id}-date`}>
        <Input
          id={`${id}-date`}
          type="date"
          required
          min={assignment.assignedAt}
          value={lostAt}
          onChange={(e) => setLostAt(e.target.value)}
        />
      </Field>
      <Field
        label="Keterangan"
        htmlFor={`${id}-note`}
        hint="Wajib, minimal 5 karakter (tercatat di audit log)."
      >
        <Textarea
          id={`${id}-note`}
          required
          minLength={5}
          maxLength={500}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </ActionDialog>
  );
}

export function ReturnPpeDialog({
  issue,
  onClose,
}: {
  issue: PpeIssue | null;
  onClose: () => void;
}) {
  const { returnPpe } = useAssetMutations();
  const [returnedAt, setReturnedAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const id = useId();
  if (!issue) return null;
  return (
    <ActionDialog
      open
      onClose={onClose}
      title="Terima pengembalian APD"
      description={`${issue.ppeType.name} × ${issue.quantity} dari ${issue.employee.fullName}.`}
      pending={returnPpe.isPending}
      submitLabel="Simpan pengembalian"
      onSubmit={async () => {
        await returnPpe.mutateAsync({
          id: issue.id,
          body: { returnedAt, note: note.trim() || null },
        });
        toast.success("Pengembalian APD dicatat.");
      }}
    >
      <Field label="Tanggal kembali" htmlFor={`${id}-date`}>
        <Input
          id={`${id}-date`}
          type="date"
          required
          min={issue.issuedAt}
          value={returnedAt}
          onChange={(e) => setReturnedAt(e.target.value)}
        />
      </Field>
      <Field label="Catatan (opsional)" htmlFor={`${id}-note`}>
        <Textarea
          id={`${id}-note`}
          maxLength={500}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </ActionDialog>
  );
}

/** Kode jenis dokumen BAST di katalog D-055. */
const BAST_TYPE = "BAST_ASSET";

/**
 * ARS-D2: unduh PDF BAST (dicetak & ditandatangani basah) lalu unggah scan-nya sebagai dokumen
 * karyawan BAST_ASSET dan tautkan ke transaksi.
 */
export function BastButtons({
  employeeId,
  target,
  attachedId,
  canManage,
  disabledReason,
}: {
  employeeId: string;
  target: { assignmentId: string; kind: BastKind } | { ppeIssueId: string };
  attachedId: string | null;
  canManage: boolean;
  disabledReason?: string | undefined;
}) {
  const types = useDocumentTypes();
  const { upload } = useEmployeeDocumentMutations(employeeId);
  const { attachBast, attachPpeBast } = useAssetMutations();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"pdf" | "scan" | null>(null);
  const bastType = types.data?.find((t) => t.code === BAST_TYPE);
  const kindLabel =
    "assignmentId" in target && target.kind === "RETURN" ? "pengembalian" : "serah-terima";

  const download = async () => {
    setBusy("pdf");
    try {
      await downloadBast(target);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const onFile = async (file: File | undefined) => {
    if (!file || !bastType) return;
    setBusy("scan");
    try {
      const doc = await upload.mutateAsync({
        file,
        meta: {
          documentTypeId: bastType.id,
          documentNumber: null,
          issuedAt: todayIso(),
          expiresAt: null,
          note: `BAST ${kindLabel}`,
        },
      });
      if ("assignmentId" in target) {
        await attachBast.mutateAsync({
          id: target.assignmentId,
          body: { kind: target.kind, documentId: doc.data.id },
        });
      } else {
        await attachPpeBast.mutateAsync({
          id: target.ppeIssueId,
          body: { documentId: doc.data.id },
        });
      }
      toast.success("Scan BAST tersimpan di dokumen karyawan dan ditautkan.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={download}
        disabled={busy !== null || Boolean(disabledReason)}
        title={disabledReason}
      >
        {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />} PDF BAST {kindLabel}
      </Button>
      {canManage ? (
        <>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            aria-label={`Scan BAST ${kindLabel}`}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            size="sm"
            variant={attachedId ? "ghost" : "outline"}
            onClick={() => input.current?.click()}
            disabled={busy !== null || !bastType || Boolean(disabledReason)}
          >
            {busy === "scan" ? <Loader2 className="animate-spin" /> : <FileUp />}
            {attachedId ? "Ganti scan BAST" : "Unggah scan BAST"}
          </Button>
        </>
      ) : null}
      {attachedId ? (
        <span className="text-success-soft-foreground text-xs">Scan BAST terlampir</span>
      ) : null}
    </div>
  );
}
