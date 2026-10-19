import type { CoreCompletenessItem, DocumentRequirement, ExitReason } from "@hris/shared";
import * as repository from "./report-data.repository.ts";

// ARS-D16/D17 (Laporan batch 1): data mentah untuk modul `report` — tanpa cek akses (pemanggil wajib
// memeriksa policy & cakupan PT) dan tanpa nilai sensitif. Interface publik lewat index.ts.

export type ReportEmployeeFilter = repository.ReportEmployeeFilter;

const toIso = (d: Date) => d.toISOString().slice(0, 10);

export interface ReportEmployee {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  companyId: string;
  positionId: string;
  workLocationId: string | null;
  employmentStatusId: string;
  joinDate: string;
  endDate: string | null;
  exitReason: ExitReason | null;
  isActive: boolean;
}

export async function listReportEmployees(filter: ReportEmployeeFilter): Promise<ReportEmployee[]> {
  const rows = await repository.findReportEmployees(filter);
  return rows.map((r) => ({
    ...r,
    joinDate: toIso(r.joinDate),
    endDate: r.endDate ? toIso(r.endDate) : null,
    exitReason: r.exitReason as ExitReason | null,
  }));
}

export interface ReportExpiringDocument {
  employeeId: string;
  documentType: { id: string; code: string; name: string; sensitive: boolean };
  expiresAt: string;
}

export async function listExpiringDocuments(
  employeeIds: string[],
  until: string,
): Promise<ReportExpiringDocument[]> {
  if (employeeIds.length === 0) return [];
  const rows = await repository.findExpiringDocuments(
    employeeIds,
    new Date(`${until}T00:00:00.000Z`),
  );
  return rows.map((r) => ({
    employeeId: r.employeeId,
    documentType: r.documentType,
    expiresAt: toIso(r.expiresAt as Date),
  }));
}

export interface ReportCompletenessFacts {
  employeeId: string;
  /** true = terisi (atau dinyatakan tidak punya untuk NPWP/BPJS). Nilai tidak pernah dikembalikan. */
  core: Record<CoreCompletenessItem, boolean>;
  documentTypeIds: string[];
}

export async function listCompletenessFacts(
  employeeIds: string[],
): Promise<ReportCompletenessFacts[]> {
  if (employeeIds.length === 0) return [];
  const rows = await repository.findCompletenessFacts(employeeIds);
  return rows.map((r) => {
    const p = r.personal;
    return {
      employeeId: r.id,
      core: {
        KTP: Boolean(p?.ktpNumber),
        NPWP: Boolean(p?.npwpNumber) || Boolean(p?.npwpAbsent),
        BPJS_TK: Boolean(p?.bpjsEmploymentNumber) || Boolean(p?.bpjsEmploymentAbsent),
        BPJS_KES: Boolean(p?.bpjsHealthNumber) || Boolean(p?.bpjsHealthAbsent),
        BANK: r.bankAccount !== null,
        EMERGENCY: Boolean(r.emergencyPhone) && Boolean(r.emergencyContactName),
        WORK_EMAIL: Boolean(r.workEmail),
      },
      documentTypeIds: [...new Set(r.documents.map((d) => d.documentTypeId))],
    };
  });
}

export interface RequiredDocumentType {
  id: string;
  code: string;
  name: string;
  requiredScope: DocumentRequirement;
  requiredPositionIds: string[];
  sensitive: boolean;
}

export async function listRequiredDocumentTypes(): Promise<RequiredDocumentType[]> {
  const rows = await repository.findRequiredDocumentTypes();
  return rows.map((r) => ({ ...r, requiredScope: r.requiredScope as DocumentRequirement }));
}
