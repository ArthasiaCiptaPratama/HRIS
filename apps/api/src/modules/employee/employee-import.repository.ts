import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import type { EmployeeTx } from "./employee.repository.ts";

// D-042: query import karyawan (tabel skema employee saja, PROMPT §4). Nilai sensitif dibaca hanya
// untuk membandingkan (diff) — tidak pernah dikembalikan ke klien atau ditulis ke log.

/**
 * Transaksi panjang untuk simpan import (≤ 2.000 baris; bawaan Prisma 5 dtk terlalu pendek).
 * Semua baris valid + master data baru + jejak import tersimpan bersama, atau tidak sama sekali.
 */
export async function withLongTransaction<T>(run: (tx: EmployeeTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(run, { timeout: 120_000, maxWait: 10_000 });
}

export async function findByEmployeeNumbers(numbers: string[]) {
  if (numbers.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { employeeNumber: { in: numbers } },
    include: {
      personal: true,
      bankAccount: true,
      educations: { select: { id: true, schoolName: true, level: true } },
      // D-059: pencocokan impor ulang (tambah yang belum ada).
      familyMembers: { select: { relationship: true, name: true } },
      trainings: { select: { trainingField: true } },
    },
  });
}
export type ExistingEmployee = Awaited<ReturnType<typeof findByEmployeeNumbers>>[number];

/** Pemilik NIK KTP / email kantor (cek unik terhadap karyawan lain). */
export async function findKtpOwners(ktpNumbers: string[]) {
  if (ktpNumbers.length === 0) return new Map<string, string>();
  const rows = await getPrisma().employeePersonal.findMany({
    where: { ktpNumber: { in: ktpNumbers } },
    select: { ktpNumber: true, employeeId: true },
  });
  return new Map(rows.map((r) => [r.ktpNumber as string, r.employeeId]));
}

export async function findEmailOwners(emails: string[]) {
  if (emails.length === 0) return new Map<string, string>();
  const rows = await getPrisma().employee.findMany({
    where: { workEmail: { in: emails } },
    select: { workEmail: true, id: true },
  });
  return new Map(rows.map((r) => [r.workEmail as string, r.id]));
}

/** D-059: pemilik email pribadi (unik, perbandingan huruf kecil). */
export async function findPersonalEmailOwners(emails: string[]) {
  if (emails.length === 0) return new Map<string, string>();
  const rows = await getPrisma().employee.findMany({
    where: { personalEmail: { in: emails, mode: "insensitive" } },
    select: { personalEmail: true, id: true },
  });
  return new Map(rows.map((r) => [(r.personalEmail as string).toLowerCase(), r.id]));
}

export async function upsertPersonal(
  tx: EmployeeTx,
  employeeId: string,
  data: Omit<Prisma.EmployeePersonalUncheckedCreateInput, "employeeId">,
) {
  await tx.employeePersonal.upsert({
    where: { employeeId },
    create: { employeeId, ...data },
    update: data,
  });
}

export async function upsertBank(
  tx: EmployeeTx,
  employeeId: string,
  data: { bankName?: string; accountNumber?: string; accountHolder?: string | null },
  existing: boolean,
) {
  if (existing) {
    await tx.employeeBankAccount.update({ where: { employeeId }, data });
    return;
  }
  if (!data.bankName || !data.accountNumber) return;
  await tx.employeeBankAccount.create({
    data: {
      employeeId,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      accountHolder: data.accountHolder ?? null,
    },
  });
}

export async function createEducation(tx: EmployeeTx, data: Prisma.EducationUncheckedCreateInput) {
  await tx.education.create({ data });
}

export async function createFamilyMember(
  tx: EmployeeTx,
  data: Prisma.FamilyMemberUncheckedCreateInput,
) {
  await tx.familyMember.create({ data });
}

export async function createTraining(tx: EmployeeTx, data: Prisma.TrainingUncheckedCreateInput) {
  await tx.training.create({ data });
}

export async function createJob(
  tx: EmployeeTx,
  data: Omit<Prisma.ImportJobUncheckedCreateInput, "issues">,
  issues: Omit<Prisma.ImportJobIssueUncheckedCreateInput, "jobId">[],
) {
  const job = await tx.importJob.create({ data, select: { id: true } });
  if (issues.length > 0) {
    await tx.importJobIssue.createMany({ data: issues.map((i) => ({ ...i, jobId: job.id })) });
  }
  return job.id;
}

export async function listJobs(where: Prisma.ImportJobWhereInput, skip: number, take: number) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.importJob.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.importJob.count({ where }),
  ]);
  return { rows, total };
}

