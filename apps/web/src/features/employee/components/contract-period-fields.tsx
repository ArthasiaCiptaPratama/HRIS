import {
  addContractDays,
  type CreateContractInput,
  createContractInputSchema,
  validateContractStage,
} from "@hris/shared";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function defaultContractEnd(start: string, kind: CreateContractInput["kind"], sequence = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
  const date = new Date(`${start}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + (kind === "PROBATION" ? 3 : sequence === 1 ? 24 : 12));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return addContractDays(date.toISOString().slice(0, 10), -1);
}

export function validatePeriod(
  values: CreateContractInput,
  previous: Parameters<typeof validateContractStage>[0]["previous"] = null,
) {
  if (!createContractInputSchema.pick({ startDate: true, endDate: true }).safeParse(values).success)
    return { errors: ["Tanggal kontrak tidak valid."], warnings: [] as string[] };
  const sequence = values.kind === "PKWT" ? (values.sequence ?? 1) : null;
  const result = validateContractStage({
    ...values,
    sequence,
    previous:
      previous ??
      (values.kind === "PKWT" && sequence !== null && sequence > 1 && values.firstPkwtStartDate
        ? {
            endDate: addContractDays(values.startDate, -1),
            sequence: sequence - 1,
            firstPkwtStart: values.firstPkwtStartDate,
          }
        : null),
  });
  if (
    !previous &&
    values.kind === "PKWT" &&
    sequence !== null &&
    sequence > 1 &&
    !values.firstPkwtStartDate
  )
    result.errors.push("Mulai PKWT 1 wajib diisi untuk tahap 2/3.");
  return result;
}

export function ContractPeriodFields({
  form,
  fixedSequence = false,
  id = "contract",
  autoEnd = true,
  showFirstPkwt,
}: {
  form: UseFormReturn<CreateContractInput>;
  fixedSequence?: boolean;
  id?: string;
  /** false = mengubah Mulai tidak menghitung ulang Akhir (koreksi data, KTR-D12). */
  autoEnd?: boolean;
  /** Paksa tampil/sembunyi isian Mulai PKWT 1 (koreksi tahap lama tanpa riwayat). */
  showFirstPkwt?: boolean;
}) {
  const values = form.watch();
  function updateEnd(start: string, sequence = values.sequence ?? 1) {
    if (!autoEnd) return;
    form.setValue("endDate", defaultContractEnd(start, values.kind, sequence), {
      shouldValidate: true,
    });
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-sequence`}>Tahap</Label>
        {values.kind === "PKWT" ? (
          <select
            id={`${id}-sequence`}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            disabled={fixedSequence}
            {...form.register("sequence", {
              valueAsNumber: true,
              onChange: (e) => updateEnd(values.startDate, Number(e.target.value)),
            })}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                PKWT {n}
              </option>
            ))}
          </select>
        ) : (
          <p>Masa Percobaan</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-start`}>Mulai kontrak</Label>
        <Input
          id={`${id}-start`}
          type="date"
          required
          {...form.register("startDate", { onChange: (e) => updateEnd(e.target.value) })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-end`}>Akhir kontrak</Label>
        <Input id={`${id}-end`} type="date" required {...form.register("endDate")} />
      </div>
      {(showFirstPkwt ??
      (!fixedSequence && values.kind === "PKWT" && (values.sequence ?? 1) > 1)) ? (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-first`}>Mulai PKWT 1</Label>
          <Input id={`${id}-first`} type="date" required {...form.register("firstPkwtStartDate")} />
        </div>
      ) : null}
    </div>
  );
}
