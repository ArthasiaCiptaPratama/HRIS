import {
  type CrewInput,
  type CrewMembersInput,
  type HolidayKind,
  OFF_CODE,
  type RosterCellsInput,
  type RosterImportInput,
  type RosterPatternInput,
  type RosterSource,
  type ShiftInput,
} from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import {
  holidaysBetween,
  type RequestContext,
  readTimeSettings,
  toDate,
  toIso,
} from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as repository from "./roster.repository.ts";
import { eachDate, generateCrewDays, isoAddDays } from "./roster-engine.ts";
import { notifyRosterChanges, type RosterChange, rosterCodes } from "./roster-notify.service.ts";

// Tahap B — roster tambang (D-069): shift, pola, crew, pembangkit hari roster, grid bulanan, import.

const todayIso = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);

const isUnique = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

type Snapshot = Record<string, unknown> | null;
async function audit(
  ctx: RequestContext,
  action: string,
  entityType: string,
  entityId: string | null,
  before: Snapshot,
  after: Snapshot,
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

function assertManage(actor: Actor, companyId: string) {
  if (!policy.canManageRoster(actor, companyId)) throw new ForbiddenError();
}

// ── Shift ──────────────────────────────────────────────────────────────────────

export interface ShiftDto {
  id: string;
  companyId: string;
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  crossesMidnight: boolean;
  startsNextDay: boolean;
  checkInOpenMin: number;
  lateToleranceMin: number;
  earlyLeaveToleranceMin: number;
  checkOutCloseMin: number;
  breakMin: number;
  breakPaid: boolean;
  breakStartMinute: number | null;
  breakEndMinute: number | null;
  regularOvertimeMin: number;
  color: string | null;
  archived: boolean;
}

export const shiftDto = (row: {
  id: string;
  companyId: string;
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  startsNextDay: boolean;
  checkInOpenMin: number;
  lateToleranceMin: number;
  earlyLeaveToleranceMin: number;
  checkOutCloseMin: number;
  breakMin: number;
  breakPaid: boolean;
  breakStartMinute: number | null;
  breakEndMinute: number | null;
  regularOvertimeMin: number;
  color: string | null;
  deletedAt: Date | null;
}): ShiftDto => ({
  id: row.id,
  companyId: row.companyId,
  code: row.code,
  name: row.name,
  startMinute: row.startMinute,
  endMinute: row.endMinute,
  crossesMidnight: row.endMinute <= row.startMinute,
  startsNextDay: row.startsNextDay,
  checkInOpenMin: row.checkInOpenMin,
  lateToleranceMin: row.lateToleranceMin,
  earlyLeaveToleranceMin: row.earlyLeaveToleranceMin,
  checkOutCloseMin: row.checkOutCloseMin,
  breakMin: row.breakMin,
  breakPaid: row.breakPaid,
  breakStartMinute: row.breakStartMinute,
  breakEndMinute: row.breakEndMinute,
  regularOvertimeMin: row.regularOvertimeMin,
  color: row.color,
  archived: row.deletedAt !== null,
});

export async function listShifts(ctx: RequestContext, companyId: string): Promise<ShiftDto[]> {
  if (!policy.canViewRosterSetup(ctx.actor, companyId)) throw new ForbiddenError();
  return (await repository.listShifts(companyId)).map(shiftDto);
}

function validateShift(input: ShiftInput) {
  if (input.startMinute === input.endMinute) {
    throw new BusinessRuleError("Jam mulai dan selesai shift tidak boleh sama.");
  }
  const length = (input.endMinute - input.startMinute + 1440) % 1440;
  if (input.regularOvertimeMin >= length) {
    throw new BusinessRuleError("Lembur rutin harus lebih pendek dari panjang shift.");
  }
  // TM-D12: jendela Mulai istirahat harus utuh di dalam shift.
  const { breakStartMinute: bs, breakEndMinute: be } = input;
  if ((bs === null) !== (be === null)) {
    throw new BusinessRuleError(
      "Isi jam mulai dan jam selesai istirahat, atau kosongkan keduanya.",
    );
  }
  if (bs !== null && be !== null) {
    const fromStart = (m: number) => (m - input.startMinute + 1440) % 1440;
    if (bs === be || fromStart(be) <= fromStart(bs) || fromStart(be) > length) {
      throw new BusinessRuleError("Jam istirahat harus berada di dalam jam shift.");
    }
  }
}

export async function createShift(ctx: RequestContext, input: ShiftInput): Promise<ShiftDto> {
  assertManage(ctx.actor, input.companyId);
  validateShift(input);
  if (!(await directory.companyExists(input.companyId)))
    throw new NotFoundError("Perusahaan tidak ditemukan.");
  try {
    const row = await repository.createShift({ ...input, color: input.color ?? null });
    await audit(ctx, "attendance.shift.create", "attendance.shift", row.id, null, { ...input });
    return shiftDto(row);
  } catch (error) {
    if (isUnique(error))
      throw new ConflictError(`Kode shift ${input.code} sudah ada di perusahaan ini.`);
    throw error;
  }
}

export async function updateShift(
  ctx: RequestContext,
  id: string,
  input: ShiftInput,
): Promise<ShiftDto> {
  const before = await repository.findShift(id);
  if (!before) throw new NotFoundError();
  assertManage(ctx.actor, before.companyId);
  if (input.companyId !== before.companyId)
    throw new BusinessRuleError("Perusahaan shift tidak bisa diubah.");
  validateShift(input);
  try {
    const row = await repository.updateShift(id, { ...input, color: input.color ?? null });
    await audit(
      ctx,
      "attendance.shift.update",
      "attendance.shift",
      id,
      { ...shiftDto(before) },
      { ...input },
    );
    return shiftDto(row);
  } catch (error) {
    if (isUnique(error))
      throw new ConflictError(`Kode shift ${input.code} sudah ada di perusahaan ini.`);
    throw error;
  }
}

/** Arsip shift: ditolak bila masih dipakai hari roster mulai hari ini (pakai pola/grid lain dulu). */
export async function archiveShift(ctx: RequestContext, id: string): Promise<ShiftDto> {
  const before = await repository.findShift(id);
  if (!before) throw new NotFoundError();
  assertManage(ctx.actor, before.companyId);
  const used = await repository.countShiftUsage(id, toDate(todayIso()));
  if (used > 0) {
    throw new BusinessRuleError(
      `Shift masih dipakai ${used} hari roster mendatang; ubah roster dulu.`,
    );
  }
  const row = await repository.updateShift(id, { deletedAt: new Date() });
  await audit(ctx, "attendance.shift.archive", "attendance.shift", id, { code: before.code }, null);
  return shiftDto(row);
}

/** Peta kode → shift aktif PT (OFF tidak termasuk). */
async function shiftCodeMap(companyId: string) {
  const shifts = await repository.listShifts(companyId);
  return new Map(shifts.map((shift) => [shift.code, shift]));
}

// ── Pola ───────────────────────────────────────────────────────────────────────

export interface PatternDto {
  id: string;
  companyId: string;
  name: string;
  steps: string[];
  cycleLength: number;
  workDays: number;
  crewCount: number;
}

const patternDto = (row: {
  id: string;
  companyId: string;
  name: string;
  steps: string[];
  _count?: { crews: number };
}): PatternDto => ({
  id: row.id,
  companyId: row.companyId,
  name: row.name,
  steps: row.steps,
  cycleLength: row.steps.length,
  workDays: row.steps.filter((s) => s !== OFF_CODE).length,
  crewCount: row._count?.crews ?? 0,
});

export async function listPatterns(ctx: RequestContext, companyId: string): Promise<PatternDto[]> {
  if (!policy.canViewRosterSetup(ctx.actor, companyId)) throw new ForbiddenError();
  return (await repository.listPatterns(companyId)).map(patternDto);
}

async function validateSteps(companyId: string, steps: string[]) {
  const codes = await shiftCodeMap(companyId);
  const unknown = [...new Set(steps.filter((step) => step !== OFF_CODE && !codes.has(step)))];
  if (unknown.length > 0) {
    throw new BusinessRuleError(
      `Kode shift tidak dikenal di perusahaan ini: ${unknown.join(", ")}.`,
    );
  }
  if (steps.every((step) => step === OFF_CODE)) {
    throw new BusinessRuleError("Pola harus berisi minimal satu hari kerja.");
  }
}

export async function createPattern(
  ctx: RequestContext,
  input: RosterPatternInput,
): Promise<PatternDto> {
  assertManage(ctx.actor, input.companyId);
  await validateSteps(input.companyId, input.steps);
  try {
    const row = await repository.createPattern(input);
    await audit(ctx, "attendance.pattern.create", "attendance.roster_pattern", row.id, null, {
      ...input,
    });
    return patternDto(row);
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Pola "${input.name}" sudah ada.`);
    throw error;
  }
}

export async function updatePattern(
  ctx: RequestContext,
  id: string,
  input: RosterPatternInput,
): Promise<PatternDto> {
  const before = await repository.findPattern(id);
  if (!before) throw new NotFoundError();
  assertManage(ctx.actor, before.companyId);
  if (input.companyId !== before.companyId)
    throw new BusinessRuleError("Perusahaan pola tidak bisa diubah.");
  await validateSteps(input.companyId, input.steps);
  try {
    const row = await repository.updatePattern(id, { name: input.name, steps: input.steps });
    await audit(
      ctx,
      "attendance.pattern.update",
      "attendance.roster_pattern",
      id,
      { steps: before.steps },
      { ...input },
    );
    // Pola berubah → crew pemakainya dibangkitkan ulang mulai hari ini.
    for (const crew of await repository.listCrews({ patternId: id })) await regenerateCrew(crew.id);
    return patternDto(row);
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Pola "${input.name}" sudah ada.`);
    throw error;
  }
}

