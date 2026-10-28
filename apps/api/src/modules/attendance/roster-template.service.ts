import {
  crewCycleStart,
  crewLetter,
  mondayOnOrBefore,
  OFF_CODE,
  patternRestWarnings,
  type RosterTemplateAssignInput,
  type RosterTemplateDefInput,
  type RosterTemplateInput,
  type RosterTemplateInstallInput,
} from "@hris/shared";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import { type RequestContext, readTimeSettings, settingsToday } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import { isDateClosed } from "./period.service.ts";
import * as repository from "./roster.repository.ts";
import {
  audit,
  type CrewDto,
  createCrew,
  createPattern,
  createShift,
  dayKey,
  keepDayKeys,
  type PatternDto,
  type ShiftDto,
  setCrewMembers,
  validateSteps,
} from "./roster.service.ts";
import { employeesWithPendingEdit, submitTemplateEdits } from "./roster-edit.service.ts";
import { isoAddDays, patternCodeOn } from "./roster-engine.ts";

// TM-D8 — template roster siap pakai: JT (Jetty & Loading team), 13+1, 5+2. JT: 3 shift × 8 jam (7 jam normal + 1 jam
// lembur rutin, istirahat dibayar di dalam shift), pola 6 kerja + 1 OFF, rotasi maju tiap minggu
// Pagi → Sore → Malam (siklus 21 hari). Hari ke-6 (5 jam) diatur pengguna sendiri di grid roster.

interface ShiftSpec {
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  /** TM-D13: shift 3 = malam setelah tanggal roster. */
  startsNextDay?: boolean;
}

const JT_SHIFTS: ShiftSpec[] = [
  { code: "JTP", name: "JT Pagi", startMinute: 7 * 60, endMinute: 15 * 60 },
  { code: "JTS", name: "JT Sore", startMinute: 15 * 60, endMinute: 23 * 60 },
  { code: "JTM", name: "JT Malam", startMinute: 23 * 60, endMinute: 7 * 60 },
];
const JT_COLORS = ["#f59e0b", "#3b82f6", "#6366f1"];
export const JT_PATTERN_NAME = "JT 6+1 rotasi Pagi-Sore-Malam";
export const JT_CREWS = ["JT Crew A", "JT Crew B", "JT Crew C"];

/** Langkah pola JT: 6 Pagi + OFF, 6 Sore + OFF, 6 Malam + OFF. */
export const jtPatternSteps = () =>
  JT_SHIFTS.flatMap((s) => [...Array<string>(6).fill(s.code), OFF_CODE]);

export interface RosterTemplateResult {
  shifts: ShiftDto[];
  pattern: PatternDto;
  crews: CrewDto[];
  /** TM-D13 Fase D: jeda antarshift di pola yang kurang dari pengaturan (hanya peringatan). */
  restWarnings: string[];
}

interface TemplateSpec {
  shifts: (ShiftSpec & {
    color: string;
    breakMin: number;
    breakPaid: boolean;
    regularOvertimeMin: number;
  })[];
  patternName: string;
  steps: string[];
  crews: { name: string; offsetDays: number }[];
  /** 5+2: siklus harus mulai Senin supaya OFF jatuh Sabtu–Minggu. */
  startOnMonday?: boolean;
}

