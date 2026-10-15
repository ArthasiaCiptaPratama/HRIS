import { getPrisma } from "../../core/db.ts";
import type { Prisma, WarningLetterStatus } from "../../generated/prisma/client.ts";

// Query Prisma ke tabel modul discipline saja (PROMPT §4). Data karyawan/PT/absensi dibaca lewat index.ts
// modul lain.

export type DisciplineTx = Prisma.TransactionClient;
export const transaction = <T>(fn: (tx: DisciplineTx) => Promise<T>) =>
  getPrisma().$transaction(fn, { timeout: 20_000 });
const db = (tx?: DisciplineTx) => tx ?? getPrisma();

// --- Master & pengaturan ---

export const listViolationTypes = () =>
  getPrisma().violationType.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
export const findViolationType = (id: string) =>
  getPrisma().violationType.findUnique({ where: { id } });
export const createViolationType = (data: Prisma.ViolationTypeCreateInput) =>
  getPrisma().violationType.create({ data });
export const updateViolationType = (id: string, data: Prisma.ViolationTypeUpdateInput) =>
  getPrisma().violationType.update({ where: { id }, data });

export const readSettings = async (tx?: DisciplineTx) =>
  (await db(tx).disciplineSetting.findUnique({ where: { id: 1 } })) ?? {
    id: 1,
    validityMonths: 6,
    updatedByAccountId: null,
    updatedAt: new Date(0),
  };
export const saveSettings = (validityMonths: number, accountId: string) =>
  getPrisma().disciplineSetting.upsert({
    where: { id: 1 },
    create: { id: 1, validityMonths, updatedByAccountId: accountId },
    update: { validityMonths, updatedByAccountId: accountId },
  });

// --- Surat ---

const LETTER_INCLUDE = {
  violationType: { select: { id: true, code: true, name: true, linksAttendance: true } },
  alphaDays: { orderBy: { workDate: "asc" } },
} as const satisfies Prisma.WarningLetterInclude;

export type LetterRow = Prisma.WarningLetterGetPayload<{ include: typeof LETTER_INCLUDE }>;

export interface LetterFilter {
  /** null = semua PT. */
  companyIds: string[] | null;
  /** PT yang draft-nya terlihat; null = semua, [] = tanpa draft. */
  draftCompanyIds: string[] | null;
  /** Karyawan yang terlihat (MANAGER/filter); null = tanpa batas. */
  employeeIds: string[] | null;
  /** MANAGER: SP yang ia terima sebagai atasan saat terbit (selain tim). */
  orManagerEmployeeId: string | null;
  /** Wajib: atasan saat terbit = ini (MANAGER memfilter karyawan di luar timnya). */
  managerEmployeeId: string | null;
  statuses: WarningLetterStatus[] | null;
  level: "SP1" | "SP2" | "SP3" | null;
  violationTypeId: string | null;
  /** Masih berlaku per tanggal ini (ISSUED & effective_until ≥ tanggal). */
  activeOn: Date | null;
  /** Kedaluwarsa per tanggal ini (EXPIRED, atau ISSUED & effective_until < tanggal). */
  expiredOn: Date | null;
  /** Cari nomor surat, atau karyawan hasil pencarian nama/NIP (`qEmployeeIds`). */
  q: string | null;
  qEmployeeIds: string[];
}

function letterWhere(f: LetterFilter): Prisma.WarningLetterWhereInput {
  const and: Prisma.WarningLetterWhereInput[] = [];
  if (f.companyIds) and.push({ companyId: { in: f.companyIds } });
  if (f.draftCompanyIds) {
    and.push({
      OR: [{ status: { not: "DRAFT" } }, { companyId: { in: f.draftCompanyIds } }],
    });
  }
  if (f.employeeIds || f.orManagerEmployeeId) {
    const or: Prisma.WarningLetterWhereInput[] = [];
    if (f.employeeIds) or.push({ employeeId: { in: f.employeeIds } });
    if (f.orManagerEmployeeId) or.push({ managerEmployeeId: f.orManagerEmployeeId });
    and.push({ OR: or });
  }
  if (f.managerEmployeeId) and.push({ managerEmployeeId: f.managerEmployeeId });
  if (f.statuses) and.push({ status: { in: f.statuses } });
  if (f.level) and.push({ level: f.level });
  if (f.violationTypeId) and.push({ violationTypeId: f.violationTypeId });
  if (f.activeOn) and.push({ status: "ISSUED", effectiveUntil: { gte: f.activeOn } });
  if (f.expiredOn) {
    and.push({
      OR: [{ status: "EXPIRED" }, { status: "ISSUED", effectiveUntil: { lt: f.expiredOn } }],
    });
  }
  if (f.q) {
    and.push({
      OR: [
        { number: { contains: f.q, mode: "insensitive" } },
        { employeeId: { in: f.qEmployeeIds } },
      ],
    });
  }
  return { AND: and };
}