export async function findJob(id: string) {
  return getPrisma().importJob.findUnique({
    where: { id },
    include: { issues: { orderBy: [{ sourceRow: "asc" }] } },
  });
}

export async function findMapping(signature: string) {
  return getPrisma().importMapping.findUnique({ where: { signature } });
}

export async function upsertMapping(signature: string, mapping: object, updatedBy: string) {
  return getPrisma().importMapping.upsert({
    where: { signature },
    create: { signature, mapping, updatedBy },
    update: { mapping, updatedBy },
  });
}

// ── D-060: antrean lampiran Google Drive ────────────────────────────────────

export type AttachmentInput = Omit<Prisma.ImportJobAttachmentUncheckedCreateInput, "jobId">;

export async function createAttachments(tx: EmployeeTx, jobId: string, rows: AttachmentInput[]) {
  if (rows.length === 0) return;
  await tx.importJobAttachment.createMany({ data: rows.map((row) => ({ ...row, jobId })) });
}

export async function listAttachments(jobId: string) {
  return getPrisma().importJobAttachment.findMany({
    where: { jobId },
    orderBy: [{ sourceRow: "asc" }, { createdAt: "asc" }],
    include: { employee: { select: { employeeNumber: true, fullName: true } } },
  });
}
export type AttachmentRow = Awaited<ReturnType<typeof listAttachments>>[number];

/**
 * Klaim satu lampiran untuk diproses (PENDING, atau PROCESSING yang terputus sebelum `staleBefore`).
 * Optimistik: dua proses bersamaan tidak mengambil baris yang sama (null = kalah balapan/kosong).
 */
export async function claimAttachment(jobId: string, now: Date, staleBefore: Date) {
  const prisma = getPrisma();
  const next = await prisma.importJobAttachment.findFirst({
    where: {
      jobId,
      OR: [{ status: "PENDING" }, { status: "PROCESSING", claimedAt: { lt: staleBefore } }],
    },
    orderBy: [{ sourceRow: "asc" }, { createdAt: "asc" }],
  });
  if (!next) return { row: null, empty: true };
  const { count } = await prisma.importJobAttachment.updateMany({
    where: { id: next.id, status: next.status, claimedAt: next.claimedAt },
    data: { status: "PROCESSING", claimedAt: now, attempts: { increment: 1 } },
  });
  return { row: count === 1 ? next : null, empty: false };
}

export async function finishAttachment(
  id: string,
  data: Pick<
    Prisma.ImportJobAttachmentUncheckedUpdateInput,
    "status" | "reason" | "sourceSha256" | "documentId"
  >,
) {
  await getPrisma().importJobAttachment.update({
    where: { id },
    data: { ...data, claimedAt: null, processedAt: new Date() },
  });
}

/** Lampiran yang sama (sidik jari file Drive) sudah pernah masuk untuk karyawan & tujuan ini. */
export async function findDoneAttachment(where: {
  employeeId: string;
  target: string;
  note: string;
  sourceSha256: string;
}) {
  return getPrisma().importJobAttachment.findFirst({
    where: { ...where, status: "DONE" },
    select: { id: true },
  });
}

export async function retryFailedAttachments(jobId: string) {
  const { count } = await getPrisma().importJobAttachment.updateMany({
    where: { jobId, status: "FAILED" },
    data: { status: "PENDING", reason: null },
  });
  return count;
}

/** Import (milik aktor, atau semua untuk SA) yang lampirannya belum selesai/gagal. */
export async function jobsWithOpenAttachments(actorAccountId: string | null) {
  const prisma = getPrisma();
  const grouped = await prisma.importJobAttachment.groupBy({
    by: ["jobId", "status"],
    where: {
      status: { in: ["PENDING", "PROCESSING", "FAILED"] },
      ...(actorAccountId ? { job: { actorAccountId } } : {}),
    },
    _count: { _all: true },
  });
  const jobs = await prisma.importJob.findMany({
    where: { id: { in: [...new Set(grouped.map((g) => g.jobId))] } },
    select: { id: true, fileName: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return jobs.map((job) => {
    const of = (statuses: string[]) =>
      grouped
        .filter((g) => g.jobId === job.id && statuses.includes(g.status))
        .reduce((sum, g) => sum + g._count._all, 0);
    return { job, pending: of(["PENDING", "PROCESSING"]), failed: of(["FAILED"]) };
  });
}

export async function findTrainingByField(employeeId: string, trainingField: string) {
  return getPrisma().training.findFirst({
    where: { employeeId, trainingField: { equals: trainingField, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
