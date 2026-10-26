import type { OvertimeOrderInput } from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import * as dayRepo from "./attendance.repository.ts";
import { localDate, orderInstants, shiftWindow } from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as repository from "./overtime.repository.ts";
import { syncOvertime } from "./overtime.service.ts";
import { isDateClosed } from "./period.service.ts";
import { rosterDaysBetween } from "./roster.repository.ts";
import { notifyEmployees } from "./time-notify.service.ts";

// TM-D17: perintah lembur (SPL) dari Atasan / HR sebelum dijalani. Lembur hanya diakui di dalam rentang SPL;
// batas Clock Out ikut mundur; Clock In hari OFF ("Lembur hari libur") hanya bila ada SPL.
// SPL susulan (tanggal lampau / sudah Clock Out): hanya HR PT & SA, periode belum ditutup; usulan lembur
// hari itu dihitung ulang (keputusan pengguna 2026-10-26, Q1 opsi B).

const MINUTE = 60_000;
/** Batas absen pulang hari OFF ber-SPL (tanpa master shift) — sama dengan bawaan master shift (TM-D16). */
export const OFF_DAY_CLOSE_MIN = 30;
const MAX_RANGE_DAYS = 62;

export type OrderRow = NonNullable<Awaited<ReturnType<typeof repository.findOrderById>>>;

export interface OvertimeOrderView {
  id: string;
  employee: { id: string; fullName: string; employeeNumber: string | null };
  companyId: string;
  workDate: string;
  startsAt: string | null;
  endsAt: string | null;
  reason: string;
  /** SPL susulan (dibuat HR / SA setelah lembur dijalani). */
  retroactive: boolean;
  createdAt: string;
  /** Penanda untuk UI: pemanggil boleh mengubah / membatalkan. */
  canManage: boolean;
}

export interface OvertimeOrderQuery {
  from: string;
  to: string;
  companyId?: string;
  employeeId?: string;
}

const later = (a: Date | null, b: Date | null) =>
  a && b ? (a.getTime() >= b.getTime() ? a : b) : (a ?? b);

/** Batas absen pulang hari absen dengan SPL: yang terlambat antara batas jadwal dan akhir SPL + batas shift. */
export function deadlineWithOrder(
  base: Date | null,
  order: { endsAt: Date | null } | null,
  closeMin: number,
): Date | null {
  const fromOrder = order?.endsAt ? new Date(order.endsAt.getTime() + closeMin * MINUTE) : null;
  return later(base, fromOrder);
}

/** SPL untuk beberapa tanggal kerja seorang karyawan (kunci = YYYY-MM-DD). */
export async function ordersOfEmployee(employeeId: string, dates: string[]) {
  const rows = await repository.ordersOf(dates.map((d) => ({ employeeId, workDate: toDate(d) })));
  return new Map(rows.map((r) => [toIso(r.workDate), r]));
}

function toView(
  row: OrderRow,
  employee: directory.DirectoryEmployee | undefined,
  canManage: boolean,
): OvertimeOrderView {
  return {
    id: row.id,
    employee: {
      id: row.employeeId,
      fullName: employee?.fullName ?? "",
      employeeNumber: employee?.employeeNumber ?? null,
    },
    companyId: row.companyId,
    workDate: toIso(row.workDate),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    reason: row.reason,
    retroactive: row.retroactive,
    createdAt: row.createdAt.toISOString(),
    canManage,
  };
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
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action,
    entityType: "attendance.overtime_order",
    entityId: id,
    before,
    after,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
}

const snapshot = (r: {
  workDate: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  reason: string;
  retroactive: boolean;
}) => ({
  workDate: toIso(r.workDate),
  startsAt: r.startsAt?.toISOString() ?? null,
  endsAt: r.endsAt?.toISOString() ?? null,
  reason: r.reason,
  retroactive: r.retroactive,
});

