import {
  type BreakLocationsInput,
  computeOvertimeDay,
  formatMinutes,
  formulaForPattern,
  type GradeWageInput,
  hourlyWage,
  OVERTIME_WEEK_LIMIT_MIN,
  type OvertimeDayResult,
  type OvertimeDayType,
  type OvertimeFlag,
  type OvertimeFormula,
  type OvertimeStatus,
  overtimePay,
} from "@hris/shared";
import { z } from "zod";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import {
  type ApprovalView,
  cancelApprovalRequest,
  createApprovalRequest,
  getApprovalViews,
  listActionable,
  registerApprovalGuard,
  registerApprovalHandler,
} from "../approval/index.ts";
import * as policy from "./attendance.policy.ts";
import { type RequestContext, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as repository from "./overtime.repository.ts";
import { isoAddDays } from "./roster-engine.ts";
import { dateLabel, notifyEmployees } from "./time-notify.service.ts";

// TM-D6 lembur (usulan otomatis dari absen vs jadwal → Atasan + HR), upah grade & rupiah; TM-D7 lokasi
// wajib absen istirahat. Perhitungan murni ada di @hris/shared `computeOvertimeDay`.

type Tx = repository.Tx;
const BREAK_KEY = "breakLocations";
/** Label hari dari lembur rutin & istirahat (dihitung ulang setiap sinkron). */
const DERIVED_LABELS = ["BREAK_OVER", "NO_BREAK_PUNCH", "REGULAR_OT_SHORT"];

async function audit(
  ctx: RequestContext,
  action: string,
  entityType: string,
  entityId: string | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action,
    entityType,
    entityId,
    before,
    after,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
}

// ── TM-D7: lokasi wajib absen istirahat ────────────────────────────────────────

export async function readBreakLocationIds(tx?: Tx): Promise<string[]> {
  const row = await repository.findSetting(BREAK_KEY, tx);
  const parsed = z
    .object({ workLocationIds: z.array(z.string()) })
    .safeParse(row?.value ?? { workLocationIds: [] });
  return parsed.success ? parsed.data.workLocationIds : [];
}

export async function isBreakRequired(workLocationId: string | null, tx?: Tx) {
  if (!workLocationId) return false;
  return (await readBreakLocationIds(tx)).includes(workLocationId);
}

export interface BreakLocationsView {
  locations: { id: string; name: string; city: string | null; required: boolean }[];
}

export async function getBreakLocations(ctx: RequestContext): Promise<BreakLocationsView> {
  if (!policy.canManageBreakLocations(ctx.actor)) throw new ForbiddenError();
  const [ids, locations] = await Promise.all([readBreakLocationIds(), directory.activeLocations()]);
  const required = new Set(ids);
  return {
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      city: l.city,
      required: required.has(l.id),
    })),
  };
}

export async function setBreakLocations(
  ctx: RequestContext,
  input: BreakLocationsInput,
): Promise<BreakLocationsView> {
  if (!policy.canManageBreakLocations(ctx.actor)) throw new ForbiddenError();
  const ids = [...new Set(input.workLocationIds)];
  const found = await directory.locationsByIds(ids);
  if (found.size !== ids.length)
    throw new BusinessRuleError("Ada lokasi kerja yang tidak ditemukan.");
  const before = await readBreakLocationIds();
  await repository.upsertSetting(BREAK_KEY, { workLocationIds: ids }, ctx.actor.accountId);
  await audit(
    ctx,
    "attendance.break_locations.set",
    "attendance.time_settings",
    null,
    { workLocationIds: before },
    { workLocationIds: ids },
  );
  return getBreakLocations(ctx);
}

// ── TM-D6: upah grade ──────────────────────────────────────────────────────────

export interface GradeWageView {
  gradeId: string;
  gradeName: string;
  basePay: number | null;
  fixedAllowance: number | null;
  /** Upah sejam = (pokok + tunjangan tetap) ÷ 173. */
  hourly: number | null;
  updatedAt: string | null;
}