const OT_SHIFT = { breakMin: 60, breakPaid: true, regularOvertimeMin: 60 };
const TEMPLATES: Record<RosterTemplateInput["template"], TemplateSpec> = {
  JT: {
    shifts: JT_SHIFTS.map((s, i) => ({ ...s, ...OT_SHIFT, color: JT_COLORS[i] ?? "#0f766e" })),
    patternName: JT_PATTERN_NAME,
    steps: jtPatternSteps(),
    crews: JT_CREWS.map((name, i) => ({ name, offsetDays: 7 * i })),
  },
  // TM-D8 (grill 2026-10-21: "seperti JT"): 7 j normal + 1 j lembur rutin, istirahat dibayar.
  // Catatan: 13 hari × 7 j normal per 14 hari ≈ 45,5 j/minggu (> 40 j) — ditampilkan sebagai peringatan.
  ROT_13_1: {
    shifts: [
      {
        code: "R13",
        name: "13+1 Siang",
        startMinute: 7 * 60,
        endMinute: 15 * 60,
        ...OT_SHIFT,
        color: "#0ea5e9",
      },
    ],
    patternName: "13+1 (13 kerja, 1 OFF)",
    steps: [...Array<string>(13).fill("R13"), OFF_CODE],
    crews: [{ name: "13+1 Crew A", offsetDays: 0 }],
  },
  // TM-D13 Fase D: 3 shift × 8 jam nonstop; S3 = malam setelah tanggal roster. Rotasi 2-2-2 + 2 OFF,
  // 4 crew bergeser 2 hari → setiap shift selalu terisi satu crew.
  SHIFT_3X8: {
    shifts: [
      {
        code: "S1",
        name: "Shift 1 (Pagi)",
        startMinute: 8 * 60,
        endMinute: 16 * 60,
        color: "#0ea5e9",
      },
      { code: "S2", name: "Shift 2 (Sore)", startMinute: 16 * 60, endMinute: 0, color: "#f59e0b" },
      {
        code: "S3",
        name: "Shift 3 (Malam)",
        startMinute: 0,
        endMinute: 8 * 60,
        startsNextDay: true,
        color: "#6366f1",
      },
    ].map((s) => ({ ...s, breakMin: 60, breakPaid: true, regularOvertimeMin: 0 })),
    patternName: "3 shift × 8 jam (2-2-2 + 2 OFF)",
    steps: ["S1", "S1", "S2", "S2", "S3", "S3", OFF_CODE, OFF_CODE],
    crews: ["A", "B", "C", "D"].map((c, i) => ({ name: `3 Shift Crew ${c}`, offsetDays: 2 * i })),
  },
  WEEK_5_2: {
    shifts: [
      {
        code: "K52",
        name: "Kantor 08–17",
        startMinute: 8 * 60,
        endMinute: 17 * 60,
        breakMin: 60,
        breakPaid: false,
        regularOvertimeMin: 0,
        color: "#16a34a",
      },
    ],
    patternName: "5+2 (Senin–Jumat)",
    steps: [...Array<string>(5).fill("K52"), OFF_CODE, OFF_CODE],
    crews: [{ name: "5+2 Kantor", offsetDays: 0 }],
    startOnMonday: true,
  },
};

/** Senin pada/sebelum tanggal (YYYY-MM-DD). */
const mondayOf = (date: string) => {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return isoAddDays(date, -dow);
};

