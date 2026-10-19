import {
  attachWarningScanInputSchema,
  disciplineSettingsInputSchema,
  formatWarningNumber,
  isAboveSuggestion,
  issueWarningLetterInputSchema,
  revokeWarningLetterInputSchema,
  suggestWarningLevel,
  violationTypeInputSchema,
  WARNING_LEVEL_LABELS,
  type WarningLetterState,
  type WarningLevel,
  warningEffectiveUntil,
  warningLetterBulkDraftInputSchema,
  warningLetterDraftInputSchema,
  warningLetterState,
} from "@hris/shared";
import type { z } from "zod";
import type { Actor, EmployeeTarget } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import { alphaDaysForEvidence, type StatementRow } from "../attendance/index.ts";
import {
  type EmployeeBrief,
  getEmployeeBriefs,
  getEmployeeDocumentRef,
  listEmployeeBriefs,
} from "../employee/index.ts";
import { getAccountSummaries, getEmployeeAccountStates } from "../iam/index.ts";
import { notify, type Recipient } from "../notification/index.ts";
import { getMasterLookup, type MasterLookup } from "../organization/index.ts";
import * as policy from "./discipline.policy.ts";
import * as repo from "./discipline.repository.ts";
import { buildWarningLetterPdf } from "./warning-letter-pdf.ts";

// ARS-D7–D13 (Arsip gelombang 2b, D-057): surat peringatan. Aturan & keputusan:
// docs/features/arsip/README.md#keputusan. Data karyawan hanya lewat employee/index.ts (aturan emas #3).

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

/** Kode jenis dokumen scan SP di katalog D-055. */
export const WARNING_LETTER_DOCUMENT_TYPE = "WARNING_LETTER";
/** Link web (dipakai notifikasi & cron). */
export const LETTERS_LINK = "/personal/arsip/peringatan";
export const SELF_LINK = "/ess?tab=sp";

const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
export const todayInJakarta = (now = new Date()) => JAKARTA_DATE.format(now);
export const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const toIso = (date: Date) => date.toISOString().slice(0, 10);
const isoOrNull = (date: Date | null) => (date ? toIso(date) : null);

function parse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

const audit = (
  ctx: RequestContext,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string | null;
  },
  tx?: repo.DisciplineTx,
) =>
  writeAudit(
    {
      actorAccountId: ctx.actor.accountId,
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
      ...entry,
    },
    tx,
  );

const target = (e: EmployeeBrief): EmployeeTarget => ({
  employeeId: e.id,
  managerId: e.managerId,
  companyId: e.companyId,
});

const letterTarget = (l: repo.LetterRow): policy.LetterTarget => ({
  companyId: l.companyId,
  status: l.status,
  managerEmployeeId: l.managerEmployeeId,
});

// --- DTO ---

const personDto = (e: EmployeeBrief | undefined, id: string) => ({
  employeeId: id,
  fullName: e?.fullName ?? "(karyawan tidak ditemukan)",
  employeeNumber: e?.employeeNumber ?? null,
  companyId: e?.companyId ?? null,
  isActive: e?.isActive ?? false,
});

function stateOf(l: repo.LetterRow, today: string): WarningLetterState {
  return warningLetterState(
    {
      status: l.status,
      effectiveUntil: isoOrNull(l.effectiveUntil),
      deliveredAt: l.deliveredAt?.toISOString() ?? null,
      acknowledgedAt: l.acknowledgedAt?.toISOString() ?? null,
    },
    today,
  );
}

