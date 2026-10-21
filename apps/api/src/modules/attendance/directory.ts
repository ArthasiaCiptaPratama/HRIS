import {
  type EmployeeBrief,
  getEmployeeBriefs,
  listActiveEmployeeJoinDates,
  listEmployeeBriefs,
} from "../employee/index.ts";
import {
  getWorkLocationBriefs,
  listGeofencedWorkLocations,
  companyExists as organizationCompanyExists,
  type WorkLocationBrief,
} from "../organization/index.ts";

// Data karyawan, PT, & lokasi kerja untuk Time Management (attendance & leave), dibaca lewat
// interface publik modul employee & organization (aturan emas #3). Tidak ada query Prisma di sini.

export interface DirectoryEmployee {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  companyId: string;
  managerId: string | null;
  workLocationId: string | null;
  isActive: boolean;
}

export type DirectoryLocation = WorkLocationBrief;

/** Bentuk tetap (tanpa positionId dll.) agar DTO pemanggil tidak ikut berubah. */
function toDirectory(row: EmployeeBrief): DirectoryEmployee {
  return {
    id: row.id,
    fullName: row.fullName,
    employeeNumber: row.employeeNumber,
    companyId: row.companyId,
    managerId: row.managerId,
    workLocationId: row.workLocationId,
    isActive: row.isActive,
  };
}

/** Karyawan "resmi" saja (D-045: calon onboarding belum disetujui bukan karyawan). */
export async function employeesByIds(ids: string[]): Promise<Map<string, DirectoryEmployee>> {
  if (ids.length === 0) return new Map();
  const rows = await getEmployeeBriefs(ids);
  return new Map([...rows].map(([id, row]) => [id, toDirectory(row)]));
}

export async function employeeById(id: string): Promise<DirectoryEmployee | null> {
  return (await employeesByIds([id])).get(id) ?? null;
}

export async function activeEmployeesInCompany(
  companyId: string,
  q?: string,
  take = 500,
): Promise<DirectoryEmployee[]> {
  const rows = await listEmployeeBriefs({
    companyIds: [companyId],
    isActive: true,
    q,
    limit: take,
  });
  return rows.map(toDirectory);
}

export async function employeesByNumbers(
  companyId: string,
  numbers: string[],
): Promise<Map<string, DirectoryEmployee>> {
  if (numbers.length === 0) return new Map();
  const rows = await listEmployeeBriefs({
    companyIds: [companyId],
    employeeNumbers: numbers,
    limit: numbers.length,
  });
  return new Map(rows.map((row) => [row.employeeNumber ?? row.id, toDirectory(row)]));
}

/** Tim MANAGER = bawahan langsung (D-009). */
export async function teamIds(managerEmployeeId: string): Promise<string[]> {
  const rows = await listEmployeeBriefs({ managerId: managerEmployeeId });
  return rows.map((row) => row.id);
}

export function locationsByIds(ids: string[]): Promise<Map<string, DirectoryLocation>> {
  return getWorkLocationBriefs(ids);
}

export function companyExists(companyId: string): Promise<boolean> {
  return organizationCompanyExists(companyId);
}

/** Semua lokasi kerja aktif yang punya geofence lengkap (untuk label OTHER_LOCATION). */
export function geofencedLocations(): Promise<DirectoryLocation[]> {
  return listGeofencedWorkLocations();
}

export interface GrantCandidate {
  id: string;
  companyId: string;
  joinDate: Date;
}

/** Karyawan aktif resmi beserta tanggal masuk (jatah cuti 1 Januari, modul leave). */
export function activeEmployeesForGrant(): Promise<GrantCandidate[]> {
  return listActiveEmployeeJoinDates();
}
