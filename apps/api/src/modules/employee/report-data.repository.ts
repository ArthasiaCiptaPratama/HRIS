import { getPrisma } from "../../core/db.ts";

// ARS-D16/D17 (Laporan batch 1): query baca-saja tabel employee untuk modul `report` (lewat index.ts).
// Hanya karyawan resmi (D-045). Nilai sensitif tidak pernah dipilih — kelengkapan hanya "terisi/kosong".

export interface ReportEmployeeFilter {
  /** null = semua PT. */
  companyIds: string[] | null;
  /** null = semua jabatan (filter unit diterjemahkan pemanggil menjadi jabatan). */
  positionIds: string[] | null;
  workLocationId: string | null;
}

export const findReportEmployees = (f: ReportEmployeeFilter) =>
  getPrisma().employee.findMany({
    where: {
      onboardingStatus: "APPROVED",
      ...(f.companyIds ? { companyId: { in: f.companyIds } } : {}),
      ...(f.positionIds ? { positionId: { in: f.positionIds } } : {}),
      ...(f.workLocationId ? { workLocationId: f.workLocationId } : {}),
    },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      companyId: true,
      positionId: true,
      workLocationId: true,
      employmentStatusId: true,
      joinDate: true,
      endDate: true,
      exitReason: true,
      isActive: true,
    },
    orderBy: { fullName: "asc" },
  });

/** Versi dokumen aktif (bukan ditolak) yang berlaku s/d ≤ `until`. */
export const findExpiringDocuments = (employeeIds: string[], until: Date) =>
  getPrisma().employeeDocument.findMany({
    where: {
      employeeId: { in: employeeIds },
      isCurrent: true,
      status: { not: "REJECTED" },
      expiresAt: { not: null, lte: until },
    },
    select: {
      employeeId: true,
      expiresAt: true,
      documentType: { select: { id: true, code: true, name: true, sensitive: true } },
    },
  });

/** Penanda terisi/kosong data inti (tanpa nilai). */
export const findCompletenessFacts = (employeeIds: string[]) =>
  getPrisma().employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      workEmail: true,
      emergencyPhone: true,
      emergencyContactName: true,
      personal: {
        select: {
          ktpNumber: true,
          npwpNumber: true,
          npwpAbsent: true,
          bpjsEmploymentNumber: true,
          bpjsEmploymentAbsent: true,
          bpjsHealthNumber: true,
          bpjsHealthAbsent: true,
        },
      },
      bankAccount: { select: { employeeId: true } },
      documents: {
        where: { isCurrent: true, status: { not: "REJECTED" } },
        select: { documentTypeId: true },
      },
    },
  });

export const findRequiredDocumentTypes = () =>
  getPrisma().documentType.findMany({
    where: { deletedAt: null, requiredScope: { not: "NONE" } },
    select: {
      id: true,
      code: true,
      name: true,
      requiredScope: true,
      requiredPositionIds: true,
      sensitive: true,
    },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
