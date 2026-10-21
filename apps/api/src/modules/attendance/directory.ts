import { getPrisma } from "../../core/db.ts";

// SEMENTARA — adapter BACA-SAJA ke data karyawan, PT, & lokasi kerja untuk Time Management.
// Modul employee/organization masih dikembangkan tim dan tidak boleh disentuh (pemilik projek 2026-10-12),
// sehingga interface publiknya belum menyediakan data ini. Hanya SELECT; tidak pernah menulis tabel modul lain.
// Ganti dengan fungsi dari modules/employee/index.ts & modules/organization/index.ts setelah tersedia.

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

const select = {
  id: true,
  fullName: true,
  employeeNumber: true,
  companyId: true,
  managerId: true,
  workLocationId: true,
  gradeId: true,
  isActive: true,
} as const;

/** Karyawan "resmi" saja (D-045: calon onboarding belum disetujui bukan karyawan). */
const APPROVED = { onboardingStatus: "APPROVED" } as const;

export async function employeesByIds(ids: string[]): Promise<Map<string, DirectoryEmployee>> {
  if (ids.length === 0) return new Map();
  const rows = await getPrisma().employee.findMany({
    where: { ...APPROVED, id: { in: [...new Set(ids)] } },
    select,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

export async function employeeById(id: string): Promise<DirectoryEmployee | null> {
  return (await employeesByIds([id])).get(id) ?? null;
}

export async function activeEmployeesInCompany(
  companyId: string,
  q?: string,
  take = 500,
): Promise<DirectoryEmployee[]> {
  return getPrisma().employee.findMany({
    where: {
      ...APPROVED,
      companyId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { employeeNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select,
    orderBy: { fullName: "asc" },
    take,
  });
}

export async function employeesByNumbers(
  companyId: string,
  numbers: string[],
): Promise<Map<string, DirectoryEmployee>> {
  if (numbers.length === 0) return new Map();
  const rows = await getPrisma().employee.findMany({
    where: { ...APPROVED, companyId, employeeNumber: { in: [...new Set(numbers)] } },
    select,
  });
  return new Map(rows.map((row) => [row.employeeNumber ?? row.id, row]));
}

/** Tim MANAGER = bawahan langsung (D-009). */
export async function teamIds(managerEmployeeId: string): Promise<string[]> {
  const rows = await getPrisma().employee.findMany({
    where: { ...APPROVED, managerId: managerEmployeeId },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export interface DirectoryLocation {
  id: string;
  name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusM: number | null;
}

export async function locationsByIds(ids: string[]): Promise<Map<string, DirectoryLocation>> {
  if (ids.length === 0) return new Map();
  const rows = await getPrisma().workLocation.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, name: true, city: true, latitude: true, longitude: true, radiusM: true },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
      },
    ]),
  );
}

export async function companyExists(companyId: string): Promise<boolean> {
  return (await getPrisma().company.count({ where: { id: companyId } })) > 0;
}

/** Semua lokasi kerja aktif yang punya geofence lengkap (untuk label OTHER_LOCATION). */
export async function geofencedLocations(): Promise<DirectoryLocation[]> {
  const rows = await getPrisma().workLocation.findMany({
    where: {
      deletedAt: null,
      latitude: { not: null },
      longitude: { not: null },
      radiusM: { not: null },
    },
    select: { id: true, name: true, city: true, latitude: true, longitude: true, radiusM: true },
  });
  return rows.map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  }));
}

export interface GrantCandidate {
  id: string;
  companyId: string;
  joinDate: Date;
}

/** Karyawan aktif resmi beserta tanggal masuk (jatah cuti 1 Januari, modul leave). */
export async function activeEmployeesForGrant(): Promise<GrantCandidate[]> {
  return getPrisma().employee.findMany({
    where: { ...APPROVED, isActive: true },
    select: { id: true, companyId: true, joinDate: true },
  });
}

export interface DirectoryGrade {
  id: string;
  name: string;
}

/** TM-D6: semua grade aktif (tabel upah grade). */
export async function activeGrades(): Promise<DirectoryGrade[]> {
  return getPrisma().grade.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** TM-D7: semua lokasi kerja aktif (pengaturan lokasi wajib absen istirahat). */
export async function activeLocations(): Promise<DirectoryLocation[]> {
  const rows = await getPrisma().workLocation.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, city: true, latitude: true, longitude: true, radiusM: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    ...row,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
  }));
}

export interface ExitedEmployee {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  companyId: string;
  endDate: Date;
  exitReason: string | null;
  gradeId: string | null;
  isActive: boolean;
}

/** TM-D9: karyawan nonaktif dengan tanggal keluar (hak cuti keluar). Baca-saja. */
export async function exitedEmployees(companyIds?: string[]): Promise<ExitedEmployee[]> {
  const rows = await getPrisma().employee.findMany({
    where: {
      ...APPROVED,
      isActive: false,
      endDate: { not: null },
      ...(companyIds ? { companyId: { in: companyIds } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      companyId: true,
      endDate: true,
      exitReason: true,
      gradeId: true,
      isActive: true,
    },
    orderBy: { endDate: "desc" },
  });
  return rows.map((r) => ({ ...r, endDate: r.endDate as Date, exitReason: r.exitReason ?? null }));
}

/** TM-D9: status aktif & tanggal keluar terkini per karyawan (pembatalan hak keluar bila aktif lagi). */
export async function exitStatusOf(
  ids: string[],
): Promise<Map<string, { isActive: boolean; endDate: Date | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await getPrisma().employee.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, isActive: true, endDate: true },
  });
  return new Map(rows.map((r) => [r.id, { isActive: r.isActive, endDate: r.endDate }]));
}
