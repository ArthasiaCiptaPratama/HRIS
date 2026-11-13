import type { OvertimeClaimDecision, OvertimeClaimInput, OvertimeClaimStatus } from "@hris/shared";
import { ROLE } from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import { listApproverAccounts, loadActor } from "../iam/index.ts";
import { notify, type Recipient } from "../notification/index.ts";
import * as policy from "./attendance.policy.ts";
import * as dayRepo from "./attendance.repository.ts";
import { localDate, orderInstants } from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as repository from "./overtime.repository.ts";
import { setOvertimeOrder } from "./overtime-order.service.ts";
import { isDateClosed } from "./period.service.ts";
import { rosterDaysBetween } from "./roster.repository.ts";
import { dateLabel, notifyEmployees, recipientsOfEmployees } from "./time-notify.service.ts";

// TM-D27: karyawan mengajukan lembur atas jam yang sudah dijalani (absen pulang bebas s.d. 24:00, jam
// setelah jadwal pulang TIDAK otomatis lembur — TM-D17). HR PT / SA menetapkan rentang yang diakui lalu
// menyetujui → SPL susulan (TM-D19) → usulan lembur hari itu dihitung ulang (TM-D6, tetap Atasan + HR).

const MAX_RANGE_DAYS = 62;

export interface OvertimeClaimView {
  id: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  companyId: string;
  workDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  status: OvertimeClaimStatus;
  approvedStartTime: string | null;
  approvedEndTime: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  /** Jam absen aktual hari itu (konteks untuk HR). */
  checkInAt: string | null;
  checkOutAt: string | null;
  /** Penanda untuk UI. */
  canDecide: boolean;
  canCancel: boolean;
}

export interface OvertimeClaimQuery {
  scope: "me" | "all";
  from: string;
  to: string;
  companyId?: string;
}

const targetOf = (e: directory.DirectoryEmployee) => ({
  employeeId: e.id,
  companyId: e.companyId,
  managerId: e.managerId,
});

async function audit(
  ctx: RequestContext,
  action: string,
  id: string,
  after: Record<string, unknown>,
) {
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action,
    entityType: "attendance.overtime_claim",
    entityId: id,
    before: null,
    after,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
}

const canDecide = (ctx: RequestContext, row: repository.ClaimRow) =>
  row.status === "PENDING" &&
  ctx.actor.employeeId !== row.employeeId &&
  policy.canOrderOvertimeRetroactive(ctx.actor, row.companyId);

async function toViews(ctx: RequestContext, rows: repository.ClaimRow[]) {
  const people = await directory.employeesByIds([...new Set(rows.map((r) => r.employeeId))]);
  const days = await Promise.all(rows.map((r) => dayRepo.findDay(r.employeeId, r.workDate)));
  return rows.map((r, i): OvertimeClaimView => {
    const e = people.get(r.employeeId);
    const punches = days[i]?.punches ?? [];
    return {
      id: r.id,
      employee: {
        id: r.employeeId,
        fullName: e?.fullName ?? "",
        employeeNumber: e?.employeeNumber ?? null,
      },
      companyId: r.companyId,
      workDate: toIso(r.workDate),
      startTime: r.startTime,
      endTime: r.endTime,
      reason: r.reason,
      status: r.status,
      approvedStartTime: r.approvedStartTime,
      approvedEndTime: r.approvedEndTime,
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      checkInAt: punches.find((p) => p.kind === "IN")?.at.toISOString() ?? null,
      checkOutAt: punches.find((p) => p.kind === "OUT")?.at.toISOString() ?? null,
      canDecide: canDecide(ctx, r),
      canCancel: r.status === "PENDING" && r.employeeId === ctx.actor.employeeId,
    };
  });
}

async function scheduleOf(employeeId: string, workDate: string) {
  const rows = await rosterDaysBetween([employeeId], toDate(workDate), toDate(workDate));
  return rows[0]?.shift ?? null;
}

