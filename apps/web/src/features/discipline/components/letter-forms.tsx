import {
  isAboveSuggestion,
  WARNING_LEVEL_LABELS,
  WARNING_LEVELS,
  type WarningLevel,
} from "@hris/shared";
import { Loader2, TriangleAlert, X } from "lucide-react";
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
import {
  EmployeePicker,
  type PickerEmployee,
} from "@/features/employee/components/employee-picker";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useAlphaCandidates,
  useDisciplineMutations,
  useDisciplineSettings,
  useLevelSuggestion,
  useLevelSuggestions,
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
    <div className="grid content-start gap-2">
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
      <DialogContent
        className={cn(
          "flex max-h-[min(90dvh,860px)] flex-col gap-0 overflow-hidden p-0",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        {/* Judul & tombol tetap terlihat; hanya isi yang di-scroll (temuan 2026-10-19). */}
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b px-6 pt-6 pr-12 pb-4">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
            {children}
          </div>
          <DialogFooter className="border-t px-6 py-4">
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

type Picked = Pick<PickerEmployee, "id" | "fullName" | "employeeNumber">;
type LevelChoice = WarningLevel | "AUTO";

/**
 * Buat (letter = null) atau ubah draft SP. Saran tingkat dari SP yang masih berlaku (ARS-D10); tingkat
 * di atas saran wajib beralasan; hari ALPHA hanya untuk jenis mangkir (ARS-D12). Saat membuat, bisa
 * memilih banyak karyawan sekaligus (ARS-D20): satu draft per karyawan, tingkat bawaan = saran sistem
 * per karyawan, bukti hari ALPHA ditautkan per draft lewat Ubah draft.
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
  const { createDraft, createDrafts, updateDraft } = useDisciplineMutations();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [level, setLevel] = useState<LevelChoice>("SP1");
  const [levelTouched, setLevelTouched] = useState(false);
  const [violationTypeId, setViolationTypeId] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [description, setDescription] = useState("");
  const [escalationReason, setEscalationReason] = useState("");
  const [alphaDayIds, setAlphaDayIds] = useState<string[]>([]);
  const id = useId();
  const multi = !letter && picked.length > 1;
  const employeeId = letter
    ? letter.employee.employeeId
    : picked.length === 1
      ? (picked[0]?.id ?? null)
      : null;
  const suggestion = useLevelSuggestion(open ? employeeId : null);
  const suggestions = useLevelSuggestions(open && multi ? picked.map((p) => p.id) : []);
  const type = types.data?.find((t) => t.id === violationTypeId);
  const alpha = useAlphaCandidates(employeeId, open && Boolean(type?.linksAttendance));

  useEffect(() => {
    if (!open) return;
    setPicked(
      letter
        ? [
            {
              id: letter.employee.employeeId,
              fullName: letter.employee.fullName,
              employeeNumber: letter.employee.employeeNumber,
            },
          ]
        : [],
    );
    setLevel(letter?.level ?? "SP1");
    setLevelTouched(Boolean(letter));
    setViolationTypeId(letter?.violationType.id ?? "");
    setIncidentDate(letter?.incidentDate ?? "");
    setDescription(letter?.description ?? "");
    setEscalationReason(letter?.escalationReason ?? "");
    setAlphaDayIds(letter?.alphaDays.map((d) => d.attendanceDayId) ?? []);
  }, [open, letter]);

  // Tingkat mengikuti saran sistem sampai pengguna memilih sendiri (banyak karyawan: "Ikuti saran").
  const suggested = suggestion.data?.suggestedLevel ?? null;
  useEffect(() => {
    if (levelTouched) return;
    if (multi) setLevel("AUTO");
    else if (suggested) setLevel(suggested);
    else setLevel((prev) => (prev === "AUTO" ? "SP1" : prev));
  }, [suggested, levelTouched, multi]);

  // Karyawan yang tingkat pilihannya di atas saran sistem → alasan wajib.
  const aboveNames =
    level === "AUTO"
      ? []
      : multi
        ? picked
            .filter((p) => {
              const s = suggestions.byId.get(p.id)?.suggestedLevel;
              return s ? isAboveSuggestion(level, s) : false;
            })
            .map((p) => p.fullName)
        : suggested && isAboveSuggestion(level, suggested)
          ? [picked[0]?.fullName ?? letter?.employee.fullName ?? ""]
          : [];
  const above = aboveNames.length > 0;

  const toggleDay = (dayId: string, on: boolean) =>
    setAlphaDayIds((prev) => (on ? [...prev, dayId] : prev.filter((d) => d !== dayId)));
  const togglePerson = (row: Picked) => {
    setPicked((prev) =>
      prev.some((p) => p.id === row.id) ? prev.filter((p) => p.id !== row.id) : [...prev, row],
    );
    setLevelTouched(false);
    setAlphaDayIds([]);
  };

  const levelOptions = [
    ...(multi ? [{ value: "AUTO", label: "Ikuti saran sistem" }] : []),
    ...WARNING_LEVELS.map((l) => ({ value: l, label: WARNING_LEVEL_LABELS[l] })),
  ];
  const pending = createDraft.isPending || createDrafts.isPending || updateDraft.isPending;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      wide
      title={letter ? "Ubah draft surat peringatan" : "Buat surat peringatan"}
      description="Draft bisa diubah atau dihapus kapan saja. Setelah diterbitkan, surat tidak bisa diubah — hanya dicabut lalu diterbitkan ulang."
      pending={pending}
      submitLabel={
        letter ? "Simpan draft" : multi ? `Simpan ${picked.length} draft` : "Simpan sebagai draft"
      }
      onSubmit={async () => {
        if (picked.length === 0) throw new Error("Pilih karyawan.");
        if (!violationTypeId) throw new Error("Pilih jenis pelanggaran.");
        if (!incidentDate) throw new Error("Isi tanggal kejadian.");
        if (above && escalationReason.trim().length < 5)
          throw new Error("Tingkat di atas saran sistem: tulis alasannya.");
        const common = {
          violationTypeId,
          incidentDate,
          description: description.trim(),
          escalationReason: above ? escalationReason.trim() : null,
        };
        if (multi) {
          const created = await createDrafts.mutateAsync({
            ...common,
            employeeIds: picked.map((p) => p.id),
            level,
          });
          toast.success(
            `${created.length} draft dibuat. Periksa PDF lalu terbitkan satu per satu.`,
          );
          return;
        }
        const body = {
          ...common,
          employeeId: picked[0]?.id ?? letter?.employee.employeeId,
          level: level === "AUTO" ? (suggested ?? "SP1") : level,
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
        <section className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label>Karyawan</Label>
            <span className="text-muted-foreground text-xs">
              {picked.length === 0
                ? "Centang satu atau beberapa karyawan."
                : `${picked.length} dipilih · satu draft per karyawan`}
            </span>
          </div>
          {picked.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Karyawan terpilih">
              {picked.map((p) => (
                <li
                  key={p.id}
                  className="bg-brand-soft text-brand-soft-foreground flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs"
                >
                  <span className="truncate font-medium">{p.fullName}</span>
                  <button
                    type="button"
                    onClick={() => togglePerson(p)}
                    className="hover:bg-background/60 rounded-full p-0.5"
                    aria-label={`Batalkan ${p.fullName}`}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
              {picked.length > 1 ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked([]);
                      setLevelTouched(false);
                    }}
                    className="text-muted-foreground hover:text-foreground px-1.5 py-0.5 text-xs underline-offset-2 hover:underline"
                  >
                    Hapus semua
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
          <EmployeePicker
            active
            multiple
            selectedId={null}
            selectedIds={picked.map((p) => p.id)}
            onSelect={(_, row) => togglePerson(row)}
            title="Daftar karyawan"
            className="h-64 min-h-0"
          />
        </section>
      )}
      {!multi && suggestion.data && suggestion.data.active.length > 0 ? (
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
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
        <Field label="Tingkat" htmlFor={`${id}-level`}>
          <FormSelect
            id={`${id}-level`}
            value={level}
            onChange={(value) => {
              setLevel(value as LevelChoice);
              setLevelTouched(true);
            }}
            placeholder="Tingkat"
            options={levelOptions}
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
        <Field label="Tanggal kejadian" htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            type="date"
            required
            max={todayIso()}
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
        </Field>
      </div>
      {!multi && suggested ? (
        <p className="text-muted-foreground -mt-2 text-xs">
          Saran sistem untuk karyawan ini: {WARNING_LEVEL_LABELS[suggested]}.
        </p>
      ) : null}
      {multi && level === "AUTO" ? (
        <p className="text-muted-foreground -mt-2 text-xs">
          Tingkat tiap karyawan mengikuti SP yang masih berlaku
          {suggestions.pending
            ? "…"
            : `: ${picked
                .map((p) => {
                  const s = suggestions.byId.get(p.id)?.suggestedLevel;
                  return `${p.fullName} ${s ? WARNING_LEVEL_LABELS[s] : "SP 1"}`;
                })
                .join(", ")}.`}
        </p>
      ) : null}
      {above ? (
        <Field
          label="Alasan tingkat di atas saran"
          htmlFor={`${id}-reason`}
          hint={
            multi
              ? `Wajib untuk: ${aboveNames.join(", ")}. Tercatat di audit dan hanya terlihat HR.`
              : "Wajib; tercatat di audit dan hanya terlihat HR."
          }
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
        hint={
          multi
            ? "Tercetak sama di setiap surat. Tulis fakta: apa, kapan, di mana."
            : "Tercetak di surat. Tulis fakta: apa, kapan, di mana."
        }
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
      {type?.linksAttendance && multi ? (
        <Notice tone="info">
          Bukti hari ALPHA berbeda per karyawan — tautkan lewat <b>Ubah draft</b> pada tiap draft
          setelah disimpan.
        </Notice>
      ) : null}
      {type?.linksAttendance && employeeId && !multi ? (
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
