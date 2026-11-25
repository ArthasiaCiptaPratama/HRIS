import { zodResolver } from "@hookform/resolvers/zod";
import {
  addContractDays,
  type CreateContractInput,
  createContractInputSchema,
  type PromoteEmployeeInput,
  promoteEmployeeInputSchema,
} from "@hris/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { useContractAction } from "../api";
import type { EmployeeContracts, EmploymentContract } from "../contract-schemas";
import { todayIso } from "../labels";
import { ContractPeriodFields, defaultContractEnd, validatePeriod } from "./contract-period-fields";

export type ContractDialogAction = "create" | "extend" | "promote" | "fail" | "end";
export const CONTRACT_ACTION_LABELS = {
  create: "Isi tahap kontrak",
  extend: "Perpanjang kontrak",
  promote: "Angkat ke PKWTT",
  fail: "Tidak lulus",
  end: "Akhiri kontrak",
};

export function EmploymentContractDialog({
  employeeId,
  action,
  data,
  active,
  firstStart,
  onClose,
}: {
  employeeId: string;
  action: ContractDialogAction;
  data: EmployeeContracts;
  active: EmploymentContract | undefined;
  firstStart: string | undefined;
  onClose: () => void;
}) {
  const mutation = useContractAction(employeeId);
  const period = action === "create" || action === "extend";
  const destructive = action === "fail" || action === "end";
  const [confirmed, setConfirmed] = useState(false);
  const start = action === "extend" && active ? addContractDays(active.endDate, 1) : data.joinDate;
  const sequence = action === "extend" ? (active?.sequence ?? 0) + 1 : 1;
  const kind = data.category === "PROBATION" ? "PROBATION" : "PKWT";
  const form = useForm<CreateContractInput>({
    resolver: zodResolver(createContractInputSchema),
    mode: "onChange",
    defaultValues: {
      kind,
      ...(kind === "PKWT" ? { sequence } : {}),
      startDate: start,
      endDate: defaultContractEnd(start, kind, sequence),
      note: "",
    },
  });
  const decision = useForm<PromoteEmployeeInput>({
    resolver: zodResolver(promoteEmployeeInputSchema),
    mode: "onChange",
    defaultValues: { effectiveDate: todayIso(), note: "" },
  });
  const values = form.watch();
  const decisionValues = decision.watch();
  const validation = validatePeriod(
    values,
    action === "extend" && active
      ? {
          endDate: active.endDate,
          sequence: active.sequence,
          firstPkwtStart: firstStart ?? active.startDate,
        }
      : null,
  );
  if (values.startDate < data.joinDate)
    validation.errors.push("Mulai kontrak tidak boleh sebelum tanggal masuk.");
  const valid = period
    ? createContractInputSchema.safeParse(values).success && !validation.errors.length
    : promoteEmployeeInputSchema.safeParse(decisionValues).success && (!destructive || confirmed);
  const title =
    action === "promote" && data.category === "PROBATION"
      ? "Lulus → Permanen"
      : CONTRACT_ACTION_LABELS[action];
  async function save() {
    if (!valid || ((action === "extend" || action === "end") && !active)) return;
    try {
      const result = await mutation.mutateAsync(
        action === "create"
          ? {
              action,
              body: {
                ...values,
                ...(values.kind === "PROBATION"
                  ? { sequence: undefined, firstPkwtStartDate: undefined }
                  : (values.sequence ?? 1) === 1
                    ? { firstPkwtStartDate: undefined }
                    : {}),
              },
            }
          : action === "extend" && active
            ? {
                action,
                contractId: active.id,
                body: { startDate: values.startDate, endDate: values.endDate, note: values.note },
              }
            : action === "end" && active
              ? { action, contractId: active.id, body: decisionValues }
              : { action: action === "fail" ? "fail" : "promote", body: decisionValues },
      );
      toast.success("Perubahan kontrak disimpan.");
      for (const warning of result.warnings) toast.warning(warning);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void (period ? form.handleSubmit(save) : decision.handleSubmit(save))();
          }}
        >
          {period ? (
            <ContractPeriodFields form={form} fixedSequence={action === "extend"} />
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="contract-effective">Tanggal efektif</Label>
              <Input
                id="contract-effective"
                type="date"
                required
                min={data.joinDate}
                max={todayIso()}
                {...decision.register("effectiveDate")}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="contract-note">Catatan (opsional)</Label>
            <Textarea
              id="contract-note"
              maxLength={500}
              {...(period ? form.register("note") : decision.register("note"))}
            />
          </div>
          {period ? (
            <>
              {validation.errors.map((message) => (
                <p role="alert" className="text-destructive text-sm" key={message}>
                  {message}
                </p>
              ))}
              {validation.warnings.map((message) => (
                <p className="text-amber-700 text-sm" key={message}>
                  {message}
                </p>
              ))}
            </>
          ) : null}
          {destructive ? (
            <div className="space-y-3 rounded-md border border-destructive p-3 text-sm">
              <p>
                Karyawan dinonaktifkan dan akun login ikut nonaktif. Data karyawan tetap diarsip.
              </p>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Saya yakin menonaktifkan karyawan ini
              </label>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "brand"}
              disabled={!valid || mutation.isPending}
            >
              {mutation.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