export async function archivePattern(ctx: RequestContext, id: string): Promise<{ id: string }> {
  const before = await repository.findPattern(id);
  if (!before) throw new NotFoundError();
  assertManage(ctx.actor, before.companyId);
  if ((await repository.listCrews({ patternId: id })).length > 0) {
    throw new BusinessRuleError("Pola masih dipakai crew; ganti pola crew dulu.");
  }
  await repository.updatePattern(id, { deletedAt: new Date() });
  await audit(
    ctx,
    "attendance.pattern.archive",
    "attendance.roster_pattern",
    id,
    { name: before.name },
    null,
  );
  return { id };
}

// ── Crew ───────────────────────────────────────────────────────────────────────

export interface CrewDto {
  id: string;
  companyId: string;
  workLocation: { id: string; name: string } | null;
  name: string;
  pattern: { id: string; name: string; steps: string[] };
  cycleStartDate: string;
  members: {
    employeeId: string;
    fullName: string;
    employeeNumber: string | null;
    startDate: string;
  }[];
}

async function crewDtos(rows: repository.CrewRow[], onDate: string): Promise<CrewDto[]> {
  const date = toDate(onDate);
  const active = (row: repository.CrewRow) =>
    row.members.filter((m) => m.startDate <= date && (m.endDate === null || m.endDate >= date));
  const employees = await directory.employeesByIds(
    rows.flatMap((row) => active(row).map((m) => m.employeeId)),
  );
  const locations = await directory.locationsByIds(rows.map((row) => row.workLocationId));
  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    workLocation: locations.has(row.workLocationId)
      ? { id: row.workLocationId, name: locations.get(row.workLocationId)?.name ?? "" }
      : null,
    name: row.name,
    pattern: { id: row.pattern.id, name: row.pattern.name, steps: row.pattern.steps },
    cycleStartDate: toIso(row.cycleStartDate),
    members: active(row)
      .map((m) => {
        const employee = employees.get(m.employeeId);
        return {
          employeeId: m.employeeId,
          fullName: employee?.fullName ?? "—",
          employeeNumber: employee?.employeeNumber ?? null,
          startDate: toIso(m.startDate),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "id")),
  }));
}

