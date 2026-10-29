import { OFF_CODE, ROLE } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { getAccountSummaries, listApproverAccounts, loadActor } from "../iam/index.ts";
import { notify, type Recipient } from "../notification/index.ts";
import * as policy from "./attendance.policy.ts";
import { type RequestContext, settingsToday, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as repository from "./roster.repository.ts";
import { dayKey, keepDayKeys } from "./roster.service.ts";
import { isoAddDays, patternCodeOn } from "./roster-engine.ts";
import { dateLabel, recipientsOfEmployees } from "./time-notify.service.ts";

// TM-D24 untuk app mobile (keputusan dari HP): detail pengajuan perubahan roster, data tambahan untuk layar
// keputusan (crew, shift yang dipakai, pengaju, hari mundur), dan notifikasi pengajuan baru ke pemutusnya.

export interface RosterEditCrewInfo {
  action: "join" | "leave";
  fromCrewName: string | null;
  toCrewName: string | null;
}

export interface RosterEditShiftInfo {
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  startsNextDay: boolean;
}

/** Isi template / pindah crew bertanggal mundur: hari lalu yang jadi Alpha & yang dipertahankan (ber-absen). */
export interface RosterEditBackdated {
  alphaDays: number;
  keptDays: number;
}

export interface RosterEditExtras {
  crew: RosterEditCrewInfo | null;
  shifts: RosterEditShiftInfo[];
  submittedBy: { name: string };
  backdated: RosterEditBackdated | null;
}

type Row = repository.RosterEditRow;
type CrewPayload = { crewId: string; crewName: string; action?: "join" | "leave" };

const isJoin = (row: Row) =>
  row.kind === "TEMPLATE" ||
  (row.kind === "CREW" && (row.payload as unknown as CrewPayload).action === "join");

/** Crew asal (yang masih berlaku pada tanggal efektif) hanya untuk pengajuan yang masih menunggu. */
async function currentCrewNames(rows: Row[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byDate = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.status !== "PENDING" || !isJoin(row)) continue;
    const date = toIso(row.effectiveDate);
    byDate.set(date, [...(byDate.get(date) ?? []), row]);
  }
  for (const [date, list] of byDate) {
    const members = await repository.membershipsOn(
      list.map((r) => r.employeeId),
      toDate(date),
    );
    for (const row of list) {
      const target = (row.payload as unknown as CrewPayload).crewId;
      const current = members.find((m) => m.employeeId === row.employeeId && m.crew.id !== target);
      if (current) out.set(row.id, current.crew.name);
    }
  }
  return out;
}

function crewInfo(row: Row, fromCrew: string | undefined): RosterEditCrewInfo | null {
  if (row.kind !== "TEMPLATE" && row.kind !== "CREW") return null;
  const p = row.payload as unknown as CrewPayload;
  if (row.kind === "CREW" && p.action === "leave") {
    return { action: "leave", fromCrewName: p.crewName, toCrewName: null };
  }
  return { action: "join", fromCrewName: fromCrew ?? null, toCrewName: p.crewName };
}

/** Data tambahan per pengajuan (id → extras). `backdated` hanya dihitung di detail (lihat withBackdated). */
export async function rosterEditExtras(rows: Row[]): Promise<Map<string, RosterEditExtras>> {
  if (rows.length === 0) return new Map();
  const companyIds = [...new Set(rows.map((r) => r.companyId))];
  const [shiftLists, accounts, fromCrews] = await Promise.all([
    Promise.all(companyIds.map((id) => repository.listShifts(id, true))),
    getAccountSummaries(rows.map((r) => r.createdByAccountId)),
    currentCrewNames(rows),
  ]);
  const shiftsOf = new Map(
    companyIds.map((id, i) => [id, new Map((shiftLists[i] ?? []).map((s) => [s.code, s]))]),
  );
  const people = await directory.employeesByIds(
    [...accounts.values()].map((a) => a.employeeId).filter((id): id is string => Boolean(id)),
  );
  const out = new Map<string, RosterEditExtras>();
  for (const row of rows) {
    const codes = new Set<string>();
    for (const day of row.preview as unknown as { from: string | null; to: string | null }[]) {
      for (const c of [day.from, day.to]) if (c && c !== OFF_CODE) codes.add(c);
    }
    const byCode = shiftsOf.get(row.companyId);
    const shifts = [...codes].sort().flatMap((c) => {
      const s = byCode?.get(c);
      return s
        ? [
            {
              code: s.code,
              name: s.name,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
              startsNextDay: s.startsNextDay,
            },
          ]
        : [];
    });
    const account = accounts.get(row.createdByAccountId);
    const person = account?.employeeId ? people.get(account.employeeId) : undefined;
    out.set(row.id, {
      crew: crewInfo(row, fromCrews.get(row.id)),
      shifts,
      submittedBy: { name: person?.fullName ?? account?.email ?? "" },
      backdated: null,
    });
  }
  return out;
}

/** Hari lalu (tanggal efektif s.d. kemarin) bila pengajuan pindah crew yang menunggu diterapkan sekarang. */
export async function backdatedOf(row: Row): Promise<RosterEditBackdated | null> {
  if (row.status !== "PENDING" || !isJoin(row)) return null;
  const today = await settingsToday();
  const from = toIso(row.effectiveDate);
  if (from >= today) return null;
  const crew = await repository.findCrew((row.payload as unknown as CrewPayload).crewId);
  if (!crew) return null;
  const to = isoAddDays(today, -1);
  const keep = await keepDayKeys([row.employeeId], from, to);
  const cycle = toIso(crew.cycleStartDate);
  let alphaDays = 0;
  let keptDays = 0;
  for (let d = from; d <= to; d = isoAddDays(d, 1)) {
    if (keep.has(dayKey(row.employeeId, d))) keptDays++;
    else if (patternCodeOn(crew.pattern.steps, cycle, d) !== OFF_CODE) alphaDays++;
  }
  return { alphaDays, keptDays };
}

