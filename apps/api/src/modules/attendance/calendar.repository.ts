import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Query kalender libur & pengaturan Time Management (skema attendance).
export type CalendarTx = Prisma.TransactionClient;

export async function listHolidays(from: Date, to: Date) {
  return getPrisma().holiday.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });
}

export async function findHoliday(id: string) {
  return getPrisma().holiday.findUnique({ where: { id } });
}

export async function createHoliday(data: Prisma.HolidayCreateInput) {
  return getPrisma().holiday.create({ data });
}

/** Tambah banyak sekaligus; tanggal yang sudah ada dilewati (tidak menimpa isian SA). */
export async function createHolidays(data: Prisma.HolidayCreateManyInput[]) {
  return getPrisma().holiday.createMany({ data, skipDuplicates: true });
}

export async function updateHoliday(id: string, data: Prisma.HolidayUpdateInput) {
  return getPrisma().holiday.update({ where: { id }, data });
}

export async function deleteHoliday(id: string) {
  return getPrisma().holiday.delete({ where: { id } });
}

export async function findSetting(key: string, tx?: CalendarTx) {
  return (tx ?? getPrisma()).timeSetting.findUnique({ where: { key } });
}

export async function upsertSetting(key: string, value: Prisma.InputJsonValue, accountId: string) {
  return getPrisma().timeSetting.upsert({
    where: { key },
    create: { key, value, updatedByAccountId: accountId },
    update: { value, updatedByAccountId: accountId },
  });
}
