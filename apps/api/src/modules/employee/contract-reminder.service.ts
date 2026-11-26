import { addContractDays, daysUntil } from "@hris/shared";
import { getEmployeeAccountStates, listDocumentReminderRecipients } from "../iam/index.ts";
import { notify } from "../notification/index.ts";
import { getMasterLookup, statusIdsForCategories } from "../organization/index.ts";
import * as repository from "./employee.repository.ts";
import { todayInJakarta } from "./employee.service.ts";
import { remindThl } from "./thl-reminder.service.ts";

// ── Cron `contract-daily` (KTR-D5, KTR-D6) ─────────────────────────────────────

/** Ambang pengingat sebelum akhir: PKWT H-30 & H-7 (KTR-D5), masa percobaan H-14 (KTR-D6). */
export const CONTRACT_REMINDER_DAYS = { PKWT: [30, 7], PROBATION: [14] } as const;
const LOOKAHEAD_DAYS = 30;

type ContractCategory = keyof typeof CONTRACT_REMINDER_DAYS;

/**
 * Ambang yang berlaku hari ini: `"overdue"` bila tanggal akhir sudah lewat, angka ambang terkecil yang sudah
 * dicapai (mis. sisa 5 hari → 7), atau null bila belum masuk ambang mana pun.
 */
export function contractReminderThreshold(
  category: ContractCategory,
  endDate: string,
  today: string,
): number | "overdue" | null {
  const left = daysUntil(endDate, today);
  if (left < 0) return "overdue";
  const reached = CONTRACT_REMINDER_DAYS[category].filter((days) => left <= days);
  return reached.length > 0 ? Math.min(...reached) : null;
}

/**
 * Pengingat kontrak/masa percobaan ke HR PT (bila tidak ada HR → SUPER_ADMIN aktif) + atasan langsung (akun
 * aktif). Notifikasi web; tidak ada perubahan status otomatis (KTR-D5: tanpa nonaktif otomatis).
 * Dedupe per penerima: ambang sebelum akhir sekali per tanggal akhir; "lewat" sekali per hari.
 */
export async function remindContracts(now: Date = new Date()) {
  const thl = await remindThl(now);
  const today = todayInJakarta(now);
  const lookup = await getMasterLookup();
  const categoryOf = new Map<string, ContractCategory>();
  for (const category of ["PKWT", "PROBATION"] as const)
    for (const id of statusIdsForCategories(lookup, [category])) categoryOf.set(id, category);
  if (categoryOf.size === 0) return { checked: 0, due: 0, notified: 0, thl };

  const rows = await repository.findContractsEndingBy(
    [...categoryOf.keys()],
    new Date(`${addContractDays(today, LOOKAHEAD_DAYS)}T00:00:00.000Z`),
  );
  const due = rows.flatMap((row) => {
    const category = categoryOf.get(row.employmentStatusId);
    if (!category || !row.contractEndDate) return [];
    const endDate = row.contractEndDate.toISOString().slice(0, 10);
    const threshold = contractReminderThreshold(category, endDate, today);
    return threshold === null ? [] : [{ row, category, endDate, threshold }];
  });

  const managers = new Map(
    (await getEmployeeAccountStates([...new Set(due.flatMap((d) => d.row.managerId ?? []))]))
      .filter((a) => a.isActive)
      .map((a) => [a.employeeId, { accountId: a.accountId, email: a.email }]),
  );
  const hrCache = new Map<string, Promise<{ accountId: string; email: string }[]>>();
  const hrOf = (companyId: string) => {
    if (!hrCache.has(companyId))
      hrCache.set(companyId, listDocumentReminderRecipients(companyId, false, now));
    return hrCache.get(companyId) as Promise<{ accountId: string; email: string }[]>;
  };
  const format = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" });

  let notified = 0;
  for (const { row, category, endDate, threshold } of due) {
    const when = format.format(new Date(`${endDate}T00:00:00.000Z`));
    const left = daysUntil(endDate, today);
    const what =
      category === "PKWT"
        ? `Kontrak ${row.contractStage ? `PKWT ${row.contractStage}` : "PKWT"}`
        : "Masa percobaan";
    const overdue = threshold === "overdue";
    const title = overdue
      ? category === "PKWT"
        ? "Kontrak lewat"
        : "Masa percobaan lewat"
      : category === "PKWT"
        ? "Kontrak akan berakhir"
        : "Masa percobaan akan berakhir";
    const next =
      category === "PKWT"
        ? "Pilih Perpanjang, Jadikan Karyawan Tetap, atau Akhiri kontrak."
        : "Pilih Lulus → Permanen atau Tidak lulus.";
    const status = overdue
      ? `berakhir ${when} (lewat ${-left} hari) dan belum ada tindakan.`
      : left === 0
        ? `berakhir hari ini (${when}).`
        : `berakhir ${when} (${left} hari lagi).`;
    const base = {
      type: overdue ? "contract.overdue" : "contract.expiring",
      title,
      dedupeKey: overdue
        ? `contract-overdue:${row.id}:${endDate}:${today}`
        : `contract-expiring:${row.id}:${endDate}:${threshold}`,
      email: false,
    };
    const hrs = await hrOf(row.companyId);
    notified += (
      await notify(
        {
          ...base,
          recipients: hrs,
          body: `${what} ${row.fullName} ${status} ${next}`,
          link: `/personal/pegawai-aktif/semua?pegawai=${row.id}&tab=work`,
        },
        now,
      )
    ).created;
    // Atasan langsung bisa berakun Karyawan (ORG-D9) yang tidak membuka Personal Management → tanpa tautan;
    // tindakan tetap di HR. Akun yang juga HR sudah menerima versi bertautan (dedupe per penerima).
    const manager = row.managerId ? managers.get(row.managerId) : undefined;
    if (manager && !hrs.some((h) => h.accountId === manager.accountId))
      notified += (
        await notify(
          {
            ...base,
            recipients: [manager],
            body: `${what} bawahan Anda, ${row.fullName}, ${status} HR akan menindaklanjuti.`,
          },
          now,
        )
      ).created;
  }
  return { checked: rows.length, due: due.length, notified, thl };
}
