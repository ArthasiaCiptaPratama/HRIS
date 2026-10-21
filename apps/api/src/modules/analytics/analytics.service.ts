import {
  anniversary,
  DAILY_WAGE_DIVISOR,
  type DashboardAnalyticsQuery,
  estimateSeverance,
  HOURLY_WAGE_DIVISOR,
  RETIREMENT_AGE,
  type SeveranceCategory,
  type SeveranceScenario,
  severanceMonths,
  tenureYears,
  upmkMonths,
} from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { ForbiddenError } from "../../core/errors.ts";
import {
  attendanceFacts,
  canSeeLaborCost,
  employeeDirectory,
  formulasOfEmployees,
  monthlyWagesOfGrades,
} from "../attendance/index.ts";
import { leaveFacts } from "../leave/index.ts";
import * as policy from "./analytics.policy.ts";

// DSB-D1 / TM-D10 — dashboard analitik SDM & biaya: aktif/nonaktif per bulan + turnover, gender, masa
// kerja vs cuti, cuti hari ini, efisiensi jam kerja, proyeksi 12 bulan, labor cost, kewajiban kompensasi.
// Agregat saja (tanpa data per orang). Rupiah hanya SA / HR ber-grant labor.cost.read; MANAGER = tim.

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

type Emp = employeeDirectory.AnalyticsEmployee;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** YYYY-MM ± n bulan. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
const monthEndOf = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Masih bekerja setelah `date` (aktif akhir hari itu). */
const employedAfter = (e: Emp, date: string) =>
  iso(e.joinDate) <= date && (e.endDate === null || iso(e.endDate) > date);
/** Sudah bekerja pada awal `date`. */
const employedAt = (e: Emp, date: string) =>
  iso(e.joinDate) < date && (e.endDate === null || iso(e.endDate) >= date);

const categoryOf = (e: Emp): SeveranceCategory =>
  e.category === "PERMANENT" ? "PERMANENT" : e.category === "PKWT" ? "PKWT" : "OTHER";

export function headcountMonth(employees: Emp[], month: string) {
  const start = `${month}-01`;
  const end = monthEndOf(month);
  const leftRows = employees.filter(
    (e) => e.endDate && iso(e.endDate) >= start && iso(e.endDate) <= end,
  );
  const leftByReason: Record<string, number> = {};
  for (const e of leftRows) {
    const key = e.exitReason ?? "UNKNOWN";
    leftByReason[key] = (leftByReason[key] ?? 0) + 1;
  }
  const atStart = employees.filter((e) => employedAt(e, start)).length;
  const atEnd = employees.filter((e) => employedAfter(e, end)).length;
  return {
    month,
    start: atStart,
    joined: employees.filter((e) => iso(e.joinDate) >= start && iso(e.joinDate) <= end).length,
    left: leftRows.length,
    leftByReason,
    end: atEnd,
    turnoverPct: pct(leftRows.length, (atStart + atEnd) / 2),
  };
}

const TENURE_BUCKETS = [
  { key: "<1", min: 0, max: 1 },
  { key: "1-3", min: 1, max: 3 },
  { key: "3-5", min: 3, max: 5 },
  { key: "5-10", min: 5, max: 10 },
  { key: "10+", min: 10, max: Number.POSITIVE_INFINITY },
] as const;

/** Ulang tahun kerja yang mengubah tingkat pesangon/UPMK (tahun ke-n). */
const tierYear = (n: number) =>
  severanceMonths(n) !== severanceMonths(n - 0.001) || upmkMonths(n) !== upmkMonths(n - 0.001);

