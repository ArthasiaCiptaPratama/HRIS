import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

export type OrganizationTx = Prisma.TransactionClient;

// Satu-satunya tempat query Prisma ke tabel skema organization (PROMPT §4).
// Master data kecil (puluhan baris) → dibaca utuh dalam satu transaksi baca.

export async function loadMasterData() {
  const prisma = getPrisma();
  const [departments, positions, statuses, grades, locations, companies] =
    await prisma.$transaction([
      prisma.department.findMany({
        select: { id: true, name: true, parentId: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.position.findMany({
        select: { id: true, name: true, departmentId: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.employmentStatus.findMany({
        select: { id: true, name: true, category: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.grade.findMany({
        select: { id: true, name: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.workLocation.findMany({
        select: { id: true, name: true, city: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      // D-039: perusahaan dalam grup; nonaktif diperlakukan seperti dihapus untuk pilihan baru.
      prisma.company.findMany({
        select: { id: true, code: true, name: true, isActive: true, deletedAt: true },
        orderBy: { code: "asc" },
      }),
    ]);
  return { departments, positions, statuses, grades, locations, companies };
}

// ── D-042: master data baru dari import (dalam transaksi pemanggil) ───────────

export async function createDepartment(tx: OrganizationTx, name: string) {
  return tx.department.create({ data: { name }, select: { id: true, name: true } });
}

export async function createPosition(tx: OrganizationTx, departmentId: string, name: string) {
  return tx.position.create({
    data: { name, departmentId },
    select: { id: true, name: true, departmentId: true },
  });
}

export async function createGrade(tx: OrganizationTx, name: string) {
  return tx.grade.create({ data: { name }, select: { id: true, name: true } });
}

export async function createWorkLocation(tx: OrganizationTx, name: string) {
  return tx.workLocation.create({ data: { name }, select: { id: true, name: true } });
}