export async function createOvertimeClaim(
  ctx: RequestContext,
  input: OvertimeClaimInput,
  now = new Date(),
): Promise<OvertimeClaimView> {
  const employeeId = ctx.actor.employeeId;
  if (!employeeId) throw new ForbiddenError("Akun tidak terhubung ke data karyawan.");
  const employee = await directory.employeeById(employeeId);
  if (!employee) throw new NotFoundError();
  if (!employee.isActive) throw new BusinessRuleError("Karyawan tidak aktif.");
  const { timezone } = await readTimeSettings();
  if (input.workDate > localDate(now, timezone)) {
    throw new BusinessRuleError("Lembur diajukan untuk jam yang sudah dijalani.");
  }
  if (await isDateClosed(employee.companyId, input.workDate)) {
    throw new BusinessRuleError("Periode absen tanggal ini sudah ditutup.");
  }
  const day = await dayRepo.findDay(employeeId, toDate(input.workDate));
  if (!day?.punches.some((p) => p.kind === "IN")) {
    throw new BusinessRuleError("Belum ada absen masuk pada tanggal kerja ini.");
  }
  if (day.status === "ALPHA" || day.status === "LEAVE" || day.status === "REJECTED") {
    throw new BusinessRuleError(
      "Hari ini berstatus Alpha, cuti, atau ditolak; lembur tidak bisa diajukan.",
    );
  }
  // Format jam sama dengan SPL: hari kerja = mulai lebih awal / selesai lebih lambat; hari OFF = keduanya.
  const times = orderInstants(
    input.workDate,
    await scheduleOf(employeeId, input.workDate),
    input,
    timezone,
  );
  if ("error" in times) throw new BusinessRuleError(times.error);
  if ((await repository.countPendingClaims(employeeId, toDate(input.workDate))) > 0) {
    throw new ConflictError("Sudah ada pengajuan lembur yang menunggu untuk tanggal ini.");
  }
  const row = await repository.createClaim({
    employeeId,
    companyId: employee.companyId,
    managerEmployeeId: employee.managerId,
    workDate: toDate(input.workDate),
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason,
  });
  await audit(ctx, "attendance.overtime_claim.create", row.id, { ...input });
  await notifyNewClaim(ctx, employee, row.id, input, now);
  return (await toViews(ctx, [row]))[0] as OvertimeClaimView;
}

/**
 * Pengajuan baru → pemutus (HR PT karyawan; SA bila PT itu tanpa HR aktif) + atasan (info saja).
 * Satu notifikasi per akun; pengaju sendiri tidak diberi tahu. Gagal kirim tidak menggagalkan pengajuan.
 */
async function notifyNewClaim(
  ctx: RequestContext,
  employee: directory.DirectoryEmployee,
  claimId: string,
  input: OvertimeClaimInput,
  now: Date,
) {
  const hrs: Recipient[] = [];
  const admins: Recipient[] = [];
  for (const account of await listApproverAccounts()) {
    const actor = await loadActor(account.authUserId, now);
    if (!actor || !policy.canOrderOvertimeRetroactive(actor, employee.companyId)) continue;
    const recipient = { accountId: account.accountId, email: account.email };
    (actor.role === ROLE.HR_ADMIN ? hrs : admins).push(recipient);
  }
  const deciders = hrs.length > 0 ? hrs : admins;
  const manager = employee.managerId
    ? (await recipientsOfEmployees([employee.managerId])).get(employee.managerId)
    : undefined;
  const title = `${employee.fullName} mengajukan lembur ${dateLabel(input.workDate)}`;
  const inbox = new Map<string, { recipient: Recipient; decider: boolean }>();
  if (manager) inbox.set(manager.accountId, { recipient: manager, decider: false });
  for (const r of deciders) inbox.set(r.accountId, { recipient: r, decider: true });
  inbox.delete(ctx.actor.accountId);
  for (const { recipient, decider } of inbox.values()) {
    try {
      await notify(
        {
          recipients: [recipient],
          type: "attendance.overtime_claim_new",
          title,
          body: decider
            ? `“${input.reason}” — tetapkan jam yang diakui lalu putuskan.`
            : `“${input.reason}” — diputus oleh HR.`,
          link: "/time/lembur?tab=claims",
          dedupeKey: `tm-ot-claim-new:${claimId}`,
          email: false,
        },
        now,
      );
    } catch {
      // Notifikasi bersifat tambahan; pengajuan tetap tersimpan.
    }
  }
}

export async function cancelOvertimeClaim(ctx: RequestContext, id: string) {
  const row = await repository.findClaimById(id);
  if (!row || row.employeeId !== ctx.actor.employeeId) throw new NotFoundError();
  const updated = await repository.updatePendingClaim(id, {
    status: "CANCELLED",
    decidedAt: new Date(),
  });
  if (updated.count !== 1) {
    throw new BusinessRuleError("Hanya pengajuan yang menunggu yang bisa dibatalkan.");
  }
  await audit(ctx, "attendance.overtime_claim.cancel", id, { status: "CANCELLED" });
  return (await toViews(ctx, [(await repository.findClaimById(id)) as repository.ClaimRow]))[0];
}

