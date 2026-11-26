import {
  type DailyWageInput,
  evaluateThlAttendance,
  shiftThlMonth,
  type ThlAttendanceMonth,
  thlCurrentMonth,
} from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ValidationError } from "../../core/errors.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { canAccessDailyWageInCompany } from "./contract.policy.ts";
import * as repository from "./daily-wage.repository.ts";

type AttendanceCounter = (input: {
  employeeIds: string[];
  fromMonth: string;
  toMonth: string;
}) => Promise<Map<string, ThlAttendanceMonth[]>>;
let countAttendanceByMonth: AttendanceCounter;
/** Wired by app.ts: attendance already depends on employee, so avoid a module cycle. */
export function registerThlAttendanceCounter(counter: AttendanceCounter) {
  countAttendanceByMonth = counter;
}

export async function evaluateThlEmployees(employeeIds: string[], now = new Date()) {
  const month = thlCurrentMonth(now);
  const counts = await countAttendanceByMonth({
    employeeIds,
    fromMonth: shiftThlMonth(month, -3),
    toMonth: month,
  });
  return new Map(employeeIds.map((id) => [id, evaluateThlAttendance(counts.get(id) ?? [], now)]));
}
export async function dailyWageHistory(employeeIds: string[], tx?: Prisma.TransactionClient) {
  return repository.listDailyWages(employeeIds, tx);
}
export async function readThl(
  employee: { id: string; companyId: string; category: string | null; isActive?: boolean },
  actor: Actor | null,
  now = new Date(),
  tx?: Prisma.TransactionClient,
) {
  if (employee.category !== "DAILY_WORKER") return null;
  const wage = actor !== null && canAccessDailyWageInCompany(actor, employee.companyId);
  const [evaluations, history] = await Promise.all([
    evaluateThlEmployees([employee.id], now),
    wage ? repository.listDailyWages([employee.id], tx) : [],
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const current = history.find((r) => r.effectiveFrom.toISOString().slice(0, 10) <= today);
  const evaluation = evaluations.get(employee.id) ?? evaluateThlAttendance([], now);
  // Inactive THL retain attendance history but no actionable evaluation.
  if (employee.isActive === false) {
    evaluation.status = "NONE";
    evaluation.label = "Belum mencapai batas";
  }
  return {
    evaluation,
    dailyWage: current
      ? {
          amount: current.amount.toNumber(),
          effectiveFrom: current.effectiveFrom.toISOString().slice(0, 10),
        }
      : null,
    ...(wage
      ? {
          wageHistory: history.map((r) => ({
            id: r.id,
            amount: r.amount.toNumber(),
            effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
            note: r.note,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
        }
      : {}),
    access: { wage },
  };
}
export async function setDailyWage(
  employee: {
    id: string;
    companyId: string;
    category: string | null;
    isActive: boolean;
    joinDate: Date;
  },
  input: DailyWageInput,
  audit: { actorAccountId: string; requestId: string | null; ip: string | null },
  source: "api" | "import",
  tx: Prisma.TransactionClient,
) {
  if (employee.category !== "DAILY_WORKER" || !employee.isActive)
    throw new BusinessRuleError("Upah harian hanya untuk THL aktif.");
  if (input.effectiveFrom < employee.joinDate.toISOString().slice(0, 10))
    throw new ValidationError([
      { path: "effectiveFrom", message: "Tanggal berlaku tidak boleh sebelum tanggal masuk." },
    ]);
  await repository.upsertDailyWage(
    {
      employeeId: employee.id,
      companyId: employee.companyId,
      amount: new Prisma.Decimal(input.amount),
      effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
      note: input.note,
      createdBy: audit.actorAccountId,
    },
    tx,
  );
  await writeAudit(
    {
      ...audit,
      action: "contract.daily_wage.set",
      entityType: "daily_wage",
      entityId: employee.id,
      after: { effectiveFrom: input.effectiveFrom, source },
    },
    tx,
  );
}
