import { zodResolver } from "@hookform/resolvers/zod";
import {
  ATTENDANCE_EXPORT_MAX_DAYS,
  type AttendanceExportInput,
  attendanceExportDays,
  attendanceExportInputSchema,
} from "@hris/shared";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { useCrews, useExportAttendanceDays } from "../api";

// TM-D31: dialog "Export Excel" (Detail per crew) & "Flash" (5 kolom) di Data Absen Harian.
// Pembatasan akses & rentang tetap dijaga API; di sini hanya kemudahan pakai.

export type AttendanceExportKind = AttendanceExportInput["kind"];

interface FormValues {
  from: string;
  to: string;
  crewMode: "ALL" | "PICK";
  crewIds: string[];
  includeNoCrew: boolean;
}

/** Bentuk isi form menjadi badan permintaan (tanpa `companyId` bila tidak ada PT terpilih). */
function toBody(
  kind: AttendanceExportKind,
  v: FormValues,
  companyId: string | undefined,
): AttendanceExportInput {
  const scope = companyId ? { companyId } : {};
  if (kind === "FLASH") return { kind, from: v.from, to: v.to, ...scope };
  return {
    kind,
    from: v.from,
    to: v.to,
    ...scope,
    ...(v.crewMode === "PICK" ? { crewIds: v.crewIds } : {}),
    includeNoCrew: v.includeNoCrew,
  };
}

const formSchema = (kind: AttendanceExportKind, companyId: string | undefined) =>
  z
    .object({
      from: z.string().min(1, "Tanggal awal wajib diisi."),
      to: z.string().min(1, "Tanggal akhir wajib diisi."),
      crewMode: z.enum(["ALL", "PICK"]),
      crewIds: z.array(z.string()),
      includeNoCrew: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (!v.from || !v.to) return;
      if (kind === "DETAIL" && v.crewMode === "PICK" && v.crewIds.length === 0)
        ctx.addIssue({ code: "custom", path: ["crewIds"], message: "Pilih minimal satu crew." });
      // Aturan rentang & bentuk body = skema bersama dengan API (TM-D31).
      const parsed = attendanceExportInputSchema.safeParse(toBody(kind, v, companyId));
      if (!parsed.success)
        for (const issue of parsed.error.issues)
          if (issue.path[0] === "from" || issue.path[0] === "to")
            ctx.addIssue({ code: "custom", path: [issue.path[0]], message: issue.message });
    });

const COPY = {
  DETAIL: {
    title: "Export Excel data absen",
    description:
      "Unduh detail absen per hari, dikelompokkan per crew (satu sheet per crew, plus ringkasan).",
    submit: "Unduh Excel",
  },
  FLASH: {
    title: "Flash",
    description: "Unduh cepat: Nama, Tanggal, Clock In, Clock Out, Status.",
    submit: "Unduh Flash",
  },
} as const;

