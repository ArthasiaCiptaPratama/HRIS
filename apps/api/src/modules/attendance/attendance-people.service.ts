import type { PaginationMeta } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { ForbiddenError } from "../../core/errors.ts";
import type { StorageAdmin } from "../../core/storage.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import * as policy from "./attendance.policy.ts";
import * as repository from "./attendance.repository.ts";
import { settingsToday, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import { membershipsOn } from "./roster.repository.ts";

// TM-D33: Data Absen Harian tampilan "Per karyawan" (web saja; bukan bagian APP_OPERATION_IDS). Satu kartu per
// karyawan dalam cakupan aktor yang pernah punya absen (hari dengan ≥1 punch). Cakupan = listDays scope=all.
// Data karyawan dibaca lewat directory (modul employee/organization), tanpa query tabel modul lain.
// Tanpa data sensitif (NIK, NPWP, KK, rekening, alamat, gaji, dokumen) dan tanpa selfie/koordinat absen.

let storage: StorageAdmin | undefined;
/** Storage foto profil (URL bertanda tangan dibuat modul employee); belum dikonfigurasi → tanpa foto. */
export function configureAttendancePeople(next: { storage: StorageAdmin }) {
  storage = next.storage;
}

export type AttendanceDayStatusValue =
  | "OPEN"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "ALPHA"
  | "LEAVE";

export interface AttendancePerson {
  id: string;
  fullName: string;
  /** NIP (nomor induk karyawan). */
  employeeNumber: string | null;
  position: string | null;
  division: string | null;
  company: { id: string; name: string } | null;
  crew: { id: string; name: string } | null;
  isActive: boolean;
  /** Tanggal kerja (YYYY-MM-DD, tanggal lokal zona TM) pertama & terakhir yang punya absen. */
  firstWorkDate: string;
  lastWorkDate: string;
  /** Jam absen terbaru pada `lastWorkDate` (ISO 8601, UTC). */
  lastPunchAt: string | null;
  /** Status hari ini (zona TM, `settingsToday`); null bila belum ada hari absen. */
  todayStatus: AttendanceDayStatusValue | null;
  /** Foto profil Personnel Management (URL bertanda tangan ±10 menit) bila ada & aktor berhak; bukan selfie. */
  photoUrl: string | null;
}

export interface AttendancePeopleQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  companyId?: string | undefined;
}

export interface AttendancePeoplePage {
  data: AttendancePerson[];
  meta: PaginationMeta;
}

interface Ctx {
  actor: Actor;
}

/** Cakupan hari absen aktor — sama persis dengan `listDays` scope=all. */
async function scopeWhere(
  actor: Actor,
  companyId: string | undefined,
): Promise<Prisma.AttendanceDayWhereInput> {
  if (actor.role === "SUPER_ADMIN") return companyId ? { companyId } : {};
  if (actor.role === "HR_ADMIN") {
    const scope = [...(actor.companyIds ?? [])];
    if (companyId && !scope.includes(companyId)) throw new ForbiddenError();
    return { companyId: companyId ? companyId : { in: scope } };
  }
  if (actor.role === "MANAGER" && actor.employeeId) {
    return {
      employeeId: { in: await directory.teamIds(actor.employeeId) },
      ...(companyId ? { companyId } : {}),
    };
  }
  throw new ForbiddenError();
}

export async function listAttendancePeople(
  ctx: Ctx,
  query: AttendancePeopleQuery,
): Promise<AttendancePeoplePage> {
  const { actor } = ctx;
  if (!policy.canListAttendancePeople(actor, query.companyId)) throw new ForbiddenError();
  const meta = (total: number): PaginationMeta => ({
    page: query.page,
    pageSize: query.pageSize,
    total,
  });
  const scope = await scopeWhere(actor, query.companyId);
  const q = query.q?.trim();
  const and: Prisma.AttendanceDayWhereInput[] = [scope];
  if (q) {
    const matching = await directory.employeeIdsMatching(q);
    if (matching.length === 0) return { data: [], meta: meta(0) };
    and.push({ employeeId: { in: matching } });
  }
  const where: Prisma.AttendanceDayWhereInput = { AND: and };
  const groups = await repository.peopleWithPunches(where);
  const start = (query.page - 1) * query.pageSize;
  const page = groups
    .slice(start, start + query.pageSize)
    .flatMap((g) =>
      g._max.workDate && g._min.workDate
        ? [{ employeeId: g.employeeId, first: g._min.workDate, last: g._max.workDate }]
        : [],
    );
  if (page.length === 0) return { data: [], meta: meta(groups.length) };

  const ids = page.map((p) => p.employeeId);
  const today = await settingsToday();
  const [people, placement, companies, latestDays, todayDays, memberships, photos] =
    await Promise.all([
      directory.employeesByIds(ids),
      directory.positionPlacementByEmployee(ids),
      directory.companyNames(),
      repository.daysForPeople(
        where,
        page.map((p) => ({ employeeId: p.employeeId, workDate: p.last })),
      ),
      repository.daysForPeople(
        scope,
        ids.map((employeeId) => ({ employeeId, workDate: toDate(today) })),
      ),
      membershipsOn(ids, toDate(today)),
      storage ? directory.photoUrlsOf({ actor, storage }, ids) : new Map<string, string>(),
    ]);

  const lastPunch = new Map<string, Date>();
  for (const day of latestDays) {
    for (const punch of day.punches) {
      const prev = lastPunch.get(day.employeeId);
      if (!prev || punch.at > prev) lastPunch.set(day.employeeId, punch.at);
    }
  }
  const todayStatus = new Map(todayDays.map((d) => [d.employeeId, d.status]));
  // Lebih dari satu keanggotaan pada tanggal yang sama → yang mulai paling akhir.
  const crewOf = new Map<string, { id: string; name: string; since: Date }>();
  for (const m of memberships) {
    const prev = crewOf.get(m.employeeId);
    if (!prev || m.startDate > prev.since) {
      crewOf.set(m.employeeId, { id: m.crew.id, name: m.crew.name, since: m.startDate });
    }
  }

  const data = page.flatMap((p): AttendancePerson[] => {
    const person = people.get(p.employeeId);
    if (!person) return [];
    const place = placement.get(p.employeeId);
    const company = companies.get(person.companyId);
    const crew = crewOf.get(p.employeeId);
    return [
      {
        id: person.id,
        fullName: person.fullName,
        employeeNumber: person.employeeNumber,
        position: place?.position ?? null,
        division: place?.division ?? null,
        company: company ? { id: person.companyId, name: company.name } : null,
        crew: crew ? { id: crew.id, name: crew.name } : null,
        isActive: person.isActive,
        firstWorkDate: toIso(p.first),
        lastWorkDate: toIso(p.last),
        lastPunchAt: lastPunch.get(p.employeeId)?.toISOString() ?? null,
        todayStatus: todayStatus.get(p.employeeId) ?? null,
        photoUrl: photos.get(p.employeeId) ?? null,
      },
    ];
  });
  return { data, meta: meta(groups.length) };
}
