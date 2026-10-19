import type { WarningLevel } from "@hris/shared";
import * as repo from "./discipline.repository.ts";

// ARS-D17 (Laporan "SP aktif"): data SP untuk modul `report` — tanpa cek akses (pemanggil memeriksa
// policy & cakupan) dan tanpa uraian/alasan (internal HR). Interface publik lewat index.ts.

const toIso = (d: Date) => d.toISOString().slice(0, 10);

export interface ReportWarningLetter {
  id: string;
  employeeId: string;
  companyId: string;
  level: WarningLevel;
  number: string | null;
  issuedAt: string;
  effectiveUntil: string;
  /** Berlaku pada tanggal laporan (ISSUED & s/d ≥ hari ini). */
  active: boolean;
  revoked: boolean;
  confirmed: boolean;
  violationType: { id: string; name: string };
}

/** SP terbit sejak `since` (untuk tren) — `active` menandai yang masih berlaku pada `today`. */
export async function listWarningLettersForReport(
  employeeIds: string[],
  since: string,
  today: string,
): Promise<ReportWarningLetter[]> {
  if (employeeIds.length === 0) return [];
  const rows = await repo.lettersForReport(employeeIds, new Date(`${since}T00:00:00.000Z`));
  return rows.map((r) => {
    const effectiveUntil = toIso(r.effectiveUntil as Date);
    return {
      id: r.id,
      employeeId: r.employeeId,
      companyId: r.companyId,
      level: r.level,
      number: r.number,
      issuedAt: toIso(r.issuedAt as Date),
      effectiveUntil,
      active: r.status === "ISSUED" && effectiveUntil >= today,
      revoked: r.status === "REVOKED",
      confirmed: r.deliveredAt !== null && r.acknowledgedAt !== null,
      violationType: r.violationType,
    };
  });
}