/** K3: pemutus langkah (atasan snapshot, HR PT, SA), atau akun pengaju. Karyawan yang dijadwalkan tidak. */
export function canViewRosterEdit(actor: Actor, row: Row): boolean {
  if (actor.accountId === row.createdByAccountId) return true;
  if (actor.employeeId !== null && actor.employeeId === row.employeeId) return false;
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  if (row.managerEmployeeId !== null && actor.employeeId === row.managerEmployeeId) return true;
  return policy.canManageRoster(actor, row.companyId);
}

// ── Notifikasi pengajuan baru (K6) ───────────────────────────────────────────────

/**
 * Penerima berhak "regular": atasan karyawan (atau SA bila tanpa atasan) + HR_ADMIN PT itu selain pengaju.
 * Satu notifikasi per penerima per batch: 1 pengajuan → layar detail; lebih → antrean persetujuan.
 */
export async function notifyNewRosterEdits(
  ctx: RequestContext,
  companyId: string,
  created: { id: string; employeeId: string; managerEmployeeId: string | null }[],
  now = new Date(),
): Promise<number> {
  if (created.length === 0) return 0;
  const inbox = new Map<string, { recipient: Recipient; editIds: string[] }>();
  const add = (recipient: Recipient, editId: string) => {
    if (recipient.accountId === ctx.actor.accountId) return;
    const entry = inbox.get(recipient.accountId) ?? { recipient, editIds: [] };
    entry.editIds.push(editId);
    inbox.set(recipient.accountId, entry);
  };
  const managers = await recipientsOfEmployees(
    created.map((c) => c.managerEmployeeId).filter((id): id is string => Boolean(id)),
  );
  const approvers: { recipient: Recipient; actor: Actor }[] = [];
  for (const account of await listApproverAccounts()) {
    const actor = await loadActor(account.authUserId, now);
    if (actor && (actor.role === ROLE.HR_ADMIN || actor.role === ROLE.SUPER_ADMIN)) {
      approvers.push({ recipient: { accountId: account.accountId, email: account.email }, actor });
    }
  }
  for (const edit of created) {
    const manager = edit.managerEmployeeId ? managers.get(edit.managerEmployeeId) : undefined;
    if (manager) add(manager, edit.id);
    for (const { recipient, actor } of approvers) {
      const hr = actor.role === ROLE.HR_ADMIN && policy.canManageRoster(actor, companyId);
      const saForManager = actor.role === ROLE.SUPER_ADMIN && edit.managerEmployeeId === null;
      if (hr || saForManager) add(recipient, edit.id);
    }
  }
  const names = await directory.employeesByIds(created.map((c) => c.employeeId));
  const employeeOf = new Map(created.map((c) => [c.id, c.employeeId]));
  const today = await settingsToday(now);
  let sent = 0;
  for (const { recipient, editIds } of inbox.values()) {
    const single = editIds.length === 1 ? (editIds[0] as string) : null;
    const name = single ? (names.get(employeeOf.get(single) ?? "")?.fullName ?? "") : "";
    try {
      const r = await notify(
        {
          recipients: [recipient],
          type: "attendance.roster_edit_new",
          title: single
            ? `Perubahan jadwal ${name} menunggu persetujuan`
            : `${editIds.length} perubahan jadwal menunggu persetujuan Anda`,
          body: `Diajukan HR ${dateLabel(today)}. Jadwal lama berlaku sampai disetujui.`,
          link: "/absen/approval",
          dedupeKey: `tm-roster-edit-new:${single ?? `${editIds[0]}:${editIds.length}`}`,
          target: single
            ? { type: "ROSTER_EDIT", id: single }
            : { type: "APPROVAL_QUEUE", id: today },
          email: false,
        },
        now,
      );
      sent += r.created;
    } catch {
      // Notifikasi bersifat tambahan: pengajuan tetap tersimpan.
    }
  }
  return sent;
}

/**
 * Keputusan final pengajuan → akun HR pengaju diberi tahu (dikirim setelah transaksi keputusan commit).
 * Target `ROSTER_EDIT` + id sama dengan `attendance.roster_edit_new` (detail boleh dilihat pengaju).
 */
export async function notifyRosterEditDecided(
  row: Pick<Row, "id" | "employeeId" | "createdByAccountId">,
  result: { status: "APPLIED" | "REJECTED"; appliedFrom: string | null },
  now = new Date(),
): Promise<number> {
  const account = (await getAccountSummaries([row.createdByAccountId])).get(row.createdByAccountId);
  if (!account) return 0;
  const name = (await directory.employeesByIds([row.employeeId])).get(row.employeeId)?.fullName;
  const applied = result.status === "APPLIED";
  const r = await notify(
    {
      recipients: [{ accountId: account.accountId, email: account.email }],
      type: "attendance.roster_edit_decided",
      title: `Perubahan jadwal${name ? ` ${name}` : ""} ${applied ? "disetujui" : "ditolak"}`,
      body:
        applied && result.appliedFrom
          ? `Berlaku mulai ${dateLabel(result.appliedFrom)}.`
          : "Jadwal lama tetap berlaku.",
      link: "/time/perubahan-roster",
      dedupeKey: `tm-roster-edit-decided:${row.id}`,
      target: { type: "ROSTER_EDIT", id: row.id },
      email: false,
    },
    now,
  );
  return r.created;
}
