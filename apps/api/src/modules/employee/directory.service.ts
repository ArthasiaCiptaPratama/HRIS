import * as repository from "./directory.repository.ts";

// Interface baca-saja karyawan untuk modul lain (asset, dan pengganti adapter sementara attendance).
// Data sensitif (PLAN §4.2) tidak pernah ikut; hanya identitas kerja minimum untuk keputusan akses.

export interface EmployeeBrief {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  companyId: string;
  managerId: string | null;
  isActive: boolean;
  positionId: string;
  workLocationId: string | null;
}

/** Ringkasan karyawan resmi per id (yang tidak ada / calon onboarding tidak ikut). */
export async function getEmployeeBriefs(ids: string[]): Promise<Map<string, EmployeeBrief>> {
  const rows = await repository.findBriefsByIds([...new Set(ids)]);
  return new Map(rows.map((row) => [row.id, row]));
}

/** Karyawan resmi dalam cakupan: `companyIds` null = semua PT; `managerId` = bawahan langsung (D-009). */
export async function listEmployeeBriefs(filter: {
  companyIds?: string[] | null;
  managerId?: string | null;
  isActive?: boolean | null;
  q?: string | null;
  limit?: number;
}): Promise<EmployeeBrief[]> {
  return repository.findBriefs({
    companyIds: filter.companyIds ?? null,
    managerId: filter.managerId ?? null,
    isActive: filter.isActive ?? null,
    q: filter.q?.trim() || null,
    limit: Math.min(filter.limit ?? 5000, 5000),
  });
}

/** Rujukan dokumen karyawan (pemilik & kode jenis) untuk validasi lampiran di modul lain. */
export async function getEmployeeDocumentRef(
  documentId: string,
): Promise<{ id: string; employeeId: string; typeCode: string } | null> {
  const row = await repository.findDocumentRef(documentId);
  return row ? { id: row.id, employeeId: row.employeeId, typeCode: row.documentType.code } : null;
}
