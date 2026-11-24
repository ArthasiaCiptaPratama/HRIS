import {
  type AnalyticsEmployeeBrief,
  type EmployeeBrief,
  type ExitedEmployeeBrief,
  getEmployeeBriefs,
  getEmployeeExitStatuses,
  getHomebasesOn,
  listActiveEmployeeJoinDates,
  listAnalyticsEmployees,
  listEmployeeBriefs,
  listExitedEmployees,
} from "../employee/index.ts";
import {
  type GradeBrief,
  getEmploymentStatusCategories,
  getMasterLookup,
  getWorkLocationBriefs,
  listActiveGrades,
  listActiveWorkLocations,
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
  /** TM-D6: grade → upah grade untuk estimasi rupiah lembur. */
  gradeId: string | null;
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
    gradeId: row.gradeId,
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

/** Id karyawan (aktif & tidak aktif) yang nama atau NIK-nya memuat `q` — filter cari Data Absen Harian. */
export async function employeeIdsMatching(q: string): Promise<string[]> {
  const rows = await listEmployeeBriefs({ q });
  return rows.map((row) => row.id);
}

/** Tim MANAGER = bawahan langsung (D-009). */
export async function teamIds(managerEmployeeId: string): Promise<string[]> {
  const rows = await listEmployeeBriefs({ managerId: managerEmployeeId });
  return rows.map((row) => row.id);
}

/** Batas baris `listEmployeeBriefs` (tanpa halaman) — dicapai berarti hasil mungkin terpotong. */
export const EMPLOYEE_LIST_CAP = 5000;

/**
 * TM-D31: karyawan resmi (aktif & tidak aktif) di PT cakupan; `companyIds` null = semua PT. Tidak memotong
 * diam-diam: bila jumlahnya mencapai batas `listEmployeeBriefs`, mengembalikan null (pemanggil menolak).
 */
export async function employeesInCompanies(
  companyIds: string[] | null,
): Promise<DirectoryEmployee[] | null> {
  if (companyIds?.length === 0) return [];
  const rows = await listEmployeeBriefs({ companyIds, limit: EMPLOYEE_LIST_CAP });
  return rows.length >= EMPLOYEE_LIST_CAP ? null : rows.map(toDirectory);
}

/** TM-D31: kode & nama PT (judul file ekspor, pembeda nama crew kembar antar-PT). */
export async function companyNames(): Promise<Map<string, { code: string; name: string }>> {
  const lookup = await getMasterLookup();
  return new Map([...lookup.companies.values()].map((c) => [c.id, { code: c.code, name: c.name }]));
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

export type DirectoryGrade = GradeBrief;

/** TM-D6: semua grade aktif (tabel upah grade). */
export function activeGrades(): Promise<DirectoryGrade[]> {
  return listActiveGrades();
}

/** TM-D7: semua lokasi kerja aktif (pengaturan lokasi wajib absen istirahat). */
export function activeLocations(): Promise<DirectoryLocation[]> {
  return listActiveWorkLocations();
}

export type ExitedEmployee = ExitedEmployeeBrief;

/** TM-D9: karyawan nonaktif dengan tanggal keluar (hak cuti keluar). Baca-saja. */
export function exitedEmployees(companyIds?: string[]): Promise<ExitedEmployee[]> {
  return listExitedEmployees(companyIds ?? null);
}

/** TM-D9: status aktif & tanggal keluar terkini per karyawan (pembatalan hak keluar bila aktif lagi). */
export function exitStatusOf(
  ids: string[],
): Promise<Map<string, { isActive: boolean; endDate: Date | null }>> {
  return getEmployeeExitStatuses(ids);
}

export interface AnalyticsEmployee extends Omit<AnalyticsEmployeeBrief, "employmentStatusId"> {
  /** Kategori status kerja (PERMANENT, PKWT, …) — null bila status tanpa kategori. */
  category: string | null;
}

/**
 * DSB-D1: karyawan yang aktif pada sebagian rentang [from, to] (masuk ≤ to, belum keluar sebelum from).
 * Baca-saja. `withBirthDate` = pemanggil berhak atas data pribadi (proyeksi pensiun).
 */
export async function analyticsEmployees(input: {
  companyIds?: string[] | undefined;
  managerId?: string | undefined;
  from: Date;
  to: Date;
  withBirthDate: boolean;
}): Promise<AnalyticsEmployee[]> {
  const rows = await listAnalyticsEmployees(input);
  const categories = await getEmploymentStatusCategories(
    rows.flatMap((row) => (row.employmentStatusId ? [row.employmentStatusId] : [])),
  );
  return rows.map(({ employmentStatusId, ...row }) => ({
    ...row,
    category: employmentStatusId ? (categories.get(employmentStatusId) ?? null) : null,
  }));
}

// ── TM-D28: Homebase (EMP-D6) untuk menentukan karyawan lokal / non-lokal ──────────

export interface DirectoryHomebase {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
}

/** Homebase aktif (master lintas PT). */
export async function activeHomebases(): Promise<DirectoryHomebase[]> {
  const lookup = await getMasterLookup();
  return [...lookup.homebases.values()]
    .filter((h) => !h.deleted)
    .map((h) => ({ id: h.id, name: h.name, city: h.city ?? null, province: h.province ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/** Homebase yang berlaku per karyawan pada tanggal itu (null = belum diisi). */
export async function homebasesOn(
  employeeIds: string[],
  date: string,
): Promise<Map<string, { homebaseId: string; name: string } | null>> {
  const rows = await getHomebasesOn(employeeIds, date);
  return new Map(
    [...rows.entries()].map(([id, hb]) => [
      id,
      hb ? { homebaseId: hb.homebaseId, name: hb.name } : null,
    ]),
  );
}