export async function applyRosterTemplate(
  ctx: RequestContext,
  input: RosterTemplateInput,
): Promise<RosterTemplateResult> {
  if (!policy.canManageRoster(ctx.actor, input.companyId)) throw new ForbiddenError();
  const spec = TEMPLATES[input.template];
  // Cek bentrok lebih dulu supaya template tidak terpasang setengah.
  const existing = new Set((await repository.listShifts(input.companyId, true)).map((s) => s.code));
  const taken = spec.shifts.filter((s) => existing.has(s.code)).map((s) => s.code);
  if (taken.length > 0) {
    throw new ConflictError(
      `Kode shift ${taken.join(", ")} sudah ada di perusahaan ini; template ini sudah dipasang?`,
    );
  }
  const patterns = await repository.listPatterns(input.companyId);
  if (patterns.some((p) => p.name === spec.patternName)) {
    throw new ConflictError(`Pola "${spec.patternName}" sudah ada.`);
  }

  const shifts: ShiftDto[] = [];
  for (const shift of spec.shifts) {
    const { color, ...rest } = shift;
    shifts.push(
      await createShift(ctx, {
        companyId: input.companyId,
        ...rest,
        checkInOpenMin: 60,
        lateToleranceMin: 15,
        earlyLeaveToleranceMin: 15,
        checkOutCloseMin: 30,
        breakStartMinute: null,
        breakEndMinute: null,
        startsNextDay: rest.startsNextDay ?? false,
        color,
      }),
    );
  }
  const pattern = await createPattern(ctx, {
    companyId: input.companyId,
    name: spec.patternName,
    steps: spec.steps,
  });
  const crews: CrewDto[] = [];
  if (input.workLocationId) {
    const start = spec.startOnMonday ? mondayOf(input.cycleStartDate) : input.cycleStartDate;
    // JT: crew B & C mulai 7 & 14 hari lebih awal → pada tanggal mulai A Pagi, B Sore, C Malam.
    for (const crew of spec.crews) {
      crews.push(
        await createCrew(ctx, {
          companyId: input.companyId,
          workLocationId: input.workLocationId,
          name: crew.name,
          patternId: pattern.id,
          cycleStartDate: isoAddDays(start, -crew.offsetDays),
        }),
      );
    }
  }
  // TM-D13 Fase D: pergantian shift berurutan dengan jeda < pengaturan → peringatan (tidak menolak).
  const restWarnings = patternRestWarnings(
    spec.steps,
    shifts,
    (await readTimeSettings()).minRestHours,
  ).map(
    (w) =>
      `Langkah ${w.index + 1}→${w.index + 2}: ${w.from} lalu ${w.to} hanya ${w.restHours} jam istirahat.`,
  );
  return { shifts, pattern, crews, restWarnings };
}

// ── TM-D23: template roster buatan HR ──────────────────────────────────────────

export interface RosterTemplateDto {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  steps: string[];
  crewCount: number;
  crewOffsetDays: number;
  startOnMonday: boolean;
  cycleLength: number;
  workDays: number;
  /** Pemasangan per lokasi kerja: pola + crew A/B/C… beserta jumlah anggota aktif hari ini. */
  installations: {
    patternId: string;
    patternName: string;
    workLocationId: string | null;
    workLocationName: string | null;
    crews: { id: string; name: string; cycleStartDate: string; memberCount: number }[];
  }[];
  updatedAt: string;
}

