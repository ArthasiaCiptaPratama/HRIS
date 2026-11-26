import { zodResolver } from "@hookform/resolvers/zod";
import {
  ATTENDANCE_EXPORT_MAX_DAYS,
  type AttendanceExportColumnGroup,
  type AttendanceExportInput,
  type AttendanceExportStatus,
  attendanceExportDays,
  attendanceExportInputSchema,
} from "@hris/shared";
import { useEffect, useMemo, useState } from "react";
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
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { useCrews, useExportAttendanceDays } from "../api";
import type { PickedEmployee } from "./attendance-export-people-picker";
import {
  ALL_STATUSES,
  ColumnGroupsSection,
  DEFAULT_GROUPS,
  type EmployeeMode,
  EmployeeSection,
  type PageFilters,
  pageStatuses,
  RowFilterSection,
} from "./attendance-export-sections";

// TM-D31: dialog "Export Excel" (Detail per crew) & "Flash" (5 kolom) di Data Absen Harian.
// Pembatasan akses & rentang tetap dijaga API; di sini hanya kemudahan pakai.

export type AttendanceExportKind = AttendanceExportInput["kind"];

interface FormValues {
  from: string;
  to: string;
  employeeMode: EmployeeMode;
  crewMode: "ALL" | "PICK";
  crewIds: string[];
  includeNoCrew: boolean;
}

