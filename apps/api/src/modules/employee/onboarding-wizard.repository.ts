import { getPrisma } from "../../core/db.ts";
import type {
  EducationLevel,
  EmployeeDocumentType,
  FamilyRelationship,
  Gender,
  MaritalStatus,
  Prisma,
  Religion,
} from "../../generated/prisma/client.ts";
import type { EmployeeTx } from "./employee.repository.ts";

// D-045 b: query wizard onboarding (data milik karyawan aktor sendiri). Aturan di service.

export async function loadSelf(employeeId: string) {
  return getPrisma().employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employeeNumber: true,
      fullName: true,
      personalEmail: true,
      workEmail: true,
      companyId: true,
      employmentStatusId: true,
      positionId: true,
      workLocationId: true,
      gradeId: true,
      managerId: true,
      joinDate: true,
      isActive: true,
      gender: true,
      phoneNumber: true,
      emergencyContactName: true,
      emergencyContactRelationship: true,
      emergencyPhone: true,
      photoPath: true,
      onboardingStatus: true,
      completionRequired: true,
      completionSubmittedAt: true,
      personal: true,
      bankAccount: true,
      familyMembers: { orderBy: { createdAt: "asc" } },
      educations: { orderBy: { createdAt: "asc" } },
      trainings: { orderBy: { createdAt: "asc" } },
      workExperiences: { orderBy: { createdAt: "asc" } },
      documents: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          storagePath: true,
          mimeType: true,
          sizeBytes: true,
          uploadedBy: true,
          createdAt: true,
        },
      },
      // D-045 c: riwayat keputusan reviewer (terbaru dulu) — catatan revisi untuk wizard & review.
      onboardingReviews: {
        orderBy: { decidedAt: "desc" },
        take: 20,
        select: {
          id: true,
          decision: true,
          reviewerAccountId: true,
          sectionNotes: true,
          reason: true,
          completion: true,
          decidedAt: true,
        },
      },
    },
  });
}
export type SelfRow = NonNullable<Awaited<ReturnType<typeof loadSelf>>>;

export async function updateEmployeeBasics(
  tx: EmployeeTx,
  id: string,
  data: {
    fullName?: string;
    gender?: Gender | null;
    phoneNumber?: string | null;
    emergencyContactName?: string | null;
    emergencyContactRelationship?: string | null;
    emergencyPhone?: string | null;
  },
) {
  return tx.employee.update({ where: { id }, data });
}

export interface PersonalData {
  ktpNumber?: string | null;
  npwpNumber?: string | null;
  kkNumber?: string | null;
  birthPlace?: string | null;
  birthDate?: Date | null;
  ktpAddress?: string | null;
  domicileAddress?: string | null;
  maritalStatus?: MaritalStatus | null;
  religion?: Religion | null;
  bpjsEmploymentNumber?: string | null;
  bpjsHealthNumber?: string | null;
  originCity?: string | null;
  npwpAbsent?: boolean;
  bpjsEmploymentAbsent?: boolean;
  bpjsHealthAbsent?: boolean;
}

export async function upsertPersonal(tx: EmployeeTx, employeeId: string, data: PersonalData) {
  return tx.employeePersonal.upsert({
    where: { employeeId },
    create: { employeeId, ...data },
    update: data,
  });
}

export async function upsertBank(
  tx: EmployeeTx,
  employeeId: string,
  data: { bankName: string; accountNumber: string; accountHolder: string | null },
) {
  return tx.employeeBankAccount.upsert({
    where: { employeeId },
    create: { employeeId, ...data },
    update: data,
  });
}

export async function replaceFamily(
  tx: EmployeeTx,
  employeeId: string,
  members: {
    name: string;
    relationship: FamilyRelationship;
    birthDate: Date | null;
    phoneNumber: string | null;
  }[],
) {
  await tx.familyMember.deleteMany({ where: { employeeId } });
  if (members.length > 0) {
    await tx.familyMember.createMany({ data: members.map((m) => ({ employeeId, ...m })) });
  }
}

export async function replaceProfessional(
  tx: EmployeeTx,
  employeeId: string,
  data: {
    educations: {
      level: EducationLevel;
      schoolName: string;
      major: string | null;
      graduationYear: number | null;
    }[];
    trainings: { trainingField: string; organizer: string | null; trainingYear: number | null }[];
    workExperiences: {
      companyName: string;
      position: string;
      startYear: number;
      endYear: number | null;
    }[];
  },
) {
  await tx.education.deleteMany({ where: { employeeId } });
  await tx.training.deleteMany({ where: { employeeId } });
  await tx.workExperience.deleteMany({ where: { employeeId } });
  if (data.educations.length > 0)
    await tx.education.createMany({ data: data.educations.map((e) => ({ employeeId, ...e })) });
  if (data.trainings.length > 0)
    await tx.training.createMany({ data: data.trainings.map((t) => ({ employeeId, ...t })) });
  if (data.workExperiences.length > 0)
    await tx.workExperience.createMany({
      data: data.workExperiences.map((w) => ({ employeeId, ...w })),
    });
}

export async function createDocument(
  tx: EmployeeTx,
  data: Prisma.EmployeeDocumentUncheckedCreateInput,
) {
  return tx.employeeDocument.create({ data, select: { id: true } });
}

/** Dokumen aktif sejenis (untuk jenis yang hanya boleh satu, mis. KTP). */
export async function findActiveDocuments(employeeId: string, type: EmployeeDocumentType) {
  return getPrisma().employeeDocument.findMany({
    where: { employeeId, type, deletedAt: null },
    select: { id: true, storagePath: true, uploadedBy: true },
  });
}

export async function findDocument(id: string) {
  return getPrisma().employeeDocument.findUnique({ where: { id } });
}

export async function archiveDocuments(tx: EmployeeTx, ids: string[], at: Date) {
  if (ids.length === 0) return;
  await tx.employeeDocument.updateMany({ where: { id: { in: ids } }, data: { deletedAt: at } });
}

export async function markCompletionSubmitted(tx: EmployeeTx, employeeId: string, at: Date) {
  return tx.employee.update({ where: { id: employeeId }, data: { completionSubmittedAt: at } });
}
