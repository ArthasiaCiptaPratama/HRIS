import {
  DEFAULT_WORK_ROSTERS,
  type EmployeeResidencyInput,
  type LocalHomebasesInput,
  RESIDENCY_LABELS,
  type Residency,
  type WorkRosterAssignInput,
  type WorkRosterInput,
  workRosterLength,
  workRosterSteps,
  workRosterSummary,
} from "@hris/shared";
import { isHiddenEmployee } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import { type RequestContext, settingsToday } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import { listShifts } from "./roster.repository.ts";
import {
  applyTemplateAssignment,
  createCustomTemplate,
  previewTemplateAssignment,
  type RosterTemplateAssignPlan,
} from "./roster-template.service.ts";
import * as repository from "./work-roster.repository.ts";

// TM-D28 (Mat 2026-11-13): roster (di tampilan "Pola Kerja") = siklus kerja–libur (office 5/2; lapangan
// non-lokal 13/1 × N + time off; lapangan lokal 6/1).
// Jadwal tetap mesin TM-D23/TM-D24: roster + shift hari kerja dirakit menjadi template jadwal (langkah
// shift / OFF / TO), lalu karyawan dipasang lewat "isi dengan template" yang sudah ada (bagi rata ke crew,
// karyawan ber-crew lewat approval). Lokal/non-lokal: override HR → Homebase ∈ Homebase lokal lokasi kerja.

export interface WorkRosterDto {
  id: string;
  companyId: string;
  name: string;
  residency: Residency;
  workDays: number;
  offDays: number;
  cyclesBeforeTimeOff: number;
  timeOffDays: number;
  crewCount: number;
  cycleLength: number;
  summary: string;
  /** Sudah dirakit menjadi template jadwal → siklus & jumlah crew terkunci. */
  inUse: boolean;
}

const dto = (row: repository.WorkRosterRow): WorkRosterDto => ({
  id: row.id,
  companyId: row.companyId,
  name: row.name,
  residency: row.residency,
  workDays: row.workDays,
  offDays: row.offDays,
  cyclesBeforeTimeOff: row.cyclesBeforeTimeOff,
  timeOffDays: row.timeOffDays,
  crewCount: row.crewCount,
  cycleLength: workRosterLength(row),
  summary: workRosterSummary(row),
  inUse: row._count.templates > 0,
});

const isUnique = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

async function audit(
  ctx: RequestContext,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action,
    entityType,
    entityId,
    before: before as never,
    after: after as never,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
}

function assertManage(ctx: RequestContext, companyId: string) {
  if (!policy.canManageRoster(ctx.actor, companyId)) throw new ForbiddenError();
}

async function loadRoster(ctx: RequestContext, id: string) {
  const row = await repository.findWorkRoster(id);
  if (!row || !policy.canViewRosterSetup(ctx.actor, row.companyId)) {
    throw new NotFoundError("Pola kerja tidak ditemukan.");
  }
  return row;
}

// ── Master roster ──────────────────────────────────────────────────────────────

export async function listWorkRosters(
  ctx: RequestContext,
  companyId: string,
): Promise<WorkRosterDto[]> {
  if (!policy.canViewRosterSetup(ctx.actor, companyId)) throw new ForbiddenError();
  return (await repository.listWorkRosters(companyId)).map(dto);
}

