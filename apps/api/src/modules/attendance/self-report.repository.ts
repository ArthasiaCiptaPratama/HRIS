import { getPrisma } from "../../core/db.ts";

// ════════════════════════════════════════════════════════════════════════════════════════════
// TM-D29 — ABSEN MANDIRI (STAGING). Hapus file ini saat fitur dicabut.
// Jejak lengkap: docs/features/time-management/tm-d29-absen-mandiri.md
// ════════════════════════════════════════════════════════════════════════════════════════════

/** Crew aktif PT beserta status izin absen mandiri & jumlah anggota aktif hari itu. */
export const crewsWithSelfReport = (companyId: string, onDate: Date) =>
  getPrisma().crew.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      companyId: true,
      workLocationId: true,
      selfReport: { select: { createdAt: true } },
      _count: {
        select: {
          members: {
            where: {
              startDate: { lte: onDate },
              OR: [{ endDate: null }, { endDate: { gte: onDate } }],
            },
          },
        },
      },
    },
  });

export const findCrew = (id: string) =>
  getPrisma().crew.findFirst({ where: { id, deletedAt: null } });

export const enableCrew = (crewId: string, accountId: string) =>
  getPrisma().selfReportCrew.upsert({
    where: { crewId },
    create: { crewId, enabledByAccountId: accountId },
    update: {},
  });

export const disableCrew = (crewId: string) =>
  getPrisma().selfReportCrew.deleteMany({ where: { crewId } });

/** Crew berizin absen mandiri tempat karyawan menjadi anggota pada tanggal itu (null = tidak berhak). */
export const selfReportCrewOf = (employeeId: string, date: Date) =>
  getPrisma().crewMember.findFirst({
    where: {
      employeeId,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
      crew: { deletedAt: null, selfReport: { isNot: null } },
    },
    select: { crew: { select: { id: true, name: true, workLocationId: true } } },
  });
