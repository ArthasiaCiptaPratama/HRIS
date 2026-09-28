import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export { prisma };

// Re-export types
export type Employee = Awaited<ReturnType<typeof prisma.employee.findFirst>>;
export type LeaveQuota = Awaited<ReturnType<typeof prisma.leaveQuota.findFirst>>;
export type AttendancePermission = Awaited<ReturnType<typeof prisma.attendancePermission.findFirst>>;
export type BusinessTrip = Awaited<ReturnType<typeof prisma.businessTrip.findFirst>>;
