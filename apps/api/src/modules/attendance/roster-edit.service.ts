import { OFF_CODE } from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import {
  type ApprovalView,
  cancelApprovalRequest,
  createApprovalRequest,
  getApprovalViews,
  listActionable,
  registerApprovalHandler,
} from "../approval/index.ts";
import * as policy from "./attendance.policy.ts";
import {
  type RequestContext,
  readTimeSettings,
  settingsToday,
  toDate,
  toIso,
} from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as repository from "./roster.repository.ts";
import {
  type CellIssue,
  type CrewedCellSplitter,
  configureCrewedCellSplitter,
  dayKey,
  lockedDayKeys,
  type RosterCell,
  regenerateCrew,
} from "./roster.service.ts";
import { isoAddDays, patternCodeOn } from "./roster-engine.ts";
import { notifyRosterChanges, rosterCodes } from "./roster-notify.service.ts";

// TM-D24 (Mat 2026-10-27: "tidak boleh main berubah roster seseorang begitu saja"): perubahan roster karyawan
// yang SUDAH anggota crew diajukan → disetujui atasan karyawan + HR (paralel, approval `ROSTER_EDIT`) → baru
// diterapkan di transaksi keputusan. Pengaju (akun HR) tidak memutus langkah mana pun. Roster lama berlaku
// sampai disetujui; disetujui setelah tanggal efektif lewat → berlaku mulai hari disetujui.

export interface RosterEditPreviewDay {
  date: string;
  from: string | null;
  to: string | null;
}

/** TEMPLATE: pindah / tetap di crew pemasangan template, roster lama non-pola ditimpa mulai tanggal efektif. */
export interface TemplateEditPayload {
  templateId: string;
  templateName: string;
  workLocationId: string;
  crewId: string;
  crewName: string;
}

export interface RosterEditDto {
  id: string;
  kind: "TEMPLATE" | "CELLS" | "IMPORT" | "CREW";
  status: "PENDING" | "APPLIED" | "REJECTED" | "CANCELLED";
  employee: { id: string; fullName: string; employeeNumber: string | null };
  summary: string;
  effectiveDate: string;
  appliedFrom: string | null;
  reason: string | null;
  preview: RosterEditPreviewDay[];
  createdAt: string;
  createdByMe: boolean;
  approval: ApprovalView | null;
}

const PREVIEW_DAYS = 14;

/** Karyawan yang masih punya pengajuan perubahan jadwal menunggu (satu pengajuan menunggu per karyawan). */
export const employeesWithPendingEdit = (employeeIds: string[]) =>
  repository.pendingRosterEditEmployees(employeeIds);

/** Ringkasan 14 hari jadwal lama → baru bila karyawan dipindah ke crew `crewId` mulai `from`. */
export async function templateEditPreview(
  employeeId: string,
  crewId: string,
  from: string,
): Promise<RosterEditPreviewDay[]> {
  const crew = await repository.findCrew(crewId);
  if (!crew) return [];
  const to = isoAddDays(from, PREVIEW_DAYS - 1);
  const [days, locked] = await Promise.all([
    repository.rosterDaysBetween([employeeId], toDate(from), toDate(to)),
    lockedDayKeys([employeeId], from, to),
  ]);
  const current = new Map(days.map((d) => [toIso(d.workDate), d.shift?.code ?? "OFF"]));
  const out: RosterEditPreviewDay[] = [];
  for (let date = from; date <= to; date = isoAddDays(date, 1)) {
    const before = current.get(date) ?? null;
    const after = locked.has(dayKey(employeeId, date))
      ? before
      : patternCodeOn(crew.pattern.steps, toIso(crew.cycleStartDate), date);
    out.push({ date, from: before, to: after });
  }
  return out;
}

/** Buat pengajuan TEMPLATE per karyawan + approval atasan & HR (pengaju = akun HR). */
interface NewEdit {
  employeeId: string;
  effectiveDate: string;
  payload: Record<string, unknown>;
  preview: RosterEditPreviewDay[];
}