export async function listCrews(ctx: RequestContext, companyId: string): Promise<CrewDto[]> {
  if (!policy.canViewRosterSetup(ctx.actor, companyId)) throw new ForbiddenError();
  return crewDtos(await repository.listCrews({ companyId }), todayIso());
}

async function validateCrew(input: CrewInput) {
  const pattern = await repository.findPattern(input.patternId);
  if (!pattern || pattern.deletedAt || pattern.companyId !== input.companyId) {
    throw new BusinessRuleError("Pola tidak ditemukan di perusahaan ini.");
  }
  const location = (await directory.locationsByIds([input.workLocationId])).get(
    input.workLocationId,
  );
  if (!location) throw new BusinessRuleError("Lokasi kerja tidak ditemukan.");
}

export async function createCrew(ctx: RequestContext, input: CrewInput): Promise<CrewDto> {
  assertManage(ctx.actor, input.companyId);
  await validateCrew(input);
  try {
    const row = await repository.createCrew({
      ...input,
      cycleStartDate: toDate(input.cycleStartDate),
    });
    await audit(ctx, "attendance.crew.create", "attendance.crew", row.id, null, { ...input });
    return (await crewDtos([row], todayIso()))[0] as CrewDto;
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Crew "${input.name}" sudah ada.`);
    throw error;
  }
}

export async function updateCrew(
  ctx: RequestContext,
  id: string,
  input: CrewInput,
): Promise<CrewDto> {
  const before = await repository.findCrew(id);
  if (!before || before.deletedAt) throw new NotFoundError();
  assertManage(ctx.actor, before.companyId);
  if (input.companyId !== before.companyId)
    throw new BusinessRuleError("Perusahaan crew tidak bisa diubah.");
  await validateCrew(input);
  try {
    const row = await repository.updateCrew(id, {
      name: input.name,
      workLocationId: input.workLocationId,
      patternId: input.patternId,
      cycleStartDate: toDate(input.cycleStartDate),
    });
    await audit(
      ctx,
      "attendance.crew.update",
      "attendance.crew",
      id,
      {
        name: before.name,
        patternId: before.patternId,
        cycleStartDate: toIso(before.cycleStartDate),
      },
      { ...input },
    );
    await regenerateCrew(id);
    return (await crewDtos([row], todayIso()))[0] as CrewDto;
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Crew "${input.name}" sudah ada.`);
    throw error;
  }
}

