import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DailyWageInput,
  dailyWageInputSchema,
  THL_STATUS_LABELS,
  type ThlStatus,
} from "@hris/shared";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
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

export function ThlStatusBadge({ status }: { status: ThlStatus }) {
  return (
    <Badge
      variant={
        status === "REQUIRED" ? "destructive" : status === "APPROACHING" ? "warning" : "muted"
      }
    >
      {THL_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Isi sel "Hari hadir 3 bulan terakhir" di kartu Status kepegawaian (Opsi A, 2026-11-26). */
export function ThlAttendanceStat({ thl }: { thl: ThlDetails }) {
  const { evaluation } = thl;
  return (
    <>
      <ul className="mt-1 space-y-0.5 text-sm">
        {evaluation.months.map((month) => (
          <li key={month.month} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-muted-foreground w-16 shrink-0 text-xs">
              {formatThlMonth(month.month)}
            </span>
            <span className="font-semibold tabular-nums">{month.presentDays}</span>
            <span className="text-muted-foreground text-xs">hari</span>
            {month.qualifies ? <Badge variant="warning">≥ 21</Badge> : null}
            {month.pendingDays > 0 ? (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                {month.pendingDays} menunggu persetujuan
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1 text-xs">
        Bulan berjalan ({formatThlMonth(evaluation.currentMonth.month)}):{" "}
        {evaluation.currentMonth.presentDays} hari hadir
        {evaluation.currentMonth.pendingDays > 0
          ? ` · ${evaluation.currentMonth.pendingDays} menunggu persetujuan`
          : ""}
        . Belum masuk evaluasi.
      </p>
    </>
  );
}

/** Isi sel "Upah harian" (hanya bila `thl.access.wage`, KTR-D13). */
export function ThlWageStat({ thl }: { thl: ThlDetails }) {
  return (
    <>
      <p className="mt-1 text-base font-semibold">{formatThlWage(thl.dailyWage?.amount)}</p>
      <p className="text-muted-foreground text-xs">
        {thl.dailyWage ? `berlaku sejak ${formatDate(thl.dailyWage.effectiveFrom)}` : "Belum diisi"}
      </p>
      {thl.wageHistory?.length ? (
        <details className="mt-1 text-xs">
          <summary className="text-muted-foreground cursor-pointer">Riwayat upah harian</summary>
          <ul className="space-y-1 pt-1">
            {thl.wageHistory.map((wage) => (
              <li key={wage.id}>
                {formatDate(wage.effectiveFrom)} · {formatThlWage(wage.amount)} · {wage.note}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
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