/** Buat pengajuan per karyawan + approval atasan & HR (pengaju = akun HR, tidak memutus langkahnya). */
async function createEdits(
  ctx: RequestContext,
  companyId: string,
  kind: "TEMPLATE" | "CELLS" | "IMPORT",
  edits: NewEdit[],
): Promise<string[]> {
  if (edits.length === 0) return [];
  const people = await directory.employeesByIds(edits.map((e) => e.employeeId));
  const ids = await repository.withTransaction(async (tx) => {
    const created: string[] = [];
    for (const e of edits) {
      const managerEmployeeId = people.get(e.employeeId)?.managerId ?? null;
      const row = await repository.createRosterEdit(tx, {
        companyId,
        employeeId: e.employeeId,
        managerEmployeeId,
        kind,
        effectiveDate: toDate(e.effectiveDate),
        payload: e.payload as never,
        preview: e.preview as never,
        createdByAccountId: ctx.actor.accountId,
      });
      await createApprovalRequest(tx, {
        subjectType: "ROSTER_EDIT",
        subjectId: row.id,
        requesterEmployeeId: e.employeeId,
        companyId,
        managerEmployeeId,
        submittedByAccountId: ctx.actor.accountId,
      });
      created.push(row.id);
    }
    return created;
  });
  for (const [i, id] of ids.entries()) {
    await writeAudit({
      actorAccountId: ctx.actor.accountId,
      action: "attendance.roster_edit.submit",
      entityType: "attendance.roster_edit_request",
      entityId: id,
      before: null,
      after: {
        kind,
        employeeId: edits[i]?.employeeId,
        effectiveDate: edits[i]?.effectiveDate,
        ...edits[i]?.payload,
      },
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
    });
  }
  return ids;
}

/** Buat pengajuan TEMPLATE per karyawan (pindah / tetap di crew pemasangan template). */
export async function submitTemplateEdits(
  ctx: RequestContext,
  input: {
    companyId: string;
    effectiveDate: string;
    payload: Omit<TemplateEditPayload, "crewId" | "crewName">;
    employees: { employeeId: string; crewId: string; crewName: string }[];
  },
): Promise<string[]> {
  const edits: NewEdit[] = [];
  for (const e of input.employees) {
    edits.push({
      employeeId: e.employeeId,
      effectiveDate: input.effectiveDate,
      payload: { ...input.payload, crewId: e.crewId, crewName: e.crewName },
      preview: await templateEditPreview(e.employeeId, e.crewId, input.effectiveDate),
    });
  }
  return createEdits(ctx, input.companyId, "TEMPLATE", edits);
}

/** CELLS / IMPORT: sel per tanggal (kode shift, OFF, atau null = hapus). */
export interface CellEditPayload {
  cells: { date: string; code: string | null }[];
}

/**
 * TM-D24 tahap 2–3: sel kuas / import untuk karyawan yang sedang ber-crew pada tanggal sel → satu pengajuan
 * per karyawan; sel lain langsung disimpan. Karyawan yang masih punya pengajuan menunggu → sel ditolak.
 */
const splitCrewedCells: CrewedCellSplitter = async (ctx, companyId, kind, cells) => {
  const employeeIds = [...new Set(cells.map((c) => c.employeeId))];
  if (employeeIds.length === 0) return { direct: cells, submitted: 0, blocked: [] };
  const dates = cells.map((c) => c.date).sort();
  const memberships = await repository.membershipsBetween(
    employeeIds,
    toDate(dates[0] as string),
    toDate(dates[dates.length - 1] as string),
  );
  const crewedOn = (employeeId: string, date: string) =>
    memberships.some(
      (m) =>
        m.employeeId === employeeId &&
        toIso(m.startDate) <= date &&
        (!m.endDate || toIso(m.endDate) >= date),
    );
  const pending = await repository.pendingRosterEditEmployees(employeeIds);
  const direct: RosterCell[] = [];
  const byEmployee = new Map<string, RosterCell[]>();
  const blocked: CellIssue[] = [];
  cells.forEach((cell, index) => {
    if (!crewedOn(cell.employeeId, cell.date)) {
      direct.push(cell);
      return;
    }
    if (pending.has(cell.employeeId)) {
      blocked.push({
        index,
        employeeId: cell.employeeId,
        date: cell.date,
        message: "Masih ada perubahan jadwal yang menunggu persetujuan untuk karyawan ini.",
      });
      return;
    }
    byEmployee.set(cell.employeeId, [...(byEmployee.get(cell.employeeId) ?? []), cell]);
  });
  if (blocked.length > 0) return { direct: [], submitted: 0, blocked };
  const edits: NewEdit[] = [];
  for (const [employeeId, list] of byEmployee) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.date as string;
    const last = sorted[sorted.length - 1]?.date as string;
    const current = new Map(
      (await repository.rosterDaysBetween([employeeId], toDate(first), toDate(last))).map((d) => [
        toIso(d.workDate),
        d.shift?.code ?? "OFF",
      ]),
    );
    edits.push({
      employeeId,
      effectiveDate: first,
      payload: { cells: sorted.map((c) => ({ date: c.date, code: c.code })) },
      preview: sorted.map((c) => ({ date: c.date, from: current.get(c.date) ?? null, to: c.code })),
    });
  }
  const ids = await createEdits(ctx, companyId, kind, edits);
  return { direct, submitted: ids.length, blocked: [] };
};