export async function archiveCrew(ctx: RequestContext, id: string): Promise<{ id: string }> {
  const before = await repository.findCrew(id);
  if (!before || before.deletedAt) throw new NotFoundError();
  assertManage(ctx.actor, before.companyId);
  const today = todayIso();
  await repository.withTransaction(async (tx) => {
    for (const m of before.members) {
      if (m.endDate === null || toIso(m.endDate) >= today)
        await repository.endMembership(tx, m.id, toDate(isoAddDays(today, -1)));
    }
    // Hari pola mendatang crew ini dihapus (hari manual/import/perubahan tetap).
    await repository.deletePatternDays(tx, id, toDate(today), toDate(isoAddDays(today, 400)));
  });
  await repository.updateCrew(id, { deletedAt: new Date() });
  await audit(ctx, "attendance.crew.archive", "attendance.crew", id, { name: before.name }, null);
  return { id };
}

/**
 * Atur anggota crew mulai `effectiveDate`: karyawan baru ditambahkan (keanggotaan crew lain diakhiri sehari
 * sebelumnya), anggota yang tidak ada di daftar diakhiri. Crew yang terdampak dibangkitkan ulang.
 */
export async function setCrewMembers(
  ctx: RequestContext,
  crewId: string,
  input: CrewMembersInput,
): Promise<CrewDto> {
  const crew = await repository.findCrew(crewId);
  if (!crew || crew.deletedAt) throw new NotFoundError();
  assertManage(ctx.actor, crew.companyId);
  const employees = await directory.employeesByIds(input.employeeIds);
  const invalid = input.employeeIds.filter((id) => {
    const e = employees.get(id);
    return !e || e.companyId !== crew.companyId || !e.isActive;
  });
  if (invalid.length > 0) {
    throw new BusinessRuleError(
      `${invalid.length} karyawan tidak aktif atau bukan karyawan perusahaan crew ini.`,
    );
  }
  const effective = toDate(input.effectiveDate);
  const dayBefore = toDate(isoAddDays(input.effectiveDate, -1));
  const wanted = new Set(input.employeeIds);
  const touchedCrews = new Set<string>([crewId]);

  await repository.withTransaction(async (tx) => {
    const open = await repository.openMemberships(
      tx,
      [...wanted, ...crew.members.map((m) => m.employeeId)],
      effective,
    );
    for (const m of open) {
      const inThisCrew = m.crewId === crewId;
      if (inThisCrew && wanted.has(m.employeeId)) continue; // tetap anggota
      if (!inThisCrew && !wanted.has(m.employeeId)) continue; // anggota crew lain, tidak dipindah
      touchedCrews.add(m.crewId);
      // Keanggotaan yang mulai pada/after tanggal efektif dihapus; selainnya diakhiri sehari sebelumnya.
      if (m.startDate >= effective) await repository.deleteMembership(tx, m.id);
      else await repository.endMembership(tx, m.id, dayBefore);
    }
    const stay = new Set(
      open.filter((m) => m.crewId === crewId && wanted.has(m.employeeId)).map((m) => m.employeeId),
    );
    const added = [...wanted].filter((id) => !stay.has(id));
    await repository.addMembers(
      tx,
      added.map((employeeId) => ({ crewId, employeeId, startDate: effective })),
    );
  });
  await audit(ctx, "attendance.crew.members", "attendance.crew", crewId, null, {
    employeeIds: input.employeeIds,
    effectiveDate: input.effectiveDate,
  });
  for (const id of touchedCrews) await regenerateCrew(id, input.effectiveDate);
  return (
    await crewDtos([(await repository.findCrew(crewId)) as repository.CrewRow], input.effectiveDate)
  )[0] as CrewDto;
}