export async function listGradeWages(ctx: RequestContext): Promise<GradeWageView[]> {
  if (!policy.canSeeLaborCost(ctx.actor)) throw new ForbiddenError();
  const [grades, wages] = await Promise.all([
    directory.activeGrades(),
    repository.listGradeWageRows(),
  ]);
  const byGrade = new Map(wages.map((w) => [w.gradeId, w]));
  return grades.map((g) => {
    const w = byGrade.get(g.id);
    const basePay = w ? Number(w.basePay) : null;
    const fixedAllowance = w ? Number(w.fixedAllowance) : null;
    return {
      gradeId: g.id,
      gradeName: g.name,
      basePay,
      fixedAllowance,
      hourly: basePay === null ? null : hourlyWage(basePay, fixedAllowance ?? 0),
      updatedAt: w?.updatedAt.toISOString() ?? null,
    };
  });
}

export async function setGradeWage(
  ctx: RequestContext,
  gradeId: string,
  input: GradeWageInput,
): Promise<GradeWageView> {
  if (!policy.canManageGradeWages(ctx.actor)) throw new ForbiddenError();
  const grade = (await directory.activeGrades()).find((g) => g.id === gradeId);
  if (!grade) throw new NotFoundError("Grade tidak ditemukan.");
  const before = await repository.findGradeWage(gradeId);
  await repository.upsertGradeWage(gradeId, input, ctx.actor.accountId);
  await audit(
    ctx,
    "attendance.grade_wage.set",
    "attendance.grade_wage",
    gradeId,
    before
      ? { basePay: Number(before.basePay), fixedAllowance: Number(before.fixedAllowance) }
      : null,
    { ...input },
  );
  return (await listGradeWages(ctx)).find((g) => g.gradeId === gradeId) as GradeWageView;
}