export async function createWorkRoster(
  ctx: RequestContext,
  input: WorkRosterInput,
): Promise<WorkRosterDto> {
  assertManage(ctx, input.companyId);
  try {
    const row = await repository.createWorkRoster(input);
    await audit(
      ctx,
      "attendance.work_roster.create",
      "attendance.work_roster",
      row.id,
      null,
      input,
    );
    return dto(row);
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Pola kerja "${input.name}" sudah ada.`);
    throw error;
  }
}

/** Buat pola kerja bawaan (office 5/2, non-lokal 13/1 + time off, lokal 6/1) yang namanya belum ada. */
export async function createDefaultWorkRosters(
  ctx: RequestContext,
  companyId: string,
): Promise<WorkRosterDto[]> {
  assertManage(ctx, companyId);
  const existing = new Set((await repository.listWorkRosters(companyId)).map((r) => r.name));
  for (const def of DEFAULT_WORK_ROSTERS) {
    if (!existing.has(def.name)) await createWorkRoster(ctx, { ...def, companyId });
  }
  return listWorkRosters(ctx, companyId);
}

const CYCLE_FIELDS = [
  "workDays",
  "offDays",
  "cyclesBeforeTimeOff",
  "timeOffDays",
  "crewCount",
] as const;

export async function updateWorkRoster(
  ctx: RequestContext,
  id: string,
  input: WorkRosterInput,
): Promise<WorkRosterDto> {
  const row = await loadRoster(ctx, id);
  assertManage(ctx, row.companyId);
  if (input.companyId !== row.companyId)
    throw new BusinessRuleError("PT pola kerja tidak bisa diubah.");
  // Sama dengan template jadwal TM-D23: yang sudah dirakit/dipasang tidak diubah siklusnya.
  if (row._count.templates > 0 && CYCLE_FIELDS.some((f) => input[f] !== row[f])) {
    throw new BusinessRuleError(
      "Pola kerja sudah dipakai untuk mengisi jadwal; siklus dan jumlah crew tidak bisa diubah. Buat pola kerja baru.",
    );
  }
  try {
    const updated = await repository.updateWorkRoster(id, {
      name: input.name,
      residency: input.residency,
      ...Object.fromEntries(CYCLE_FIELDS.map((f) => [f, input[f]])),
    });
    await audit(
      ctx,
      "attendance.work_roster.update",
      "attendance.work_roster",
      id,
      dto(row),
      input,
    );
    return dto(updated);
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Pola kerja "${input.name}" sudah ada.`);
    throw error;
  }
}

export async function archiveWorkRoster(ctx: RequestContext, id: string) {
  const row = await loadRoster(ctx, id);
  assertManage(ctx, row.companyId);
  // Nama dibebaskan supaya bisa dipakai lagi; template jadwal yang sudah terpasang tetap berjalan.
  await repository.updateWorkRoster(id, {
    deletedAt: new Date(),
    name: `${row.name.slice(0, 40)} (arsip ${Date.now().toString(36)})`,
  });
  await audit(ctx, "attendance.work_roster.archive", "attendance.work_roster", id, dto(row), null);
  return { id };
}

// ── Homebase lokal per lokasi kerja ──────────────────────────────────────────────

export interface LocalHomebasesView {
  homebases: directory.DirectoryHomebase[];
  locations: {
    id: string;
    name: string;
    city: string | null;
    /** Lokasi kantor → karyawannya memakai pola kerja office. */
    office: boolean;
    homebaseIds: string[];
  }[];
}

const canSetLocalHomebases = (ctx: RequestContext) =>
  ctx.actor.role === "SUPER_ADMIN" || ctx.actor.role === "HR_ADMIN";

