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
  gradeId: string | null;
}

/** Ringkasan karyawan resmi per id (yang tidak ada / calon onboarding tidak ikut). */
export async function getEmployeeBriefs(ids: string[]): Promise<Map<string, EmployeeBrief>> {
  const rows = await repository.findBriefsByIds([...new Set(ids)]);
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Karyawan resmi dalam cakupan: `companyIds` null = semua PT; `managerId` = bawahan langsung (D-009);
 * `employeeNumbers` = cocok persis nomor induk (import).
 */
export async function listEmployeeBriefs(filter: {
  companyIds?: string[] | null;
  managerId?: string | null;
  isActive?: boolean | null;
  employeeNumbers?: string[] | null;
  q?: string | null;
  limit?: number;
}): Promise<EmployeeBrief[]> {
  return repository.findBriefs({
    companyIds: filter.companyIds ?? null,
    managerId: filter.managerId ?? null,
    isActive: filter.isActive ?? null,
    employeeNumbers: filter.employeeNumbers ? [...new Set(filter.employeeNumbers)] : null,
    q: filter.q?.trim() || null,
    limit: Math.min(filter.limit ?? 5000, 5000),
  });
}

/** Karyawan aktif resmi beserta tanggal masuk (jatah cuti 1 Januari, modul leave). */
export async function listActiveEmployeeJoinDates(): Promise<
  { id: string; companyId: string; joinDate: Date }[]
> {
  return repository.findActiveJoinDates();
}

/** Rujukan dokumen karyawan (pemilik & kode jenis) untuk validasi lampiran di modul lain. */
export async function getEmployeeDocumentRef(
  documentId: string,
): Promise<{ id: string; employeeId: string; typeCode: string } | null> {
  const row = await repository.findDocumentRef(documentId);
  return row ? { id: row.id, employeeId: row.employeeId, typeCode: row.documentType.code } : null;
}

export interface ExitedEmployeeBrief {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  companyId: string;
  endDate: Date;
  exitReason: string | null;
  gradeId: string | null;
  isActive: boolean;
}

/** TM-D9: karyawan resmi nonaktif dengan tanggal keluar; `companyIds` null = semua PT. */
export async function listExitedEmployees(
  companyIds: string[] | null = null,
): Promise<ExitedEmployeeBrief[]> {
  const rows = await repository.findExited(companyIds);
  return rows.map((row) => ({
    ...row,
    endDate: row.endDate as Date,
    exitReason: row.exitReason ?? null,
  }));
}

/** TM-D9: status aktif & tanggal keluar terkini per karyawan. */
export async function getEmployeeExitStatuses(
  ids: string[],
): Promise<Map<string, { isActive: boolean; endDate: Date | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await repository.findExitStatus([...new Set(ids)]);
  return new Map(rows.map((row) => [row.id, { isActive: row.isActive, endDate: row.endDate }]));
}

export interface AnalyticsEmployeeBrief {
  id: string;
  fullName: string;
  companyId: string;
  managerId: string | null;
  workLocationId: string | null;
  gradeId: string | null;
  gender: string | null;
  joinDate: Date;
  endDate: Date | null;
  exitReason: string | null;
  isActive: boolean;
  employmentStatusId: string | null;
  /** Hanya diisi bila `withBirthDate` (pemanggil berhak atas data pribadi). */
  birthDate: Date | null;
}

/** DSB-D1: karyawan resmi yang aktif pada sebagian rentang [from, to]. Baca-saja. */
export async function listAnalyticsEmployees(input: {
  companyIds?: string[] | null;
  managerId?: string | null;
  from: Date;
  to: Date;
  withBirthDate: boolean;
}): Promise<AnalyticsEmployeeBrief[]> {
  const rows = await repository.findForAnalytics({
    companyIds: input.companyIds ?? null,
    managerId: input.managerId ?? null,
    from: input.from,
    to: input.to,
    withBirthDate: input.withBirthDate,
  });
  return rows.map((row) => {
    const personal = (row as { personal?: { birthDate: Date | null } | null }).personal;
    return {
      id: row.id,
      fullName: row.fullName,
      companyId: row.companyId,
      managerId: row.managerId,
      workLocationId: row.workLocationId,
      gradeId: row.gradeId,
      gender: row.gender ?? null,
      joinDate: row.joinDate,
      endDate: row.endDate,
      exitReason: row.exitReason ?? null,
      isActive: row.isActive,
      employmentStatusId: row.employmentStatusId ?? null,
      birthDate: personal?.birthDate ?? null,
    };
  });
}