const isUnique = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function templateDtos(rows: repository.TemplateRow[]): Promise<RosterTemplateDto[]> {
  const locationIds = [
    ...new Set(
      rows.flatMap((r) => r.patterns.flatMap((p) => p.crews.map((c) => c.workLocationId))),
    ),
  ];
  const locations = await directory.locationsByIds(locationIds);
  const now = await settingsToday();
  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    steps: row.steps,
    crewCount: row.crewCount,
    crewOffsetDays: row.crewOffsetDays,
    startOnMonday: row.startOnMonday,
    cycleLength: row.steps.length,
    workDays: row.steps.filter((s) => s !== OFF_CODE).length,
    installations: row.patterns.map((p) => {
      const locationId = p.crews[0]?.workLocationId ?? null;
      return {
        patternId: p.id,
        patternName: p.name,
        workLocationId: locationId,
        workLocationName: locationId ? (locations.get(locationId)?.name ?? null) : null,
        crews: p.crews.map((c) => ({
          id: c.id,
          name: c.name,
          cycleStartDate: iso(c.cycleStartDate),
          memberCount: new Set(
            c.members
              .filter((m) => iso(m.startDate) <= now && (!m.endDate || iso(m.endDate) >= now))
              .map((m) => m.employeeId),
          ).size,
        })),
      };
    }),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function loadTemplate(ctx: RequestContext, id: string) {
  const row = await repository.findTemplate(id);
  if (!row || row.deletedAt) throw new NotFoundError();
  if (!policy.canManageRoster(ctx.actor, row.companyId)) throw new ForbiddenError();
  return row;
}

export async function listCustomTemplates(
  ctx: RequestContext,
  companyId: string,
): Promise<RosterTemplateDto[]> {
  if (!policy.canViewRosterSetup(ctx.actor, companyId)) throw new ForbiddenError();
  return templateDtos(await repository.listTemplates(companyId));
}

export async function createCustomTemplate(
  ctx: RequestContext,
  input: RosterTemplateDefInput,
): Promise<RosterTemplateDto> {
  if (!policy.canManageRoster(ctx.actor, input.companyId)) throw new ForbiddenError();
  await validateSteps(input.companyId, input.steps);
  try {
    const row = await repository.createTemplate({
      ...input,
      description: input.description ?? null,
    });
    await audit(
      ctx,
      "attendance.roster_template.create",
      "attendance.roster_template",
      row.id,
      null,
      {
        ...input,
      },
    );
    return (await templateDtos([row]))[0] as RosterTemplateDto;
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Template "${input.name}" sudah ada.`);
    throw error;
  }
}

export async function updateCustomTemplate(
  ctx: RequestContext,
  id: string,
  input: RosterTemplateDefInput,
): Promise<RosterTemplateDto> {
  const before = await loadTemplate(ctx, id);
  if (input.companyId !== before.companyId)
    throw new BusinessRuleError("Perusahaan template tidak bisa diubah.");
  const patternChanged =
    input.steps.join(" ") !== before.steps.join(" ") ||
    input.crewCount !== before.crewCount ||
    input.crewOffsetDays !== before.crewOffsetDays ||
    input.startOnMonday !== before.startOnMonday;
  if (patternChanged && before.patterns.length > 0) {
    throw new BusinessRuleError(
      "Template sudah dipasang; pola, jumlah crew, dan jarak geser belum bisa diubah. Buat template baru, atau ubah pola di tab Pola roster.",
    );
  }
  await validateSteps(before.companyId, input.steps);
  try {
    const row = await repository.updateTemplate(id, {
      name: input.name,
      description: input.description ?? null,
      steps: input.steps,
      crewCount: input.crewCount,
      crewOffsetDays: input.crewOffsetDays,
      startOnMonday: input.startOnMonday,
    });
    await audit(
      ctx,
      "attendance.roster_template.update",
      "attendance.roster_template",
      id,
      { name: before.name, steps: before.steps, crewCount: before.crewCount },
      { ...input },
    );
    return (await templateDtos([row]))[0] as RosterTemplateDto;
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Template "${input.name}" sudah ada.`);
    throw error;
  }
}

export async function archiveCustomTemplate(
  ctx: RequestContext,
  id: string,
): Promise<{ id: string }> {
  const before = await loadTemplate(ctx, id);
  // Pola & crew hasil pemasangan tetap berjalan; template hanya tidak bisa dipasang lagi.
  await repository.updateTemplate(id, { deletedAt: new Date() });
  await audit(
    ctx,
    "attendance.roster_template.archive",
    "attendance.roster_template",
    id,
    {
      name: before.name,
    },
    null,
  );
  return { id };
}

export interface RosterTemplateInstallResult {
  template: RosterTemplateDto;
  pattern: PatternDto;
  crews: CrewDto[];
  restWarnings: string[];
}

