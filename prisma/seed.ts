import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create sample employees
  const employees = await Promise.all([
    prisma.employee.create({
      data: {
        name: 'Ahmad Rizki Pratama',
        email: 'ahmad.rizki@company.com',
        phone: '+62 812-3456-7890',
        address: 'Jl. Sudirman No. 123, Jakarta Selatan',
        department: 'Engineering',
        position: 'Senior Software Engineer',
        joinDate: new Date('2022-01-15'),
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmad',
      },
    }),
    prisma.employee.create({
      data: {
        name: 'Siti Nurhaliza',
        email: 'siti.nurhaliza@company.com',
        phone: '+62 813-4567-8901',
        address: 'Jl. Gatot Subroto No. 45, Jakarta Pusat',
        department: 'Human Resources',
        position: 'HR Manager',
        joinDate: new Date('2020-03-10'),
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Siti',
      },
    }),
    prisma.employee.create({
      data: {
        name: 'Budi Santoso',
        email: 'budi.santoso@company.com',
        phone: '+62 814-5678-9012',
        address: 'Jl. Thamrin No. 78, Jakarta Barat',
        department: 'Sales',
        position: 'Sales Executive',
        joinDate: new Date('2023-06-01'),
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Budi',
      },
    }),
    prisma.employee.create({
      data: {
        name: 'Dewi Lestari',
        email: 'dewi.lestari@company.com',
        phone: '+62 815-6789-0123',
        address: 'Jl. HR Rasuna Said, Jakarta Selatan',
        department: 'Finance',
        position: 'Financial Analyst',
        joinDate: new Date('2021-09-20'),
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Dewi',
      },
    }),
  ]);

  console.log(`✅ Created ${employees.length} employees`);

  const currentYear = new Date().getFullYear();

  // Create leave quotas for each employee
  for (const employee of employees) {
    await prisma.leaveQuota.createMany({
      data: [
        { employeeId: employee.id, leaveType: 'ANNUAL', totalDays: 12, usedDays: Math.floor(Math.random() * 5), year: currentYear },
        { employeeId: employee.id, leaveType: 'SICK', totalDays: 14, usedDays: Math.floor(Math.random() * 3), year: currentYear },
        { employeeId: employee.id, leaveType: 'PERSONAL', totalDays: 3, usedDays: Math.floor(Math.random() * 2), year: currentYear },
      ],
    });
  }

  console.log(`✅ Created leave quotas for ${employees.length} employees`);

  // Create sample attendance permissions
  await prisma.attendancePermission.createMany({
    data: [
      {
        employeeId: employees[0].id,
        type: 'SICK',
        date: new Date('2026-09-20'),
        reason: 'Demam dan flu',
        status: 'APPROVED',
      },
      {
        employeeId: employees[1].id,
        type: 'PERMIT',
        date: new Date('2026-09-18'),
        reason: 'Keperluan keluarga mendesak',
        status: 'APPROVED',
      },
      {
        employeeId: employees[2].id,
        type: 'BUSINESS',
        date: new Date('2026-09-25'),
        reason: 'Meeting dengan klien di Surabaya',
        status: 'PENDING',
      },
    ],
  });

  console.log('✅ Created sample attendance permissions');

  // Create sample business trips
  await prisma.businessTrip.createMany({
    data: [
      {
        employeeId: employees[0].id,
        destination: 'Bandung',
        purpose: 'Technical workshop dan training',
        startDate: new Date('2026-10-05'),
        endDate: new Date('2026-10-07'),
        status: 'APPROVED',
      },
      {
        employeeId: employees[2].id,
        destination: 'Surabaya',
        purpose: 'Sales presentation ke PT Maju Jaya',
        startDate: new Date('2026-09-28'),
        endDate: new Date('2026-09-30'),
        status: 'PENDING',
      },
      {
        employeeId: employees[3].id,
        destination: 'Yogyakarta',
        purpose: 'Audit keuangan cabang',
        startDate: new Date('2026-10-10'),
        endDate: new Date('2026-10-12'),
        status: 'APPROVED',
      },
    ],
  });

  console.log('✅ Created sample business trips');
  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
