import { zodResolver } from "@hookform/resolvers/zod";
import { type DailyWageInput, dailyWageInputSchema, type ThlStatus, thlStreak } from "@hris/shared";
import { Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSetDailyWage } from "../api";
import type { ThlDetails } from "../contract-schemas";
import { todayIso } from "../labels";

export const formatThlWage = (value: number | null | undefined) =>
  value == null
    ? "—"
    : `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}`;
export const formatThlMonth = (month: string) =>
  new Intl.DateTimeFormat("id-ID", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${month}-01T00:00:00Z`));

const STATUS_CHIP: Record<ThlStatus, { label: string; className: string }> = {
  REQUIRED: {
    label: "Wajib diangkat PKWTT",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
  },
  APPROACHING: {
    label: "Mendekati batas",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  NONE: { label: "", className: "bg-muted text-muted-foreground" },
};

/** Chip status kartu THL (2026-11-26, "setuju kartu THL"): status + n/3 bulan, warna sama dengan tabel. */
export function ThlStreakChip({ thl }: { thl: ThlDetails }) {
  const { status, months } = thl.evaluation;
  const chip = STATUS_CHIP[status];
  const streak = `${thlStreak(months)}/3 bulan`;
  return (
    <span
      data-status={status}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        chip.className,
      )}
    >
      {chip.label ? `${chip.label} · ${streak}` : streak}
    </span>
  );
}

const BOX_TONE: Record<ThlStatus, string> = {
  REQUIRED: "border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/40",
  APPROACHING: "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/40",
  NONE: "border-green-300 bg-green-50/60 dark:border-green-800 dark:bg-green-950/40",
};
const CHECK_TONE: Record<ThlStatus, string> = {
  REQUIRED: "text-red-600",
  APPROACHING: "text-amber-600",
  NONE: "text-green-600",
};

function MonthBox({
  month,
  presentDays,
  pendingDays,
  beforeJoin,
  current,
  qualifies,
  status,
}: {
  month: string;
  presentDays: number;
  pendingDays: number;
  beforeJoin: boolean;
  current?: boolean;
  qualifies?: boolean;
  status: ThlStatus;
}) {
  return (
    <li
      aria-label={`${formatThlMonth(month)}${current ? " (berjalan)" : ""}: ${
        beforeJoin ? "sebelum tanggal masuk" : `${presentDays} hari hadir`
      }`}
      className={cn(
        "relative flex min-w-0 flex-col items-center rounded-lg border px-1 py-2 text-center sm:py-3",
        current ? "border-dashed" : qualifies ? BOX_TONE[status] : "bg-card",
      )}
    >
      {qualifies ? (
        <Check
          aria-hidden
          className={cn("absolute top-1 right-1 hidden size-4 sm:block", CHECK_TONE[status])}
        />
      ) : null}
      <span className="text-muted-foreground text-[11px] whitespace-nowrap sm:text-xs">
        {formatThlMonth(month)}
      </span>
      <span
        className={cn(
          "mt-0.5 text-xl leading-tight font-semibold tabular-nums sm:text-2xl",
          (beforeJoin || current) && "text-muted-foreground",
        )}
      >
        {beforeJoin ? "–" : presentDays}
      </span>
      <span className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px] whitespace-nowrap sm:text-xs">
        {/* HP: ✓ di baris ini supaya tidak menimpa label bulan. */}
        {qualifies ? (
          <Check aria-hidden className={cn("size-3 sm:hidden", CHECK_TONE[status])} />
        ) : null}
        {current ? "berjalan" : beforeJoin ? "belum masuk" : "hari"}
      </span>
      {!beforeJoin && pendingDays > 0 ? (
        <span className="mt-0.5 text-[10px] font-medium whitespace-nowrap text-amber-700 sm:text-[11px] dark:text-amber-400">
          +{pendingDays} tunggu
        </span>
      ) : null}
    </li>
  );
}

/** Deret 4 kotak: 3 bulan penuh (dinilai) + bulan berjalan (garis putus-putus, tidak dinilai). */
export function ThlAttendanceBoxes({ thl, joinDate }: { thl: ThlDetails; joinDate: string }) {
  const { status, months, currentMonth } = thl.evaluation;
  const joinMonth = joinDate.slice(0, 7);
  return (
    <section aria-label="Kehadiran" className="space-y-2">
      <h4 className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        Kehadiran
      </h4>
      <ol className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {months.map((m) => (
          <MonthBox
            key={m.month}
            {...m}
            beforeJoin={m.month < joinMonth}
            qualifies={m.qualifies && m.month >= joinMonth}
            status={status}
          />
        ))}
        <MonthBox
          {...currentMonth}
          beforeJoin={currentMonth.month < joinMonth}
          current
          status={status}
        />
      </ol>
    </section>
  );
}

/** Upah harian + tautan riwayat (popover); hanya dirender bila `thl.access.wage` (KTR-D13). */
export function ThlWageInfo({ thl }: { thl: ThlDetails }) {
  return (
    <>
      <p className="mt-1 text-base font-semibold">{formatThlWage(thl.dailyWage?.amount)}</p>
      <p className="text-muted-foreground text-xs">
        {thl.dailyWage ? `sejak ${formatDate(thl.dailyWage.effectiveFrom)}` : "Belum diisi"}
        {thl.wageHistory?.length ? (
          <>
            {" · "}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="text-brand font-medium hover:underline">
                  Riwayat →
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 text-sm">
                <p className="mb-2 font-semibold">Riwayat upah harian</p>
                <ul className="space-y-2">
                  {thl.wageHistory.map((wage) => (
                    <li key={wage.id}>
                      <span className="font-medium tabular-nums">{formatThlWage(wage.amount)}</span>{" "}
                      <span className="text-muted-foreground">
                        · sejak {formatDate(wage.effectiveFrom)}
                      </span>
                      <p className="text-muted-foreground text-xs">{wage.note}</p>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          </>
        ) : null}
      </p>
    </>
  );
}

export function DailyWageDialog({
  employeeId,
  amount,
  onClose,
}: {
  employeeId: string;
  amount: number | undefined;
  onClose: () => void;
}) {
  const mutation = useSetDailyWage(employeeId);
  const form = useForm<DailyWageInput>({
    resolver: zodResolver(dailyWageInputSchema),
    mode: "onChange",
    defaultValues: { amount: amount ?? 0, effectiveFrom: todayIso(), note: "" },
  });
  const values = form.watch();
  const valid = dailyWageInputSchema.safeParse(values).success;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah upah harian</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (body) => {
            try {
              await mutation.mutateAsync(body);
              onClose();
            } catch {
              /* Error API ditampilkan di formulir. */
            }
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="daily-wage-amount">Upah harian (Rp)</Label>
            <Input
              id="daily-wage-amount"
              type="number"
              min="0.01"
              step="0.01"
              {...form.register("amount", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="daily-wage-date">Tanggal berlaku</Label>
            <Input id="daily-wage-date" type="date" {...form.register("effectiveFrom")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="daily-wage-note">Alasan perubahan (wajib)</Label>
            <Textarea id="daily-wage-note" maxLength={300} {...form.register("note")} />
          </div>
          {!valid ? (
            <p className="text-muted-foreground text-sm">
              Isi nominal positif (maksimal Rp 100.000.000), tanggal berlaku, dan alasan perubahan.
            </p>
          ) : null}
          {mutation.isError ? (
            <p role="alert" className="text-destructive">
              {errorMessage(mutation.error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={!valid || mutation.isPending}>
              Simpan upah harian
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
