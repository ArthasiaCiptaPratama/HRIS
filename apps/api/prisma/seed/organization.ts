import type { EmploymentCategory, PrismaClient } from "../../src/generated/prisma/client.ts";

// Master data dummy (PLAN §5.7). Idempoten: upsert berdasarkan kunci unik.
export const DEPARTMENTS: Record<string, string[]> = {
  "Human Resources & GA": ["HR Manager", "HR Staff", "GA Staff"],
  "Keuangan & Akuntansi": ["Finance Manager", "Accounting Staff"],
  "Teknologi Informasi": ["IT Manager", "Software Engineer", "IT Support"],
  Operasional: ["Operations Manager", "Operations Staff"],
  "Penjualan & Pemasaran": ["Sales Manager", "Sales Executive"],
};

// D-035/D-038: satu status per kategori navigasi. `legacyNames` = nama seed lama yang diganti (DB developer
// lama). "Masa Percobaan" dulu digabung ke Pegawai Tetap; sejak D-038 menjadi kategori sendiri lagi.
export const EMPLOYMENT_STATUSES: Array<{
  name: string;
  category: EmploymentCategory;
  legacyNames: string[];
}> = [
  { name: "Karyawan Tetap", category: "PERMANENT", legacyNames: ["Pegawai Tetap", "Tetap"] },
  { name: "Karyawan Percobaan", category: "PROBATION", legacyNames: ["Masa Percobaan"] },
  { name: "PKWT", category: "PKWT", legacyNames: ["Kontrak (PKWT)"] },
  { name: "Pekerja Harian", category: "DAILY_WORKER", legacyNames: ["Daily Worker"] },
  { name: "Magang", category: "INTERNSHIP", legacyNames: ["Internship"] },
  { name: "Outsourcing", category: "OUTSOURCING", legacyNames: [] },
  { name: "Vendor", category: "VENDOR", legacyNames: [] },
];
export const GRADES = ["Staf", "Staf Senior", "Supervisor", "Manajer", "Direktur"];

export const WORK_LOCATIONS = [
  {
    name: "Kantor Pusat Jakarta",
    city: "Jakarta Pusat",
    address: "Jl. Contoh Merdeka No. 1, Gambir, Jakarta Pusat",
    latitude: "-6.175392",
    longitude: "106.827153",
    radiusM: 100,
  },
  {
    name: "Kantor Cabang Bandung",
    city: "Bandung",
    address: "Jl. Contoh Asia Afrika No. 2, Sumur Bandung, Bandung",
    latitude: "-6.921151",
    longitude: "107.607301",
    radiusM: 150,
  },
];

export interface OrganizationIds {
  positions: Map<string, string>;
  statuses: Map<string, string>;
  grades: Map<string, string>;
  locations: Map<string, string>;
}

export async function seedOrganization(prisma: PrismaClient): Promise<OrganizationIds> {
  const positions = new Map<string, string>();
  for (const [departmentName, positionNames] of Object.entries(DEPARTMENTS)) {
    const department = await prisma.department.upsert({
      where: { name: departmentName },
      update: {},
      create: { name: departmentName },
    });
    for (const name of positionNames) {
      const position = await prisma.position.upsert({
        where: { departmentId_name: { departmentId: department.id, name } },
        update: {},
        create: { name, departmentId: department.id },
      });
      positions.set(name, position.id);
    }
  }

  const statuses = new Map<string, string>();
  for (const { name, category, legacyNames } of EMPLOYMENT_STATUSES) {
    const status = await upsertStatus(prisma, name, category, legacyNames);
    statuses.set(name, status.id);
  }

  const grades = new Map<string, string>();
  for (const name of GRADES) {
    const grade = await prisma.grade.upsert({ where: { name }, update: {}, create: { name } });
    grades.set(name, grade.id);
  }

  const locations = new Map<string, string>();
  for (const location of WORK_LOCATIONS) {
    const row = await prisma.workLocation.upsert({
      where: { name: location.name },
      update: {},
      create: location,
    });
    locations.set(location.name, row.id);
  }

  return { positions, statuses, grades, locations };
}

// Cari berdasarkan kategori → nama baru/lama → buat. Nama lama yang tersisa (mis. "Masa Percobaan")
// dipindah pegawainya ke status baru lalu di-soft delete, supaya seed ulang di DB lama tetap bersih.
async function upsertStatus(
  prisma: PrismaClient,
  name: string,
  category: EmploymentCategory,
  legacyNames: string[],
) {
  const existing =
    (await prisma.employmentStatus.findUnique({ where: { category } })) ??
    (await prisma.employmentStatus.findFirst({ where: { name: { in: [name, ...legacyNames] } } }));
  const status = existing
    ? await prisma.employmentStatus.update({
        where: { id: existing.id },
        data: { name, category, deletedAt: null },
      })
    : await prisma.employmentStatus.create({ data: { name, category } });
  const leftovers = await prisma.employmentStatus.findMany({
    where: { name: { in: legacyNames }, id: { not: status.id } },
  });
  for (const legacy of leftovers) {
    await prisma.employee.updateMany({
      where: { employmentStatusId: legacy.id },
      data: { employmentStatusId: status.id },
    });
    await prisma.employmentStatus.update({
      where: { id: legacy.id },
      data: { deletedAt: legacy.deletedAt ?? new Date() },
    });
  }
  return status;
}