/** Hari absen yang masih terbuka: batas absen pulang dihitung ulang dari jadwal terkunci + SPL. */
async function syncOpenDay(
  tx: repository.Tx,
  employeeId: string,
  workDate: string,
  order: { startsAt: Date | null; endsAt: Date | null } | null,
  closeMin: number,
) {
  const day = await dayRepo.findDay(employeeId, toDate(workDate), tx);
  if (day?.status !== "OPEN") return;
  const base = day.scheduledEnd ? new Date(day.scheduledEnd.getTime() + closeMin * MINUTE) : null;
  await dayRepo.updateDay(tx, day.id, {
    checkOutDeadline: deadlineWithOrder(base, order, closeMin),
  });
}

async function scheduleOf(employeeId: string, workDate: string) {
  const rows = await rosterDaysBetween([employeeId], toDate(workDate), toDate(workDate));
  return rows[0]?.shift ?? null;
}

/**
 * Susulan = tanggal kerja sudah lewat atau karyawan sudah Clock Out. Hanya HR PT / SA, dan periode absen
 * tanggal itu belum ditutup; selain itu ditolak dengan pesan yang menjelaskan jalurnya.
 */
async function assertCanChange(
  ctx: RequestContext,
  employee: directory.DirectoryEmployee,
  workDate: string,
  today: string,
) {
  const day = await dayRepo.findDay(employee.id, toDate(workDate));
  const retroactive = workDate < today || (day?.punches.some((p) => p.kind === "OUT") ?? false);
  if (retroactive) {
    if (!policy.canOrderOvertimeRetroactive(ctx.actor, employee.companyId)) {
      throw new BusinessRuleError(
        "Lembur yang sudah dijalani hanya bisa dibuatkan perintah lembur susulan oleh HR.",
      );
    }
    if (await isDateClosed(employee.companyId, workDate)) {
      throw new BusinessRuleError("Periode absen tanggal ini sudah ditutup.");
    }
  }
  return { day, retroactive };
}

/** SPL berubah pada hari yang sudah Clock Out → usulan lembur hari itu dihitung ulang. */
async function resync(tx: repository.Tx, day: { id: string; punches: { kind: string }[] } | null) {
  if (day?.punches.some((p) => p.kind === "OUT")) await syncOvertime(tx, day.id);
}

export async function setOvertimeOrder(
  ctx: RequestContext,
  input: OvertimeOrderInput,
  now = new Date(),
): Promise<OvertimeOrderView> {
  const employee = await directory.employeeById(input.employeeId);
  if (!employee) throw new NotFoundError("Karyawan tidak ditemukan.");
  if (!policy.canOrderOvertime(ctx.actor, targetOf(employee))) throw new ForbiddenError();
  if (!employee.isActive) throw new BusinessRuleError("Karyawan tidak aktif.");
  const { timezone } = await readTimeSettings();
  const { day, retroactive } = await assertCanChange(
    ctx,
    employee,
    input.workDate,
    localDate(now, timezone),
  );
  const shift = await scheduleOf(employee.id, input.workDate);
  const times = orderInstants(input.workDate, shift, input, timezone);
  if ("error" in times) throw new BusinessRuleError(times.error);

  const existing = await repository.findOrder(employee.id, toDate(input.workDate));
  const same = (a: Date | null | undefined, b: Date | null) =>
    (a?.getTime() ?? null) === (b?.getTime() ?? null);
  // Sebelum dijalani: jam mulai baru belum lewat; perpanjangan diberikan sebelum jadwal pulang.
  const fresh = !retroactive;
  if (
    fresh &&
    times.startsAt &&
    !same(existing?.startsAt, times.startsAt) &&
    times.startsAt <= now
  ) {
    throw new BusinessRuleError("Jam mulai lembur sudah lewat.");
  }
  if (fresh && times.endsAt && !same(existing?.endsAt, times.endsAt)) {
    const normalEnd = shift
      ? (day?.scheduledEnd ?? shiftWindow(input.workDate, shift, timezone).end)
      : times.endsAt;
    if (now >= normalEnd) {
      throw new BusinessRuleError(
        "Perpanjangan lembur diberikan sebelum jam pulang shift. Lewat dari itu, HR membuat perintah lembur susulan.",
      );
    }
  }

  const closeMin = shift?.checkOutCloseMin ?? OFF_DAY_CLOSE_MIN;
  const row = await repository.withTransaction(async (tx) => {
    const saved = await repository.upsertOrder(tx, {
      employeeId: employee.id,
      companyId: employee.companyId,
      workDate: toDate(input.workDate),
      startsAt: times.startsAt,
      endsAt: times.endsAt,
      reason: input.reason,
      retroactive,
      createdByAccountId: ctx.actor.accountId,
    });
    await syncOpenDay(tx, employee.id, input.workDate, saved, closeMin);
    await resync(tx, day);
    return saved;
  });
  await audit(
    ctx,
    existing ? "attendance.overtime_order.update" : "attendance.overtime_order.create",
    row.id,
    existing ? snapshot(existing) : null,
    snapshot(row),
  );
  await notifyEmployees(
    [
      {
        employeeId: employee.id,
        type: "attendance.overtime_order",
        title: `Perintah lembur${retroactive ? " susulan" : ""} ${input.workDate}${
          input.startTime ? ` mulai ${input.startTime}` : ""
        }${input.endTime ? ` sampai ${input.endTime}` : ""}`,
        body: input.reason,
        link: "/absen",
        target: { type: "ATTENDANCE_DATE", id: input.workDate },
      },
    ],
    now,
  );
  return toView(row, employee, true);
}

