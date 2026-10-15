import { getPrisma } from "../../core/db.ts";

// TM-D1 — query pengaturan lokasi absen per karyawan (skema attendance).

export interface LocationSettingRow {
  employeeId: string;
  workLocationId: string | null;
  anywhere: boolean;
  updatedAt: Date;
}

const select = { employeeId: true, workLocationId: true, anywhere: true, updatedAt: true } as const;

export const findSetting = (employeeId: string): Promise<LocationSettingRow | null> =>
  getPrisma().employeeLocationSetting.findUnique({ where: { employeeId }, select });

export async function settingsFor(employeeIds: string[]): Promise<Map<string, LocationSettingRow>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await getPrisma().employeeLocationSetting.findMany({
    where: { employeeId: { in: employeeIds } },
    select,
  });
  return new Map(rows.map((row) => [row.employeeId, row]));
}

/** Lokasi crew tiap karyawan pada tanggal itu (versi banyak-karyawan dari crewOfEmployeeOn). */
export async function crewLocationsOn(
  employeeIds: string[],
  date: Date,
): Promise<Map<string, { crewName: string; workLocationId: string }>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await getPrisma().crewMember.findMany({
    where: {
      employeeId: { in: employeeIds },
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
    include: { crew: { select: { name: true, workLocationId: true } } },
  });
  return new Map(
    rows.map((row) => [
      row.employeeId,
      { crewName: row.crew.name, workLocationId: row.crew.workLocationId },
    ]),
  );
}

/** Terapkan satu mode ke banyak karyawan sekaligus (atomik). DEFAULT = hapus baris (kembali ke bawaan). */
export async function applySettings(
  employeeIds: string[],
  value: { workLocationId: string | null; anywhere: boolean } | null,
  accountId: string,
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    if (value === null) {
      await tx.employeeLocationSetting.deleteMany({ where: { employeeId: { in: employeeIds } } });
      return;
    }
    for (const employeeId of employeeIds) {
      await tx.employeeLocationSetting.upsert({
        where: { employeeId },
        create: { employeeId, ...value, updatedByAccountId: accountId },
        update: { ...value, updatedByAccountId: accountId },
      });
    }
  });
}
