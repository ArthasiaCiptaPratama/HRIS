import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Satu-satunya tempat query Prisma ke tabel skema employee (PROMPT §4).
// Tidak ada `include` ke tabel modul lain: nama jabatan/status dirakit service dari modul organization.

export type EmployeeTx = Prisma.TransactionClient;
export type EmployeeWhere = Prisma.EmployeeWhereInput;
export type EmployeeOrderBy = Prisma.EmployeeOrderByWithRelationInput;

// Kolom daftar dipilih eksplisit: data sensitif (tabel terpisah) tidak pernah ikut ter-select.
export const LIST_SELECT = {
  id: true,
  employeeNumber: true,
  fullName: true,
  workEmail: true,
  phoneNumber: true,
  gender: true,
  joinDate: true,
  endDate: true,
  isActive: true,
  exitReason: true,
  employmentStatusId: true,
  companyId: true,
  positionId: true,
  workLocationId: true,
  gradeId: true,
  managerId: true,
  // D-051/D-053: pos jabatan & atasan manual.
  orgPostId: true,
  managerOverride: true,
  photoPath: true,
  manager: { select: { id: true, fullName: true } },
} satisfies Prisma.EmployeeSelect;

export type EmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof LIST_SELECT }>;

export async function withTransaction<T>(run: (tx: EmployeeTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(run);
}

export async function listEmployees(
  where: EmployeeWhere,
  orderBy: EmployeeOrderBy[],
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.employee.findMany({ where, orderBy, skip, take, select: LIST_SELECT }),
    prisma.employee.count({ where }),
  ]);
  return { rows, total };
}

export async function countByStatus(where: EmployeeWhere) {
  return getPrisma().employee.groupBy({
    by: ["employmentStatusId", "isActive"],
    where,
    _count: { _all: true },
    orderBy: { employmentStatusId: "asc" },
  });
}

export async function findEmployee(id: string, tx: EmployeeTx = getPrisma()) {
  return tx.employee.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      emergencyPhone: true,
      emergencyContactName: true,
      emergencyContactRelationship: true,
      onboardingStatus: true,
    },
  });
}

export async function findEmployeeParts(id: string, include: { personal: boolean; bank: boolean }) {
  const prisma = getPrisma();
  // Bagian sensitif hanya di-query bila boleh (tidak dibaca lalu dibuang).
  const [educations, trainings, histories, personal, familyMembers, bankAccount, workExperiences] =
    await Promise.all([
      prisma.education.findMany({
        where: { employeeId: id },
        select: {
          id: true,
          schoolName: true,
          major: true,
          graduationYear: true,
          level: true,
          // D-059
          entryYear: true,
        },
        orderBy: [{ graduationYear: "desc" }, { createdAt: "desc" }],
      }),
      prisma.training.findMany({
        where: { employeeId: id },
        select: {
          id: true,
          trainingField: true,
          organizer: true,
          duration: true,
          trainingYear: true,
          // D-054 (Arsip 1a)
          type: true,
          startDate: true,
          endDate: true,
          hours: true,
          cost: true,
          // D-059: nomor sertifikat (sertifikasi dari Formulir Data Karyawan).
          certificateNumber: true,
        },
        orderBy: [{ trainingYear: "desc" }, { createdAt: "desc" }],
      }),
      prisma.employmentHistory.findMany({
        where: { employeeId: id },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      include.personal ? prisma.employeePersonal.findUnique({ where: { employeeId: id } }) : null,
      include.personal
        ? prisma.familyMember.findMany({
            where: { employeeId: id },
            select: {
              id: true,
              name: true,
              relationship: true,
              address: true,
              birthDate: true,
              phoneNumber: true,
              // D-059: data keluarga lengkap dari Formulir Data Karyawan.
              gender: true,
              birthPlace: true,
              education: true,
              occupation: true,
              ageAtEntry: true,
              workAddress: true,
              relationDetail: true,
              isDeceased: true,
            },
            orderBy: { createdAt: "asc" },
          })
        : null,
      include.bank
        ? prisma.employeeBankAccount.findUnique({
            where: { employeeId: id },
            select: { bankName: true, accountNumber: true, accountHolder: true },
          })
        : null,
      // D-054 (Arsip 1a): riwayat kerja sebelum bergabung (data kerja, bukan sensitif).
      prisma.workExperience.findMany({
        where: { employeeId: id },
        select: {
          id: true,
          companyName: true,
          position: true,
          startYear: true,
          endYear: true,
          description: true,
        },
        orderBy: [{ startYear: "desc" }, { createdAt: "desc" }],
      }),
    ]);
  return {
    educations,
    trainings,
    histories,
    personal,
    familyMembers,
    bankAccount,
    workExperiences,
  };
}

export async function findManyByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      positionId: true,
      isActive: true,
      onboardingStatus: true,
    },
    orderBy: { fullName: "asc" },
  });
}