export async function cancelOvertimeOrder(
  ctx: RequestContext,
  id: string,
  now = new Date(),
): Promise<{ id: string }> {
  const row = await repository.findOrderById(id);
  if (!row) throw new NotFoundError("Perintah lembur tidak ditemukan.");
  const employee = await directory.employeeById(row.employeeId);
  if (!employee || !policy.canOrderOvertime(ctx.actor, targetOf(employee))) {
    throw new ForbiddenError();
  }
  const workDate = toIso(row.workDate);
  const { timezone } = await readTimeSettings();
  const { day } = await assertCanChange(ctx, employee, workDate, localDate(now, timezone));
  const shift = await scheduleOf(row.employeeId, workDate);
  await repository.withTransaction(async (tx) => {
    await repository.deleteOrder(tx, row.id);
    await syncOpenDay(tx, row.employeeId, workDate, null, shift?.checkOutCloseMin ?? 0);
    await resync(tx, day);
  });
  await audit(ctx, "attendance.overtime_order.cancel", row.id, snapshot(row), null);
  await notifyEmployees(
    [
      {
        employeeId: row.employeeId,
        type: "attendance.overtime_order",
        title: `Perintah lembur ${workDate} dibatalkan`,
        link: "/absen",
        target: { type: "ATTENDANCE_DATE", id: workDate },
      },
    ],
    now,
  );
  return { id: row.id };
}

/** Daftar SPL: SA semua; HR PT-nya; atasan timnya; karyawan miliknya sendiri. */
export async function listOvertimeOrders(
  ctx: RequestContext,
  q: OvertimeOrderQuery,
): Promise<OvertimeOrderView[]> {
  const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
  if (days < 0 || days > MAX_RANGE_DAYS) {
    throw new BusinessRuleError(`Rentang tanggal 0–${MAX_RANGE_DAYS} hari.`);
  }
  const rows = await repository.listOrderRows({
    workDate: { gte: toDate(q.from), lte: toDate(q.to) },
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.employeeId ? { employeeId: q.employeeId } : {}),
  });
  const employees = await directory.employeesByIds([...new Set(rows.map((r) => r.employeeId))]);
  return rows.flatMap((r) => {
    const e = employees.get(r.employeeId);
    if (!e || !policy.canViewEmployeeRoster(ctx.actor, targetOf(e))) return [];
    return [toView(r, e, policy.canOrderOvertime(ctx.actor, targetOf(e)))];
  });
}