// ── Pembangkit hari roster ─────────────────────────────────────────────────────

/** Bangkitkan ulang hari pola crew dari `from` (bawaan hari ini) sampai horizon pengaturan. */
/**
 * Bangkitkan ulang hari pola crew. `notify` (TM-D13 Fase C): beri tahu anggota yang jadwalnya berubah —
 * dimatikan untuk cron perpanjangan horizon (hari baru di ujung bukan perubahan).
 */
export async function regenerateCrew(
  crewId: string,
  from = todayIso(),
  notify = true,
): Promise<number> {
  const crew = await repository.findCrew(crewId);
  if (!crew) return 0;
  const settings = await readTimeSettings();
  const start = from < todayIso() ? todayIso() : from;
  const end = isoAddDays(todayIso(), settings.rosterHorizonDays);
  const memberIds = [...new Set(crew.members.map((m) => m.employeeId))];
  const snapshot = async () =>
    new Map(
      (await repository.rosterDaysBetween(memberIds, toDate(start), toDate(end))).map((r) => [
        `${r.employeeId}|${toIso(r.workDate)}`,
        r.shift?.code ?? null,
      ]),
    );
  const before = notify && memberIds.length > 0 ? await snapshot() : null;
  const codes = await shiftCodeMap(crew.companyId);
  const generated = crew.deletedAt
    ? []
    : generateCrewDays(
        crew.pattern.steps,
        toIso(crew.cycleStartDate),
        crew.members.map((m) => ({
          employeeId: m.employeeId,
          startDate: toIso(m.startDate),
          endDate: m.endDate ? toIso(m.endDate) : null,
        })),
        start,
        end,
      );
  const count = await repository.withTransaction(async (tx) => {
    await repository.deletePatternDays(tx, crewId, toDate(start), toDate(end));
    const result = await repository.insertDays(
      tx,
      generated.map((day) => ({
        employeeId: day.employeeId,
        workDate: toDate(day.date),
        shiftId: day.code === OFF_CODE ? null : (codes.get(day.code)?.id ?? null),
        crewId,
        source: "PATTERN" as const,
      })),
    );
    return result.count;
  });
  if (before) {
    const after = await snapshot();
    const changes: RosterChange[] = [];
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const [employeeId, date] = key.split("|") as [string, string];
      changes.push({ employeeId, date, from: before.get(key), to: after.get(key) });
    }
    await notifyRosterChanges(changes, "pattern");
  }
  return count;
}