/** Pasang template ke lokasi kerja: 1 pola + `crewCount` crew bergeser `crewOffsetDays` hari. */
export async function installCustomTemplate(
  ctx: RequestContext,
  id: string,
  input: RosterTemplateInstallInput,
): Promise<RosterTemplateInstallResult> {
  const template = await loadTemplate(ctx, id);
  const location = (await directory.locationsByIds([input.workLocationId])).get(
    input.workLocationId,
  );
  if (!location) throw new BusinessRuleError("Lokasi kerja tidak ditemukan.");
  const patternName = `${template.name} · ${location.name}`.slice(0, 80);
  const crewNames = Array.from({ length: template.crewCount }, (_, i) =>
    `${template.name} · Crew ${crewLetter(i)} (${location.name})`.slice(0, 80),
  );
  // Cek bentrok nama lebih dulu supaya template tidak terpasang setengah.
  if ((await repository.listPatterns(template.companyId)).some((p) => p.name === patternName)) {
    throw new ConflictError(`Template "${template.name}" sudah dipasang di ${location.name}.`);
  }
  const takenCrews = (await repository.listCrews({ companyId: template.companyId }))
    .map((c) => c.name)
    .filter((name) => crewNames.includes(name));
  if (takenCrews.length > 0) throw new ConflictError(`Crew "${takenCrews[0]}" sudah ada.`);

  const pattern = await createPattern(ctx, {
    companyId: template.companyId,
    name: patternName,
    steps: template.steps,
  });
  await repository.updatePattern(pattern.id, { templateId: template.id });
  const base = template.startOnMonday
    ? mondayOnOrBefore(input.cycleStartDate)
    : input.cycleStartDate;
  const crews: CrewDto[] = [];
  for (const [i, name] of crewNames.entries()) {
    crews.push(
      await createCrew(ctx, {
        companyId: template.companyId,
        workLocationId: input.workLocationId,
        name,
        patternId: pattern.id,
        cycleStartDate: crewCycleStart(base, i, template.crewOffsetDays),
      }),
    );
  }
  await audit(ctx, "attendance.roster_template.install", "attendance.roster_template", id, null, {
    ...input,
    patternId: pattern.id,
    crewIds: crews.map((c) => c.id),
  });
  const shifts = await repository.listShifts(template.companyId);
  const restWarnings = patternRestWarnings(
    template.steps,
    shifts,
    (await readTimeSettings()).minRestHours,
  ).map((w) =>
    w.restHours < 0
      ? `Langkah ${w.index + 1}→${w.index + 2}: ${w.from} lalu ${w.to} bertabrakan ${Math.abs(w.restHours)} jam.`
      : `Langkah ${w.index + 1}→${w.index + 2}: ${w.from} lalu ${w.to} hanya ${w.restHours} jam istirahat.`,
  );
  return {
    template: (
      await templateDtos([(await repository.findTemplate(id)) as repository.TemplateRow])
    )[0] as RosterTemplateDto,
    pattern,
    crews,
    restWarnings,
  };
}

// ── TM-D23 Fase 2: isi roster karyawan dengan template (bagi rata ke crew) ─────────────

export interface RosterTemplateAssignPlan {
  /** false = template belum terpasang di lokasi itu; akan dipasang otomatis saat disimpan. */
  installed: boolean;
  cycleStartDate: string;
  crews: { name: string; existing: number; added: number }[];
  assignments: {
    employeeId: string;
    fullName: string;
    employeeNumber: string | null;
    crewName: string;
    /** Crew lama karyawan pada tanggal efektif (null = belum punya crew). */
    fromCrew: string | null;
    /** Sudah anggota crew ini → tidak dipindah. */
    stays: boolean;
    /** TM-D24: karyawan sudah ber-crew → diajukan ke atasan + HR, berlaku setelah disetujui. */
    needsApproval: boolean;
  }[];
  skipped: { employeeId: string; fullName: string | null; reason: string }[];
  /** Sel roster lama (kuas / import / tukar shift) mulai tanggal efektif yang akan ditimpa template. */
  replacedDays: number;
  /** Hari yang tidak disentuh: sudah ada absennya, absen disetujui, atau periode tertutup. */
  lockedDays: number;
  /** TM-D24 (mundur): hari lalu tanpa absen yang menjadi hari kerja → akan ditandai Alpha (perlu verifikasi). */
  newAlphaDays: number;
  /** TM-D24: jumlah karyawan yang perubahannya diajukan (bukan langsung berlaku). */
  approvalCount: number;
  restWarnings: string[];
}