function letterDto(
  ctx: RequestContext,
  l: repo.LetterRow,
  briefs: Map<string, EmployeeBrief>,
  lookup: MasterLookup,
  today: string,
  reachable: Set<string>,
) {
  const employee = briefs.get(l.employeeId);
  const managerId = l.managerEmployeeId ?? employee?.managerId ?? null;
  const manager = managerId ? briefs.get(managerId) : undefined;
  const internal = policy.canSeeInternalNotes(ctx.actor, l.companyId);
  const t = employee ? target(employee) : null;
  const state = stateOf(l, today);
  const writer = policy.canWriteLetters(ctx.actor, l.companyId);
  const live = l.status === "ISSUED" || l.status === "EXPIRED";
  return {
    id: l.id,
    employee: personDto(employee, l.employeeId),
    companyId: l.companyId,
    companyName: lookup.companies.get(l.companyId)?.name ?? null,
    level: l.level,
    violationType: l.violationType,
    incidentDate: isoOrNull(l.incidentDate),
    description: l.description,
    status: l.status,
    state,
    suggestedLevel: internal ? l.suggestedLevel : null,
    escalationReason: internal ? l.escalationReason : null,
    number: l.number,
    issuedAt: isoOrNull(l.issuedAt),
    effectiveUntil: isoOrNull(l.effectiveUntil),
    manager: managerId
      ? { employeeId: managerId, fullName: manager?.fullName ?? "(atasan)" }
      : null,
    deliveredAt: l.deliveredAt?.toISOString() ?? null,
    acknowledgedAt: l.acknowledgedAt?.toISOString() ?? null,
    scanDocumentId: l.scanDocumentId,
    revokedAt: l.revokedAt?.toISOString() ?? null,
    revokeReason: l.revokeReason,
    alphaDays: internal
      ? l.alphaDays.map((d) => ({
          attendanceDayId: d.attendanceDayId,
          workDate: toIso(d.workDate),
        }))
      : [],
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    can: {
      edit: writer && l.status === "DRAFT",
      issue: writer && l.status === "DRAFT",
      revoke: writer && l.status === "ISSUED",
      attachScan: writer && l.status !== "DRAFT",
      deliver:
        t !== null &&
        live &&
        !l.deliveredAt &&
        policy.canDeliver(
          ctx.actor,
          letterTarget(l),
          t,
          managerId !== null && reachable.has(managerId),
        ),
      acknowledge: t !== null && live && !l.acknowledgedAt && policy.canAcknowledge(ctx.actor, t),
    },
  };
}

async function briefsForLetters(rows: repo.LetterRow[]) {
  const ids = rows.map((r) => r.employeeId);
  const first = await getEmployeeBriefs(ids);
  const managers = rows
    .map((r) => r.managerEmployeeId ?? first.get(r.employeeId)?.managerId ?? null)
    .filter((id): id is string => id !== null && !first.has(id));
  if (managers.length) for (const [k, v] of await getEmployeeBriefs(managers)) first.set(k, v);
  return first;
}

/** Atasan (saat terbit, atau sekarang) yang punya akun aktif — dasar `canDeliver` (ARS-D9). */
async function reachableManagers(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Set<string>();
  const states = await getEmployeeAccountStates(wanted);
  return new Set(states.filter((a) => a.isActive).map((a) => a.employeeId));
}

async function dtos(ctx: RequestContext, rows: repo.LetterRow[], now: Date) {
  const [briefs, lookup] = await Promise.all([briefsForLetters(rows), getMasterLookup()]);
  const reachable = await reachableManagers(
    rows.map((r) => r.managerEmployeeId ?? briefs.get(r.employeeId)?.managerId ?? null),
  );
  const today = todayInJakarta(now);
  return rows.map((r) => letterDto(ctx, r, briefs, lookup, today, reachable));
}

async function one(ctx: RequestContext, row: repo.LetterRow, now: Date) {
  const [dto] = await dtos(ctx, [row], now);
  if (!dto) throw new NotFoundError();
  return dto;
}

// --- Master & pengaturan ---

const violationDto = (v: Awaited<ReturnType<typeof repo.listViolationTypes>>[number]) => ({
  id: v.id,
  code: v.code,
  name: v.name,
  linksAttendance: v.linksAttendance,
  isActive: v.isActive,
});

export async function listViolationTypes(ctx: RequestContext) {
  if (!policy.canReadDisciplineMasters(ctx.actor)) throw new ForbiddenError();
  return (await repo.listViolationTypes()).map(violationDto);
}

