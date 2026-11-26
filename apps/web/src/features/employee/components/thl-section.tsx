import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DailyWageInput,
  dailyWageInputSchema,
  THL_STATUS_LABELS,
  type ThlStatus,
} from "@hris/shared";
import { useState } from "react";
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

export function ThlSection({ employeeId, thl }: { employeeId: string; thl: ThlDetails }) {
  const [editing, setEditing] = useState(false);
  const { evaluation } = thl;
  return (
    <section aria-label="Harian Lepas (THL)" className="space-y-3 rounded-lg border p-4 text-sm">
      <h4 className="font-semibold">Harian Lepas (THL)</h4>
      <ThlStatusBadge status={evaluation.status} />
      {evaluation.status === "REQUIRED" ? (
        <p className="text-destructive">
          PP 35/2021 Ps. 10: ≥ 21 hari hadir 3 bulan berturut-turut
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {["Bulan", "Hari hadir", "Menunggu persetujuan"].map((label) => (
                <th key={label} className="p-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evaluation.months.map((month) => (
              <tr key={month.month} className="border-t">
                <td className="p-2">{formatThlMonth(month.month)}</td>
                <td className="p-2">
                  {month.presentDays}{" "}
                  {month.qualifies ? <Badge variant="warning">≥ 21</Badge> : null}
                </td>
                <td className="p-2">
                  {month.pendingDays > 0 ? `${month.pendingDays} menunggu persetujuan` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground">
        Bulan berjalan ({formatThlMonth(evaluation.currentMonth.month)}):{" "}
        {evaluation.currentMonth.presentDays} hari hadir
        {evaluation.currentMonth.pendingDays > 0
          ? ` · ${evaluation.currentMonth.pendingDays} menunggu persetujuan`
          : ""}
        . Belum masuk evaluasi.
      </p>
      {thl.access.wage ? (
        <div className="space-y-3 border-t pt-3">
          <p>
            Upah harian: <strong>{formatThlWage(thl.dailyWage?.amount)}</strong>
            {thl.dailyWage
              ? ` · Berlaku sejak ${formatDate(thl.dailyWage.effectiveFrom)}`
              : " · Belum diisi"}
          </p>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Ubah upah harian
          </Button>
          {thl.wageHistory?.length ? (
            <details>
              <summary className="cursor-pointer">Riwayat upah harian</summary>
              <ul className="space-y-2 pt-2">
                {thl.wageHistory.map((wage) => (
                  <li key={wage.id}>
                    {formatDate(wage.effectiveFrom)} · {formatThlWage(wage.amount)} · {wage.note}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {editing ? (
            <DailyWageDialog
              employeeId={employeeId}
              amount={thl.dailyWage?.amount}
              onClose={() => setEditing(false)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DailyWageDialog({
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
