import type { ImportFieldKey } from "@hris/shared";
import { ForbiddenError, NotFoundError } from "../../core/errors.ts";
import { canAccessDailyWageInCompany, dailyWageHistory, setDailyWage } from "../contract/index.ts";
import type { MasterLookup } from "../organization/index.ts";
import type { EmployeeTx } from "./employee.repository.ts";
import * as repository from "./employee.repository.ts";
import type { RequestContext } from "./employee.service.ts";
import type { ContractRowPlan } from "./employee-import-contracts.ts";

export interface DailyWagePlan {
  action: "SET" | "KEEP";
  amount: number;
  effectiveFrom: string;
  joinDate: string;
}
type RowPlan = ContractRowPlan & { dailyWage?: DailyWagePlan };
const iso = (date: Date) => date.toISOString().slice(0, 10);

export async function planImportDailyWages(
  ctx: RequestContext,
  plans: RowPlan[],
  lookup: MasterLookup,
  mode: "CREATE_ONLY" | "UPSERT" | "FILL_EMPTY",
  today: string,
) {
  const untouched = new Set(["EXISTS_SKIPPED", "EXISTING_OUT_OF_SCOPE", "ONBOARDING_IN_PROGRESS"]);
  const candidates = plans.filter(
    (p) =>
      p.action !== "ERROR" &&
      !p.issues.some((i) => untouched.has(i.code)) &&
      p.row.contract.dailyWage !== undefined,
  );
  const allowed = candidates.filter((p) =>
    canAccessDailyWageInCompany(ctx.actor, {
      companyId: p.companyId ?? p.existing?.companyId ?? "",
      employeeId: p.existing?.id ?? null,
    }),
  );
  const history = await dailyWageHistory([
    ...new Set(allowed.flatMap((p) => p.existing?.id ?? [])),
  ]);
  const byEmployee = new Map<string, typeof history>();
  for (const wage of history) {
    const rows = byEmployee.get(wage.employeeId) ?? [];
    rows.push(wage);
    byEmployee.set(wage.employeeId, rows);
  }
  for (const plan of candidates) {
    const warn = (code: string) =>
      plan.issues.push({ field: "dailyWage", code, severity: "WARNING" });
    const { existing, row } = plan;
    const category = lookup.statuses.get(
      existing && !plan.changes.includes("employmentStatusText")
        ? existing.employmentStatusId
        : (plan.statusId ?? ""),
    )?.category;
    if (
      category !== "DAILY_WORKER" ||
      (existing ? !existing.isActive : Boolean(row.exit)) ||
      plan.deactivate
    ) {
      warn("DAILY_WAGE_IGNORED");
      continue;
    }
    if (!allowed.includes(plan)) {
      warn("DAILY_WAGE_NO_PERMISSION");
      continue;
    }
    if (existing && mode === "CREATE_ONLY") continue;
    const amount = row.contract.dailyWage;
    if (amount === undefined) continue;
    const wages = existing ? (byEmployee.get(existing.id) ?? []) : [];
    const current = wages.find((w) => iso(w.effectiveFrom) <= today);
    const joinDate =
      existing && !plan.changes.includes("joinDate") ? iso(existing.joinDate) : row.joinDate;
    if (!joinDate) continue;
    if (mode === "FILL_EMPTY" && wages.length > 0) {
      plan.dailyWage = { action: "KEEP", amount, effectiveFrom: today, joinDate };
      plan.kept = [...new Set<ImportFieldKey>([...(plan.kept ?? []), "dailyWage"])];
      continue;
    }
    if (current?.amount.equals(amount)) continue;
    const effectiveFrom = existing ? today : joinDate;
    if (effectiveFrom < joinDate) {
      plan.issues.push({ field: "dailyWage", code: "DAILY_WAGE_BEFORE_JOIN", severity: "ERROR" });
      plan.action = "ERROR";
      continue;
    }
    plan.dailyWage = { action: "SET", amount, effectiveFrom, joinDate };
    plan.changes = [...new Set<ImportFieldKey>([...plan.changes, "dailyWage"])];
    if (existing && plan.action === "SKIP") plan.action = "UPDATE";
  }
  return history.map(
    (w) => `daily-wage:${w.id}:${w.updatedAt.toISOString()}:${w.amount.toString()}`,
  );
}

export async function writeImportDailyWage(
  tx: EmployeeTx,
  ctx: RequestContext,
  employee: { id: string; companyId: string },
  plan: DailyWagePlan,
  lookup: MasterLookup,
) {
  if (plan.action === "KEEP") return;
  await repository.lockEmployee(tx, employee.id);
  const current = await repository.findEmployee(employee.id, tx);
  if (!current) throw new NotFoundError("Karyawan tidak ditemukan.");
  if (
    !canAccessDailyWageInCompany(ctx.actor, {
      companyId: current.companyId,
      employeeId: current.id,
    })
  )
    throw new ForbiddenError();
  await setDailyWage(
    {
      ...current,
      category: lookup.statuses.get(current.employmentStatusId)?.category ?? null,
    },
    { amount: plan.amount, effectiveFrom: plan.effectiveFrom, note: "Import data karyawan" },
    { actorAccountId: ctx.actor.accountId, requestId: ctx.requestId ?? null, ip: ctx.ip ?? null },
    "import",
    tx,
  );
}
