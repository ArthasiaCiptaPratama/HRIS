import { getPrisma } from "../../core/db.ts";
import type { OnboardingStatus, Prisma } from "../../generated/prisma/client.ts";
import type { EmployeeTx } from "./employee.repository.ts";

// D-045: query onboarding (tabel skema employee). Aturan bisnis ada di onboarding.service.ts.

/** Nomor induk karyawan per PT (semua status, termasuk calon & nonaktif) untuk usulan nomor. */
export async function employeeNumbersInCompanies(companyIds: string[]) {
  if (companyIds.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { companyId: { in: companyIds } },
    select: { companyId: true, employeeNumber: true },
  });
}

export async function findTakenNumbers(numbers: string[]) {
  if (numbers.length === 0) return [];
  const rows = await getPrisma().employee.findMany({
    where: { employeeNumber: { in: numbers, mode: "insensitive" } },
    select: { employeeNumber: true },
  });
  return rows.map((row) => row.employeeNumber);
}

export async function findTakenPersonalEmails(emails: string[]) {
  if (emails.length === 0) return [];
  const rows = await getPrisma().employee.findMany({
    where: { personalEmail: { in: emails } },
    select: { personalEmail: true },
  });
  return rows.map((row) => row.personalEmail as string);
}

export async function createBatch(
  tx: EmployeeTx,
  data: Prisma.OnboardingBatchUncheckedCreateInput,
) {
  return tx.onboardingBatch.create({ data, select: { id: true } });
}

export async function createCandidate(tx: EmployeeTx, data: Prisma.EmployeeUncheckedCreateInput) {
  return tx.employee.create({ data, select: { id: true } });
}

export async function addEvent(
  tx: EmployeeTx,
  data: {
    employeeId: string;
    fromStatus: OnboardingStatus | null;
    toStatus: OnboardingStatus;
    actorAccountId: string | null;
  },
) {
  return tx.onboardingEvent.create({ data });
}

export async function queueInvitation(
  tx: EmployeeTx,
  data: { employeeId: string; email: string; queuedBy: string },
) {
  return tx.onboardingInvitation.create({ data, select: { id: true } });
}

export async function setStatus(tx: EmployeeTx, employeeId: string, status: OnboardingStatus) {
  return tx.employee.update({ where: { id: employeeId }, data: { onboardingStatus: status } });
}

export async function listBatches(companyIds: string[] | null) {
  return getPrisma().onboardingBatch.findMany({
    where: companyIds === null ? {} : { companyId: { in: companyIds } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function findBatch(id: string) {
  return getPrisma().onboardingBatch.findUnique({ where: { id } });
}

/** Ringkasan antrean undangan per batch (jumlah per status). */
export async function invitationCountsForBatch(batchId: string) {
  return getPrisma().onboardingInvitation.groupBy({
    by: ["status"],
    where: { employee: { onboardingBatchId: batchId } },
    _count: { _all: true },
  });
}

/** Undangan terbaru per karyawan (status pengiriman di daftar). */
export async function latestInvitations(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  return getPrisma().onboardingInvitation.findMany({
    where: { employeeId: { in: employeeIds } },
    orderBy: { createdAt: "desc" },
    select: { employeeId: true, status: true, sentAt: true, lastErrorCode: true, createdAt: true },
  });
}

/** Antrean tertua dalam cakupan PT (null = semua). */
export async function takeQueued(companyIds: string[] | null, limit: number) {
  return getPrisma().onboardingInvitation.findMany({
    where: {
      status: "QUEUED",
      ...(companyIds === null ? {} : { employee: { companyId: { in: companyIds } } }),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, employeeId: true, email: true, attempts: true, queuedBy: true },
  });
}

export async function countQueued(companyIds: string[] | null) {
  return getPrisma().onboardingInvitation.count({
    where: {
      status: "QUEUED",
      ...(companyIds === null ? {} : { employee: { companyId: { in: companyIds } } }),
    },
  });
}

/** Undangan yang terkirim sejak waktu tertentu (batas per jam, seluruh sistem). */
export async function countSentSince(since: Date) {
  return getPrisma().onboardingInvitation.count({ where: { sentAt: { gte: since } } });
}

export async function markInvitation(
  id: string,
  data: {
    status: "SENT" | "FAILED" | "QUEUED";
    attempts: number;
    sentAt?: Date;
    lastErrorCode?: string | null;
  },
) {
  return getPrisma().onboardingInvitation.update({ where: { id }, data });
}

export async function hasOpenInvitation(employeeId: string) {
  return (
    (await getPrisma().onboardingInvitation.count({
      where: { employeeId, status: "QUEUED" },
    })) > 0
  );
}

export type CandidateWhere = Prisma.EmployeeWhereInput;

export async function listCandidates(where: CandidateWhere, skip: number, take: number) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { fullName: "asc" }],
      skip,
      take,
      select: {
        id: true,
        employeeNumber: true,
        fullName: true,
        personalEmail: true,
        workEmail: true,
        companyId: true,
        positionId: true,
        employmentStatusId: true,
        joinDate: true,
        onboardingStatus: true,
        completionRequired: true,
        onboardingBatchId: true,
        createdAt: true,
      },
    }),
    prisma.employee.count({ where }),
  ]);
  return { rows, total };
}

export async function countCandidatesByStatus(where: CandidateWhere) {
  return getPrisma().employee.groupBy({
    by: ["onboardingStatus"],
    where,
    _count: { _all: true },
  });
}

export async function findCandidate(id: string) {
  return getPrisma().employee.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      personalEmail: true,
      workEmail: true,
      companyId: true,
      isActive: true,
      onboardingStatus: true,
      completionRequired: true,
    },
  });
}

export async function findEmployeesForInvite(ids: string[]) {
  if (ids.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      fullName: true,
      personalEmail: true,
      workEmail: true,
      companyId: true,
      isActive: true,
      onboardingStatus: true,
    },
  });
}

export async function updateForExistingInvite(
  tx: EmployeeTx,
  id: string,
  data: { personalEmail: string; completionRequired: boolean },
) {
  return tx.employee.update({ where: { id }, data });
}

/** Login pertama calon (D-045): DIUNDANG → MENGISI DATA, idempoten & aman bila paralel. */
export async function activateIfInvited(employeeId: string) {
  return getPrisma().$transaction(async (tx) => {
    const { count } = await tx.employee.updateMany({
      where: { id: employeeId, onboardingStatus: "INVITED" },
      data: { onboardingStatus: "FILLING" },
    });
    if (count > 0) {
      await tx.onboardingEvent.create({
        data: { employeeId, fromStatus: "INVITED", toStatus: "FILLING", actorAccountId: null },
      });
    }
    return count > 0;
  });
}