export async function getLocalHomebases(ctx: RequestContext): Promise<LocalHomebasesView> {
  if (!canSetLocalHomebases(ctx)) throw new ForbiddenError();
  const [homebases, locations, mapping, offices] = await Promise.all([
    directory.activeHomebases(),
    directory.activeLocations(),
    repository.localHomebases(),
    repository.officeLocations(),
  ]);
  return {
    homebases,
    locations: locations
      .map((l) => ({
        id: l.id,
        name: l.name,
        city: l.city,
        office: offices.has(l.id),
        homebaseIds: mapping.get(l.id) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "id")),
  };
}

export async function setLocalHomebases(ctx: RequestContext, input: LocalHomebasesInput) {
  if (!canSetLocalHomebases(ctx)) throw new ForbiddenError();
  const location = (await directory.locationsByIds([input.workLocationId])).get(
    input.workLocationId,
  );
  if (!location) throw new NotFoundError("Lokasi kerja tidak ditemukan.");
  const known = new Set((await directory.activeHomebases()).map((h) => h.id));
  const ids = [...new Set(input.homebaseIds)];
  if (ids.some((id) => !known.has(id))) throw new BusinessRuleError("Homebase tidak dikenal.");
  const before = {
    office: (await repository.officeLocations([input.workLocationId])).has(input.workLocationId),
    homebaseIds:
      (await repository.localHomebases([input.workLocationId])).get(input.workLocationId) ?? [],
  };
  await repository.replaceLocationSetting(
    input.workLocationId,
    input.office,
    ids,
    ctx.actor.accountId,
  );
  await audit(
    ctx,
    "attendance.local_homebases.set",
    "organization.work_location",
    input.workLocationId,
    before,
    { office: input.office, homebaseIds: ids },
  );
  return { workLocationId: input.workLocationId, office: input.office, homebaseIds: ids };
}

// ── Lokal / non-lokal karyawan ───────────────────────────────────────────────────

/** OVERRIDE = diatur HR; LOCATION = lokasi kerja kantor; HOMEBASE = Homebase vs Homebase lokal. */
export type ResidencySource = "OVERRIDE" | "LOCATION" | "HOMEBASE" | "UNKNOWN";

export interface EmployeeResidencyRow {
  employeeId: string;
  fullName: string;
  employeeNumber: string | null;
  homebase: { id: string; name: string } | null;
  workLocation: { id: string; name: string } | null;
  /** Hasil akhir (null = belum bisa ditentukan → HR wajib memilih). */
  residency: Residency | null;
  source: ResidencySource;
  /** Alasan bila UNKNOWN. */
  note: string | null;
  override: Residency | null;
}

interface Resolved {
  residency: Residency | null;
  source: ResidencySource;
  note: string | null;
}

/**
 * Override HR → lokasi kerja kantor → OFFICE → Homebase karyawan ada di daftar Homebase lokal lokasi kerja →
 * LAPANGAN LOKAL, tidak ada → LAPANGAN NON-LOKAL. Tanpa Homebase / lokasi tanpa daftar Homebase lokal →
 * belum diketahui (Mat: wajib dipilih HR).
 */
function resolveResidency(
  override: Residency | undefined,
  homebaseId: string | null,
  locationId: string | null,
  mapping: Map<string, string[]>,
  offices: Set<string>,
): Resolved {
  if (override) return { residency: override, source: "OVERRIDE", note: null };
  if (locationId && offices.has(locationId)) {
    return { residency: "OFFICE", source: "LOCATION", note: null };
  }
  if (!homebaseId) {
    return { residency: null, source: "UNKNOWN", note: "Homebase belum diisi" };
  }
  if (!locationId) return { residency: null, source: "UNKNOWN", note: "Lokasi kerja belum diisi" };
  const local = mapping.get(locationId);
  if (!local || local.length === 0) {
    return { residency: null, source: "UNKNOWN", note: "Homebase lokal lokasi ini belum diatur" };
  }
  return {
    residency: local.includes(homebaseId) ? "LOCAL" : "NON_LOCAL",
    source: "HOMEBASE",
    note: null,
  };
}

/** Lokal/non-lokal per karyawan pada tanggal & lokasi kerja (bawaan: lokasi kerja karyawan). */
async function residenciesOf(
  employees: directory.DirectoryEmployee[],
  date: string,
  workLocationId?: string,
) {
  const ids = employees.map((e) => e.id);
  const [overrides, homebases] = await Promise.all([
    repository.residencyOverrides(ids),
    directory.homebasesOn(ids, date),
  ]);
  const locationIds = [
    ...new Set(
      employees
        .map((e) => workLocationId ?? e.workLocationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const mapping = await repository.localHomebases(locationIds);
  const offices = await repository.officeLocations(locationIds);
  return new Map(
    employees.map((e) => {
      const homebase = homebases.get(e.id) ?? null;
      const locationId = workLocationId ?? e.workLocationId;
      return [
        e.id,
        {
          homebase,
          locationId,
          override: overrides.get(e.id) ?? null,
          ...resolveResidency(
            overrides.get(e.id),
            homebase?.homebaseId ?? null,
            locationId,
            mapping,
            offices,
          ),
        },
      ];
    }),
  );
}

export async function listEmployeeResidencies(
  ctx: RequestContext,
  companyId: string,
  q?: string,
): Promise<EmployeeResidencyRow[]> {
  // Homebase karyawan lain = data pribadi → hanya pengelola jadwal (SA, HR PT).
  assertManage(ctx, companyId);
  const employees = await directory.activeEmployeesInCompany(
    ctx.actor,
    companyId,
    q?.trim() || undefined,
  );
  const resolved = await residenciesOf(employees, await settingsToday());
  const locations = await directory.locationsByIds(
    employees.map((e) => e.workLocationId).filter((id): id is string => Boolean(id)),
  );
  return employees
    .map((e) => {
      const r = resolved.get(e.id);
      const loc = e.workLocationId ? locations.get(e.workLocationId) : undefined;
      return {
        employeeId: e.id,
        fullName: e.fullName,
        employeeNumber: e.employeeNumber,
        homebase: r?.homebase ? { id: r.homebase.homebaseId, name: r.homebase.name } : null,
        workLocation: loc ? { id: loc.id, name: loc.name } : null,
        residency: r?.residency ?? null,
        source: r?.source ?? "UNKNOWN",
        note: r?.note ?? null,
        override: r?.override ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));
}

export async function setEmployeeResidency(ctx: RequestContext, input: EmployeeResidencyInput) {
  assertManage(ctx, input.companyId);
  const people = await directory.employeesByIds(input.employeeIds);
  const ids = [...new Set(input.employeeIds)];
  if (
    ids.some(
      (id) => isHiddenEmployee(ctx.actor, id) || people.get(id)?.companyId !== input.companyId,
    )
  ) {
    throw new BusinessRuleError("Semua karyawan harus dari PT yang dipilih.");
  }
  const before = await repository.residencyOverrides(ids);
  const updated = await repository.setResidencyOverrides(ids, input.residency, ctx.actor.accountId);
  for (const id of ids) {
    await audit(
      ctx,
      "attendance.employee_residency.set",
      "attendance.employee_residency",
      id,
      { residency: before.get(id) ?? null },
      { residency: input.residency },
    );
  }
  return { updated };
}

// ── Isi jadwal dengan pola kerja ─────────────────────────────────────────────────

/** Template jadwal hasil pola kerja + shift (dibuat sekali, dipakai ulang). */
async function ensureTemplate(
  ctx: RequestContext,
  roster: repository.WorkRosterRow,
  shiftCode: string,
) {
  const steps = workRosterSteps(roster, shiftCode);
  const same = (await repository.templatesOfRoster(roster.id)).find(
    (t) => t.steps.length === steps.length && t.steps.every((s, i) => s === steps[i]),
  );
  if (same) return { id: same.id, name: same.name };
  const base = `Pola kerja ${roster.name} · ${shiftCode}`.slice(0, 56);
  let name = base;
  for (let n = 2; await repository.templateNameTaken(roster.companyId, name); n++) {
    name = `${base} ${n}`;
  }
  const length = workRosterLength(roster);
  const weekly = length === 7 && roster.cyclesBeforeTimeOff === 0;
  const created = await createCustomTemplate(ctx, {
    companyId: roster.companyId,
    name,
    description: `TM-D28: ${workRosterSummary(roster)}, hari kerja ${shiftCode}.`,
    steps,
    crewCount: roster.crewCount,
    crewOffsetDays: roster.crewCount > 1 ? Math.floor(length / roster.crewCount) : 0,
    // Siklus mingguan (office 5/2, lokal 6/1): OFF jatuh di akhir pekan.
    startOnMonday: weekly,
  });
  await repository.linkTemplate(created.id, roster.id);
  return { id: created.id, name: created.name };
}

export interface WorkRosterAssignGroup {
  residency: Residency;
  roster: WorkRosterDto;
  templateName: string;
  plan: RosterTemplateAssignPlan;
}

export interface WorkRosterAssignPreview {
  groups: WorkRosterAssignGroup[];
  /** Kelompok belum bisa ditentukan, atau pola kerja kelompoknya tidak dipilih → tidak dipasang. */
  unresolved: { employeeId: string; fullName: string; reason: string }[];
}

async function planWorkRoster(
  ctx: RequestContext,
  input: WorkRosterAssignInput,
  apply: boolean,
): Promise<WorkRosterAssignPreview> {
  assertManage(ctx, input.companyId);
  if (!input.officeRosterId && !input.localRosterId && !input.nonLocalRosterId) {
    throw new BusinessRuleError("Pilih pola kerja untuk minimal satu kelompok karyawan.");
  }
  const rosters = new Map<Residency, repository.WorkRosterRow>();
  for (const [residency, id] of [
    ["OFFICE", input.officeRosterId],
    ["LOCAL", input.localRosterId],
    ["NON_LOCAL", input.nonLocalRosterId],
  ] as const) {
    if (!id) continue;
    const row = await loadRoster(ctx, id);
    if (row.companyId !== input.companyId) {
      throw new BusinessRuleError("Pola kerja bukan milik PT yang dipilih.");
    }
    rosters.set(residency, row);
  }
  const shifts = await listShifts(input.companyId);
  if (!shifts.some((s) => s.code === input.shiftCode)) {
    throw new BusinessRuleError(`Shift ${input.shiftCode} tidak ada di PT ini.`);
  }
  // Lokasi kerja master global (tanpa PT) → cukup dipastikan ada sebelum dipakai menentukan kelompok.
  if (!(await directory.locationsByIds([input.workLocationId])).has(input.workLocationId)) {
    throw new NotFoundError("Lokasi kerja tidak ditemukan.");
  }
  // Pola setEmployeeResidency: semua karyawan harus dari PT yang dipilih (dicek sebelum nama/kelompok
  // diproses, supaya pratinjau tidak membocorkan data karyawan PT lain atau ID yang tidak dikenal).
  const people = await directory.employeesByIds(input.employeeIds);
  const ids = [...new Set(input.employeeIds)];
  if (
    ids.some(
      (id) => isHiddenEmployee(ctx.actor, id) || people.get(id)?.companyId !== input.companyId,
    )
  ) {
    throw new BusinessRuleError("Semua karyawan harus dari PT yang dipilih.");
  }
  const employees = ids.map((id) => people.get(id) as directory.DirectoryEmployee);
  const resolved = await residenciesOf(employees, input.effectiveDate, input.workLocationId);

  const unresolved: WorkRosterAssignPreview["unresolved"] = [];
  const buckets = new Map<Residency, string[]>();
  for (const e of employees) {
    const r = resolved.get(e.id);
    if (!r?.residency) {
      unresolved.push({
        employeeId: e.id,
        fullName: e.fullName,
        reason: `${r?.note ?? "Belum diketahui"} — pilih kelompoknya`,
      });
    } else if (!rosters.has(r.residency)) {
      unresolved.push({
        employeeId: e.id,
        fullName: e.fullName,
        reason: `Pola kerja ${RESIDENCY_LABELS[r.residency].toLowerCase()} tidak dipilih`,
      });
    } else {
      buckets.set(r.residency, [...(buckets.get(r.residency) ?? []), e.id]);
    }
  }

  const groups: WorkRosterAssignGroup[] = [];
  for (const [residency, employeeIds] of buckets) {
    const roster = rosters.get(residency) as repository.WorkRosterRow;
    const template = await ensureTemplate(ctx, roster, input.shiftCode);
    const args = {
      workLocationId: input.workLocationId,
      employeeIds,
      effectiveDate: input.effectiveDate,
      cycleStartDate: input.effectiveDate,
    };
    let plan: RosterTemplateAssignPlan;
    if (!apply) plan = await previewTemplateAssignment(ctx, template.id, args);
    else {
      try {
        plan = await applyTemplateAssignment(ctx, template.id, args);
      } catch (error) {
        // Kelompok tanpa perubahan (semua sudah di crew pola ini) tidak menggagalkan kelompok lain.
        if (error instanceof BusinessRuleError && buckets.size > 1) {
          plan = await previewTemplateAssignment(ctx, template.id, args);
        } else throw error;
      }
    }
    groups.push({
      residency,
      roster: dto((await repository.findWorkRoster(roster.id)) ?? roster),
      templateName: template.name,
      plan,
    });
  }
  return { groups, unresolved };
}

export const previewWorkRosterAssignment = (ctx: RequestContext, input: WorkRosterAssignInput) =>
  planWorkRoster(ctx, input, false);

export async function applyWorkRosterAssignment(
  ctx: RequestContext,
  input: WorkRosterAssignInput,
): Promise<WorkRosterAssignPreview> {
  const result = await planWorkRoster(ctx, input, true);
  if (result.groups.length === 0) {
    throw new BusinessRuleError(
      "Tidak ada karyawan yang bisa dipasangi pola kerja. Lengkapi Homebase atau pilih kelompoknya.",
    );
  }
  await audit(
    ctx,
    "attendance.work_roster.assign",
    "attendance.work_roster",
    input.companyId,
    null,
    {
      ...input,
      groups: result.groups.map((g) => ({
        residency: g.residency,
        rosterId: g.roster.id,
        template: g.templateName,
        employees: g.plan.assignments.map((a) => a.employeeId),
      })),
      unresolved: result.unresolved.map((u) => u.employeeId),
    },
  );
  return result;
}
