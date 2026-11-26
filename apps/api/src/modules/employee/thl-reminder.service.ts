import { evaluateThlEmployees } from "../contract/index.ts";
import { getEmployeeAccountStates, listCompanyHrRecipients } from "../iam/index.ts";
import { notify } from "../notification/index.ts";
import { getMasterLookup, statusIdsForCategories } from "../organization/index.ts";
import * as repository from "./employee.repository.ts";

/** KTR-D8/D13: web only, no automatic conversion; recipient-level notification dedupe. */
export async function remindThl(now = new Date()) {
  const lookup = await getMasterLookup();
  const rows = await repository.findActiveThl(
    { onboardingStatus: "APPROVED" },
    statusIdsForCategories(lookup, ["DAILY_WORKER"]),
  );
  const evaluations = await evaluateThlEmployees(
    rows.map((r) => r.id),
    now,
  );
  const due = rows.filter((r) => evaluations.get(r.id)?.status === "REQUIRED");
  const managers = new Map(
    (await getEmployeeAccountStates([...new Set(due.flatMap((r) => r.managerId ?? []))]))
      .filter((r) => r.isActive)
      .map((r) => [r.employeeId, { accountId: r.accountId, email: r.email }]),
  );
  const hrs = new Map<string, Awaited<ReturnType<typeof listCompanyHrRecipients>>>();
  let notified = 0;
  for (const row of due) {
    const evaluation = evaluations.get(row.id);
    if (!evaluation) continue;
    if (!hrs.has(row.companyId))
      hrs.set(row.companyId, await listCompanyHrRecipients(row.companyId, now));
    const recipients = hrs.get(row.companyId) ?? [];
    const body = `${row.fullName}: ${evaluation.months.map((m) => `${m.month}: ${m.presentDays} hari hadir`).join(", ")}. Wajib diangkat PKWTT (PP 35/2021 Ps. 10). Jadikan Karyawan Tetap.`;
    const base = {
      type: "contract.thl.required",
      title: "Wajib diangkat PKWTT",
      body,
      email: false,
      dedupeKey: `thl-required:${row.id}:${evaluation.months[2]?.month}`,
    };
    notified += (
      await notify(
        { ...base, recipients, link: `/personal/pegawai-aktif/semua?pegawai=${row.id}&tab=work` },
        now,
      )
    ).created;
    const manager = row.managerId ? managers.get(row.managerId) : undefined;
    if (manager && !recipients.some((r) => r.accountId === manager.accountId))
      notified += (await notify({ ...base, recipients: [manager] }, now)).created;
  }
  return { checked: rows.length, due: due.length, notified };
}