/** Terapkan pengajuan CELLS / IMPORT di transaksi keputusan (hari terkunci dilewati). */
async function applyCellEdit(
  tx: repository.AttendanceTx,
  row: repository.RosterEditRow,
): Promise<string> {
  const payload = row.payload as unknown as CellEditPayload;
  const dates = payload.cells.map((c) => c.date).sort();
  const locked = await lockedDayKeys(
    [row.employeeId],
    dates[0] as string,
    dates[dates.length - 1] as string,
  );
  const shifts = new Map((await repository.listShifts(row.companyId)).map((s) => [s.code, s.id]));
  const before = await rosterCodes(
    payload.cells.map((c) => ({ employeeId: row.employeeId, date: c.date })),
  );
  const applied: { date: string; code: string | null }[] = [];
  for (const cell of payload.cells) {
    if (locked.has(dayKey(row.employeeId, cell.date))) continue;
    const date = toDate(cell.date);
    if (cell.code === null) await repository.deleteDay(tx, row.employeeId, date);
    else {
      const shiftId = cell.code === OFF_CODE ? null : (shifts.get(cell.code) ?? null);
      if (cell.code !== OFF_CODE && !shiftId) {
        throw new BusinessRuleError(
          `Shift ${cell.code} sudah diarsipkan; ajukan ulang perubahan ini.`,
        );
      }
      await repository.upsertDay(tx, row.employeeId, date, {
        shiftId,
        source: row.kind === "IMPORT" ? "IMPORT" : "MANUAL",
      });
    }
    applied.push(cell);
  }
  await notifyRosterChanges(
    applied.map((c) => {
      const key = `${row.employeeId}|${c.date}`;
      return {
        employeeId: row.employeeId,
        date: c.date,
        from: before.has(key) ? before.get(key) : undefined,
        to: c.code === null ? undefined : c.code === OFF_CODE ? null : c.code,
      };
    }),
    row.kind === "IMPORT" ? "import" : "edit",
  );
  return dates[0] as string;
}

/** Terapkan pengajuan TEMPLATE di transaksi keputusan approval. */
async function applyTemplateEdit(
  tx: repository.AttendanceTx,
  row: repository.RosterEditRow,
): Promise<string> {
  const payload = row.payload as unknown as TemplateEditPayload;
  const crew = await repository.findCrew(payload.crewId, tx);
  if (!crew || crew.deletedAt) {
    throw new BusinessRuleError(
      `Crew ${payload.crewName} sudah diarsipkan; ajukan ulang perubahan ini.`,
    );
  }
  const today = await settingsToday();
  const effective = toIso(row.effectiveDate);
  const from = effective < today ? today : effective;
  const horizon = isoAddDays(today, (await readTimeSettings()).rosterHorizonDays);
  const locked = await lockedDayKeys([row.employeeId], from, horizon);
  const old = await repository.nonPatternDaysBetween(
    [row.employeeId],
    toDate(from),
    toDate(horizon),
    tx,
  );
  const replace = old.filter((d) => !locked.has(dayKey(d.employeeId, toIso(d.workDate))));
  if (replace.length > 0)
    await repository.deleteRosterDays(
      replace.map((d) => d.id),
      tx,
    );

  const fromDate = toDate(from);
  const touched = new Set<string>();
  let member = false;
  for (const m of await repository.openMemberships(tx, [row.employeeId], fromDate)) {
    if (m.crewId === payload.crewId) {
      member = true;
      continue;
    }
    touched.add(m.crewId);
    if (m.startDate >= fromDate) await repository.deleteMembership(tx, m.id);
    else await repository.endMembership(tx, m.id, toDate(isoAddDays(from, -1)));
  }
  if (!member) {
    await repository.addMembers(tx, [
      { crewId: payload.crewId, employeeId: row.employeeId, startDate: fromDate },
    ]);
  }
  // Crew asal dulu, crew tujuan terakhir (lihat setCrewMembers).
  for (const id of touched) await regenerateCrew(id, from, true, tx);
  await regenerateCrew(payload.crewId, from, true, tx);
  return from;
}

