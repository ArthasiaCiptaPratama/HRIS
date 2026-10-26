import { OFF_CODE, type RosterChangeInput, type RosterChangeStatus } from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import {
  type ApprovalView,
  cancelApprovalRequest,
  createApprovalRequest,
  getApprovalViews,
  listActionable,
  registerApprovalHandler,
} from "../approval/index.ts";
import * as policy from "./attendance.policy.ts";
import { localDate } from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as repository from "./roster.repository.ts";
import { lockedEmployeesOn } from "./roster.service.ts";
import { notifyRosterChangeRejected, notifyRosterChanges } from "./roster-notify.service.ts";

// Tahap B — perubahan / tukar shift (D-069): rekan yang ditukar setuju dulu, lalu MANAGER + HR paralel.

const todayIso = async () => localDate(new Date(), (await readTimeSettings()).timezone);

/** Hari absen disetujui / periode tertutup tidak boleh diubah — sama dengan edit grid & impor roster. */
async function assertDayUnlocked(employeeId: string, peerEmployeeId: string | null, date: string) {
  const locked = await lockedEmployeesOn(
    peerEmployeeId ? [employeeId, peerEmployeeId] : [employeeId],
    date,
  );
  if (locked.length === 0) return;
  throw new BusinessRuleError(
    locked.includes(employeeId)
      ? "Hari yang absennya sudah disetujui atau periodenya sudah ditutup tidak bisa diubah."
      : "Hari rekan pada tanggal itu sudah disetujui absennya atau periodenya sudah ditutup.",
  );
}

export interface RosterChangeDto {
  id: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  peer: { id: string; fullName: string; employeeNumber: string | null } | null;
  date: string;
  fromCode: string;
  toCode: string;
  reason: string;
  status: RosterChangeStatus;
  createdAt: string;
  approval: ApprovalView | null;
  /** Aktor adalah rekan yang diminta menukar & masih menunggu jawabannya. */
  awaitingMyConsent: boolean;
  canCancel: boolean;
}

type ChangeRow = Awaited<ReturnType<typeof repository.findChange>> & object;

async function toDtos(ctx: RequestContext, rows: ChangeRow[]): Promise<RosterChangeDto[]> {
  const people = await directory.employeesByIds(
    rows.flatMap((r) => [r.employeeId, ...(r.peerEmployeeId ? [r.peerEmployeeId] : [])]),
  );
  const shifts = new Map(
    (
      await repository.shiftsByIds(
        rows.flatMap((r) => [r.fromShiftId, r.toShiftId]).filter((id): id is string => id !== null),
      )
    ).map((s) => [s.id, s.code]),
  );
  const approvals = await getApprovalViews(
    ctx.actor,
    "ROSTER_CHANGE",
    rows.map((r) => r.id),
  );
  const person = (id: string) => {
    const p = people.get(id);
    return { id, fullName: p?.fullName ?? "—", employeeNumber: p?.employeeNumber ?? null };
  };
  const code = (id: string | null) => (id ? (shifts.get(id) ?? "?") : OFF_CODE);
  return rows.map((row) => ({
    id: row.id,
    employee: person(row.employeeId),
    peer: row.peerEmployeeId ? person(row.peerEmployeeId) : null,
    date: toIso(row.workDate),
    fromCode: code(row.fromShiftId),
    toCode: code(row.toShiftId),
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    approval: approvals.get(row.id) ?? null,
    awaitingMyConsent:
      row.status === "AWAITING_PEER" && row.peerEmployeeId === ctx.actor.employeeId,
    canCancel:
      (row.status === "AWAITING_PEER" || row.status === "PENDING") &&
      (row.createdByEmployeeId === ctx.actor.employeeId || row.employeeId === ctx.actor.employeeId),
  }));
}