export async function setPhotoPath(id: string, photoPath: string | null) {
  return getPrisma().employee.update({ where: { id }, data: { photoPath } });
}

/** Nama & lokasi kerja pegawai milik akun pengubah (riwayat "diubah oleh"). */
export async function findChangerEmployees(ids: string[]) {
  if (ids.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, workLocationId: true },
  });
}

/** Rantai atasan ke atas (untuk mencegah siklus manager_id). */
export async function findManagerId(id: string, tx: EmployeeTx = getPrisma()) {
  const row = await tx.employee.findUnique({ where: { id }, select: { managerId: true } });
  return row?.managerId ?? null;
}

/** Direktori: `companyIds` null = semua PT (D-040). */
export async function listActiveForStructure(companyIds: readonly string[] | null) {
  return getPrisma().employee.findMany({
    where: {
      isActive: true,
      // D-045: calon onboarding belum masuk struktur organisasi.
      onboardingStatus: "APPROVED",
      ...(companyIds === null ? {} : { companyId: { in: [...companyIds] } }),
    },
    select: { id: true, fullName: true, employeeNumber: true, positionId: true, managerId: true },
    orderBy: { fullName: "asc" },
  });
}

/** D-040: PT per karyawan (cakupan akun di iam). */
export async function findCompanyIds(ids: string[]) {
  if (ids.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, companyId: true },
  });
}