/** Status final approval `ROSTER_EDIT` → terapkan / tandai ditolak / dibatalkan. */
export function registerRosterEditHandler() {
  configureCrewedCellSplitter(splitCrewedCells);
  registerApprovalHandler("ROSTER_EDIT", async (tx, event) => {
    const row = await repository.findRosterEdit(event.subjectId, tx);
    if (!row || row.status !== "PENDING") return;
    if (event.status !== "APPROVED") {
      await repository.updateRosterEdit(tx, row.id, {
        status: event.status === "CANCELLED" ? "CANCELLED" : "REJECTED",
        decidedAt: event.decidedAt,
      });
      return;
    }
    const appliedFrom =
      row.kind === "TEMPLATE"
        ? await applyTemplateEdit(tx, row)
        : row.kind === "CELLS" || row.kind === "IMPORT"
          ? await applyCellEdit(tx, row)
          : null;
    if (!appliedFrom) throw new BusinessRuleError("Jenis perubahan roster ini belum didukung.");
    await repository.updateRosterEdit(tx, row.id, {
      status: "APPLIED",
      appliedFrom: toDate(appliedFrom),
      decidedAt: event.decidedAt,
    });
  });
}

const summaryOf = (row: repository.RosterEditRow) => {
  if (row.kind === "TEMPLATE") {
    const p = row.payload as unknown as TemplateEditPayload;
    return `Isi template ${p.templateName} → ${p.crewName.split(" · ")[1] ?? p.crewName}`;
  }
  const n = (row.payload as unknown as CellEditPayload).cells.length;
  return row.kind === "IMPORT" ? `Import roster: ${n} hari` : `Ubah sel roster: ${n} hari`;
};

async function toDtos(
  ctx: RequestContext,
  rows: repository.RosterEditRow[],
): Promise<RosterEditDto[]> {
  const [people, approvals] = await Promise.all([
    directory.employeesByIds([...new Set(rows.map((r) => r.employeeId))]),
    getApprovalViews(
      ctx.actor,
      "ROSTER_EDIT",
      rows.map((r) => r.id),
    ),
  ]);
  return rows.map((row) => {
    const person = people.get(row.employeeId);
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      employee: {
        id: row.employeeId,
        fullName: person?.fullName ?? "",
        employeeNumber: person?.employeeNumber ?? null,
      },
      summary: summaryOf(row),
      effectiveDate: toIso(row.effectiveDate),
      appliedFrom: row.appliedFrom ? toIso(row.appliedFrom) : null,
      reason: row.reason,
      preview: row.preview as unknown as RosterEditPreviewDay[],
      createdAt: row.createdAt.toISOString(),
      createdByMe: row.createdByAccountId === ctx.actor.accountId,
      approval: approvals.get(row.id) ?? null,
    };
  });
}

/** inbox = menunggu keputusan aktor; mine = diajukan aktor; all = semua di PT (SA / HR PT). */
export async function listRosterEdits(
  ctx: RequestContext,
  query: { scope: "inbox" | "mine" | "all"; companyId?: string | undefined },
): Promise<RosterEditDto[]> {
  if (query.scope === "inbox") {
    const actionable = await listActionable(ctx.actor, "ROSTER_EDIT", { includeOverride: true });
    const rows = await repository.listRosterEdits({
      id: { in: actionable.map((a) => a.subjectId) },
      status: "PENDING",
    });
    return toDtos(ctx, rows);
  }
  if (query.scope === "mine") {
    return toDtos(
      ctx,
      await repository.listRosterEdits({ createdByAccountId: ctx.actor.accountId }),
    );
  }
  if (!query.companyId || !policy.canManageRoster(ctx.actor, query.companyId))
    throw new ForbiddenError();
  return toDtos(ctx, await repository.listRosterEdits({ companyId: query.companyId }));
}

/** Pengaju membatalkan pengajuannya yang masih menunggu. */
export async function cancelRosterEdit(ctx: RequestContext, id: string): Promise<RosterEditDto> {
  const row = await repository.findRosterEdit(id);
  if (!row) throw new NotFoundError();
  if (row.createdByAccountId !== ctx.actor.accountId) throw new ForbiddenError();
  if (row.status !== "PENDING") throw new BusinessRuleError("Pengajuan ini sudah diputuskan.");
  await repository.withTransaction(async (tx) => {
    await cancelApprovalRequest(tx, "ROSTER_EDIT", id);
    await repository.updateRosterEdit(tx, id, { status: "CANCELLED", decidedAt: new Date() });
  });
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "attendance.roster_edit.cancel",
    entityType: "attendance.roster_edit_request",
    entityId: id,
    before: { status: "PENDING" },
    after: { status: "CANCELLED" },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return (
    await toDtos(ctx, [(await repository.findRosterEdit(id)) as repository.RosterEditRow])
  )[0] as RosterEditDto;
}
