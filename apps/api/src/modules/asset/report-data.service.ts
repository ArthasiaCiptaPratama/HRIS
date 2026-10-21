import type { AssetCondition, AssetStatus } from "@hris/shared";
import { getPrisma } from "../../core/db.ts";
import { unreturnedMustReturnPpe } from "./asset.repository.ts";

// ARS-D21 (Laporan "Aset"): data aset untuk modul `report` — tanpa cek akses (pemanggil memeriksa
// policy & cakupan PT) dan tanpa harga beli (ARS-D3). Interface publik lewat index.ts.

const toIso = (d: Date) => d.toISOString().slice(0, 10);

export interface ReportAsset {
  id: string;
  code: string;
  name: string;
  category: string;
  companyId: string;
  workLocationId: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  /** Pemegang saat ini (serah-terima terbuka). */
  holder: { employeeId: string; assignedAt: string; dueBackAt: string | null } | null;
}

export async function listAssetsForReport(filter: {
  companyIds: string[] | null;
  workLocationId: string | null;
}): Promise<ReportAsset[]> {
  const rows = await getPrisma().asset.findMany({
    where: {
      ...(filter.companyIds ? { companyId: { in: filter.companyIds } } : {}),
      ...(filter.workLocationId ? { workLocationId: filter.workLocationId } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      companyId: true,
      workLocationId: true,
      status: true,
      condition: true,
      category: { select: { name: true } },
      assignments: {
        where: { closedAt: null },
        select: { employeeId: true, assignedAt: true, dueBackAt: true },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  });
  return rows.map(({ category, assignments, ...r }) => {
    const open = assignments[0];
    return {
      ...r,
      category: category.name,
      holder: open
        ? {
            employeeId: open.employeeId,
            assignedAt: toIso(open.assignedAt),
            dueBackAt: open.dueBackAt ? toIso(open.dueBackAt) : null,
          }
        : null,
    };
  });
}

export interface ReportUnreturnedPpe {
  id: string;
  employeeId: string;
  ppeType: string;
  quantity: number;
  issuedAt: string;
}

/** APD jenis wajib kembali (ARS-D6) yang belum dikembalikan milik karyawan `employeeIds`. */
export async function listUnreturnedPpeForReport(
  employeeIds: string[],
): Promise<ReportUnreturnedPpe[]> {
  if (employeeIds.length === 0) return [];
  const rows = await unreturnedMustReturnPpe(employeeIds);
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    ppeType: r.ppeType.name,
    quantity: r.quantity,
    issuedAt: toIso(r.issuedAt),
  }));
}