export async function saveViolationType(ctx: RequestContext, id: string | null, raw: unknown) {
  if (!policy.canManageViolationTypes(ctx.actor)) throw new ForbiddenError();
  const input = parse(violationTypeInputSchema, raw);
  const isActive = (raw as { isActive?: unknown } | null)?.isActive;
  try {
    if (!id) {
      const row = await repo.createViolationType(input);
      await audit(ctx, {
        action: "discipline.violation_type.create",
        entityType: "violation_type",
        entityId: row.id,
        after: input,
      });
      return violationDto(row);
    }
    const before = await repo.findViolationType(id);
    if (!before) throw new NotFoundError();
    const row = await repo.updateViolationType(id, {
      ...input,
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    });
    await audit(ctx, {
      action: "discipline.violation_type.update",
      entityType: "violation_type",
      entityId: id,
      before: violationDto(before),
      after: violationDto(row),
    });
    return violationDto(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("Kode atau nama jenis sudah dipakai.");
    throw error;
  }
}

export async function getSettings(ctx: RequestContext) {
  if (!policy.canReadDisciplineMasters(ctx.actor)) throw new ForbiddenError();
  const s = await repo.readSettings();
  return { validityMonths: s.validityMonths };
}

export async function updateSettings(ctx: RequestContext, raw: unknown) {
  if (!policy.canChangeSettings(ctx.actor)) throw new ForbiddenError();
  const input = parse(disciplineSettingsInputSchema, raw);
  const before = await repo.readSettings();
  const row = await repo.saveSettings(input.validityMonths, ctx.actor.accountId);
  await audit(ctx, {
    action: "discipline.settings.update",
    entityType: "discipline_settings",
    entityId: "1",
    before: { validityMonths: before.validityMonths },
    after: { validityMonths: row.validityMonths },
  });
  return { validityMonths: row.validityMonths };
}

// --- Daftar & detail ---

export interface LetterListQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  state?: "DRAFT" | "ACTIVE" | "EXPIRED" | "REVOKED" | undefined;
  level?: WarningLevel | undefined;
  violationTypeId?: string | undefined;
  companyId?: string | undefined;
  employeeId?: string | undefined;
}