const crewNameOf = (templateName: string, index: number, locationName: string) =>
  `${templateName} · Crew ${crewLetter(index)} (${locationName})`.slice(0, 80);

async function planAssignment(ctx: RequestContext, id: string, input: RosterTemplateAssignInput) {
  const template = await loadTemplate(ctx, id);
  const location = (await directory.locationsByIds([input.workLocationId])).get(
    input.workLocationId,
  );
  if (!location) throw new BusinessRuleError("Lokasi kerja tidak ditemukan.");
  const today = await settingsToday();
  // TM-D24 (Mat 2026-10-28): boleh mundur selama periode bulan-bulan itu belum ditutup.
  if (input.effectiveDate < today) {
    for (let month = input.effectiveDate.slice(0, 7); month <= today.slice(0, 7); ) {
      if (await isDateClosed(template.companyId, `${month}-01`)) {
        throw new BusinessRuleError(
          `Periode ${month} sudah ditutup; tanggal berlaku tidak boleh di periode tertutup.`,
        );
      }
      const [y, m] = month.split("-").map(Number) as [number, number];
      month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }
  }
  const installation = template.patterns.find((p) =>
    p.crews.some((c) => c.workLocationId === input.workLocationId),
  );
  const crews = installation
    ? installation.crews.filter((c) => c.workLocationId === input.workLocationId)
    : Array.from({ length: template.crewCount }, (_, i) => ({
        id: null as string | null,
        name: crewNameOf(template.name, i, location.name),
        members: [] as { employeeId: string; startDate: Date; endDate: Date | null }[],
      }));
  const effective = new Date(`${input.effectiveDate}T00:00:00Z`);
  const activeOn = (m: { startDate: Date; endDate: Date | null }) =>
    m.startDate <= effective && (!m.endDate || m.endDate >= effective);

  const people = await directory.employeesByIds(input.employeeIds);
  const skipped: RosterTemplateAssignPlan["skipped"] = [];
  const valid = [...new Set(input.employeeIds)].filter((employeeId) => {
    const e = people.get(employeeId);
    if (!e?.isActive)
      skipped.push({ employeeId, fullName: e?.fullName ?? null, reason: "Tidak aktif" });
    else if (e.companyId !== template.companyId)
      skipped.push({ employeeId, fullName: e.fullName, reason: "Bukan karyawan PT template ini" });
    else return true;
    return false;
  });
  // TM-D24: satu pengajuan menunggu per karyawan.
  const pending = await employeesWithPendingEdit(valid);
  for (const employeeId of [...valid]) {
    if (!pending.has(employeeId)) continue;
    skipped.push({
      employeeId,
      fullName: people.get(employeeId)?.fullName ?? null,
      reason: "Masih ada perubahan jadwal yang menunggu persetujuan",
    });
    valid.splice(valid.indexOf(employeeId), 1);
  }
  const settings = await readTimeSettings();
  const horizon = isoAddDays(today, settings.rosterHorizonDays);
  const manual = valid.length
    ? await repository.nonPatternDaysBetween(valid, effective, new Date(`${horizon}T00:00:00Z`))
    : [];
  // Terkunci + sudah ada absennya (hari lalu) → jadwal tidak diubah.
  const locked = valid.length
    ? await keepDayKeys(valid, input.effectiveDate, horizon)
    : new Set<string>();
  const replaceable = manual.filter(
    (d) => !locked.has(dayKey(d.employeeId, d.workDate.toISOString().slice(0, 10))),
  );
  const replacing = new Set(replaceable.map((d) => d.employeeId));
  const current = new Map(
    (await repository.membershipsOn(valid, effective)).map((m) => [m.employeeId, m.crew]),
  );
  // Anggota yang sudah di salah satu crew pemasangan ini tetap; sisanya diisi ke crew paling sedikit.
  const counts = crews.map(
    (c) => new Set(c.members.filter(activeOn).map((m) => m.employeeId)).size,
  );
  const existing = [...counts];
  const assignments: RosterTemplateAssignPlan["assignments"] = [];
  const movers: string[] = [];
  const crewIndexOf = new Map<string, number>();
  for (const employeeId of valid) {
    const index = crews.findIndex((c) =>
      c.members.some((m) => m.employeeId === employeeId && activeOn(m)),
    );
    if (index >= 0) {
      const e = people.get(employeeId);
      crewIndexOf.set(employeeId, index);
      assignments.push({
        employeeId,
        fullName: e?.fullName ?? "",
        employeeNumber: e?.employeeNumber ?? null,
        crewName: crews[index]?.name ?? "",
        fromCrew: crews[index]?.name ?? null,
        stays: true,
        // Tetap di crew: hanya berubah bila ada sel lama yang ditimpa.
        needsApproval: replacing.has(employeeId),
      });
    } else movers.push(employeeId);
  }
  movers.sort((a, b) =>
    (people.get(a)?.fullName ?? "").localeCompare(people.get(b)?.fullName ?? ""),
  );
  const target = new Map<string, number>();
  for (const employeeId of movers) {
    let best = 0;
    for (let i = 1; i < counts.length; i++) if ((counts[i] ?? 0) < (counts[best] ?? 0)) best = i;
    counts[best] = (counts[best] ?? 0) + 1;
    target.set(employeeId, best);
    crewIndexOf.set(employeeId, best);
    const e = people.get(employeeId);
    assignments.push({
      employeeId,
      fullName: e?.fullName ?? "",
      employeeNumber: e?.employeeNumber ?? null,
      crewName: crews[best]?.name ?? "",
      fromCrew: current.get(employeeId)?.name ?? null,
      stays: false,
      needsApproval: current.has(employeeId),
    });
  }
  assignments.sort(
    (a, b) => a.crewName.localeCompare(b.crewName) || a.fullName.localeCompare(b.fullName),
  );

  // Hari lalu (tanggal berlaku s.d. kemarin) yang akan menjadi hari kerja tanpa absen → Alpha.
  let newAlphaDays = 0;
  if (input.effectiveDate < today) {
    const steps = installation?.steps ?? template.steps;
    const base = template.startOnMonday
      ? mondayOnOrBefore(input.cycleStartDate ?? input.effectiveDate)
      : (input.cycleStartDate ?? input.effectiveDate);
    for (const a of assignments) {
      if (a.stays && !a.needsApproval) continue;
      const index = crewIndexOf.get(a.employeeId) ?? 0;
      const crew = crews[index];
      const cycle =
        crew && "cycleStartDate" in crew
          ? (crew.cycleStartDate as Date).toISOString().slice(0, 10)
          : crewCycleStart(base, index, template.crewOffsetDays);
      for (let d = input.effectiveDate; d < today; d = isoAddDays(d, 1)) {
        if (locked.has(dayKey(a.employeeId, d))) continue;
        if (patternCodeOn(steps, cycle, d) !== OFF_CODE) newAlphaDays++;
      }
    }
  }
  const shifts = await repository.listShifts(template.companyId);
  const plan: RosterTemplateAssignPlan = {
    installed: Boolean(installation),
    cycleStartDate: installation
      ? crews[0] && "cycleStartDate" in crews[0]
        ? (crews[0].cycleStartDate as Date).toISOString().slice(0, 10)
        : input.effectiveDate
      : (input.cycleStartDate ?? input.effectiveDate),
    crews: crews.map((c, i) => ({
      name: c.name,
      existing: existing[i] ?? 0,
      added: (counts[i] ?? 0) - (existing[i] ?? 0),
    })),
    assignments,
    skipped,
    replacedDays: replaceable.length,
    lockedDays: locked.size,
    approvalCount: assignments.filter((a) => a.needsApproval).length,
    newAlphaDays,
    restWarnings: patternRestWarnings(template.steps, shifts, settings.minRestHours).map((w) =>
      w.restHours < 0
        ? `Langkah ${w.index + 1}→${w.index + 2}: ${w.from} lalu ${w.to} bertabrakan ${Math.abs(w.restHours)} jam.`
        : `Langkah ${w.index + 1}→${w.index + 2}: ${w.from} lalu ${w.to} hanya ${w.restHours} jam istirahat.`,
    ),
  };
  return { template, crews, target, crewIndexOf, plan, replaceable, keep: locked };
}

