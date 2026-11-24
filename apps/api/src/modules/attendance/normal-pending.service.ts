import { autoApproveRequest, pendingRequestsForSubjects } from "../approval/index.ts";
import * as repository from "./attendance.repository.ts";
import { toDate, toIso } from "./calendar.service.ts";
import { closedMonths } from "./period.service.ts";

const AUTO_APPROVAL_NOTE = "Otomatis: absen normal (EMP-D8 P1)";
export interface NormalPendingOptions {
  apply?: boolean;
  companyId?: string;
  /** Eksklusif, berdasarkan tanggal kerja di zona Time Management. */
  before?: string;
}

/** EMP-D8 P1: dry-run bawaan; satu transaksi per request dan kelayakan diperiksa lagi saat apply. */
export async function approveNormalPendingPunches(
  options: NormalPendingOptions = {},
  now = new Date(),
) {
  const filters = {
    ...(options.companyId ? { companyId: options.companyId } : {}),
    ...(options.before ? { before: toDate(options.before) } : {}),
  };
  const result = {
    dryRun: options.apply !== true,
    candidates: 0,
    approved: 0,
    failed: 0,
    skipped: 0,
    groups: [] as { companyId: string; month: string; count: number }[],
  };
  const groups = new Map<string, { companyId: string; month: string; count: number }>();
  let afterId: string | undefined;
  for (;;) {
    const punches = await repository.normalPendingPunches({
      ...filters,
      ...(afterId ? { afterId } : {}),
    });
    if (punches.length === 0) break;
    afterId = punches.at(-1)?.id;
    const requests = await pendingRequestsForSubjects(
      "ATTENDANCE_PUNCH",
      punches.map((p) => p.id),
    );
    const byPunch = new Map(punches.map((p) => [p.id, p]));
    const dates = punches.map((p) => toIso(p.day.workDate)).sort();
    const closed = await closedMonths(
      punches.map((p) => p.day.companyId),
      dates[0] as string,
      dates.at(-1) as string,
    );
    for (const request of requests) {
      const punch = byPunch.get(request.subjectId);
      if (!punch) continue;
      const month = toIso(punch.day.workDate).slice(0, 7);
      const key = `${punch.day.companyId}|${month}`;
      if (closed.has(key)) continue;
      result.candidates++;
      const group = groups.get(key) ?? { companyId: punch.day.companyId, month, count: 0 };
      group.count++;
      groups.set(key, group);
      if (options.apply !== true) continue;
      try {
        const approved = await repository.withTransactionDay(async (tx) => {
          const [current] = await repository.normalPendingPunches({ ...filters, id: punch.id }, tx);
          if (!current) return false;
          const date = toIso(current.day.workDate);
          if ((await closedMonths([current.day.companyId], date, date, tx)).size > 0) return false;
          return autoApproveRequest(tx, request.id, now, AUTO_APPROVAL_NOTE);
        });
        if (approved) result.approved++;
        else result.skipped++;
      } catch {
        // EMP-D8 P1: gagal satu request tidak menghentikan request lain; jangan mencetak data pribadi.
        result.failed++;
      }
    }
  }
  result.groups = [...groups.values()].sort(
    (a, b) => a.companyId.localeCompare(b.companyId) || a.month.localeCompare(b.month),
  );
  return result;
}