export async function wagesOfGrades(gradeIds: (string | null)[]) {
  const ids = [...new Set(gradeIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map<string, { basePay: number; fixedAllowance: number }>();
  const rows = await repository.gradeWagesByIds(ids);
  return new Map(
    rows.map((r) => [
      r.gradeId,
      { basePay: Number(r.basePay), fixedAllowance: Number(r.fixedAllowance) },
    ]),
  );
}

/**
 * TM-D9 dasar uang penggantian hak cuti saat keluar (tanpa aktor; gerbang rupiah di pemanggil):
 * upah grade (pokok + tunjangan tetap) & rumus pola — pola crew pada hari roster terakhir s.d. `date`;
 * tanpa roster/crew → pola 5 hari (÷21), konsisten dengan hitungan hari cuti staf tanpa roster.
 */
export async function exitWageBasis(
  employeeId: string,
  gradeId: string | null,
  date: string,
): Promise<{ formula: OvertimeFormula; monthlyWage: number | null }> {
  const [roster, wage] = await Promise.all([
    repository.lastCrewDay(employeeId, toDate(date)),
    gradeId ? repository.findGradeWage(gradeId) : Promise.resolve(null),
  ]);
  const crew = roster?.crewId ? await repository.crewWithPattern(roster.crewId) : null;
  return {
    formula: crew ? formulaForPattern(crew.pattern.steps) : "FIVE_DAY",
    monthlyWage: wage ? Number(wage.basePay) + Number(wage.fixedAllowance) : null,
  };
}

// ── Perhitungan per hari (batch) ───────────────────────────────────────────────

type DayWithPunches = Prisma.AttendanceDayGetPayload<{ include: { punches: true } }>;

export interface CalcContext {
  shifts: Map<
    string,
    {
      lateToleranceMin: number;
      breakMin: number;
      breakPaid: boolean;
      regularOvertimeMin: number;
    }
  >;
  holidays: Set<string>;
  formulas: Map<string, OvertimeFormula>;
  breakLocations: Set<string>;
  /** TM-D17: perintah lembur per `employeeId|YYYY-MM-DD`. */
  orders: Map<string, { startsAt: Date | null; endsAt: Date | null }>;
}

/** Muat shift, tanggal merah, pola crew, & lokasi wajib istirahat untuk sekumpulan hari sekaligus. */
export async function loadCalcContext(
  tx: Tx | undefined,
  days: DayWithPunches[],
): Promise<CalcContext> {
  const shiftIds = [...new Set(days.map((d) => d.shiftId).filter((x): x is string => !!x))];
  const dates = days.map((d) => toIso(d.workDate)).sort();
  const [shifts, holidays, rosterDays, breakIds, orders] = await Promise.all([
    shiftIds.length ? repository.shiftsByIds(shiftIds, tx) : Promise.resolve([]),
    dates.length
      ? repository.nationalHolidays(
          { gte: toDate(dates[0] as string), lte: toDate(dates.at(-1) as string) },
          tx,
        )
      : Promise.resolve([]),
    days.length
      ? repository.crewDaysOf(
          days.map((d) => ({ employeeId: d.employeeId, workDate: d.workDate })),
          tx,
        )
      : Promise.resolve([]),
    readBreakLocationIds(tx),
    repository.ordersOf(
      days.map((d) => ({ employeeId: d.employeeId, workDate: d.workDate })),
      tx,
    ),
  ]);
  const crewIds = [...new Set(rosterDays.map((r) => r.crewId as string))];
  const crews = crewIds.length ? await repository.crewsWithPattern(crewIds, tx) : [];
  const crewFormula = new Map(crews.map((c) => [c.id, formulaForPattern(c.pattern.steps)]));
  return {
    shifts: new Map(shifts.map((s) => [s.id, s])),
    holidays: new Set(holidays.map((h) => toIso(h.date))),
    formulas: new Map(
      rosterDays.map((r) => [
        `${r.employeeId}|${toIso(r.workDate)}`,
        crewFormula.get(r.crewId as string) ?? "SIX_DAY",
      ]),
    ),
    breakLocations: new Set(breakIds),
    orders: new Map(orders.map((o) => [`${o.employeeId}|${toIso(o.workDate)}`, o])),
  };
}

/**
 * TM-D17: lembur hanya diakui di dalam rentang perintah lembur. Hari terjadwal: datang awal dibatasi
 * "mulai lebih awal" SPL (tanpa SPL = jam masuk), pulang lewat dibatasi "selesai lebih lambat" (tanpa SPL =
 * jam pulang); telat & pulang cepat tetap riil. Tanpa jadwal (hari OFF): hanya di dalam rentang SPL;
 * tanpa SPL tidak ada jam yang diakui.
 */
export function clampToOrder(
  checkIn: number,
  checkOut: number,
  schedule: { start: number; end: number } | null,
  order: { startsAt: Date | null; endsAt: Date | null } | null,
): { checkIn: number; checkOut: number } {
  if (schedule) {
    const from = order?.startsAt?.getTime() ?? schedule.start;
    const to = order?.endsAt?.getTime() ?? schedule.end;
    const inAt = Math.max(checkIn, Math.min(from, schedule.start));
    const outAt = Math.min(checkOut, Math.max(to, schedule.end));
    return { checkIn: inAt, checkOut: Math.max(inAt, outAt) };
  }
  if (!order?.startsAt || !order.endsAt) return { checkIn, checkOut: checkIn };
  const inAt = Math.max(checkIn, order.startsAt.getTime());
  const outAt = Math.min(checkOut, order.endsAt.getTime());
  return { checkIn: inAt, checkOut: Math.max(inAt, outAt) };
}

export interface DayCalc {
  dayType: OvertimeDayType;
  formula: OvertimeFormula;
  result: OvertimeDayResult;
}

/** Lembur satu hari (null = belum lengkap / tidak dihitung: tanpa Clock Out, ditolak, Alpha, cuti). */
export function calcDay(ctx: CalcContext, day: DayWithPunches): DayCalc | null {
  if (day.status === "ALPHA" || day.status === "LEAVE" || day.status === "REJECTED") return null;
  const inP = day.punches.find((p) => p.kind === "IN");
  const outP = day.punches.find((p) => p.kind === "OUT");
  if (!inP || !outP || inP.status === "REJECTED" || outP.status === "REJECTED") return null;
  const date = toIso(day.workDate);
  const shift = day.shiftId ? ctx.shifts.get(day.shiftId) : undefined;
  const scheduled = shift && day.scheduledStart && day.scheduledEnd;
  const dayType: OvertimeDayType = ctx.holidays.has(date)
    ? "HOLIDAY"
    : scheduled
      ? "WORKDAY"
      : "OFF_DAY";
  const formula = ctx.formulas.get(`${day.employeeId}|${date}`) ?? "SIX_DAY";
  const clamped = clampToOrder(
    inP.at.getTime(),
    outP.at.getTime(),
    scheduled
      ? {
          start: (day.scheduledStart as Date).getTime(),
          end: (day.scheduledEnd as Date).getTime(),
        }
      : null,
    ctx.orders.get(`${day.employeeId}|${date}`) ?? null,
  );
  const result = computeOvertimeDay({
    dayType,
    formula,
    scheduledStart: scheduled ? (day.scheduledStart as Date).getTime() : null,
    scheduledEnd: scheduled ? (day.scheduledEnd as Date).getTime() : null,
    regularOvertimeMin: shift?.regularOvertimeMin ?? 0,
    lateToleranceMin: shift?.lateToleranceMin ?? 0,
    breakMin: shift?.breakMin ?? 0,
    breakPaid: shift?.breakPaid ?? false,
    breakRequired: day.workLocationId !== null && ctx.breakLocations.has(day.workLocationId),
    checkIn: clamped.checkIn,
    checkOut: clamped.checkOut,
    breakStart: day.punches.find((p) => p.kind === "BREAK_START")?.at.getTime() ?? null,
    breakEnd: day.punches.find((p) => p.kind === "BREAK_END")?.at.getTime() ?? null,
  });
  return { dayType, formula, result };
}

const derivedLabels = (calc: DayCalc | null) =>
  calc
    ? [...calc.result.breakLabels, ...(calc.result.regularShort ? ["REGULAR_OT_SHORT"] : [])]
    : [];

/** Senin–Minggu tanggal kerja (batas 18 jam/minggu). */
function weekRange(date: string): [string, string] {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = isoAddDays(date, -dow);
  return [monday, isoAddDays(monday, 6)];
}

/** Menit lembur (rutin + tambahan yang menunggu/disetujui) minggu itu di luar tanggal merah & hari ini. */
async function weekMinutes(tx: Tx, day: DayWithPunches): Promise<number> {
  const [from, to] = weekRange(toIso(day.workDate));
  const days = await repository.daysWithPunches(
    {
      employeeId: day.employeeId,
      workDate: { gte: toDate(from), lte: toDate(to) },
      id: { not: day.id },
    },
    tx,
  );
  if (days.length === 0) return 0;
  const ctx = await loadCalcContext(tx, days);
  const requests = await repository.overtimeOfDays(
    tx,
    days.map((d) => d.id),
    ["PENDING", "APPROVED"],
  );
  const proposed = new Map(requests.map((r) => [r.dayId, r]));
  let total = 0;
  for (const d of days) {
    const calc = calcDay(ctx, d);
    if (!calc || calc.dayType === "HOLIDAY") continue;
    total += calc.result.regularMin + (proposed.get(d.id)?.proposedMin ?? 0);
  }
  return total;
}

/**
 * Sinkron usulan lembur & label istirahat/lembur rutin untuk satu hari absen (dipanggil setelah Clock Out,
 * keputusan absen, input manual, batal). Usulan yang sudah diputuskan tidak diubah; usulan menunggu yang
 * nilainya berubah diganti (approval lama dibatalkan) supaya pemutus melihat angka terbaru.
 */
export async function syncOvertime(tx: Tx, dayId: string): Promise<DayCalc | null> {
  const day = await repository.findDayWithPunches(tx, dayId);
  const existing = await repository.findOvertimeByDay(tx, dayId);
  if (!day) return null;
  const calc = calcDay(await loadCalcContext(tx, [day]), day);

  const labels = [
    ...new Set([...day.labels.filter((l) => !DERIVED_LABELS.includes(l)), ...derivedLabels(calc)]),
  ];
  if (labels.join("|") !== day.labels.join("|")) {
    await repository.setDayLabels(tx, day.id, labels);
  }

  if (existing && existing.status !== "PENDING") return calc;
  const proposal = calc && calc.result.proposedMin > 0 ? calc : null;
  if (!proposal) {
    if (existing) {
      await cancelApprovalRequest(tx, "OVERTIME", existing.id);
      await repository.deleteOvertime(tx, existing.id);
    }
    return calc;
  }
  const r = proposal.result;
  const flags: OvertimeFlag[] = [...r.flags];
  if (
    proposal.dayType !== "HOLIDAY" &&
    (await weekMinutes(tx, day)) + r.regularMin + r.proposedMin > OVERTIME_WEEK_LIMIT_MIN
  ) {
    flags.push("OVER_WEEK_LIMIT");
  }
  const data = {
    dayType: proposal.dayType,
    formula: proposal.formula,
    rawMin: r.rawMin,
    earlyMin: r.earlyMin,
    debtMin: r.debtMin,
    regularMin: r.regularMin,
    proposedMin: r.proposedMin,
    equivalentHours: r.proposedEquivalentHours,
    flags,
  };
  if (
    existing &&
    existing.dayType === data.dayType &&
    existing.formula === data.formula &&
    existing.rawMin === data.rawMin &&
    existing.debtMin === data.debtMin &&
    existing.regularMin === data.regularMin &&
    existing.proposedMin === data.proposedMin &&
    existing.flags.join("|") === flags.join("|")
  ) {
    return calc;
  }
  if (existing) {
    await cancelApprovalRequest(tx, "OVERTIME", existing.id);
    await repository.deleteOvertime(tx, existing.id);
  }
  const created = await repository.createOvertime(tx, {
    ...data,
    dayId: day.id,
    employeeId: day.employeeId,
    companyId: day.companyId,
    managerEmployeeId: day.managerEmployeeId,
    workDate: day.workDate,
  });
  await createApprovalRequest(tx, {
    subjectType: "OVERTIME",
    subjectId: created.id,
    requesterEmployeeId: day.employeeId,
    companyId: day.companyId,
    managerEmployeeId: day.managerEmployeeId,
  });
  return calc;
}

/** Sinkron satu hari di transaksinya sendiri (cron/test/perbaikan data). */
export const syncOvertimeForDay = (dayId: string) =>
  repository.withTransaction((tx) => syncOvertime(tx, dayId));

// ── Approval ───────────────────────────────────────────────────────────────────

export function registerOvertimeIntegrations() {
  registerApprovalGuard("OVERTIME", async (tx, input) => {
    if (input.decision !== "APPROVED" || input.note) return;
    const row = await repository.findOvertime(tx, input.subjectId);
    if (row && row.flags.length > 0) {
      throw new BusinessRuleError(
        "Lembur ini melewati batas PP 35/2021 (4 jam/hari atau 18 jam/minggu). Tulis alasan persetujuan.",
      );
    }
  });
  registerApprovalHandler("OVERTIME", async (tx, event) => {
    const row = await repository.findOvertime(tx, event.subjectId);
    if (row?.status !== "PENDING") return;
    await repository.decideOvertime(tx, row.id, {
      status: event.status,
      decidedAt: event.decidedAt,
    });
    if (event.status === "CANCELLED") return;
    const date = toIso(row.workDate);
    const title = `Lembur ${dateLabel(date)} ${event.status === "APPROVED" ? "disetujui" : "ditolak"}`;
    // Setelah commit: keputusan yang batal tidak mengirim notifikasi.
    event.afterCommit(() =>
      notifyEmployees([
        {
          employeeId: row.employeeId,
          type: "attendance.overtime_decided",
          title,
          body: `${formatMinutes(row.proposedMin)} (setara ${Number(row.equivalentHours)} jam).`,
          link: "/time/lembur",
          dedupeKey: `tm-overtime-decided:${row.id}`,
          target: { type: "OVERTIME", id: row.id },
        },
      ]),
    );
  });
}

// ── Daftar & rekap ─────────────────────────────────────────────────────────────

export interface OvertimeView {
  id: string;
  dayId: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  workDate: string;
  shiftCode: string | null;
  checkIn: string | null;
  checkOut: string | null;
  dayType: OvertimeDayType;
  formula: OvertimeFormula;
  rawMin: number;
  earlyMin: number;
  debtMin: number;
  regularMin: number;
  proposedMin: number;
  equivalentHours: number;
  flags: OvertimeFlag[];
  status: OvertimeStatus;
  approval: ApprovalView | null;
  /** Rupiah tambahan ini: hanya SA / HR ber-grant `labor.cost.read`. */
  pay: number | null;
}

export interface OvertimeListQuery {
  scope: "inbox" | "all" | "me";
  from: string;
  to: string;
  companyId?: string | undefined;
}

/** Filter cakupan aktor (SA semua; HR PT ditugaskan; MANAGER tim; lainnya ditolak). */
async function scopeWhere(ctx: RequestContext, companyId?: string) {
  const actor = ctx.actor;
  if (actor.role === "SUPER_ADMIN") return companyId ? { companyId } : {};
  if (actor.role === "HR_ADMIN") {
    const scope = [...(actor.companyIds ?? [])];
    if (companyId && !scope.includes(companyId)) throw new ForbiddenError();
    return { companyId: companyId ? companyId : { in: scope } };
  }
  if (actor.role === "MANAGER" && actor.employeeId) {
    return {
      employeeId: { in: await directory.teamIds(actor.employeeId) },
      ...(companyId ? { companyId } : {}),
    };
  }
  throw new ForbiddenError();
}

export async function listOvertime(
  ctx: RequestContext,
  query: OvertimeListQuery,
): Promise<OvertimeView[]> {
  const range = { workDate: { gte: toDate(query.from), lte: toDate(query.to) } };
  let where: Prisma.OvertimeRequestWhereInput;
  if (query.scope === "me") {
    if (!ctx.actor.employeeId) throw new ForbiddenError();
    where = { ...range, employeeId: ctx.actor.employeeId, status: { not: "CANCELLED" } };
  } else if (query.scope === "inbox") {
    const ids = (await listActionable(ctx.actor, "OVERTIME", { includeOverride: true })).map(
      (a) => a.subjectId,
    );
    where = { id: { in: ids }, status: "PENDING" };
  } else {
    where = { ...range, ...(await scopeWhere(ctx, query.companyId)), status: { not: "CANCELLED" } };
  }
  const rows = await repository.listOvertimeRows(where);
  return overtimeViews(ctx, rows);
}

async function overtimeViews(
  ctx: RequestContext,
  rows: Prisma.OvertimeRequestGetPayload<object>[],
): Promise<OvertimeView[]> {
  const [people, approvals, days] = await Promise.all([
    directory.employeesByIds(rows.map((r) => r.employeeId)),
    getApprovalViews(
      ctx.actor,
      "OVERTIME",
      rows.map((r) => r.id),
    ),
    repository.daysWithPunchTimes(rows.map((r) => r.dayId)),
  ]);
  const dayById = new Map(days.map((d) => [d.id, d]));
  const showPay = policy.canSeeLaborCost(ctx.actor);
  const wages = showPay
    ? await wagesOfGrades([...people.values()].map((p) => p.gradeId))
    : new Map<string, { basePay: number; fixedAllowance: number }>();
  return rows.map((r) => {
    const person = people.get(r.employeeId);
    const day = dayById.get(r.dayId);
    const wage = person?.gradeId ? wages.get(person.gradeId) : undefined;
    const eq = Number(r.equivalentHours);
    return {
      id: r.id,
      dayId: r.dayId,
      employee: {
        id: r.employeeId,
        fullName: person?.fullName ?? "—",
        employeeNumber: person?.employeeNumber ?? null,
      },
      workDate: toIso(r.workDate),
      shiftCode: day?.shiftCode ?? null,
      checkIn: day?.punches.find((p) => p.kind === "IN")?.at.toISOString() ?? null,
      checkOut: day?.punches.find((p) => p.kind === "OUT")?.at.toISOString() ?? null,
      dayType: r.dayType,
      formula: r.formula,
      rawMin: r.rawMin,
      earlyMin: r.earlyMin,
      debtMin: r.debtMin,
      regularMin: r.regularMin,
      proposedMin: r.proposedMin,
      equivalentHours: eq,
      flags: r.flags as OvertimeFlag[],
      status: r.status,
      approval: approvals.get(r.id) ?? null,
      pay: showPay && wage ? overtimePay(eq, wage.basePay, wage.fixedAllowance) : null,
    };
  });
}

export interface OvertimeSummaryRow {
  employee: { id: string; fullName: string; employeeNumber: string | null };
  /** Lembur rutin pada hari absen yang sudah disetujui. */
  regularMin: number;
  regularEquivalentHours: number;
  approvedMin: number;
  approvedEquivalentHours: number;
  pendingMin: number;
  totalEquivalentHours: number;
  /** Rupiah (rutin + tambahan disetujui): hanya SA / HR ber-grant. */
  pay: number | null;
  /** Grade karyawan belum punya upah grade → rupiah tidak bisa dihitung. */
  wageMissing: boolean;
}

export interface OvertimeSummary {
  month: string;
  rows: OvertimeSummaryRow[];
  totals: {
    regularMin: number;
    approvedMin: number;
    pendingMin: number;
    totalEquivalentHours: number;
    /** SA/HR ber-grant: total rupiah; MANAGER: total rupiah tim (tanpa rincian per orang). */
    pay: number | null;
  };
  showPay: boolean;
}

/** Rekap lembur bulanan per karyawan dalam cakupan aktor. */
export async function overtimeSummary(
  ctx: RequestContext,
  month: string,
  companyId?: string,
): Promise<OvertimeSummary> {
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
    .toISOString()
    .slice(0, 10);
  const scope = await scopeWhere(ctx, companyId);
  const range = { gte: toDate(from), lte: toDate(lastDay) };
  const [days, requests] = await Promise.all([
    repository.daysWithPunches({ ...scope, workDate: range, status: "APPROVED" }),
    repository.overtimeRows({ ...scope, workDate: range, status: { in: ["PENDING", "APPROVED"] } }),
  ]);
  const calc = await loadCalcContext(undefined, days);
  const people = await directory.employeesByIds([
    ...days.map((d) => d.employeeId),
    ...requests.map((r) => r.employeeId),
  ]);
  const showPay = policy.canSeeLaborCost(ctx.actor);
  const teamTotal = policy.canSeeTeamCostTotal(ctx.actor);
  const wages =
    showPay || teamTotal
      ? await wagesOfGrades([...people.values()].map((p) => p.gradeId))
      : new Map<string, { basePay: number; fixedAllowance: number }>();

  const acc = new Map<string, Omit<OvertimeSummaryRow, "employee" | "pay" | "wageMissing">>();
  const get = (id: string) => {
    let row = acc.get(id);
    if (!row) {
      row = {
        regularMin: 0,
        regularEquivalentHours: 0,
        approvedMin: 0,
        approvedEquivalentHours: 0,
        pendingMin: 0,
        totalEquivalentHours: 0,
      };
      acc.set(id, row);
    }
    return row;
  };
  for (const day of days) {
    const c = calcDay(calc, day);
    if (!c || c.result.regularMin === 0) continue;
    const row = get(day.employeeId);
    row.regularMin += c.result.regularMin;
    row.regularEquivalentHours += c.result.regularEquivalentHours;
  }
  for (const r of requests) {
    const row = get(r.employeeId);
    if (r.status === "APPROVED") {
      row.approvedMin += r.proposedMin;
      row.approvedEquivalentHours += Number(r.equivalentHours);
    } else {
      row.pendingMin += r.proposedMin;
    }
  }
  let totalPay = 0;
  let anyPay = false;
  const rows: OvertimeSummaryRow[] = [...acc.entries()].map(([employeeId, row]) => {
    const person = people.get(employeeId);
    const wage = person?.gradeId ? wages.get(person.gradeId) : undefined;
    const totalEquivalentHours =
      Math.round((row.regularEquivalentHours + row.approvedEquivalentHours) * 100) / 100;
    const pay = wage ? overtimePay(totalEquivalentHours, wage.basePay, wage.fixedAllowance) : null;
    if (pay !== null) {
      totalPay += pay;
      anyPay = true;
    }
    return {
      employee: {
        id: employeeId,
        fullName: person?.fullName ?? "—",
        employeeNumber: person?.employeeNumber ?? null,
      },
      ...row,
      regularEquivalentHours: Math.round(row.regularEquivalentHours * 100) / 100,
      approvedEquivalentHours: Math.round(row.approvedEquivalentHours * 100) / 100,
      totalEquivalentHours,
      pay: showPay ? pay : null,
      wageMissing: (showPay || teamTotal) && !wage,
    };
  });
  rows.sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName));
  const sum = (k: "regularMin" | "approvedMin" | "pendingMin") =>
    rows.reduce((s, r) => s + r[k], 0);
  return {
    month,
    rows,
    totals: {
      regularMin: sum("regularMin"),
      approvedMin: sum("approvedMin"),
      pendingMin: sum("pendingMin"),
      totalEquivalentHours:
        Math.round(rows.reduce((s, r) => s + r.totalEquivalentHours, 0) * 100) / 100,
      pay: (showPay || teamTotal) && anyPay ? totalPay : null,
    },
    showPay,
  };
}
