import type { PrismaClient } from "../../src/generated/prisma/client.ts";

// Master data dummy (PLAN §5.7). Idempoten: upsert berdasarkan kunci unik.
export const DEPARTMENTS: Record<string, string[]> = {
  "Human Resources & GA": ["HR Manager", "HR Staff", "GA Staff"],
  "Keuangan & Akuntansi": ["Finance Manager", "Accounting Staff"],
  "Teknologi Informasi": ["IT Manager", "Software Engineer", "IT Support"],
  Operasional: ["Operations Manager", "Operations Staff"],
  "Penjualan & Pemasaran": ["Sales Manager", "Sales Executive"],
};

export const EMPLOYMENT_STATUSES = ["Tetap", "Kontrak (PKWT)", "Masa Percobaan", "Magang"];
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
  for (const name of EMPLOYMENT_STATUSES) {
    const status = await prisma.employmentStatus.upsert({
      where: { name },
      update: {},
      create: { name },
    });
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