export async function dashboardAnalytics(
  ctx: RequestContext,
  query: DashboardAnalyticsQuery,
  now = new Date(),
) {
  const scope = policy.analyticsScope(ctx.actor, query.companyId);
  if (!scope) throw new ForbiddenError();
  const showCost = scope.kind !== "team" && canSeeLaborCost(ctx.actor);
  const withBirth = policy.canSeeBirthDates(ctx.actor) && scope.kind !== "team";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const month = query.month;
  const monthStart = `${month}-01`;
  const monthEnd = monthEndOf(month);
  const historyFrom = `${shiftMonth(month, -11)}-01`;
  const prevMonth = shiftMonth(month, -1);

  const employees = await employeeDirectory.analyticsEmployees({
    companyIds: scope.kind === "companies" ? scope.companyIds : undefined,
    managerId: scope.kind === "team" ? scope.managerId : undefined,
    from: new Date(`${historyFrom}T00:00:00Z`),
    to: new Date(`${monthEnd}T00:00:00Z`),
    withBirthDate: withBirth,
  });
  const active = employees.filter((e) => employedAfter(e, monthEnd));
  const activeIds = active.map((e) => e.id);
  const year = Number(month.slice(0, 4));

  // ── Aktif / nonaktif per bulan (12 bulan) ──
  const history = Array.from({ length: 12 }, (_, i) =>
    headcountMonth(employees, shiftMonth(month, i - 11)),
  );
  const current = history[11] as ReturnType<typeof headcountMonth>;
  const previous = history[10] as ReturnType<typeof headcountMonth>;

  // ── Gender (aktif akhir bulan) ──
  const genders = new Map<string, number>();
  for (const e of active)
    genders.set(e.gender ?? "UNKNOWN", (genders.get(e.gender ?? "UNKNOWN") ?? 0) + 1);
  const gender = [...genders.entries()]
    .map(([key, count]) => ({ gender: key, count, pct: pct(count, active.length) }))
    .sort((a, b) => b.count - a.count);

  // ── Masa kerja vs cuti ──
  const leave = await leaveFacts(activeIds, year, today);
  const tenure = TENURE_BUCKETS.map((b) => {
    const rows = active.filter((e) => {
      const y = tenureYears(iso(e.joinDate), monthEnd);
      return y >= b.min && y < b.max;
    });
    const avg = (pick: (e: Emp) => number) =>
      rows.length ? round1(rows.reduce((t, e) => t + pick(e), 0) / rows.length) : 0;
    return {
      bucket: b.key,
      count: rows.length,
      pct: pct(rows.length, active.length),
      avgYears: avg((e) => tenureYears(iso(e.joinDate), monthEnd)),
      avgGranted: avg((e) => leave.perEmployee.get(e.id)?.granted ?? 0),
      avgUsed: avg((e) => leave.perEmployee.get(e.id)?.used ?? 0),
      avgRemaining: avg((e) => leave.perEmployee.get(e.id)?.remaining ?? 0),
    };
  });
  const avgTenureYears = active.length
    ? round1(active.reduce((t, e) => t + tenureYears(iso(e.joinDate), monthEnd), 0) / active.length)
    : 0;
  let usedDays = 0;
  let remainingDays = 0;
  let debtDays = 0;
  for (const id of activeIds) {
    const f = leave.perEmployee.get(id);
    if (!f) continue;
    usedDays += f.used;
    if (f.remaining > 0) remainingDays += f.remaining;
    else debtDays += -f.remaining;
  }

  // ── Efisiensi jam kerja (bulan ini & bulan lalu) ──
  const [facts, prevFacts] = await Promise.all([
    attendanceFacts(activeIds, monthStart, monthEnd),
    attendanceFacts(activeIds, `${prevMonth}-01`, monthEndOf(prevMonth)),
  ]);
  const totalOf = (rows: Iterable<{ scheduledMin: number; workedMin: number }>) => {
    let scheduled = 0;
    let worked = 0;
    for (const r of rows) {
      scheduled += r.scheduledMin;
      worked += r.workedMin;
    }
    return { scheduled, worked };
  };
  const sumFacts = (ids: string[]) => {
    const acc = {
      scheduled: 0,
      worked: 0,
      overtime: 0,
      present: 0,
      late: 0,
      alpha: 0,
      workDays: 0,
    };
    for (const id of ids) {
      const f = facts.get(id);
      if (!f) continue;
      acc.scheduled += f.scheduledMin;
      acc.worked += f.workedMin;
      acc.overtime += f.overtimeMin;
      acc.present += f.presentDays;
      acc.late += f.lateDays;
      acc.alpha += f.alphaDays;
      acc.workDays += f.workDays;
    }
    return {
      scheduledHours: round1(acc.scheduled / 60),
      effectiveHours: round1(acc.worked / 60),
      efficiencyPct: pct(acc.worked, acc.scheduled),
      overtimeHours: round1(acc.overtime / 60),
      overtimePct: pct(acc.overtime, acc.scheduled),
      latePct: pct(acc.late, acc.present),
      alphaPct: pct(acc.alpha, acc.workDays),
    };
  };
  const prevTotals = totalOf(prevFacts.values());
  const byLocationIds = new Map<string, string[]>();
  for (const e of active) {
    const key = e.workLocationId ?? "NONE";
    byLocationIds.set(key, [...(byLocationIds.get(key) ?? []), e.id]);
  }
  const locations = await employeeDirectory.locationsByIds(
    [...byLocationIds.keys()].filter((k) => k !== "NONE"),
  );
  const efficiency = {
    ...sumFacts(activeIds),
    prevEfficiencyPct: pct(prevTotals.worked, prevTotals.scheduled),
    byLocation: [...byLocationIds.entries()]
      .map(([id, ids]) => ({
        location: id === "NONE" ? "Belum diisi" : (locations.get(id)?.name ?? "—"),
        headcount: ids.length,
        ...sumFacts(ids),
      }))
      .filter((r) => r.scheduledHours > 0 || r.effectiveHours > 0)
      .sort((a, b) => b.headcount - a.headcount),
  };

  // ── Upah (hanya bila boleh melihat biaya) ──
  const wages = showCost ? await monthlyWagesOfGrades(active.map((e) => e.gradeId)) : new Map();
  const wageOf = (e: Emp): number | null => (e.gradeId ? (wages.get(e.gradeId) ?? null) : null);
  const scenario: SeveranceScenario = query.scenario;

  // ── Proyeksi 12 bulan ke depan ──
  const projection = Array.from({ length: 12 }, (_, i) => {
    const m = shiftMonth(month, i + 1);
    const from = `${m}-01`;
    const to = monthEndOf(m);
    const inMonth = (date: string) => date >= from && date <= to;
    let contractEnds = 0;
    let tierChanges = 0;
    let retirements = 0;
    let costDelta = 0;
    for (const e of active) {
      const cat = categoryOf(e);
      const wage = wageOf(e);
      if (cat === "PKWT" && e.endDate && inMonth(iso(e.endDate))) {
        contractEnds++;
        if (wage !== null) {
          costDelta += estimateSeverance({
            category: "PKWT",
            joinDate: iso(e.joinDate),
            at: iso(e.endDate),
            monthlyWage: wage,
            scenario,
          }).pkwt;
        }
      }
      if (cat === "PERMANENT") {
        const join = iso(e.joinDate);
        for (let n = 1; n <= 24; n++) {
          const day = anniversary(join, n);
          if (!inMonth(day) || !tierYear(n)) continue;
          tierChanges++;
          if (wage !== null) {
            const dayBefore = iso(new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000));
            const before = estimateSeverance({
              category: "PERMANENT",
              joinDate: join,
              at: dayBefore,
              monthlyWage: wage,
              scenario,
            });
            const after = estimateSeverance({
              category: "PERMANENT",
              joinDate: join,
              at: day,
              monthlyWage: wage,
              scenario,
            });
            costDelta += after.severance + after.upmk - (before.severance + before.upmk);
          }
        }
      }
      if (withBirth && e.birthDate) {
        const retire = anniversary(iso(e.birthDate), RETIREMENT_AGE);
        if (inMonth(retire)) retirements++;
      }
    }
    return {
      month: m,
      contractEnds,
      tierChanges,
      retirements: withBirth ? retirements : null,
      costDelta: showCost ? Math.round(costDelta) : null,
    };
  });

  // ── Labor cost & kewajiban kompensasi (rupiah) ──
  let laborCost: {
    rows: {
      category: string;
      headcount: number;
      wage: number;
      overtime: number;
      total: number;
      pct: number;
    }[];
    total: number;
    wageMissing: number;
  } | null = null;
  let liability: {
    scenario: SeveranceScenario;
    severance: number;
    upmk: number;
    pkwt: number;
    leaveComp: number;
    total: number;
    employees: number;
    wageMissing: number;
  } | null = null;
  if (showCost) {
    const groups = new Map<string, { headcount: number; wage: number; overtime: number }>();
    let wageMissing = 0;
    for (const e of active) {
      const key = e.category ?? "OTHER";
      const g = groups.get(key) ?? { headcount: 0, wage: 0, overtime: 0 };
      g.headcount++;
      const wage = wageOf(e);
      if (wage === null) wageMissing++;
      else {
        g.wage += wage;
        g.overtime += Math.round(
          ((facts.get(e.id)?.overtimeEquivalentHours ?? 0) * wage) / HOURLY_WAGE_DIVISOR,
        );
      }
      groups.set(key, g);
    }
    const total = [...groups.values()].reduce((t, g) => t + g.wage + g.overtime, 0);
    laborCost = {
      rows: [...groups.entries()]
        .map(([category, g]) => ({
          category,
          ...g,
          total: g.wage + g.overtime,
          pct: pct(g.wage + g.overtime, total),
        }))
        .sort((a, b) => b.total - a.total),
      total,
      wageMissing,
    };
    const formulas = await formulasOfEmployees(activeIds, monthEnd);
    const acc = { severance: 0, upmk: 0, pkwt: 0, leaveComp: 0 };
    let missing = 0;
    for (const e of active) {
      const wage = wageOf(e);
      if (wage === null) {
        missing++;
        continue;
      }
      const est = estimateSeverance({
        category: categoryOf(e),
        joinDate: iso(e.joinDate),
        at: monthEnd,
        monthlyWage: wage,
        scenario,
      });
      acc.severance += est.severance;
      acc.upmk += est.upmk;
      acc.pkwt += est.pkwt;
      const remaining = Math.max(0, leave.perEmployee.get(e.id)?.remaining ?? 0);
      acc.leaveComp += Math.round(
        (remaining * wage) / DAILY_WAGE_DIVISOR[formulas.get(e.id) ?? "FIVE_DAY"],
      );
    }
    liability = {
      scenario,
      ...acc,
      total: acc.severance + acc.upmk + acc.pkwt + acc.leaveComp,
      employees: active.length - missing,
      wageMissing: missing,
    };
  }

  return {
    month,
    scope: scope.kind,
    showCost,
    headcount: {
      ...current,
      prevEnd: previous.end,
      endChangePct:
        previous.end > 0 ? round1(((current.end - previous.end) / previous.end) * 100) : null,
      history,
    },
    gender,
    tenure: { avgYears: avgTenureYears, buckets: tenure },
    leave: {
      year,
      onLeaveToday: leave.onLeaveToday,
      pendingRequests: leave.pendingRequests,
      usedDays,
      remainingDays,
      debtDays,
    },
    efficiency,
    projection,
    laborCost,
    liability,
  };
}

export type DashboardAnalytics = Awaited<ReturnType<typeof dashboardAnalytics>>;