/** D-040: id karyawan di perusahaan tertentu (cakupan akun HR di iam). */
export async function findIdsInCompanies(companyIds: string[]) {
  if (companyIds.length === 0) return [];
  const rows = await getPrisma().employee.findMany({
    where: { companyId: { in: companyIds } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/** D-040: PT tempat karyawan terdaftar (untuk cakupan direktori MANAGER/EMPLOYEE). */
export async function findCompanyId(id: string) {
  const row = await getPrisma().employee.findUnique({ where: { id }, select: { companyId: true } });
  return row?.companyId ?? null;
}

/** PT + status onboarding karyawan milik aktor (dimuat setiap request). */
export async function findActorEmployee(id: string) {
  return getPrisma().employee.findUnique({
    where: { id },
    select: {
      companyId: true,
      onboardingStatus: true,
      completionRequired: true,
      completionSubmittedAt: true,
    },
  });
}

export async function createEmployee(tx: EmployeeTx, data: Prisma.EmployeeUncheckedCreateInput) {
  return tx.employee.create({ data, select: { id: true } });
}

export async function updateEmployee(
  tx: EmployeeTx,
  id: string,
  data: Prisma.EmployeeUncheckedUpdateInput,
) {
  return tx.employee.update({ where: { id }, data, select: { id: true } });
}

export async function createHistory(
  tx: EmployeeTx,
  data: Prisma.EmploymentHistoryUncheckedCreateInput,
) {
  return tx.employmentHistory.create({ data, select: { id: true } });
}

export async function countActiveSubordinates(id: string) {
  return getPrisma().employee.count({ where: { managerId: id, isActive: true } });
}

/** Dashboard: baris minimal karyawan dalam cakupan (agregat dihitung di service; skala ribuan baris). */
export async function listForDashboard(where: EmployeeWhere) {
  return getPrisma().employee.findMany({
    where,
    select: {
      isActive: true,
      joinDate: true,
      employmentStatusId: true,
      positionId: true,
      workLocationId: true,
      educations: { select: { level: true } },
    },
  });
}

/**
 * D-065: baris minimal untuk pivot dashboard (agregat di service). Kolom pribadi (`personal`) hanya
 * diambil bila pivot memakai dimensi sensitif dan aktor berhak (dicek service sebelum memanggil).
 */
export async function listForPivot(where: EmployeeWhere, withPersonal: boolean) {
  return getPrisma().employee.findMany({
    where,
    select: {
      isActive: true,
      joinDate: true,
      gender: true,
      companyId: true,
      employmentStatusId: true,
      positionId: true,
      workLocationId: true,
      gradeId: true,
      educations: { select: { level: true } },
      ...(withPersonal
        ? { personal: { select: { birthDate: true, religion: true, maritalStatus: true } } }
        : {}),
    },
  });
}

// ── D-049: dukungan master data untuk modul organization (lewat index.ts, disuntik di app.ts) ──

export type MasterRefKind = "company" | "position" | "status" | "grade" | "location";

const MASTER_REF_COLUMN = {
  company: "companyId",
  position: "positionId",
  status: "employmentStatusId",
  grade: "gradeId",
  location: "workLocationId",
} as const;

/** Jumlah karyawan (aktif & total) per id master data. */
export async function countByMasterRef(kind: MasterRefKind) {
  const column = MASTER_REF_COLUMN[kind];
  const rows = await getPrisma().employee.groupBy({
    by: [column, "isActive", "onboardingStatus"],
    _count: { _all: true },
  });
  const result = new Map<string, { active: number; total: number }>();
  for (const row of rows) {
    const id = (row as Record<string, unknown>)[column];
    if (typeof id !== "string") continue;
    const entry = result.get(id) ?? { active: 0, total: 0 };
    // `total` termasuk calon onboarding (nomor induknya memakai kode PT, D-045); `active` tidak.
    entry.total += row._count._all;
    if (row.isActive && row.onboardingStatus === "APPROVED") entry.active += row._count._all;
    result.set(id, entry);
  }
  return result;
}

/** Pindahkan rujukan karyawan (+ riwayat untuk jabatan/status) dari satu master data ke yang lain. */
export async function reassignMasterRef(
  tx: EmployeeTx,
  kind: Exclude<MasterRefKind, "company">,
  fromId: string,
  toId: string,
) {
  const column = MASTER_REF_COLUMN[kind];
  const employees = await tx.employee.updateMany({
    where: { [column]: fromId },
    data: { [column]: toId },
  });
  let histories = 0;
  if (kind === "position" || kind === "status") {
    const [from, to] =
      kind === "position" ? ["fromPositionId", "toPositionId"] : ["fromStatusId", "toStatusId"];
    histories += (
      await tx.employmentHistory.updateMany({
        where: { [from as string]: fromId },
        data: { [from as string]: toId },
      })
    ).count;
    histories += (
      await tx.employmentHistory.updateMany({
        where: { [to as string]: fromId },
        data: { [to as string]: toId },
      })
    ).count;
  }
  return { employees: employees.count, histories };
}

// ── D-048: lupa password (dipakai iam lewat employeeLoginDirectory) ──────────────────────────

/** Karyawan disetujui berdasarkan nomor induk (tanpa beda huruf besar/kecil). */
export async function findApprovedIdByNumber(employeeNumber: string) {
  const row = await getPrisma().employee.findFirst({
    where: {
      employeeNumber: { equals: employeeNumber, mode: "insensitive" },
      onboardingStatus: "APPROVED",
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function findIdByPersonalEmail(email: string) {
  const row = await getPrisma().employee.findUnique({
    where: { personalEmail: email },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function findPersonalEmail(id: string) {
  const row = await getPrisma().employee.findUnique({
    where: { id },
    select: { personalEmail: true },
  });
  return row?.personalEmail ?? null;
}