export async function previewTemplateAssignment(
  ctx: RequestContext,
  id: string,
  input: RosterTemplateAssignInput,
): Promise<RosterTemplateAssignPlan> {
  return (await planAssignment(ctx, id, input)).plan;
}

export async function applyTemplateAssignment(
  ctx: RequestContext,
  id: string,
  input: RosterTemplateAssignInput,
): Promise<RosterTemplateAssignPlan> {
  const { template, plan, crewIndexOf, replaceable, keep } = await planAssignment(ctx, id, input);
  const today = await settingsToday();
  // Langsung berlaku: karyawan yang belum punya crew. Yang sudah ber-crew → pengajuan (TM-D24).
  const direct = plan.assignments.filter((a) => !a.stays && !a.needsApproval);
  const approval = plan.assignments.filter((a) => a.needsApproval);
  if (direct.length === 0 && approval.length === 0) {
    throw new BusinessRuleError("Tidak ada perubahan roster untuk karyawan terpilih.");
  }
  if (!plan.installed) {
    await installCustomTemplate(ctx, id, {
      workLocationId: input.workLocationId,
      cycleStartDate: plan.cycleStartDate,
    });
  }
  // Muat ulang crew pemasangan (baru dibuat atau sudah ada) berurutan A, B, C…
  const fresh = await repository.findTemplate(id);
  const crews = (
    fresh?.patterns.find((p) => p.crews.some((c) => c.workLocationId === input.workLocationId))
      ?.crews ?? []
  ).filter((c) => c.workLocationId === input.workLocationId);
  const directIds = new Set(direct.map((a) => a.employeeId));
  const directDays = replaceable.filter((d) => directIds.has(d.employeeId));
  if (directDays.length > 0) {
    // Paksa tempel: sel lama dihapus dulu supaya hari pola mengisi tanggal itu (hari terkunci tidak ikut).
    await repository.deleteRosterDays(directDays.map((d) => d.id));
  }
  const effective = new Date(`${input.effectiveDate}T00:00:00Z`);
  for (const [index, crew] of crews.entries()) {
    const added = direct
      .filter((a) => crewIndexOf.get(a.employeeId) === index)
      .map((a) => a.employeeId);
    if (added.length === 0) continue;
    const members = crew.members
      .filter((m) => m.startDate <= effective && (!m.endDate || m.endDate >= effective))
      .map((m) => m.employeeId);
    await setCrewMembers(
      ctx,
      crew.id,
      { employeeIds: [...new Set([...members, ...added])], effectiveDate: input.effectiveDate },
      input.effectiveDate < today
        ? { employeeIds: added, from: input.effectiveDate, keep }
        : undefined,
    );
  }
  const submitted = await submitTemplateEdits(ctx, {
    companyId: template.companyId,
    effectiveDate: input.effectiveDate,
    payload: { templateId: id, templateName: template.name, workLocationId: input.workLocationId },
    employees: approval.flatMap((a) => {
      const crew = crews[crewIndexOf.get(a.employeeId) ?? -1];
      return crew ? [{ employeeId: a.employeeId, crewId: crew.id, crewName: crew.name }] : [];
    }),
  });
  await audit(ctx, "attendance.roster_template.assign", "attendance.roster_template", id, null, {
    ...input,
    assigned: direct.map((a) => a.employeeId),
    submitted,
    replacedDays: directDays.length,
  });
  return plan;
}