export async function createRosterChange(
  ctx: RequestContext,
  input: RosterChangeInput,
): Promise<RosterChangeDto> {
  if (!ctx.actor.employeeId) throw new ForbiddenError("Akun tidak terhubung ke data karyawan.");
  const employeeId = input.employeeId ?? ctx.actor.employeeId;
  const employee = await directory.employeeById(employeeId);
  if (!employee) throw new NotFoundError();
  const target = { employeeId, companyId: employee.companyId, managerId: employee.managerId };
  if (!policy.canRequestRosterChange(ctx.actor, target)) throw new ForbiddenError();
  if (input.date < (await todayIso()))
    throw new BusinessRuleError("Perubahan roster hanya untuk hari ini atau setelahnya.");

  const day = await repository.rosterDay(employeeId, toDate(input.date));
  if (!day) throw new BusinessRuleError("Belum ada roster pada tanggal itu.");
  const fromShiftId = day.shiftId;
  let toShiftId: string | null;
  let peerEmployeeId: string | null = null;

  if (input.peerEmployeeId) {
    if (input.peerEmployeeId === employeeId)
      throw new BusinessRuleError("Tidak bisa menukar dengan diri sendiri.");
    const peer = await directory.employeeById(input.peerEmployeeId);
    if (!peer || peer.companyId !== employee.companyId || !peer.isActive) {
      throw new BusinessRuleError("Rekan harus karyawan aktif di perusahaan yang sama.");
    }
    const peerDay = await repository.rosterDay(peer.id, toDate(input.date));
    if (!peerDay) throw new BusinessRuleError("Rekan belum punya roster pada tanggal itu.");
    if (peerDay.shiftId === fromShiftId)
      throw new BusinessRuleError("Shift rekan pada tanggal itu sama; tidak ada yang ditukar.");
    toShiftId = peerDay.shiftId;
    peerEmployeeId = peer.id;
  } else {
    const code = input.toCode as string;
    if (code === OFF_CODE) toShiftId = null;
    else {
      const shift = (await repository.listShifts(employee.companyId)).find((s) => s.code === code);
      if (!shift) throw new BusinessRuleError(`Kode shift ${code} tidak dikenal.`);
      toShiftId = shift.id;
    }
    if (toShiftId === fromShiftId)
      throw new BusinessRuleError("Shift tujuan sama dengan roster saat ini.");
  }

  await assertDayUnlocked(employeeId, peerEmployeeId, input.date);

  const row = await repository.withTransaction(async (tx) => {
    const created = await repository.createChange(tx, {
      employeeId,
      createdByEmployeeId: ctx.actor.employeeId as string,
      workDate: toDate(input.date),
      fromShiftId,
      toShiftId,
      peerEmployeeId,
      reason: input.reason,
      status: peerEmployeeId ? "AWAITING_PEER" : "PENDING",
    });
    if (!peerEmployeeId) {
      await createApprovalRequest(tx, {
        subjectType: "ROSTER_CHANGE",
        subjectId: created.id,
        requesterEmployeeId: employeeId,
        companyId: employee.companyId,
        managerEmployeeId: employee.managerId,
      });
    }
    return created;
  });
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "attendance.roster_change.create",
    entityType: "attendance.roster_change",
    entityId: row.id,
    before: null,
    after: { employeeId, date: input.date, peerEmployeeId },
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return (await toDtos(ctx, [row]))[0] as RosterChangeDto;
}

/** Jawaban rekan atas permintaan tukar: setuju → masuk approval; tolak → ditolak. */
export async function respondToSwap(
  ctx: RequestContext,
  id: string,
  accept: boolean,
): Promise<RosterChangeDto> {
  const row = await repository.findChange(id);
  if (!row || row.peerEmployeeId !== ctx.actor.employeeId) throw new NotFoundError();
  if (row.status !== "AWAITING_PEER") throw new ConflictError("Permintaan ini sudah dijawab.");
  const employee = await directory.employeeById(row.employeeId);
  if (!employee) throw new NotFoundError();
  const updated = await repository.withTransaction(async (tx) => {
    const next = await repository.updateChange(tx, id, {
      status: accept ? "PENDING" : "REJECTED",
      peerDecidedAt: new Date(),
    });
    if (accept) {
      await createApprovalRequest(tx, {
        subjectType: "ROSTER_CHANGE",
        subjectId: id,
        requesterEmployeeId: row.employeeId,
        companyId: employee.companyId,
        managerEmployeeId: employee.managerId,
      });
    }
    return next;
  });
  return (await toDtos(ctx, [updated]))[0] as RosterChangeDto;
}