export async function listLetters(ctx: RequestContext, query: LetterListQuery, now = new Date()) {
  const scope = policy.letterListScope(ctx.actor);
  if (!scope) throw new ForbiddenError();
  const today = toDate(todayInJakarta(now));
  let companyIds: string[] | null = scope.kind === "companies" ? scope.companyIds : null;
  let draftCompanyIds: string[] | null =
    scope.kind === "all"
      ? scope.drafts
        ? null
        : []
      : scope.kind === "companies"
        ? scope.draftCompanyIds
        : [];
  if (query.companyId) {
    companyIds = companyIds && !companyIds.includes(query.companyId) ? [] : [query.companyId];
  }
  let employeeIds: string[] | null = null;
  let orManager: string | null = null;
  if (scope.kind === "team") {
    employeeIds = (await listEmployeeBriefs({ managerId: scope.managerId })).map((e) => e.id);
    orManager = scope.managerId;
    draftCompanyIds = [];
  }
  // Filter karyawan = AND di dalam cakupan. MANAGER: karyawan tim, atau bukan tim tetapi SP-nya
  // diterima sebagai atasan saat terbit (audit 2026-10-15: filter tidak boleh melebarkan cakupan).
  let onlyManagerEmployeeId: string | null = null;
  if (query.employeeId) {
    const inTeam = employeeIds === null || employeeIds.includes(query.employeeId);
    if (!inTeam && orManager) onlyManagerEmployeeId = orManager;
    employeeIds = inTeam || orManager ? [query.employeeId] : [];
    orManager = null;
  }
  const q = query.q?.trim() || null;
  const qEmployeeIds = q
    ? (await listEmployeeBriefs({ companyIds, q, limit: 500 })).map((e) => e.id)
    : [];
  const statuses =
    query.state === "DRAFT"
      ? (["DRAFT"] as const)
      : query.state === "REVOKED"
        ? (["REVOKED"] as const)
        : null;
  const { rows, total } = await repo.listLetters(
    {
      companyIds,
      draftCompanyIds,
      employeeIds,
      orManagerEmployeeId: orManager,
      managerEmployeeId: onlyManagerEmployeeId,
      statuses: statuses ? [...statuses] : null,
      level: query.level ?? null,
      violationTypeId: query.violationTypeId ?? null,
      activeOn: query.state === "ACTIVE" ? today : null,
      expiredOn: query.state === "EXPIRED" ? today : null,
      q,
      qEmployeeIds,
    },
    (query.page - 1) * query.pageSize,
    query.pageSize,
  );
  return {
    data: await dtos(ctx, rows, now),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

/** Muat SP + karyawannya; tidak berhak = 404 (keberadaan SP tidak dibocorkan, PROMPT §5). */
async function loadVisible(ctx: RequestContext, id: string) {
  const letter = await repo.findLetter(id);
  if (!letter) throw new NotFoundError();
  const employee = (await getEmployeeBriefs([letter.employeeId])).get(letter.employeeId);
  if (!employee || !policy.canViewLetter(ctx.actor, letterTarget(letter), target(employee)))
    throw new NotFoundError();
  return { letter, employee };
}

async function loadWritable(ctx: RequestContext, id: string) {
  const { letter, employee } = await loadVisible(ctx, id);
  if (!policy.canWriteLetters(ctx.actor, letter.companyId)) throw new ForbiddenError();
  return { letter, employee };
}

export async function getLetter(ctx: RequestContext, id: string, now = new Date()) {
  const { letter } = await loadVisible(ctx, id);
  const dto = await one(ctx, letter, now);
  const evidence: StatementRow[] =
    policy.canSeeInternalNotes(ctx.actor, letter.companyId) && letter.alphaDays.length
      ? await alphaDaysForEvidence(
          letter.employeeId,
          letter.alphaDays.map((d) => d.attendanceDayId),
          true,
        )
      : [];
  return { ...dto, alphaEvidence: evidence };
}

export async function employeeLetters(ctx: RequestContext, employeeId: string, now = new Date()) {
  const employee = (await getEmployeeBriefs([employeeId])).get(employeeId);
  if (!employee) throw new NotFoundError();
  // Tab SP di detail karyawan: tanpa hak melihat SP terbit karyawan ini = 403.
  const probe: policy.LetterTarget = {
    companyId: employee.companyId,
    status: "ISSUED",
    managerEmployeeId: employee.managerId,
  };
  if (!policy.canViewLetter(ctx.actor, probe, target(employee))) throw new ForbiddenError();
  const rows = await repo.lettersOfEmployee(employeeId, true);
  const visible = rows.filter((r) =>
    policy.canViewLetter(ctx.actor, letterTarget(r), target(employee)),
  );
  return dtos(ctx, visible, now);
}

export async function selfLetters(ctx: RequestContext, now = new Date()) {
  if (!ctx.actor.employeeId) return [];
  return dtos(ctx, await repo.lettersOfEmployee(ctx.actor.employeeId, false), now);
}

// --- Saran tingkat & kandidat bukti ---

async function writableEmployee(ctx: RequestContext, employeeId: string) {
  const employee = (await getEmployeeBriefs([employeeId])).get(employeeId);
  if (!employee) throw new NotFoundError("Karyawan tidak ditemukan.");
  if (!policy.canWriteLetters(ctx.actor, employee.companyId)) throw new ForbiddenError();
  return employee;
}

export async function suggestion(ctx: RequestContext, employeeId: string, now = new Date()) {
  await writableEmployee(ctx, employeeId);
  const active = await repo.activeLettersOf(employeeId, toDate(todayInJakarta(now)), null);
  return {
    suggestedLevel: suggestWarningLevel(active.map((a) => a.level)),
    active: active.map((a) => ({
      id: a.id,
      level: a.level,
      number: a.number,
      effectiveUntil: isoOrNull(a.effectiveUntil),
    })),
  };
}

export async function alphaCandidates(ctx: RequestContext, employeeId: string) {
  await writableEmployee(ctx, employeeId);
  return alphaDaysForEvidence(employeeId);
}

// --- Draft ---

async function validateDraft(
  ctx: RequestContext,
  input: z.infer<typeof warningLetterDraftInputSchema>,
) {
  if (input.incidentDate > todayInJakarta()) {
    throw new BusinessRuleError("Tanggal kejadian tidak boleh di masa depan.");
  }
  const employee = await writableEmployee(ctx, input.employeeId);
  if (!employee.isActive) throw new BusinessRuleError("Karyawan tidak aktif.");
  if (ctx.actor.employeeId === employee.id) {
    throw new BusinessRuleError("Surat peringatan untuk diri sendiri dibuat oleh pengguna lain.");
  }
  const type = await repo.findViolationType(input.violationTypeId);
  if (!type?.isActive) throw new BusinessRuleError("Jenis pelanggaran tidak ditemukan/nonaktif.");
  let alphaDays: { attendanceDayId: string; workDate: Date }[] = [];
  const dayIds = [...new Set(input.alphaDayIds)];
  if (dayIds.length) {
    if (!type.linksAttendance) {
      throw new BusinessRuleError("Hari ALPHA hanya bisa ditautkan ke jenis pelanggaran mangkir.");
    }
    const found = await alphaDaysForEvidence(employee.id, dayIds);
    if (found.length !== dayIds.length) {
      throw new BusinessRuleError("Ada hari ALPHA yang tidak ditemukan pada karyawan ini.");
    }
    alphaDays = found.map((d) => ({ attendanceDayId: d.dayId, workDate: toDate(d.workDate) }));
  }
  return { employee, alphaDays };
}

export async function createDraft(ctx: RequestContext, raw: unknown, now = new Date()) {
  const input = parse(warningLetterDraftInputSchema, raw);
  const { employee, alphaDays } = await validateDraft(ctx, input);
  const row = await repo.transaction(async (tx) => {
    const created = await repo.createLetter(
      tx,
      {
        employeeId: employee.id,
        companyId: employee.companyId,
        level: input.level,
        violationTypeId: input.violationTypeId,
        incidentDate: toDate(input.incidentDate),
        description: input.description,
        escalationReason: input.escalationReason,
        createdBy: ctx.actor.accountId,
      },
      alphaDays,
    );
    await audit(
      ctx,
      {
        action: "discipline.letter.create_draft",
        entityType: "warning_letter",
        entityId: created.id,
        after: { employeeId: employee.id, level: input.level, alphaDays: alphaDays.length },
      },
      tx,
    );
    return created;
  });
  return one(ctx, row, now);
}

/**
 * ARS-D20: draft untuk banyak karyawan dalam satu transaksi — satu gagal, semua batal. Tingkat AUTO =
 * saran sistem per karyawan. Bukti hari ALPHA tidak ikut (beda per orang; tambahkan lewat Ubah draft).
 */
export async function createDrafts(ctx: RequestContext, raw: unknown, now = new Date()) {
  const input = parse(warningLetterBulkDraftInputSchema, raw);
  const employeeIds = [...new Set(input.employeeIds)];
  const today = toDate(todayInJakarta(now));
  const planned: { employeeId: string; companyId: string; level: WarningLevel }[] = [];
  for (const employeeId of employeeIds) {
    const level = input.level === "AUTO" ? "SP1" : input.level;
    const { employee } = await validateDraft(ctx, { ...input, employeeId, level, alphaDayIds: [] });
    const resolved =
      input.level === "AUTO"
        ? suggestWarningLevel(
            (await repo.activeLettersOf(employee.id, today, null)).map((a) => a.level),
          )
        : input.level;
    planned.push({ employeeId: employee.id, companyId: employee.companyId, level: resolved });
  }
  const rows = await repo.transaction(async (tx) => {
    const created: repo.LetterRow[] = [];
    for (const p of planned) {
      const row = await repo.createLetter(
        tx,
        {
          employeeId: p.employeeId,
          companyId: p.companyId,
          level: p.level,
          violationTypeId: input.violationTypeId,
          incidentDate: toDate(input.incidentDate),
          description: input.description,
          escalationReason: input.level === "AUTO" ? null : input.escalationReason,
          createdBy: ctx.actor.accountId,
        },
        [],
      );
      await audit(
        ctx,
        {
          action: "discipline.letter.create_draft",
          entityType: "warning_letter",
          entityId: row.id,
          after: { employeeId: p.employeeId, level: p.level, alphaDays: 0, bulk: planned.length },
        },
        tx,
      );
      created.push(row);
    }
    return created;
  });
  return dtos(ctx, rows, now);
}

export async function updateDraft(ctx: RequestContext, id: string, raw: unknown, now = new Date()) {
  const { letter } = await loadWritable(ctx, id);
  if (letter.status !== "DRAFT") {
    throw new BusinessRuleError(
      "SP yang sudah terbit tidak bisa diubah; cabut lalu terbitkan ulang.",
    );
  }
  const input = parse(warningLetterDraftInputSchema, raw);
  if (input.employeeId !== letter.employeeId) {
    throw new BusinessRuleError(
      "Karyawan pada draft tidak bisa diganti; hapus draft dan buat baru.",
    );
  }
  const { alphaDays } = await validateDraft(ctx, input);
  await repo.transaction(async (tx) => {
    const ok = await repo.updateDraft(
      tx,
      id,
      {
        level: input.level,
        violationTypeId: input.violationTypeId,
        incidentDate: toDate(input.incidentDate),
        description: input.description,
        escalationReason: input.escalationReason,
      },
      alphaDays,
    );
    if (!ok) throw new BusinessRuleError("SP sudah terbit; muat ulang halaman.");
    await audit(
      ctx,
      {
        action: "discipline.letter.update_draft",
        entityType: "warning_letter",
        entityId: id,
        after: { level: input.level, alphaDays: alphaDays.length },
      },
      tx,
    );
  });
  return getLetter(ctx, id, now);
}

export async function deleteDraft(ctx: RequestContext, id: string) {
  const { letter } = await loadWritable(ctx, id);
  if (letter.status !== "DRAFT") {
    throw new BusinessRuleError("Hanya draft yang bisa dihapus; SP terbit dicabut.");
  }
  await repo.transaction(async (tx) => {
    if (!(await repo.deleteDraft(tx, id))) throw new BusinessRuleError("SP sudah terbit.");
    await audit(
      ctx,
      {
        action: "discipline.letter.delete_draft",
        entityType: "warning_letter",
        entityId: id,
        before: { employeeId: letter.employeeId, level: letter.level },
      },
      tx,
    );
  });
}

// --- Terbit, cabut, konfirmasi ---

async function accountOf(employeeId: string | null): Promise<Recipient | null> {
  if (!employeeId) return null;
  const [account] = (await getEmployeeAccountStates([employeeId])).filter((a) => a.isActive);
  return account ? { accountId: account.accountId, email: account.email } : null;
}

export async function issueLetter(ctx: RequestContext, id: string, raw: unknown, now = new Date()) {
  const { letter, employee } = await loadWritable(ctx, id);
  if (letter.status !== "DRAFT") throw new BusinessRuleError("SP ini sudah terbit.");
  const input = parse(issueWarningLetterInputSchema, raw);
  if (input.issuedAt > todayInJakarta(now)) {
    throw new BusinessRuleError("Tanggal terbit tidak boleh di masa depan.");
  }
  if (!employee.isActive) throw new BusinessRuleError("Karyawan tidak aktif.");
  // ARS-D19: draft lama (sebelum tanggal kejadian wajib) harus dilengkapi dulu.
  if (!letter.incidentDate) {
    throw new BusinessRuleError("Isi tanggal kejadian lewat Ubah draft sebelum menerbitkan.");
  }
  const issuedAt = toDate(input.issuedAt);
  const active = await repo.activeLettersOf(employee.id, issuedAt, letter.id);
  const suggested = suggestWarningLevel(active.map((a) => a.level));
  if (isAboveSuggestion(letter.level, suggested) && !letter.escalationReason) {
    throw new BusinessRuleError(
      `Tingkat ${WARNING_LEVEL_LABELS[letter.level]} di atas saran sistem (${WARNING_LEVEL_LABELS[suggested]}); isi alasan pada draft.`,
    );
  }
  const settings = await repo.readSettings();
  const effectiveUntil = warningEffectiveUntil(input.issuedAt, settings.validityMonths);
  const lookup = await getMasterLookup();
  const companyCode = lookup.companies.get(letter.companyId)?.code ?? "PT";
  const year = Number(input.issuedAt.slice(0, 4));

  let number = input.number;
  for (let attempt = 0; ; attempt++) {
    try {
      await repo.transaction(async (tx) => {
        let seq = input.number ? null : await repo.nextNumberSeq(tx, letter.companyId, year);
        number =
          input.number ??
          formatWarningNumber(seq as number, letter.level, companyCode, input.issuedAt);
        // Nomor manual bisa sama dengan nomor otomatis berikutnya (number_seq manual = null) → lompati
        // urutan yang sudah terpakai (audit 2026-10-15).
        while (seq !== null && (await repo.numberTaken(tx, number))) {
          seq += 1;
          number = formatWarningNumber(seq, letter.level, companyCode, input.issuedAt);
        }
        const ok = await repo.updateIfStatus(tx, letter.id, "DRAFT", {
          status: "ISSUED",
          number,
          numberYear: seq === null ? null : year,
          numberSeq: seq,
          issuedAt,
          effectiveUntil: toDate(effectiveUntil),
          suggestedLevel: suggested,
          managerEmployeeId: employee.managerId,
          issuedBy: ctx.actor.accountId,
        });
        if (!ok) throw new BusinessRuleError("SP ini sudah terbit.");
        await audit(
          ctx,
          {
            action: "discipline.letter.issue",
            entityType: "warning_letter",
            entityId: letter.id,
            after: {
              number,
              level: letter.level,
              suggestedLevel: suggested,
              issuedAt: input.issuedAt,
              effectiveUntil,
            },
            reason: isAboveSuggestion(letter.level, suggested) ? letter.escalationReason : null,
          },
          tx,
        );
      });
      break;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (input.number) throw new ConflictError("Nomor surat sudah dipakai.");
      // Penomoran otomatis bentrok dengan terbit bersamaan di PT yang sama: hitung ulang.
      if (attempt >= 2) throw new ConflictError("Nomor surat bentrok; coba lagi.");
    }
  }

  // ARS-D13: in-app + email TANPA isi (PROMPT §3.7) ke karyawan & atasan. SP sudah terbit: kegagalan
  // notifikasi tidak boleh membuat respons gagal (audit 2026-10-15).
  await notifyIssued(employee, now).catch(() => {});
  return getLetter(ctx, id, now);
}

async function notifyIssued(employee: EmployeeBrief, now: Date) {
  const [self, boss] = await Promise.all([accountOf(employee.id), accountOf(employee.managerId)]);
  if (self) {
    await notify(
      {
        recipients: [self],
        type: "discipline.letter.issued",
        title: "Ada surat untuk Anda",
        body: "Buka Akselerasi Arthasia untuk membaca dan mengonfirmasi surat tersebut.",
        link: SELF_LINK,
        email: true,
      },
      now,
    );
  }
  if (boss) {
    await notify(
      {
        recipients: [boss],
        type: "discipline.letter.to_deliver",
        title: "Ada surat untuk disampaikan ke anggota tim",
        body: "Buka Akselerasi Arthasia untuk melihat dan menandai surat sudah disampaikan.",
        link: LETTERS_LINK,
        email: true,
      },
      now,
    );
  }
}

export async function revokeLetter(
  ctx: RequestContext,
  id: string,
  raw: unknown,
  now = new Date(),
) {
  const { letter, employee } = await loadWritable(ctx, id);
  if (letter.status !== "ISSUED") {
    throw new BusinessRuleError("Hanya SP yang masih berlaku yang bisa dicabut.");
  }
  const input = parse(revokeWarningLetterInputSchema, raw);
  await repo.transaction(async (tx) => {
    const ok = await repo.updateIfStatus(tx, id, "ISSUED", {
      status: "REVOKED",
      revokedAt: now,
      revokedBy: ctx.actor.accountId,
      revokeReason: input.reason,
    });
    if (!ok) throw new BusinessRuleError("Status SP sudah berubah; muat ulang halaman.");
    await audit(
      ctx,
      {
        action: "discipline.letter.revoke",
        entityType: "warning_letter",
        entityId: id,
        before: { status: letter.status, number: letter.number },
        after: { status: "REVOKED" },
        reason: input.reason,
      },
      tx,
    );
  });
  // SP sudah dicabut: kegagalan notifikasi tidak membuat respons gagal (audit 2026-10-15).
  await (async () => {
    const [self, boss] = await Promise.all([
      accountOf(employee.id),
      accountOf(letter.managerEmployeeId),
    ]);
    for (const [recipient, link] of [
      [self, SELF_LINK],
      [boss, LETTERS_LINK],
    ] as const) {
      if (!recipient) continue;
      await notify(
        {
          recipients: [recipient],
          type: "discipline.letter.revoked",
          title: "Surat peringatan dicabut",
          body: `Surat ${letter.number ?? ""} dicabut oleh HR.`,
          link,
          email: false,
        },
        now,
      );
    }
  })().catch(() => {});
  return getLetter(ctx, id, now);
}

export async function deliverLetter(ctx: RequestContext, id: string, now = new Date()) {
  const { letter, employee } = await loadVisible(ctx, id);
  const managerId = letter.managerEmployeeId ?? employee.managerId;
  const reachable = (await reachableManagers([managerId])).has(managerId ?? "");
  if (!policy.canDeliver(ctx.actor, letterTarget(letter), target(employee), reachable))
    throw new ForbiddenError();
  if (letter.status !== "ISSUED" && letter.status !== "EXPIRED")
    throw new BusinessRuleError("SP ini tidak berlaku.");
  await repo.transaction(async (tx) => {
    if (
      await repo.confirmOnce(tx, id, "deliveredAt", {
        deliveredAt: now,
        deliveredBy: ctx.actor.accountId,
      })
    ) {
      await audit(
        ctx,
        { action: "discipline.letter.deliver", entityType: "warning_letter", entityId: id },
        tx,
      );
    }
  });
  return getLetter(ctx, id, now);
}

export async function acknowledgeLetter(ctx: RequestContext, id: string, now = new Date()) {
  const { letter, employee } = await loadVisible(ctx, id);
  if (!policy.canAcknowledge(ctx.actor, target(employee))) throw new NotFoundError();
  if (letter.status !== "ISSUED" && letter.status !== "EXPIRED")
    throw new BusinessRuleError("SP ini tidak berlaku.");
  await repo.transaction(async (tx) => {
    if (await repo.confirmOnce(tx, id, "acknowledgedAt", { acknowledgedAt: now })) {
      await audit(
        ctx,
        { action: "discipline.letter.acknowledge", entityType: "warning_letter", entityId: id },
        tx,
      );
    }
  });
  return getLetter(ctx, id, now);
}

export async function attachScan(ctx: RequestContext, id: string, raw: unknown, now = new Date()) {
  const { letter } = await loadWritable(ctx, id);
  if (letter.status === "DRAFT")
    throw new BusinessRuleError("Terbitkan SP sebelum melampirkan scan.");
  const input = parse(attachWarningScanInputSchema, raw);
  const doc = await getEmployeeDocumentRef(input.documentId);
  if (!doc || doc.employeeId !== letter.employeeId) {
    throw new BusinessRuleError("Dokumen tidak ditemukan pada karyawan penerima SP.");
  }
  if (doc.typeCode !== WARNING_LETTER_DOCUMENT_TYPE) {
    throw new BusinessRuleError("Dokumen harus berjenis Surat Peringatan.");
  }
  await repo.transaction(async (tx) => {
    await repo.setScanDocument(tx, id, input.documentId);
    await audit(
      ctx,
      {
        action: "discipline.letter.attach_scan",
        entityType: "warning_letter",
        entityId: id,
        after: input,
      },
      tx,
    );
  });
  return getLetter(ctx, id, now);
}

// --- PDF ---

async function personWithRole(employeeId: string | null, lookup: MasterLookup) {
  if (!employeeId) return null;
  const e = (await getEmployeeBriefs([employeeId])).get(employeeId);
  return e ? { name: e.fullName, role: lookup.positions.get(e.positionId)?.name ?? "-" } : null;
}

export async function letterPdf(ctx: RequestContext, id: string) {
  const { letter, employee } = await loadVisible(ctx, id);
  const lookup = await getMasterLookup();
  const issuerAccountId = letter.issuedBy ?? ctx.actor.accountId;
  const account = (await getAccountSummaries([issuerAccountId])).get(issuerAccountId);
  const issuer = (await personWithRole(account?.employeeId ?? null, lookup)) ?? {
    name: account?.email ?? "HR",
    role: "Human Resources",
  };
  const settings = await repo.readSettings();
  const bytes = await buildWarningLetterPdf({
    number: letter.number,
    level: letter.level,
    companyName: lookup.companies.get(letter.companyId)?.name ?? "",
    issuedAt: isoOrNull(letter.issuedAt),
    effectiveUntil: isoOrNull(letter.effectiveUntil),
    validityMonths: settings.validityMonths,
    violationName: letter.violationType.name,
    incidentDate: isoOrNull(letter.incidentDate),
    description: letter.description,
    alphaDates: letter.alphaDays.map((d) => toIso(d.workDate)),
    employee: {
      name: employee.fullName,
      number: employee.employeeNumber ?? "-",
      role: lookup.positions.get(employee.positionId)?.name ?? "-",
    },
    issuer,
    manager: await personWithRole(letter.managerEmployeeId ?? employee.managerId, lookup),
  });
  const label = (letter.number ?? `draf-${letter.id.slice(0, 8)}`).replace(/[^A-Za-z0-9-]+/g, "-");
  return {
    fileName: `${letter.level}-${label}.pdf`,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}