/** Cron `roster-extend`: perpanjang roster semua crew sampai horizon. */
export async function extendAllRosters(): Promise<{ crews: number; days: number }> {
  let days = 0;
  const crews = await repository.allActiveCrews();
  for (const crew of crews) days += await regenerateCrew(crew.id, todayIso(), false);
  return { crews: crews.length, days };
}

// ── Grid bulanan ───────────────────────────────────────────────────────────────

export interface RosterGrid {
  month: string;
  companyId: string;
  dates: string[];
  holidays: { date: string; name: string; kind: HolidayKind }[];
  shifts: ShiftDto[];
  employees: { id: string; fullName: string; employeeNumber: string | null; crew: string | null }[];
  days: { employeeId: string; date: string; code: string; source: RosterSource }[];
  canEdit: boolean;
}

/** Karyawan yang terlihat di grid sesuai peran (SA/HR: PT; MANAGER: tim; karyawan: diri sendiri). */
async function visibleEmployeeIds(
  actor: Actor,
  companyId: string,
  from: Date,
  to: Date,
): Promise<string[]> {
  if (policy.canManageRoster(actor, companyId)) {
    const crewMembers = (await repository.listCrews({ companyId })).flatMap((c) =>
      c.members
        .filter((m) => m.startDate <= to && (m.endDate === null || m.endDate >= from))
        .map((m) => m.employeeId),
    );
    const withDays = await repository.employeesWithDays(null, from, to);
    const all = await directory.employeesByIds([...crewMembers, ...withDays]);
    return [...all.values()].filter((e) => e.companyId === companyId).map((e) => e.id);
  }
  if (!actor.employeeId) return [];
  const own = await directory.employeeById(actor.employeeId);
  const team = actor.role === "MANAGER" ? await directory.teamIds(actor.employeeId) : [];
  const people = await directory.employeesByIds([...(own ? [own.id] : []), ...team]);
  return [...people.values()].filter((e) => e.companyId === companyId).map((e) => e.id);
}

export async function getRosterGrid(
  ctx: RequestContext,
  companyId: string,
  month: string,
  crewId?: string,
): Promise<RosterGrid> {
  if (!policy.canViewRosterSetup(ctx.actor, companyId)) throw new ForbiddenError();
  const fromIso = `${month}-01`;
  const toIsoDate = isoAddDays(`${isoAddDays(fromIso, 31).slice(0, 7)}-01`, -1);
  const from = toDate(fromIso);
  const to = toDate(toIsoDate);
  let ids = await visibleEmployeeIds(ctx.actor, companyId, from, to);
  const crews = await repository.listCrews({ companyId });
  const crewOf = new Map<string, string>();
  for (const crew of crews) {
    for (const m of crew.members) {
      if (m.startDate <= to && (m.endDate === null || m.endDate >= from))
        crewOf.set(m.employeeId, crew.name);
    }
  }
  if (crewId) {
    const crew = crews.find((c) => c.id === crewId);
    const members = new Set(crew?.members.map((m) => m.employeeId) ?? []);
    ids = ids.filter((id) => members.has(id));
  }
  const [employees, days, holidays, shifts] = await Promise.all([
    directory.employeesByIds(ids),
    repository.rosterDaysBetween(ids, from, to),
    holidaysBetween(fromIso, toIsoDate),
    repository.listShifts(companyId, true),
  ]);
  return {
    month,
    companyId,
    dates: eachDate(fromIso, toIsoDate),
    holidays: [...holidays.values()].map((h) => ({ date: h.date, name: h.name, kind: h.kind })),
    shifts: shifts.map(shiftDto),
    employees: [...employees.values()]
      .map((e) => ({
        id: e.id,
        fullName: e.fullName,
        employeeNumber: e.employeeNumber,
        crew: crewOf.get(e.id) ?? null,
      }))
      .sort(
        (a, b) =>
          (a.crew ?? "~").localeCompare(b.crew ?? "~", "id") ||
          a.fullName.localeCompare(b.fullName, "id"),
      ),
    days: days.map((d) => ({
      employeeId: d.employeeId,
      date: toIso(d.workDate),
      code: d.shift?.code ?? OFF_CODE,
      source: d.source,
    })),
    canEdit: policy.canManageRoster(ctx.actor, companyId),
  };
}