/** TM-D34: pilihan Detail di luar rentang & crew (kelompok kolom, filter baris, karyawan). */
interface DetailExtras {
  employees: PickedEmployee[];
  /** Filter halaman (mode "Sesuai filter halaman ini"). */
  q: string;
  groups: AttendanceExportColumnGroup[];
  statuses: AttendanceExportStatus[];
  labeledOnly: boolean;
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Bentuk isi form menjadi badan permintaan (tanpa `companyId` bila tidak ada PT terpilih). Nilai bawaan
 * (kelompok kolom bawaan, semua status, tidak hanya berlabel) tidak dikirim.
 */
function toBody(
  kind: AttendanceExportKind,
  v: FormValues,
  companyId: string | undefined,
  extras?: DetailExtras,
): AttendanceExportInput {
  const scope = companyId ? { companyId } : {};
  if (kind === "FLASH") return { kind, from: v.from, to: v.to, ...scope };
  const who =
    v.employeeMode === "EMPLOYEES"
      ? { employeeIds: (extras?.employees ?? []).map((e) => e.id) }
      : v.employeeMode === "PAGE_FILTER"
        ? { q: extras?.q ?? "" }
        : {
            ...(v.crewMode === "PICK" ? { crewIds: v.crewIds } : {}),
            includeNoCrew: v.includeNoCrew,
          };
  return {
    kind,
    from: v.from,
    to: v.to,
    ...scope,
    ...who,
    ...(extras && !sameSet(extras.groups, DEFAULT_GROUPS) ? { columnGroups: extras.groups } : {}),
    ...(extras && !sameSet(extras.statuses, ALL_STATUSES) ? { statuses: extras.statuses } : {}),
    ...(extras?.labeledOnly ? { labeledOnly: true } : {}),
  };
}

const formSchema = (kind: AttendanceExportKind, companyId: string | undefined) =>
  z
    .object({
      from: z.string().min(1, "Tanggal awal wajib diisi."),
      to: z.string().min(1, "Tanggal akhir wajib diisi."),
      employeeMode: z.enum(["CREW", "EMPLOYEES", "PAGE_FILTER"]),
      crewMode: z.enum(["ALL", "PICK"]),
      crewIds: z.array(z.string()),
      includeNoCrew: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (!v.from || !v.to) return;
      if (
        kind === "DETAIL" &&
        v.employeeMode === "CREW" &&
        v.crewMode === "PICK" &&
        v.crewIds.length === 0
      )
        ctx.addIssue({ code: "custom", path: ["crewIds"], message: "Pilih minimal satu crew." });
      // Aturan rentang = skema bersama dengan API; hanya galat from/to yang ditampilkan di sini
      // (pilihan karyawan/kolom/status divalidasi terpisah di dialog).
      const parsed = attendanceExportInputSchema.safeParse(
        toBody(kind, { ...v, employeeMode: "CREW" }, companyId),
      );
      if (!parsed.success)
        for (const issue of parsed.error.issues)
          if (issue.path[0] === "from" || issue.path[0] === "to")
            ctx.addIssue({ code: "custom", path: [issue.path[0]], message: issue.message });
    });

const COPY = {
  DETAIL: {
    title: "Export Excel data absen",
    description: "Pilih rentang tanggal, karyawan, kolom, dan baris untuk file Excel.",
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
  pageFilters,
  onClose,
}: {
  kind: AttendanceExportKind;
  /** Rentang halaman saat dialog dibuka (nilai awal). */
  from: string;
  to: string;
  /** PT terpilih di bilah atas; kosong = semua PT yang boleh diakses. */
  companyId: string | undefined;
  /** Filter halaman saat dialog dibuka (untuk mode "Sesuai filter halaman ini"). */
  pageFilters: PageFilters;
  onClose: () => void;
}) {
  const copy = COPY[kind];
  const exporter = useExportAttendanceDays();
  const schema = useMemo(() => formSchema(kind, companyId), [kind, companyId]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      from,
      to,
      employeeMode: "CREW",
      crewMode: "ALL",
      crewIds: [],
      includeNoCrew: true,
    },
  });
  // Diambil sekali saat dialog dibuka: halaman di belakang dialog tidak mengubah pilihan.
  const [filters] = useState(pageFilters);
  const [employees, setEmployees] = useState<PickedEmployee[]>([]);
  const [groups, setGroups] = useState<AttendanceExportColumnGroup[]>([...DEFAULT_GROUPS]);
  const [statuses, setStatuses] = useState<AttendanceExportStatus[]>([...ALL_STATUSES]);
  const [labeledOnly, setLabeledOnly] = useState(false);
  const { watch, setValue, handleSubmit, formState } = form;
  const [vFrom, vTo, employeeMode, crewMode, crewIds, includeNoCrew] = watch([
    "from",
    "to",
    "employeeMode",
    "crewMode",
    "crewIds",
    "includeNoCrew",
  ]);
  const crews = useCrews(kind === "DETAIL" ? companyId : undefined);
  const days = vFrom && vTo && vFrom <= vTo ? attendanceExportDays(vFrom, vTo) : null;

  // Ganti mode crew → "tanpa crew" kembali ke bawaan mode itu (semua = ikut, pilih = tidak).
  const setMode = (mode: "ALL" | "PICK") => {
    setValue("crewMode", mode, { shouldValidate: true });
    setValue("includeNoCrew", mode === "ALL");
    if (mode === "ALL") setValue("crewIds", [], { shouldValidate: true });
  };
  const setEmployeeMode = (mode: EmployeeMode) => {
    setValue("employeeMode", mode, { shouldValidate: true });
    // Sesuai filter halaman: status & berlabel terisi dari halaman (masih bisa diubah).
    if (mode === "PAGE_FILTER") {
      setStatuses(pageStatuses(filters));
      setLabeledOnly(filters.labeledOnly);
    }
  };
  const toggleCrew = (id: string) =>
    setValue("crewIds", crewIds.includes(id) ? crewIds.filter((c) => c !== id) : [...crewIds, id], {
      shouldValidate: true,
    });

  useEffect(() => {
    form.trigger();
  }, [form]);

  const extras: DetailExtras = { employees, q: filters.q, groups, statuses, labeledOnly };
  const detailOk =
    kind !== "DETAIL" ||
    (statuses.length > 0 && (employeeMode !== "EMPLOYEES" || employees.length > 0));

  const onSubmit = handleSubmit((values) =>
    exporter.mutate(toBody(kind, values, companyId, extras), {
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
      <DialogContent
        className={kind === "DETAIL" ? "max-h-[90dvh] overflow-y-auto sm:max-w-xl" : "sm:max-w-md"}
      >
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
            <fieldset disabled={exporter.isPending} className="space-y-4">
              <legend className="sr-only">Pilihan export</legend>
              <EmployeeSection
                mode={employeeMode}
                onMode={setEmployeeMode}
                disabledCrewPick={!companyId}
                crewMode={crewMode}
                onCrewMode={setMode}
                crews={{ isPending: crews.isPending, isError: crews.isError, data: crews.data }}
                crewIds={crewIds}
                onToggleCrew={toggleCrew}
                includeNoCrew={includeNoCrew}
                onIncludeNoCrew={(value) => setValue("includeNoCrew", value)}
                crewError={formState.errors.crewIds?.message}
                companyId={companyId}
                employees={employees}
                onEmployees={setEmployees}
                pageFilters={filters}
              />
              <ColumnGroupsSection groups={groups} onChange={setGroups} />
              <RowFilterSection
                statuses={statuses}
                onStatuses={setStatuses}
                labeledOnly={labeledOnly}
                onLabeledOnly={setLabeledOnly}
                prefilled={employeeMode === "PAGE_FILTER"}
              />
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
            <Button type="submit" disabled={!formState.isValid || !detailOk || exporter.isPending}>
              {exporter.isPending ? "Menyiapkan…" : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