export async function listLetters(filter: LetterFilter, skip: number, take: number) {
  const where = letterWhere(filter);
  const [rows, total] = await Promise.all([
    getPrisma().warningLetter.findMany({
      where,
      include: LETTER_INCLUDE,
      orderBy: [{ issuedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      skip,
      take,
    }),
    getPrisma().warningLetter.count({ where }),
  ]);
  return { rows, total };
}

export const findLetter = (id: string, tx?: DisciplineTx) =>
  db(tx).warningLetter.findUnique({ where: { id }, include: LETTER_INCLUDE });

export const lettersOfEmployee = (employeeId: string, includeDrafts: boolean) =>
  getPrisma().warningLetter.findMany({
    where: { employeeId, ...(includeDrafts ? {} : { status: { not: "DRAFT" } }) },
    include: LETTER_INCLUDE,
    orderBy: [{ issuedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
  });

/**
 * SP terbit yang masih berlaku pada `on` atau sesudahnya (dasar saran tingkat, ARS-D10). Termasuk SP yang
 * terbit setelah `on`, supaya tanggal terbit mundur tidak menurunkan saran (audit 2026-10-15).
 */
export const activeLettersOf = (
  employeeId: string,
  on: Date,
  excludeId: string | null,
  tx?: DisciplineTx,
) =>
  db(tx).warningLetter.findMany({
    where: {
      employeeId,
      status: "ISSUED",
      effectiveUntil: { gte: on },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, level: true, number: true, effectiveUntil: true },
    orderBy: { issuedAt: "desc" },
  });

export const createLetter = (
  tx: DisciplineTx,
  data: Prisma.WarningLetterUncheckedCreateInput,
  alphaDays: { attendanceDayId: string; workDate: Date }[],
) =>
  tx.warningLetter.create({
    data: { ...data, alphaDays: { create: alphaDays } },
    include: LETTER_INCLUDE,
  });

/** Ubah draft: hanya bila masih DRAFT (aman dari terbit bersamaan). Hari ALPHA diganti seluruhnya. */
export async function updateDraft(
  tx: DisciplineTx,
  id: string,
  data: Prisma.WarningLetterUncheckedUpdateManyInput,
  alphaDays: { attendanceDayId: string; workDate: Date }[],
) {
  const { count } = await tx.warningLetter.updateMany({ where: { id, status: "DRAFT" }, data });
  if (count === 0) return false;
  await tx.warningLetterAlphaDay.deleteMany({ where: { letterId: id } });
  if (alphaDays.length) {
    await tx.warningLetterAlphaDay.createMany({
      data: alphaDays.map((d) => ({ ...d, letterId: id })),
    });
  }
  return true;
}

export async function deleteDraft(tx: DisciplineTx, id: string) {
  const { count } = await tx.warningLetter.deleteMany({ where: { id, status: "DRAFT" } });
  return count > 0;
}

/** Nomor urut otomatis berikutnya untuk PT + tahun (ARS-D11). */
export async function nextNumberSeq(tx: DisciplineTx, companyId: string, year: number) {
  const agg = await tx.warningLetter.aggregate({
    where: { companyId, numberYear: year },
    _max: { numberSeq: true },
  });
  return (agg._max.numberSeq ?? 0) + 1;
}

/** Nomor surat sudah dipakai (otomatis maupun manual)? */
export const numberTaken = async (tx: DisciplineTx, number: string) =>
  (await tx.warningLetter.count({ where: { number } })) > 0;

/** Ubah bersyarat status (terbit / cabut / kedaluwarsa); false = status sudah berubah. */
export async function updateIfStatus(
  tx: DisciplineTx,
  id: string,
  status: WarningLetterStatus,
  data: Prisma.WarningLetterUncheckedUpdateManyInput,
) {
  const { count } = await tx.warningLetter.updateMany({ where: { id, status }, data });
  return count > 0;
}

/** Konfirmasi sekali: hanya baris yang kolomnya masih kosong (idempoten & aman bersamaan). */
export async function confirmOnce(
  tx: DisciplineTx,
  id: string,
  field: "deliveredAt" | "acknowledgedAt",
  data: Prisma.WarningLetterUncheckedUpdateManyInput,
) {
  const { count } = await tx.warningLetter.updateMany({
    where: { id, status: { in: ["ISSUED", "EXPIRED"] }, [field]: null },
    data,
  });
  return count > 0;
}

export const setScanDocument = (tx: DisciplineTx, id: string, scanDocumentId: string) =>
  tx.warningLetter.update({ where: { id }, data: { scanDocumentId }, include: LETTER_INCLUDE });

// --- Cron ---

/** ARS-D8: SP terbit yang lewat berlaku s/d. */
export const issuedExpiredBefore = (today: Date) =>
  getPrisma().warningLetter.findMany({
    where: { status: "ISSUED", effectiveUntil: { lt: today } },
    select: { id: true, number: true, employeeId: true },
  });

export async function markExpired(ids: string[]) {
  const { count } = await getPrisma().warningLetter.updateMany({
    where: { id: { in: ids }, status: "ISSUED" },
    data: { status: "EXPIRED" },
  });
  return count;
}

/** ARS-D9: SP berlaku yang belum dikonfirmasi lengkap & terbit ≤ `issuedOnOrBefore`. */
export const unconfirmedIssued = (issuedOnOrBefore: Date) =>
  getPrisma().warningLetter.findMany({
    where: {
      status: "ISSUED",
      issuedAt: { lte: issuedOnOrBefore },
      OR: [{ deliveredAt: null }, { acknowledgedAt: null }],
    },
    select: {
      id: true,
      number: true,
      employeeId: true,
      companyId: true,
      managerEmployeeId: true,
      deliveredAt: true,
      acknowledgedAt: true,
    },
  });
