import { LOAN_STATE_LABELS, loanState, ppeReplacementDate } from "@hris/shared";
import { type EmployeeBrief, getEmployeeBriefs } from "../employee/index.ts";
import { getEmployeeAccountStates, listAssetManagers } from "../iam/index.ts";
import { notify, type Recipient } from "../notification/index.ts";
import * as repo from "./asset.repository.ts";
import { todayInJakarta } from "./asset.service.ts";

// ARS-D5/ARS-D6: cron harian `asset-daily` — (1) pinjaman lewat tanggal kembali → pengelola + pemegang,
// (2) APD jatuh tempo ganti → pengelola, (3) aset/APD wajib kembali milik karyawan nonaktif → pengelola.
// Dedupe per transaksi (notification.dedupe_key): tiap kejadian diingatkan sekali.

const toIso = (date: Date) => date.toISOString().slice(0, 10);

export async function runAssetDaily(now: Date = new Date()) {
  const today = todayInJakarta(now);
  const managers = new Map<string, Promise<Recipient[]>>();
  const managersOf = (companyId: string) => {
    if (!managers.has(companyId)) managers.set(companyId, listAssetManagers(companyId, now));
    return managers.get(companyId) as Promise<Recipient[]>;
  };
  const counts = { overdue: 0, replacementDue: 0, exitPending: 0 };

  const open = await repo.openAssignments();
  const ppeAll = await repo.ppeIssuesWithReplacement();
  const mustReturn = await repo.unreturnedMustReturnPpe(null);
  const briefs: Map<string, EmployeeBrief> = await getEmployeeBriefs([
    ...open.map((a) => a.employeeId),
    ...ppeAll.map((p) => p.employeeId),
    ...mustReturn.map((p) => p.employeeId),
  ]);
  const accounts = new Map(
    (await getEmployeeAccountStates([...briefs.keys()]))
      .filter((a) => a.isActive)
      .map((a) => [a.employeeId, a]),
  );

  // (1) Pinjaman terlambat & (3) aset karyawan keluar.
  for (const a of open) {
    const e = briefs.get(a.employeeId);
    if (!e) continue;
    const label = `${a.asset.name} (${a.asset.code})`;
    if (!e.isActive) {
      const r = await notify(
        {
          recipients: await managersOf(a.asset.companyId),
          type: "asset.exit_pending",
          title: "Aset belum kembali dari karyawan keluar",
          body: `${label} masih tercatat dipegang ${e.fullName}.`,
          link: "/personal/arsip/aset?tab=belum-kembali",
          dedupeKey: `asset-exit:${a.id}`,
          email: true,
        },
        now,
      );
      counts.exitPending += r.created;
      continue;
    }
    if (loanState(a.dueBackAt ? toIso(a.dueBackAt) : null, today) !== "OVERDUE") continue;
    const due = toIso(a.dueBackAt as Date);
    const r = await notify(
      {
        recipients: await managersOf(a.asset.companyId),
        type: "asset.loan_overdue",
        title: LOAN_STATE_LABELS.OVERDUE,
        body: `${label} dipinjam ${e.fullName}, seharusnya kembali ${due}.`,
        link: `/personal/arsip/aset?asset=${a.asset.id}`,
        dedupeKey: `asset-overdue:${a.id}`,
        email: true,
      },
      now,
    );
    counts.overdue += r.created;
    const own = accounts.get(e.id);
    if (own) {
      const mine = await notify(
        {
          recipients: [{ accountId: own.accountId, email: own.email }],
          type: "asset.loan_overdue",
          title: "Pinjaman aset lewat tanggal kembali",
          body: `${label} seharusnya dikembalikan ${due}. Hubungi pengelola aset.`,
          link: "/ess",
          dedupeKey: `asset-overdue:${a.id}`,
          email: false,
        },
        now,
      );
      counts.overdue += mine.created;
    }
  }

  // (2) APD jatuh tempo ganti: hanya pembagian terakhir per (karyawan, jenis), karyawan aktif.
  const latest = new Map<string, (typeof ppeAll)[number]>();
  for (const p of ppeAll) {
    const key = `${p.employeeId}:${p.ppeTypeId}`;
    if (!latest.has(key)) latest.set(key, p); // repo mengurutkan terbaru dulu
  }
  for (const p of latest.values()) {
    const e = briefs.get(p.employeeId);
    if (!e?.isActive) continue;
    const due = ppeReplacementDate(toIso(p.issuedAt), p.ppeType.replaceAfterMonths);
    if (!due || due > today) continue;
    const r = await notify(
      {
        recipients: await managersOf(e.companyId),
        type: "asset.ppe_replacement_due",
        title: "APD jatuh tempo ganti",
        body: `${p.ppeType.name} milik ${e.fullName} jatuh tempo ganti ${due}.`,
        link: "/personal/arsip/aset?tab=apd&replacement=DUE",
        dedupeKey: `ppe-replace:${p.id}`,
        email: false,
      },
      now,
    );
    counts.replacementDue += r.created;
  }

  // (3) APD wajib kembali milik karyawan nonaktif.
  for (const p of mustReturn) {
    const e = briefs.get(p.employeeId);
    if (!e || e.isActive) continue;
    const r = await notify(
      {
        recipients: await managersOf(e.companyId),
        type: "asset.exit_pending",
        title: "APD wajib kembali belum dikembalikan",
        body: `${p.ppeType.name} × ${p.quantity} masih tercatat dipegang ${e.fullName}.`,
        link: "/personal/arsip/aset?tab=belum-kembali",
        dedupeKey: `ppe-exit:${p.id}`,
        email: true,
      },
      now,
    );
    counts.exitPending += r.created;
  }
  return counts;
}