/** Roster seorang karyawan pada rentang (dipakai halaman absen & riwayat). */
export async function getEmployeeRoster(
  ctx: RequestContext,
  employeeId: string,
  from: string,
  to: string,
) {
  const employee = await directory.employeeById(employeeId);
  if (
    !employee ||
    !policy.canViewEmployeeRoster(ctx.actor, {
      employeeId,
      companyId: employee.companyId,
      managerId: employee.managerId,
    })
  ) {
    throw new NotFoundError();
  }
  const days = await repository.rosterDaysBetween([employeeId], toDate(from), toDate(to));
  return days.map((d) => ({
    date: toIso(d.workDate),
    code: d.shift?.code ?? OFF_CODE,
    shift: d.shift ? shiftDto(d.shift) : null,
    source: d.source,
  }));
}

// ── Edit sel & import ──────────────────────────────────────────────────────────

/** Tanggal yang terkunci (hari absen disetujui / periode tertutup) — diisi Tahap C/F. */
export type LockedDayCheck = (
  employeeIds: string[],
  from: string,
  to: string,
) => Promise<Set<string>>;
let lockedDays: LockedDayCheck = async () => new Set();
export function configureRosterLocks(check: LockedDayCheck) {
  lockedDays = check;
}
const dayKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

/** Karyawan dari daftar yang tanggal `date`-nya terkunci (dipakai juga oleh perubahan/tukar shift). */
export async function lockedEmployeesOn(employeeIds: string[], date: string): Promise<string[]> {
  const locked = await lockedDays(employeeIds, date, date);
  return employeeIds.filter((id) => locked.has(dayKey(id, date)));
}

export interface CellIssue {
  index: number;
  employeeId?: string;
  employeeNumber?: string;
  date: string;
  message: string;
}

async function validateCells(
  companyId: string,
  cells: { employeeId: string; date: string; code: string | null }[],
): Promise<{ issues: CellIssue[]; codes: Awaited<ReturnType<typeof shiftCodeMap>> }> {
  const codes = await shiftCodeMap(companyId);
  const employees = await directory.employeesByIds(cells.map((c) => c.employeeId));
  const dates = cells.map((c) => c.date).sort();
  const locked = dates.length
    ? await lockedDays([...employees.keys()], dates[0] as string, dates[dates.length - 1] as string)
    : new Set<string>();
  const issues: CellIssue[] = [];
  cells.forEach((cell, index) => {
    const employee = employees.get(cell.employeeId);
    if (!employee || employee.companyId !== companyId) {
      issues.push({
        index,
        employeeId: cell.employeeId,
        date: cell.date,
        message: "Karyawan bukan karyawan perusahaan ini.",
      });
    } else if (cell.code !== null && cell.code !== OFF_CODE && !codes.has(cell.code)) {
      issues.push({
        index,
        employeeId: cell.employeeId,
        date: cell.date,
        message: `Kode shift ${cell.code} tidak dikenal.`,
      });
    } else if (locked.has(dayKey(cell.employeeId, cell.date))) {
      issues.push({
        index,
        employeeId: cell.employeeId,
        date: cell.date,
        message: "Hari sudah punya absen disetujui / periode tertutup.",
      });
    }
  });
  return { issues, codes };
}

