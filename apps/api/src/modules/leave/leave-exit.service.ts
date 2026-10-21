import {
  DAILY_WAGE_DIVISOR,
  type LeaveExitStatus,
  leaveCompensation,
  type OvertimeFormula,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import {
  canSeeLaborCost,
  employeeDirectory,
  exitWageBasis,
  type RequestContext,
} from "../attendance/index.ts";
import * as policy from "./leave.policy.ts";
import * as repository from "./leave.repository.ts";
import { realBalance } from "./leave-engine.ts";

// TM-D9 — hak cuti saat karyawan keluar (alasan apa pun): sisa cuti tahun keluar dibayar uang penggantian
// hak (sisa × upah grade ÷ 25 / ÷ 21), hutang cuti dicatat untuk dipotong payroll akhir. Modul employee
// tidak disentuh: settlement dibuat dari data karyawan nonaktif ber-tanggal keluar (cron leave-daily &
// saat daftar dibuka), dibatalkan otomatis bila karyawan diaktifkan lagi. Rupiah hanya untuk SA / HR
// ber-grant labor.cost.read; snapshot upah & pembagi disimpan saat dihitung.

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

interface ExitCalc {
  gradeId: string | null;
  note: string | null;
  year: number;
  remainingDays: number;
  debtDays: number;
  pendingDays: number;
  formula: "SIX_DAY" | "FIVE_DAY";
  divisor: number;
  monthlyWage: number | null;
  payAmount: number | null;
  debtAmount: number | null;
}

/** Hitung hak cuti keluar dari buku besar (saldo nyata: tahanan pengajuan menunggu tidak dihitung). */
export async function computeExit(
  employee: { id: string; gradeId: string | null },
  exitDate: string,
): Promise<ExitCalc> {
  const year = Number(exitDate.slice(0, 4));
  const rows = await repository.ledgerOf(employee.id, [year - 1, year]);
  const ofYear = (y: number) => rows.filter((r) => r.year === y);
  // Hangus 31 Des selalu terjadi pada/sesudah tanggal keluar → EXPIRE tahun keluar tidak mengurangi hak.
  // Cuti disetujui & cuti bersama yang jatuh SETELAH tanggal keluar tidak dijalani → dikembalikan.
  const refund = await repository.chargesAfter(employee.id, year, toDate(exitDate));
  const current = realBalance(ofYear(year).filter((r) => r.kind !== "EXPIRE")) + refund;
  const previous = realBalance(ofYear(year - 1));
  // Sisa positif tahun lalu sudah hangus (TM-D9) → tidak dibayar; hutang tahun lalu yang belum lunas ikut.
  const remainingDays = Math.max(0, current);
  const debtDays = Math.max(0, -current) + Math.max(0, -previous);
  const pendingDays = -ofYear(year)
    .filter((r) => r.kind === "HOLD" || r.kind === "RELEASE")
    .reduce((t, r) => t + r.days, 0);
  const basis = await exitWageBasis(employee.id, employee.gradeId, exitDate);
  return {
    gradeId: employee.gradeId,
    note: refund > 0 ? `${refund} hari cuti setelah tanggal keluar dikembalikan ke sisa` : null,
    year,
    remainingDays,
    debtDays,
    pendingDays: Math.max(0, pendingDays),
    formula: basis.formula,
    divisor: DAILY_WAGE_DIVISOR[basis.formula],
    monthlyWage: basis.monthlyWage,
    payAmount:
      basis.monthlyWage === null
        ? null
        : leaveCompensation(remainingDays, basis.monthlyWage, 0, basis.formula),
    debtAmount:
      basis.monthlyWage === null
        ? null
        : leaveCompensation(debtDays, basis.monthlyWage, 0, basis.formula),
  };
}

/**
 * Buat settlement OPEN untuk karyawan keluar yang belum punya (per tanggal keluar), batalkan settlement
 * OPEN milik karyawan yang sudah aktif lagi. Idempoten. `companyIds` membatasi cakupan.
 */
export async function syncExitSettlements(
  companyIds?: string[],
): Promise<{ created: number; cancelled: number }> {
  const exited = await employeeDirectory.exitedEmployees(companyIds);
  const existing = await repository.activeExitSettlements(companyIds);
  const has = new Set(existing.map((s) => `${s.employeeId}|${toIso(s.exitDate)}`));
  // Sudah diproses payroll untuk tahun keluar yang sama → tanggal keluar dikoreksi tidak membuat bayar ganda.
  const paid = new Set(
    existing.filter((s) => s.status === "PAID").map((s) => `${s.employeeId}|${s.year}`),
  );
  let created = 0;
  for (const employee of exited) {
    const exitDate = toIso(employee.endDate);
    if (has.has(`${employee.id}|${exitDate}`)) continue;
    if (paid.has(`${employee.id}|${exitDate.slice(0, 4)}`)) continue;
    const calc = await computeExit(employee, exitDate);
    await repository.createExitSettlement({
      employeeId: employee.id,
      companyId: employee.companyId,
      exitDate: toDate(exitDate),
      ...calc,
    });
    created++;
  }
  // Karyawan yang diaktifkan lagi (atau tanggal keluarnya berubah) → settlement OPEN lama dibatalkan.
  // Diputuskan dari status karyawan langsung (bukan dari daftar keluar yang bisa terpotong).
  const open = existing.filter((s) => s.status === "OPEN");
  const status = await employeeDirectory.exitStatusOf(open.map((s) => s.employeeId));
  const stale = open.filter((s) => {
    const now = status.get(s.employeeId);
    return !now || now.isActive || !now.endDate || toIso(now.endDate) !== toIso(s.exitDate);
  });
  if (stale.length > 0) {
    await repository.cancelOpenExitSettlements(
      stale.map((s) => s.id),
      "Karyawan aktif lagi / tanggal keluar berubah",
    );
  }
  return { created, cancelled: stale.length };
}

export interface ExitSettlementView {
  id: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  companyId: string;
  exitDate: string;
  exitReason: string | null;
  year: number;
  remainingDays: number;
  debtDays: number;
  pendingDays: number;
  formula: OvertimeFormula;
  divisor: number;
  status: LeaveExitStatus;
  note: string | null;
  decidedAt: string | null;
  /** Rupiah hanya untuk SA / HR ber-grant labor.cost.read (null = tersembunyi atau upah grade kosong). */
  dailyWage: number | null;
  payAmount: number | null;
  debtAmount: number | null;
  wageMissing: boolean;
}

function scopeOf(ctx: RequestContext, companyId?: string): string[] | undefined {
  const actor = ctx.actor;
  if (actor.role === "SUPER_ADMIN") return companyId ? [companyId] : undefined;
  if (actor.role === "HR_ADMIN") {
    const scope = [...(actor.companyIds ?? [])];
    if (companyId && !scope.includes(companyId)) throw new ForbiddenError();
    return companyId ? [companyId] : scope;
  }
  throw new ForbiddenError();
}

export async function listExitSettlements(
  ctx: RequestContext,
  companyId?: string,
): Promise<ExitSettlementView[]> {
  const scope = scopeOf(ctx, companyId);
  await syncExitSettlements(scope);
  const rows = await repository.listExitSettlementRows(scope);
  const [people, exited] = await Promise.all([
    employeeDirectory.employeesByIds(rows.map((r) => r.employeeId)),
    employeeDirectory.exitedEmployees(scope),
  ]);
  const reasonOf = new Map(exited.map((e) => [e.id, e.exitReason]));
  const showPay = canSeeLaborCost(ctx.actor);
  return rows.map((r) => {
    const person = people.get(r.employeeId);
    const monthly = r.monthlyWage === null ? null : Number(r.monthlyWage);
    return {
      id: r.id,
      employee: {
        id: r.employeeId,
        fullName: person?.fullName ?? "—",
        employeeNumber: person?.employeeNumber ?? null,
      },
      companyId: r.companyId,
      exitDate: toIso(r.exitDate),
      exitReason: reasonOf.get(r.employeeId) ?? null,
      year: r.year,
      remainingDays: r.remainingDays,
      debtDays: r.debtDays,
      pendingDays: r.pendingDays,
      formula: r.formula as OvertimeFormula,
      divisor: r.divisor,
      status: r.status,
      note: r.note,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      dailyWage: showPay && monthly !== null ? Math.round(monthly / r.divisor) : null,
      payAmount: showPay && r.payAmount !== null ? Number(r.payAmount) : null,
      debtAmount: showPay && r.debtAmount !== null ? Number(r.debtAmount) : null,
      wageMissing: monthly === null,
    };
  });
}

async function viewOf(ctx: RequestContext, companyId: string, id: string) {
  const view = (await listExitSettlements(ctx, companyId)).find((r) => r.id === id);
  if (!view) throw new NotFoundError();
  return view;
}

async function findForManage(ctx: RequestContext, id: string) {
  const row = await repository.findExitSettlement(id);
  if (!row || !policy.canManageBalances(ctx.actor, row.companyId)) throw new NotFoundError();
  return row;
}

/** Hitung ulang settlement OPEN (mis. upah grade baru diisi / penyesuaian saldo). */
export async function recalculateExitSettlement(ctx: RequestContext, id: string) {
  const row = await findForManage(ctx, id);
  if (row.status !== "OPEN")
    throw new BusinessRuleError("Hanya yang belum diproses yang bisa dihitung ulang.");
  const people = await employeeDirectory.employeesByIds([row.employeeId]);
  const calc = await computeExit(
    { id: row.employeeId, gradeId: people.get(row.employeeId)?.gradeId ?? null },
    toIso(row.exitDate),
  );
  await repository.updateExitSettlement(id, calc);
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "leave.exit.recalculate",
    entityType: "leave.exit_settlement",
    entityId: id,
    before: { remainingDays: row.remainingDays, debtDays: row.debtDays },
    after: { remainingDays: calc.remainingDays, debtDays: calc.debtDays },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return viewOf(ctx, row.companyId, id);
}

/** Tandai sudah diproses di payroll akhir (dibayar / dipotong). */
export async function markExitSettlementPaid(ctx: RequestContext, id: string, note?: string) {
  const row = await findForManage(ctx, id);
  if (row.status !== "OPEN")
    throw new BusinessRuleError("Settlement ini sudah diproses atau dibatalkan.");
  await repository.updateExitSettlement(id, {
    status: "PAID",
    note: note?.trim() || null,
    decidedByAccountId: ctx.actor.accountId,
    decidedAt: new Date(),
  });
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "leave.exit.paid",
    entityType: "leave.exit_settlement",
    entityId: id,
    before: { status: row.status },
    after: { status: "PAID", note: note ?? null },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return viewOf(ctx, row.companyId, id);
}