export async function decideOvertimeClaim(
  ctx: RequestContext,
  id: string,
  input: OvertimeClaimDecision,
  now = new Date(),
): Promise<OvertimeClaimView> {
  const row = await repository.findClaimById(id);
  if (!row) throw new NotFoundError("Pengajuan lembur tidak ditemukan.");
  const employee = await directory.employeeById(row.employeeId);
  if (!employee || !policy.canViewEmployeeRoster(ctx.actor, targetOf(employee))) {
    throw new NotFoundError("Pengajuan lembur tidak ditemukan.");
  }
  if (ctx.actor.employeeId === row.employeeId) {
    throw new ForbiddenError("Pengajuan lembur sendiri tidak bisa diputus sendiri.");
  }
  if (!policy.canOrderOvertimeRetroactive(ctx.actor, row.companyId)) {
    throw new ForbiddenError("Pengajuan lembur diputus oleh HR.");
  }
  if (row.status !== "PENDING") throw new ConflictError("Pengajuan ini sudah diputus.");
  const workDate = toIso(row.workDate);

  let orderId: string | null = null;
  if (input.decision === "APPROVED") {
    const { timezone } = await readTimeSettings();
    const day = await dayRepo.findDay(row.employeeId, row.workDate);
    const done = day?.punches.some((p) => p.kind === "OUT") ?? false;
    if (!done && workDate >= localDate(now, timezone)) {
      throw new BusinessRuleError(
        "Karyawan belum Clock Out. Putuskan setelah absen pulang tercatat agar jam lembur sesuai.",
      );
    }
    // SPL susulan (TM-D19): validasi jam, periode, & hitung ulang usulan lembur ada di sana.
    const order = await setOvertimeOrder(
      ctx,
      {
        employeeId: row.employeeId,
        workDate,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: `Pengajuan lembur karyawan: ${row.reason}`.slice(0, 300),
      },
      now,
    );
    orderId = order.id;
  }
  const updated = await repository.updatePendingClaim(id, {
    status: input.decision,
    approvedStartTime: input.decision === "APPROVED" ? input.startTime : null,
    approvedEndTime: input.decision === "APPROVED" ? input.endTime : null,
    decisionNote: input.note,
    decidedByAccountId: ctx.actor.accountId,
    decidedAt: now,
    orderId,
  });
  if (updated.count !== 1) throw new ConflictError("Pengajuan ini sudah diputus.");
  await audit(ctx, "attendance.overtime_claim.decide", id, {
    decision: input.decision,
    startTime: input.startTime,
    endTime: input.endTime,
    note: input.note,
    orderId,
  });
  const range = [
    input.startTime && `mulai ${input.startTime}`,
    input.endTime && `s.d. ${input.endTime}`,
  ]
    .filter(Boolean)
    .join(" ");
  await notifyEmployees(
    [
      {
        employeeId: row.employeeId,
        type: "attendance.overtime_claim_decided",
        title: `Pengajuan lembur ${dateLabel(workDate)} ${
          input.decision === "APPROVED" ? "disetujui" : "ditolak"
        }`,
        body:
          input.decision === "APPROVED"
            ? `Jam lembur yang diakui HR: ${range}. Usulan lembur hari itu dihitung ulang.${
                input.note ? ` Catatan: ${input.note}` : ""
              }`
            : `Alasan: ${input.note ?? "-"}`,
        link: "/absen",
        dedupeKey: `tm-ot-claim-decided:${id}`,
        target: { type: "ATTENDANCE_DATE", id: workDate },
      },
    ],
    now,
  );
  return (
    await toViews(ctx, [(await repository.findClaimById(id)) as repository.ClaimRow])
  )[0] as OvertimeClaimView;
}

/** `me` = milik saya; `all` = SA semua, HR PT-nya, atasan timnya. Rentang ≤ 62 hari. */
export async function listOvertimeClaims(
  ctx: RequestContext,
  q: OvertimeClaimQuery,
): Promise<OvertimeClaimView[]> {
  const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
  if (days < 0 || days > MAX_RANGE_DAYS) {
    throw new BusinessRuleError(`Rentang tanggal 0–${MAX_RANGE_DAYS} hari.`);
  }
  const range = { workDate: { gte: toDate(q.from), lte: toDate(q.to) } };
  if (q.scope === "me") {
    if (!ctx.actor.employeeId) return [];
    return toViews(
      ctx,
      await repository.listClaimRows({ ...range, employeeId: ctx.actor.employeeId }),
    );
  }
  const rows = await repository.listClaimRows({
    ...range,
    ...(q.companyId ? { companyId: q.companyId } : {}),
  });
  const people = await directory.employeesByIds([...new Set(rows.map((r) => r.employeeId))]);
  const visible = rows.filter((r) => {
    const e = people.get(r.employeeId);
    return (
      e !== undefined &&
      r.employeeId !== ctx.actor.employeeId &&
      policy.canViewEmployeeRoster(ctx.actor, targetOf(e))
    );
  });
  return toViews(ctx, visible);
}