async function applyCells(
  ctx: RequestContext,
  companyId: string,
  cells: { employeeId: string; date: string; code: string | null }[],
  source: "MANUAL" | "IMPORT",
  codes: Awaited<ReturnType<typeof shiftCodeMap>>,
) {
  const before = await rosterCodes(cells.map((c) => ({ employeeId: c.employeeId, date: c.date })));
  await repository.withTransaction(async (tx) => {
    for (const cell of cells) {
      const date = toDate(cell.date);
      if (cell.code === null) await repository.deleteDay(tx, cell.employeeId, date);
      else {
        await repository.upsertDay(tx, cell.employeeId, date, {
          shiftId: cell.code === OFF_CODE ? null : (codes.get(cell.code)?.id ?? null),
          source,
        });
      }
    }
  });
  await audit(
    ctx,
    source === "MANUAL" ? "attendance.roster.edit" : "attendance.roster.import",
    "attendance.roster",
    null,
    null,
    {
      companyId,
      cells: cells.length,
    },
  );
  // TM-D13 Fase C: karyawan diberi tahu perubahan jadwalnya (hari ini ke depan).
  await notifyRosterChanges(
    cells.map((c) => {
      const key = `${c.employeeId}|${c.date}`;
      return {
        employeeId: c.employeeId,
        date: c.date,
        from: before.has(key) ? before.get(key) : undefined,
        to: c.code === null ? undefined : c.code === OFF_CODE ? null : c.code,
      };
    }),
    source === "MANUAL" ? "edit" : "import",
  );
}

export async function setRosterCells(
  ctx: RequestContext,
  input: RosterCellsInput,
): Promise<{ updated: number }> {
  assertManage(ctx.actor, input.companyId);
  const { issues, codes } = await validateCells(input.companyId, input.cells);
  if (issues.length > 0) throw new BusinessRuleError("Sebagian sel tidak bisa disimpan.", issues);
  await applyCells(ctx, input.companyId, input.cells, "MANUAL", codes);
  return { updated: input.cells.length };
}

export interface ImportPreview {
  total: number;
  valid: number;
  issues: CellIssue[];
}

async function resolveImport(input: RosterImportInput) {
  const employees = await directory.employeesByNumbers(
    input.companyId,
    input.rows.map((r) => r.employeeNumber),
  );
  const issues: CellIssue[] = [];
  const cells: { employeeId: string; date: string; code: string | null }[] = [];
  input.rows.forEach((row, index) => {
    const employee = employees.get(row.employeeNumber);
    if (!employee)
      issues.push({
        index,
        employeeNumber: row.employeeNumber,
        date: row.date,
        message: "NIP tidak ditemukan di perusahaan ini.",
      });
    else cells.push({ employeeId: employee.id, date: row.date, code: row.code });
  });
  const validation = await validateCells(input.companyId, cells);
  for (const issue of validation.issues) {
    const cell = cells[issue.index];
    const original = input.rows.findIndex(
      (r) => employees.get(r.employeeNumber)?.id === cell?.employeeId && r.date === cell?.date,
    );
    issues.push({ ...issue, index: original });
  }
  return { cells, issues, codes: validation.codes };
}

export async function previewRosterImport(
  ctx: RequestContext,
  input: RosterImportInput,
): Promise<ImportPreview> {
  assertManage(ctx.actor, input.companyId);
  const { issues } = await resolveImport(input);
  return {
    total: input.rows.length,
    valid: input.rows.length - issues.length,
    issues: issues.slice(0, 500),
  };
}

/** Simpan import: semua atau tidak sama sekali (baris bermasalah → tidak ada yang disimpan). */
export async function commitRosterImport(
  ctx: RequestContext,
  input: RosterImportInput,
): Promise<{ saved: number }> {
  assertManage(ctx.actor, input.companyId);
  const { cells, issues, codes } = await resolveImport(input);
  if (issues.length > 0)
    throw new BusinessRuleError(
      "Masih ada baris bermasalah; perbaiki lalu pratinjau ulang.",
      issues.slice(0, 500),
    );
  await applyCells(ctx, input.companyId, cells, "IMPORT", codes);
  return { saved: cells.length };
}

export { dayKey };
