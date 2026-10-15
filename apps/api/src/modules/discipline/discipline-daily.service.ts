import { writeAudit } from "../../core/audit.ts";
import { getEmployeeBriefs } from "../employee/index.ts";
import { getEmployeeAccountStates, listDisciplineWriters } from "../iam/index.ts";
import { notify, type Recipient } from "../notification/index.ts";
import * as repo from "./discipline.repository.ts";
import { LETTERS_LINK, SELF_LINK, toDate, todayInJakarta } from "./discipline.service.ts";

// ARS-D8/ARS-D9/ARS-D13: cron harian `discipline-daily` — (1) SP lewat berlaku s/d → EXPIRED (riwayat
// tetap), (2) pengingat konfirmasi in-app (tanpa email) ke atasan ("Sudah disampaikan") dan karyawan
// ("Sudah menerima") bila belum dikonfirmasi ≥ 2 hari setelah terbit. Dedupe per SP: diingatkan sekali.

/** Pengingat konfirmasi dikirim bila SP sudah terbit sekurangnya sekian hari. */
export const CONFIRM_REMINDER_AFTER_DAYS = 2;

export async function runDisciplineDaily(now: Date = new Date()) {
  const today = todayInJakarta(now);
  const counts = { expired: 0, deliverReminders: 0, acknowledgeReminders: 0 };

  // (1) Kedaluwarsa.
  const expired = await repo.issuedExpiredBefore(toDate(today));
  if (expired.length) {
    counts.expired = await repo.markExpired(expired.map((e) => e.id));
    for (const e of expired) {
      await writeAudit({
        actorAccountId: null,
        action: "discipline.letter.expire",
        entityType: "warning_letter",
        entityId: e.id,
        after: { status: "EXPIRED", number: e.number },
      });
    }
  }

  // (2) Pengingat konfirmasi.
  const cutoff = new Date(toDate(today).getTime() - CONFIRM_REMINDER_AFTER_DAYS * 86_400_000);
  const pending = await repo.unconfirmedIssued(cutoff);
  if (pending.length === 0) return counts;
  const briefs = await getEmployeeBriefs(pending.map((p) => p.employeeId));
  const deliverers = pending.map(
    (p) => p.managerEmployeeId ?? briefs.get(p.employeeId)?.managerId ?? null,
  );
  const accounts = new Map(
    (
      await getEmployeeAccountStates([
        ...pending.map((p) => p.employeeId),
        ...deliverers.filter((id): id is string => id !== null),
      ])
    )
      .filter((a) => a.isActive)
      .map((a) => [a.employeeId, { accountId: a.accountId, email: a.email } satisfies Recipient]),
  );
  const writers = new Map<string, Promise<Recipient[]>>();
  const writersOf = (companyId: string) => {
    if (!writers.has(companyId)) writers.set(companyId, listDisciplineWriters(companyId, now));
    return writers.get(companyId) as Promise<Recipient[]>;
  };

  for (const [i, p] of pending.entries()) {
    if (!p.deliveredAt) {
      const boss = deliverers[i] ? accounts.get(deliverers[i] as string) : undefined;
      const r = await notify(
        {
          recipients: boss ? [boss] : await writersOf(p.companyId),
          type: "discipline.letter.deliver_reminder",
          title: "Surat peringatan belum ditandai disampaikan",
          body: `Surat ${p.number ?? ""} menunggu konfirmasi "Sudah disampaikan".`,
          link: LETTERS_LINK,
          dedupeKey: `sp-deliver:${p.id}`,
          email: false,
        },
        now,
      );
      counts.deliverReminders += r.created;
    }
    if (!p.acknowledgedAt) {
      const self = accounts.get(p.employeeId);
      if (!self) continue;
      const r = await notify(
        {
          recipients: [self],
          type: "discipline.letter.acknowledge_reminder",
          title: "Ada surat yang menunggu konfirmasi Anda",
          body: 'Buka Layanan Mandiri lalu tekan "Sudah menerima".',
          link: SELF_LINK,
          dedupeKey: `sp-ack:${p.id}`,
          email: false,
        },
        now,
      );
      counts.acknowledgeReminders += r.created;
    }
  }
  return counts;
}
