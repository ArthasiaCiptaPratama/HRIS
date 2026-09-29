import { getPrisma } from "../../core/db.ts";

// Satu-satunya tempat query Prisma ke tabel skema organization (PROMPT §4).
// Master data kecil (puluhan baris) → dibaca utuh dalam satu transaksi baca.

export async function loadMasterData() {
  const prisma = getPrisma();
  const [departments, positions, statuses, grades, locations] = await prisma.$transaction([
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
  ]);
  return { departments, positions, statuses, grades, locations };
}
