import {
  type AgeBucket,
  ageBucket,
  type CoreCompletenessItem,
  type DataChangeSection,
  type DataChangeStatus,
  type DocumentRequirement,
  EDUCATION_LEVELS,
  type EducationLevel,
  type ExitReason,
  type Gender,
} from "@hris/shared";
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

// --- Batch 2 (ARS-D21) ---

/**
 * Demografi per karyawan: tanggal lahir tidak keluar dari modul ini (hanya kelompok usia). Kota asal
 * dikembalikan apa adanya (dirapikan) untuk dihitung — pemanggil tidak boleh menampilkannya per orang.
 */
export interface ReportDemographicFacts {
  employeeId: string;
  gender: Gender | null;
  ageBucket: AgeBucket | null;
  /** Jenjang tertinggi; `OTHER` hanya bila tidak ada jenjang lain. */
  education: EducationLevel | null;
  originCity: string | null;
}

/** "JAKARTA", "jakarta", "Jakarta" → satu kelompok "Jakarta". */
const titleCase = (text: string) =>
  text
    .toLowerCase()
    .replace(/(^|[\s/(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

const EDUCATION_RANK = EDUCATION_LEVELS.filter((l) => l !== "OTHER");

export async function listDemographicFacts(
  employeeIds: string[],
  today: string,
): Promise<ReportDemographicFacts[]> {
  if (employeeIds.length === 0) return [];
  const rows = await repository.findDemographicFacts(employeeIds);
  return rows.map((r) => {
    const levels = r.educations.map((e) => e.level).filter((l): l is EducationLevel => l !== null);
    const ranked = levels
      .filter((l) => l !== "OTHER")
      .sort((a, b) => EDUCATION_RANK.indexOf(b) - EDUCATION_RANK.indexOf(a));
    const birth = r.personal?.birthDate;
    const city = r.personal?.originCity?.trim().replace(/\s+/g, " ");
    return {
      employeeId: r.id,
      gender: r.gender as Gender | null,
      ageBucket: birth ? ageBucket(toIso(birth), today) : null,
      education: ranked[0] ?? (levels.length > 0 ? "OTHER" : null),
      originCity: city ? titleCase(city) : null,
    };
  });
}

/** Ulang tahun pada bulan `month`: hanya bulan-tanggal (`MM-DD`), tanpa tahun lahir (ARS-D21). */
export async function listBirthdaysInMonth(
  employeeIds: string[],
  month: number,
): Promise<{ employeeId: string; monthDay: string }[]> {
  if (employeeIds.length === 0) return [];
  const prefix = String(month).padStart(2, "0");
  const rows = await repository.findBirthDates(employeeIds);
  return rows
    .map((r) => ({ employeeId: r.employeeId, monthDay: toIso(r.birthDate as Date).slice(5) }))
    .filter((r) => r.monthDay.startsWith(prefix));
}

export interface ReportMovement {
  id: string;
  employeeId: string;
  changeType: "POSITION_CHANGED" | "COMPANY_CHANGED";
  effectiveDate: string;
  fromPositionId: string | null;
  toPositionId: string | null;
  fromCompanyId: string | null;
  toCompanyId: string | null;
}

export async function listMovements(
  employeeIds: string[],
  from: string,
  to: string,
): Promise<ReportMovement[]> {
  if (employeeIds.length === 0) return [];
  const rows = await repository.findMovementHistories(
    employeeIds,
    new Date(`${from}T00:00:00.000Z`),
    new Date(`${to}T00:00:00.000Z`),
  );
  return rows.map((r) => ({
    ...r,
    changeType: r.changeType as ReportMovement["changeType"],
    effectiveDate: toIso(r.effectiveDate),
  }));
}

export interface ReportDataChange {
  id: string;
  employeeId: string;
  section: DataChangeSection;
  status: DataChangeStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export async function listDataChangeFacts(
  employeeIds: string[],
  since: string,
): Promise<ReportDataChange[]> {
  if (employeeIds.length === 0) return [];
  const rows = await repository.findDataChangeFacts(
    employeeIds,
    new Date(`${since}T00:00:00.000Z`),
  );
  return rows.map((r) => ({
    ...r,
    section: r.section as DataChangeSection,
    status: r.status as DataChangeStatus,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  }));
}
