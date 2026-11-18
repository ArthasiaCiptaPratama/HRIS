import { getPrisma } from "../../core/db.ts";
import type { Prisma, Residency } from "../../generated/prisma/client.ts";

// TM-D28 — query roster (siklus kerja–libur), Homebase lokal per lokasi kerja, & lokal/non-lokal karyawan.

const db = () => getPrisma();

export type WorkRosterRow = Prisma.WorkRosterGetPayload<{
  include: { _count: { select: { templates: true } } };
}>;
const withUse = { _count: { select: { templates: true } } } as const;

export const listWorkRosters = (companyId: string) =>
  db().workRoster.findMany({
    where: { companyId, deletedAt: null },
    include: withUse,
    orderBy: [{ residency: "desc" }, { name: "asc" }],
  });

export const findWorkRoster = (id: string) =>
  db().workRoster.findFirst({ where: { id, deletedAt: null }, include: withUse });

export const createWorkRoster = (data: Prisma.WorkRosterUncheckedCreateInput) =>
  db().workRoster.create({ data, include: withUse });

export const updateWorkRoster = (id: string, data: Prisma.WorkRosterUncheckedUpdateInput) =>
  db().workRoster.update({ where: { id }, data, include: withUse });

/** Template jadwal hasil roster ini (cari yang langkahnya sama dengan rakitan roster + shift). */
export const templatesOfRoster = (workRosterId: string) =>
  db().rosterTemplate.findMany({
    where: { workRosterId, deletedAt: null },
    select: { id: true, name: true, steps: true },
  });

export const linkTemplate = (templateId: string, workRosterId: string) =>
  db().rosterTemplate.update({ where: { id: templateId }, data: { workRosterId } });

export const templateNameTaken = async (companyId: string, name: string) =>
  (await db().rosterTemplate.count({ where: { companyId, name } })) > 0;

// ── Homebase lokal per lokasi kerja ───────────────────────────────────────────────

export async function localHomebases(workLocationIds?: string[]): Promise<Map<string, string[]>> {
  const rows = await db().localHomebase.findMany({
    where: workLocationIds ? { workLocationId: { in: workLocationIds } } : {},
    select: { workLocationId: true, homebaseId: true },
  });
  const out = new Map<string, string[]>();
  for (const row of rows) {
    out.set(row.workLocationId, [...(out.get(row.workLocationId) ?? []), row.homebaseId]);
  }
  return out;
}

/** Lokasi kerja kantor (karyawannya = office). */
export async function officeLocations(workLocationIds?: string[]): Promise<Set<string>> {
  const rows = await db().officeWorkLocation.findMany({
    where: workLocationIds ? { workLocationId: { in: workLocationIds } } : {},
    select: { workLocationId: true },
  });
  return new Set(rows.map((r) => r.workLocationId));
}

/** Ganti penanda kantor & seluruh daftar Homebase lokal satu lokasi (berurutan di satu transaksi). */
export const replaceLocationSetting = (
  workLocationId: string,
  office: boolean,
  homebaseIds: string[],
  accountId: string,
) =>
  db().$transaction(async (tx) => {
    await tx.officeWorkLocation.deleteMany({ where: { workLocationId } });
    if (office) {
      await tx.officeWorkLocation.create({
        data: { workLocationId, createdByAccountId: accountId },
      });
    }
    await tx.localHomebase.deleteMany({ where: { workLocationId } });
    if (homebaseIds.length > 0) {
      await tx.localHomebase.createMany({
        data: homebaseIds.map((homebaseId) => ({
          workLocationId,
          homebaseId,
          createdByAccountId: accountId,
        })),
      });
    }
  });

// ── Lokal / non-lokal yang ditetapkan HR ─────────────────────────────────────────

export async function residencyOverrides(employeeIds: string[]): Promise<Map<string, Residency>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await db().employeeResidency.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { employeeId: true, residency: true },
  });
  return new Map(rows.map((r) => [r.employeeId, r.residency]));
}

export const setResidencyOverrides = (
  employeeIds: string[],
  residency: Residency | null,
  accountId: string,
) =>
  db().$transaction(async (tx) => {
    if (residency === null) {
      return (await tx.employeeResidency.deleteMany({ where: { employeeId: { in: employeeIds } } }))
        .count;
    }
    for (const employeeId of employeeIds) {
      await tx.employeeResidency.upsert({
        where: { employeeId },
        create: { employeeId, residency, updatedByAccountId: accountId },
        update: { residency, updatedByAccountId: accountId },
      });
    }
    return employeeIds.length;
  });