export async function cancelRosterChange(
  ctx: RequestContext,
  id: string,
): Promise<RosterChangeDto> {
  const row = await repository.findChange(id);
  if (
    !row ||
    (row.createdByEmployeeId !== ctx.actor.employeeId && row.employeeId !== ctx.actor.employeeId)
  ) {
    throw new NotFoundError();
  }
  if (row.status !== "AWAITING_PEER" && row.status !== "PENDING")
    throw new ConflictError("Pengajuan sudah final.");
  const updated = await repository.withTransaction(async (tx) => {
    await cancelApprovalRequest(tx, "ROSTER_CHANGE", id);
    return repository.updateChange(tx, id, { status: "CANCELLED" });
  });
  return (await toDtos(ctx, [updated]))[0] as RosterChangeDto;
}

/** Pengajuan milik/terkait aktor + yang menunggu keputusannya (atasan/HR). */
export async function listRosterChanges(
  ctx: RequestContext,
  scope: "mine" | "inbox",
): Promise<RosterChangeDto[]> {
  if (scope === "inbox") {
    const actionable = await listActionable(ctx.actor, "ROSTER_CHANGE", { includeOverride: true });
    const rows = await repository.changesByIds(actionable.map((a) => a.subjectId));
    return toDtos(ctx, rows);
  }
  if (!ctx.actor.employeeId) return [];
  const me = ctx.actor.employeeId;
  const rows = await repository.listChanges({
    OR: [{ employeeId: me }, { createdByEmployeeId: me }, { peerEmployeeId: me }],
  });
  return toDtos(ctx, rows);
}

/** Status final dari mesin approval → terapkan ke roster (dipanggil di transaksi keputusan). */
export function registerRosterChangeHandler() {
  registerApprovalHandler("ROSTER_CHANGE", async (tx, event) => {
    const row = await repository.findChange(event.subjectId, tx);
    if (!row) return;
    if (event.status !== "APPROVED") {
      const status = event.status === "CANCELLED" ? "CANCELLED" : "REJECTED";
      await repository.updateChange(tx, row.id, { status });
      await notifyRosterChangeRejected(row.employeeId, toIso(row.workDate), status);
      return;
    }
    // Absen bisa disetujui / periode ditutup selama pengajuan menunggu → keputusan ditolak (rollback).
    await assertDayUnlocked(row.employeeId, row.peerEmployeeId, toIso(row.workDate));
    await repository.upsertDay(tx, row.employeeId, row.workDate, {
      shiftId: row.toShiftId,
      source: "CHANGE",
    });
    if (row.peerEmployeeId) {
      await repository.upsertDay(tx, row.peerEmployeeId, row.workDate, {
        shiftId: row.fromShiftId,
        source: "CHANGE",
      });
    }
    await repository.updateChange(tx, row.id, { status: "APPROVED" });
    // TM-D13 Fase C: pengaju & rekan diberi tahu jadwal barunya.
    const shiftIds = [row.fromShiftId, row.toShiftId].filter((id): id is string => id !== null);
    const codeOf = new Map((await repository.shiftsByIds(shiftIds)).map((s) => [s.id, s.code]));
    const code = (id: string | null) => (id === null ? null : (codeOf.get(id) ?? null));
    const date = toIso(row.workDate);
    await notifyRosterChanges(
      [
        { employeeId: row.employeeId, date, from: code(row.fromShiftId), to: code(row.toShiftId) },
        ...(row.peerEmployeeId
          ? [
              {
                employeeId: row.peerEmployeeId,
                date,
                from: code(row.toShiftId),
                to: code(row.fromShiftId),
              },
            ]
          : []),
      ],
      "swap",
    );
  });
}
