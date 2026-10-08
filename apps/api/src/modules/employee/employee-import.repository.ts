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
