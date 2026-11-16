import { getPrisma } from "../../core/db.ts";
import type { OnboardingStatus, Prisma } from "../../generated/prisma/client.ts";
import type { EmployeeTx } from "./employee.repository.ts";

// D-045: query onboarding (tabel skema employee). Aturan bisnis ada di onboarding.service.ts.

/** Nomor induk karyawan per PT (semua status, termasuk calon & nonaktif) untuk usulan nomor. */
export async function employeeNumbersInCompanies(companyIds: string[]) {
  if (companyIds.length === 0) return [];
  const rows = await getPrisma().employee.findMany({
    where: { companyId: { in: companyIds }, employeeNumber: { not: null } },
    select: { companyId: true, employeeNumber: true },
  });
  return rows.flatMap((row) =>
    row.employeeNumber ? [{ companyId: row.companyId, employeeNumber: row.employeeNumber }] : [],
  );
}

export async function findTakenNumbers(numbers: string[]) {
  if (numbers.length === 0) return [];
  const rows = await getPrisma().employee.findMany({
    where: { employeeNumber: { in: numbers, mode: "insensitive" } },
    select: { employeeNumber: true },
  });
  return rows.flatMap((row) => (row.employeeNumber ? [row.employeeNumber] : []));
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

/**
 * Tandai hasil satu undangan antrean. Hanya baris yang MASIH `QUEUED` yang diubah (ONB-D1: undangan
 * yang dibatalkan/diganti emailnya di tengah proses tidak ditimpa jadi SENT). Mengembalikan jumlah baris.
 */
export async function markInvitation(
  id: string,
  data: {
    status: "SENT" | "FAILED" | "QUEUED";
    attempts: number;
    sentAt?: Date;
    lastErrorCode?: string | null;
  },
) {
  const { count } = await getPrisma().onboardingInvitation.updateMany({
    where: { id, status: "QUEUED" },
    data,
  });
  return count;
}

/** ONB-D1: undangan antrean masih QUEUED? (cek ulang tepat sebelum mengundang). */
export async function isInvitationQueued(id: string) {
  return (await getPrisma().onboardingInvitation.count({ where: { id, status: "QUEUED" } })) > 0;
}

export async function hasOpenInvitation(employeeId: string) {
  return (
    (await getPrisma().onboardingInvitation.count({
      where: { employeeId, status: "QUEUED" },
    })) > 0
  );
}

/** ONB-D1: email undangan antrean terbaru yang masih terbuka (null bila tidak ada). */
export async function openInvitationEmail(employeeId: string) {
  const row = await getPrisma().onboardingInvitation.findFirst({
    where: { employeeId, status: "QUEUED" },
    orderBy: { createdAt: "desc" },
    select: { email: true },
  });
  return row?.email ?? null;
}

/**
 * ONB-D1: tutup undangan antrean yang masih terbuka (batal / email diganti). Status antrean hanya
 * QUEUED/SENT/FAILED, jadi ditandai FAILED dengan kode alasan (tanpa migrasi).
 */
export async function closeOpenInvitations(
  tx: EmployeeTx,
  employeeId: string,
  code: "CANCELLED" | "EMAIL_CHANGED",
) {
  const { count } = await tx.onboardingInvitation.updateMany({
    where: { employeeId, status: "QUEUED" },
    data: { status: "FAILED", lastErrorCode: code },
  });
  return count;
}

export async function setCompletionRequired(tx: EmployeeTx, id: string, value: boolean) {
  return tx.employee.update({ where: { id }, data: { completionRequired: value } });
}

export async function setPersonalEmail(tx: EmployeeTx, id: string, personalEmail: string) {
  return tx.employee.update({ where: { id }, data: { personalEmail } });
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

/** ONB-D2: karyawan aktif & disetujui yang email pribadi/kerjanya = `email` (saran tautan akun). */
export async function findEmployeesByEmail(email: string, companyIds: string[] | null) {
  return getPrisma().employee.findMany({
    where: {
      isActive: true,
      onboardingStatus: "APPROVED",
      ...(companyIds === null ? {} : { companyId: { in: companyIds } }),
      OR: [
        { personalEmail: { equals: email, mode: "insensitive" } },
        { workEmail: { equals: email, mode: "insensitive" } },
      ],
    },
    orderBy: { fullName: "asc" },
    take: 10,
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      companyId: true,
      personalEmail: true,
      workEmail: true,
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

// ── D-045 c: review ─────────────────────────────────────────────────────────────────────────────

export async function createReview(
  tx: EmployeeTx,
  data: {
    employeeId: string;
    decision: "APPROVED" | "REVISION_REQUESTED" | "CANCELLED";
    reviewerAccountId: string;
    sectionNotes: Record<string, string> | null;
    reason: string | null;
    completion: boolean;
    decidedAt: Date;
  },
) {
  const { sectionNotes, ...rest } = data;
  return tx.onboardingReview.create({
    data: { ...rest, ...(sectionNotes ? { sectionNotes } : {}) },
    select: { id: true },
  });
}

/** PTKP ditetapkan reviewer saat menyetujui (calon tidak mengisinya sendiri). */
export async function setPtkpStatus(
  tx: EmployeeTx,
  employeeId: string,
  ptkpStatus: Prisma.EmployeePersonalUncheckedCreateInput["ptkpStatus"],
) {
  return tx.employeePersonal.upsert({
    where: { employeeId },
    create: { employeeId, ptkpStatus },
    update: { ptkpStatus },
  });
}

// ── D-045 d: pemulihan, retensi, pengingat ──────────────────────────────────────────────────────

/** Jejak pembatalan terbaru (waktu & status sebelum batal) per calon. */
export async function latestCancellations(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  return getPrisma().onboardingEvent.findMany({
    where: { employeeId: { in: employeeIds }, toStatus: "CANCELLED" },
    orderBy: { occurredAt: "desc" },
    select: { employeeId: true, fromStatus: true, occurredAt: true },
  });
}

/** Calon berstatus Dibatalkan yang pembatalan terakhirnya sebelum `cutoff`. */
export async function findCancelledBefore(cutoff: Date, take: number) {
  const rows = await getPrisma().employee.findMany({
    where: {
      onboardingStatus: "CANCELLED",
      onboardingEvents: { some: { toStatus: "CANCELLED", occurredAt: { lt: cutoff } } },
    },
    take,
    select: {
      id: true,
      photoPath: true,
      documents: { select: { storagePath: true } },
      onboardingEvents: {
        where: { toStatus: "CANCELLED" },
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { occurredAt: true },
      },
    },
  });
  // Dibatalkan lagi setelah dipulihkan → hitung dari pembatalan TERAKHIR.
  return rows.filter((r) => (r.onboardingEvents[0]?.occurredAt ?? cutoff) < cutoff);
}

/** Calon masih Diundang yang undangannya terkirim sebelum `cutoff` (pengingat ke HR). */
export async function findStaleInvited(cutoff: Date, take: number) {
  return getPrisma().employee.findMany({
    where: {
      onboardingStatus: "INVITED",
      onboardingInvitations: { some: { status: "SENT", sentAt: { lt: cutoff } } },
    },
    take,
    select: { id: true, fullName: true, employeeNumber: true, companyId: true },
  });
}

export async function deleteEmployee(tx: EmployeeTx, id: string) {
  return tx.employee.delete({ where: { id } });
}