export function AttendanceExportDialog({
  kind,
  from,
  to,
  companyId,
  onClose,
}: {
  kind: AttendanceExportKind;
  /** Rentang halaman saat dialog dibuka (nilai awal). */
  from: string;
  to: string;
  /** PT terpilih di bilah atas; kosong = semua PT yang boleh diakses. */
  companyId: string | undefined;
  onClose: () => void;
}) {
  const copy = COPY[kind];
  const exporter = useExportAttendanceDays();
  const schema = useMemo(() => formSchema(kind, companyId), [kind, companyId]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { from, to, crewMode: "ALL", crewIds: [], includeNoCrew: true },
  });
  const { register, watch, setValue, handleSubmit, formState } = form;
  const [vFrom, vTo, crewMode, crewIds] = watch(["from", "to", "crewMode", "crewIds"]);
  const crews = useCrews(kind === "DETAIL" ? companyId : undefined);
  const days = vFrom && vTo && vFrom <= vTo ? attendanceExportDays(vFrom, vTo) : null;

  // Ganti mode crew → "tanpa crew" kembali ke bawaan mode itu (semua = ikut, pilih = tidak).
  const setMode = (mode: "ALL" | "PICK") => {
    setValue("crewMode", mode, { shouldValidate: true });
    setValue("includeNoCrew", mode === "ALL");
    if (mode === "ALL") setValue("crewIds", [], { shouldValidate: true });
  };
  const toggleCrew = (id: string) =>
    setValue("crewIds", crewIds.includes(id) ? crewIds.filter((c) => c !== id) : [...crewIds, id], {
      shouldValidate: true,
    });

  useEffect(() => {
    form.trigger();
  }, [form]);

  const onSubmit = handleSubmit((values) =>
    exporter.mutate(toBody(kind, values, companyId), {
      onSuccess: (data) => {
        toast.success(`${data.rows} baris absen berhasil diekspor.`);
        onClose();
      },
    }),
  );

  const errorText = !exporter.isError
    ? null
    : exporter.error instanceof ApiError && exporter.error.status === 403
      ? "Anda tidak berhak mengekspor data absen ini."
      : errorMessage(exporter.error);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DateRangePicker
            idPrefix="export"
            value={{ from: vFrom, to: vTo }}
            maxDays={ATTENDANCE_EXPORT_MAX_DAYS}
            invalid={Boolean(formState.errors.from || formState.errors.to)}
            onChange={(r) => {
              setValue("from", r.from, { shouldValidate: true, shouldDirty: true });
              setValue("to", r.to, { shouldValidate: true, shouldDirty: true });
            }}
          />
          <p
            className={
              formState.errors.from || formState.errors.to
                ? "text-destructive text-xs"
                : "text-muted-foreground text-xs"
            }
            role={formState.errors.from || formState.errors.to ? "alert" : undefined}
          >
            {formState.errors.from?.message ??
              formState.errors.to?.message ??
              `Maks. ${ATTENDANCE_EXPORT_MAX_DAYS} hari${days ? ` (dipilih ${days} hari)` : ""}.`}
          </p>

          {kind === "DETAIL" ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Crew</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="crew-mode"
                  className="accent-brand size-4"
                  checked={crewMode === "ALL"}
                  onChange={() => setMode("ALL")}
                />
                Semua crew
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="crew-mode"
                  className="accent-brand size-4"
                  checked={crewMode === "PICK"}
                  disabled={!companyId}
                  onChange={() => setMode("PICK")}
                />
                Pilih crew tertentu
              </label>
              {!companyId ? (
                <p className="text-muted-foreground text-xs">
                  Pilih PT di bilah atas untuk memilih crew tertentu.
                </p>
              ) : null}
              {crewMode === "PICK" ? (
                crews.isPending ? (
                  <Skeleton className="h-16 w-full" />
                ) : crews.isError ? (
                  <p className="text-destructive text-xs" role="alert">
                    Daftar crew gagal dimuat.
                  </p>
                ) : (crews.data ?? []).length === 0 ? (
                  <p className="text-muted-foreground text-xs">Belum ada crew di PT ini.</p>
                ) : (
                  <fieldset className="max-h-40 min-w-0 space-y-1 overflow-y-auto rounded-md border p-2">
                    <legend className="sr-only">Daftar crew</legend>
                    {(crews.data ?? []).map((crew) => (
                      <label key={crew.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="accent-brand size-4"
                          checked={crewIds.includes(crew.id)}
                          onChange={() => toggleCrew(crew.id)}
                        />
                        {crew.name}
                      </label>
                    ))}
                  </fieldset>
                )
              ) : null}
              {formState.errors.crewIds ? (
                <p className="text-destructive text-xs" role="alert">
                  {formState.errors.crewIds.message}
                </p>
              ) : null}
              <label className="flex items-center gap-2 pt-1 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand size-4"
                  {...register("includeNoCrew")}
                />
                Sertakan karyawan tanpa crew
              </label>
            </fieldset>
          ) : null}

          {errorText ? (
            <p className="text-destructive text-sm" role="alert">
              {errorText}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={!formState.isValid || exporter.isPending}>
              {exporter.isPending ? "Menyiapkan…" : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
