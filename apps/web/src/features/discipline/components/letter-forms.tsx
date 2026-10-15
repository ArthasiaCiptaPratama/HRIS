import {
  isAboveSuggestion,
  WARNING_LEVEL_LABELS,
  WARNING_LEVELS,
  type WarningLevel,
} from "@hris/shared";
import { Loader2, TriangleAlert } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
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
import { EmployeePicker } from "@/features/employee/components/employee-picker";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import {
  useAlphaCandidates,
  useDisciplineMutations,
  useDisciplineSettings,
  useLevelSuggestion,
  useViolationTypes,
} from "../api";
import type { WarningLetter, WarningLetterDetail } from "../schemas";

// ARS-D7–D12: form draft (buat/ubah), terbitkan, dan cabut SP. Hanya dipakai halaman Riwayat Peringatan
// (mengimpor EmployeePicker; jangan diimpor dari fitur employee).

const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

function Field({
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

function FormDialog({
  open,
  onClose,
  title,
  description,
  pending,
  submitLabel,
  destructive,
  onSubmit,
  children,
  wide,
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
  wide?: boolean;
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
      <DialogContent className={wide ? "sm:max-w-2xl" : "sm:max-w-lg"}>
        <form onSubmit={submit} className="grid max-h-[80dvh] gap-5 overflow-y-auto pr-1">
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

function Notice({
  children,
  tone = "warning",
}: {
  children: ReactNode;
  tone?: "warning" | "info";
}) {
  return (
    <div
      className={
        tone === "warning"
          ? "bg-warning-soft text-warning-soft-foreground flex gap-2 rounded-lg p-3 text-sm"
          : "bg-muted text-muted-foreground flex gap-2 rounded-lg p-3 text-sm"
      }
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/**
 * Buat (letter = null) atau ubah draft SP. Saran tingkat dari SP yang masih berlaku (ARS-D10); tingkat
 * di atas saran wajib beralasan; hari ALPHA hanya untuk jenis mangkir (ARS-D12).
 */
export function DraftDialog({
  open,
  letter,
  onClose,
  onSaved,
}: {
  open: boolean;
  letter: WarningLetterDetail | null;
  onClose: () => void;
  onSaved?: (letter: WarningLetter) => void;
}) {
  const types = useViolationTypes(open);
  const { createDraft, updateDraft } = useDisciplineMutations();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [level, setLevel] = useState<WarningLevel>("SP1");
  const [levelTouched, setLevelTouched] = useState(false);
  const [violationTypeId, setViolationTypeId] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [description, setDescription] = useState("");
  const [escalationReason, setEscalationReason] = useState("");
  const [alphaDayIds, setAlphaDayIds] = useState<string[]>([]);
  const id = useId();
  const suggestion = useLevelSuggestion(open ? employeeId : null);
  const type = types.data?.find((t) => t.id === violationTypeId);
  const alpha = useAlphaCandidates(employeeId, open && Boolean(type?.linksAttendance));

  useEffect(() => {
    if (!open) return;
    setEmployeeId(letter?.employee.employeeId ?? null);
    setLevel(letter?.level ?? "SP1");
    setLevelTouched(Boolean(letter));
    setViolationTypeId(letter?.violationType.id ?? "");
    setIncidentDate(letter?.incidentDate ?? "");
    setDescription(letter?.description ?? "");
    setEscalationReason(letter?.escalationReason ?? "");
    setAlphaDayIds(letter?.alphaDays.map((d) => d.attendanceDayId) ?? []);
  }, [open, letter]);

  // Tingkat mengikuti saran sistem sampai pengguna memilih sendiri.
  const suggested = suggestion.data?.suggestedLevel ?? null;
  useEffect(() => {
    if (suggested && !levelTouched) setLevel(suggested);
  }, [suggested, levelTouched]);

  const above = suggested ? isAboveSuggestion(level, suggested) : false;
  const toggleDay = (dayId: string, on: boolean) =>
    setAlphaDayIds((prev) => (on ? [...prev, dayId] : prev.filter((d) => d !== dayId)));

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      wide
      title={letter ? "Ubah draft surat peringatan" : "Buat surat peringatan"}
      description="Draft bisa diubah atau dihapus kapan saja. Setelah diterbitkan, surat tidak bisa diubah — hanya dicabut lalu diterbitkan ulang."
      pending={createDraft.isPending || updateDraft.isPending}
      submitLabel={letter ? "Simpan draft" : "Simpan sebagai draft"}
      onSubmit={async () => {
        if (!employeeId) throw new Error("Pilih karyawan.");
        if (!violationTypeId) throw new Error("Pilih jenis pelanggaran.");
        if (above && escalationReason.trim().length < 5)
          throw new Error("Tingkat di atas saran sistem: tulis alasannya.");
        const body = {
          employeeId,
          level,
          violationTypeId,
          incidentDate: incidentDate || null,
          description: description.trim(),
          escalationReason: escalationReason.trim() || null,
          alphaDayIds: type?.linksAttendance ? alphaDayIds : [],
        };
        if (letter) {
          await updateDraft.mutateAsync({ id: letter.id, body });
          toast.success("Draft disimpan.");
        } else {
          const created = await createDraft.mutateAsync(body);
          toast.success("Draft dibuat. Periksa PDF lalu terbitkan.");
          onSaved?.(created);
        }
      }}
    >
      {letter ? (
        <p className="text-sm">
          Karyawan: <span className="font-medium">{letter.employee.fullName}</span>
        </p>
      ) : (
        <EmployeePicker
          active
          selectedId={employeeId}
          onSelect={(next) => {
            setEmployeeId(next);
            setLevelTouched(false);
            setAlphaDayIds([]);
          }}
          title="Karyawan"
          className="h-56"
        />
      )}
      {suggestion.data && suggestion.data.active.length > 0 ? (
        <Notice tone="info">
          Masih berlaku:{" "}
          {suggestion.data.active
            .map(
              (a) =>
                `${WARNING_LEVEL_LABELS[a.level]} ${a.number ?? ""} (s/d ${formatDate(a.effectiveUntil)})`,
            )
            .join(", ")}
          . Saran sistem: <b>{WARNING_LEVEL_LABELS[suggestion.data.suggestedLevel]}</b>.
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label="Tingkat"
          htmlFor={`${id}-level`}
          hint={suggested ? `Saran: ${WARNING_LEVEL_LABELS[suggested]}` : undefined}
        >
          <FormSelect
            id={`${id}-level`}
            value={level}
            onChange={(value) => {
              setLevel(value as WarningLevel);
              setLevelTouched(true);
            }}
            placeholder="Tingkat"
            options={WARNING_LEVELS.map((l) => ({ value: l, label: WARNING_LEVEL_LABELS[l] }))}
          />
        </Field>
        <Field label="Jenis pelanggaran" htmlFor={`${id}-type`}>
          <FormSelect
            id={`${id}-type`}
            value={violationTypeId}
            onChange={setViolationTypeId}
            placeholder="Pilih jenis"
            options={(types.data ?? [])
              .filter((t) => t.isActive || t.id === violationTypeId)
              .map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        <Field label="Tanggal kejadian" htmlFor={`${id}-date`} hint="Opsional.">
          <Input
            id={`${id}-date`}
            type="date"
            max={todayIso()}
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
        </Field>
      </div>
      {above ? (
        <Field
          label="Alasan tingkat di atas saran"
          htmlFor={`${id}-reason`}
          hint="Wajib; tercatat di audit dan hanya terlihat HR."
        >
          <Textarea
            id={`${id}-reason`}
            required
            rows={2}
            maxLength={500}
            value={escalationReason}
            onChange={(e) => setEscalationReason(e.target.value)}
            placeholder="Mis. pelanggaran berat K3 yang membahayakan keselamatan."
          />
        </Field>
      ) : null}
      {level === "SP3" ? (
        <Notice>
          SP 3 adalah peringatan terakhir. Pertimbangkan proses PHK sesuai Peraturan Perusahaan —
          sistem tidak memprosesnya otomatis.
        </Notice>
      ) : null}
      <Field
        label="Uraian / kronologi"
        htmlFor={`${id}-desc`}
        hint="Tercetak di surat. Tulis fakta: apa, kapan, di mana."
      >
        <Textarea
          id={`${id}-desc`}
          required
          rows={5}
          minLength={10}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {type?.linksAttendance && employeeId ? (
        <section className="grid gap-2">
          <Label>Hari ALPHA sebagai bukti (opsional)</Label>
          {alpha.isPending ? (
            <p className="text-muted-foreground text-sm">Memuat hari ALPHA…</p>
          ) : (alpha.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">Karyawan ini tidak punya hari ALPHA.</p>
          ) : (
            <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
              {(alpha.data ?? []).map((d) => (
                <li key={d.dayId}>
                  <label className="flex cursor-pointer items-start gap-3 p-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={alphaDayIds.includes(d.dayId)}
                      onChange={(e) => toggleDay(d.dayId, e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{formatDate(d.workDate)}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {d.statement
                          ? `Pernyataan: ${d.statement.reason}`
                          : "Belum ada surat pernyataan"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </FormDialog>
  );
}

/** ARS-D8/D11: terbitkan — tanggal terbit, nomor otomatis (atau manual), berlaku s/d dari pengaturan. */
export function IssueDialog({
  letter,
  onClose,
}: {
  letter: WarningLetterDetail | null;
  onClose: () => void;
}) {
  const { issue } = useDisciplineMutations();
  const settings = useDisciplineSettings(letter !== null);
  const suggestion = useLevelSuggestion(letter?.employee.employeeId ?? null);
  const [issuedAt, setIssuedAt] = useState(todayIso());
  const [manual, setManual] = useState(false);
  const [number, setNumber] = useState("");
  const id = useId();
  useEffect(() => {
    if (letter) {
      setIssuedAt(todayIso());
      setManual(false);
      setNumber("");
    }
  }, [letter]);
  if (!letter) return null;
  const suggested = suggestion.data?.suggestedLevel ?? null;
  const above = suggested ? isAboveSuggestion(letter.level, suggested) : false;
  return (
    <FormDialog
      open
      onClose={onClose}
      title={`Terbitkan ${WARNING_LEVEL_LABELS[letter.level]} untuk ${letter.employee.fullName}`}
      description={`Surat berlaku sejak tanggal terbit selama ${settings.data?.validityMonths ?? 6} bulan. Karyawan & atasannya menerima notifikasi (email tanpa isi surat).`}
      pending={issue.isPending}
      submitLabel="Terbitkan"
      onSubmit={async () => {
        await issue.mutateAsync({
          id: letter.id,
          body: { issuedAt, number: manual ? number.trim() || null : null },
        });
        toast.success("Surat diterbitkan. Cetak PDF untuk ditandatangani.");
      }}
    >
      {above && !letter.escalationReason ? (
        <Notice>
          Tingkat di atas saran sistem ({suggested ? WARNING_LEVEL_LABELS[suggested] : ""}). Ubah
          draft dan isi alasannya sebelum menerbitkan.
        </Notice>
      ) : null}
      <Field label="Tanggal terbit" htmlFor={`${id}-date`}>
        <Input
          id={`${id}-date`}
          type="date"
          required
          max={todayIso()}
          value={issuedAt}
          onChange={(e) => setIssuedAt(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={manual}
          onChange={(e) => setManual(e.target.checked)}
        />
        Pakai nomor surat manual
      </label>
      {manual ? (
        <Field
          label="Nomor surat"
          htmlFor={`${id}-number`}
          hint="Harus unik. Kosongkan pilihan di atas untuk nomor otomatis per PT per tahun."
        >
          <Input
            id={`${id}-number`}
            required
            maxLength={60}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </Field>
      ) : (
        <p className="text-muted-foreground text-sm">
          Nomor otomatis, mis. <span className="font-mono">007/{letter.level}/HRD-ACP/X/2026</span>.
        </p>
      )}
    </FormDialog>
  );
}

/** ARS-D10: cabut SP berlaku (alasan wajib, diaudit); riwayat tetap tersimpan. */
export function RevokeDialog({
  letter,
  onClose,
}: {
  letter: WarningLetterDetail | null;
  onClose: () => void;
}) {
  const { revoke } = useDisciplineMutations();
  const [reason, setReason] = useState("");
  const id = useId();
  useEffect(() => {
    if (letter) setReason("");
  }, [letter]);
  if (!letter) return null;
  return (
    <FormDialog
      open
      onClose={onClose}
      destructive
      title={`Cabut ${letter.number ?? "surat"}`}
      description="Surat yang dicabut tidak lagi berlaku dan tidak dihitung untuk tingkat berikutnya, tetapi tetap tersimpan sebagai riwayat. Untuk koreksi, buat draft baru lalu terbitkan."
      pending={revoke.isPending}
      submitLabel="Cabut surat"
      onSubmit={async () => {
        await revoke.mutateAsync({ id: letter.id, body: { reason: reason.trim() } });
        toast.success("Surat dicabut.");
      }}
    >
      <Field label="Alasan pencabutan" htmlFor={`${id}-reason`}>
        <Textarea
          id={`${id}-reason`}
          required
          minLength={5}
          maxLength={500}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
