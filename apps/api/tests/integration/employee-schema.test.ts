import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { disconnectPrisma, getPrisma } from "../../src/core/db.ts";

// Constraint skema ERD employee management (D-026) di PostgreSQL lokal. Data dibersihkan sendiri.
const prisma = getPrisma();
const RUN = crypto.randomUUID().slice(0, 8);
// PrismaPromise bukan Promise biasa; dibungkus supaya `expect(...).rejects` bekerja.
function attempt<T>(run: () => PromiseLike<T>): Promise<T> {
  return (async () => run())();
}

const ids = { departmentId: "", positionId: "", statusId: "", gradeId: "", locationId: "" };

async function createEmployee(suffix: string, extra: { managerId?: string } = {}) {
  return prisma.employee.create({
    data: {
      employeeNumber: `T-${RUN}-${suffix}`,
      fullName: `Uji ${suffix}`,
      joinDate: new Date("2026-01-05"),
      employmentStatusId: ids.statusId,
      positionId: ids.positionId,
      gradeId: ids.gradeId,
      workLocationId: ids.locationId,
      ...extra,
    },
  });
}

beforeAll(async () => {
  const department = await prisma.department.create({ data: { name: `Dept ${RUN}` } });
  const position = await prisma.position.create({
    data: { name: "Staf", departmentId: department.id },
  });
  const status = await prisma.employmentStatus.create({ data: { name: `Tetap ${RUN}` } });
  const grade = await prisma.grade.create({ data: { name: `G1 ${RUN}` } });
  const location = await prisma.workLocation.create({
    data: { name: `Kantor ${RUN}`, city: "Jakarta" },
  });
  Object.assign(ids, {
    departmentId: department.id,
    positionId: position.id,
    statusId: status.id,
    gradeId: grade.id,
    locationId: location.id,
  });
});

afterAll(async () => {
  const prefix = `T-${RUN}-`;
  await prisma.employee.updateMany({
    where: { employeeNumber: { startsWith: prefix } },
    data: { managerId: null },
  });
  await prisma.employee.deleteMany({ where: { employeeNumber: { startsWith: prefix } } });
  await prisma.position.deleteMany({ where: { departmentId: ids.departmentId } });
  await prisma.department.deleteMany({ where: { id: ids.departmentId } });
  await prisma.employmentStatus.deleteMany({ where: { id: ids.statusId } });
  await prisma.grade.deleteMany({ where: { id: ids.gradeId } });
  await prisma.workLocation.deleteMany({ where: { id: ids.locationId } });
  await disconnectPrisma();
});

describe("skema employee management (ERD)", () => {
  test("employee_number unik", async () => {
    await createEmployee("dup");
    await expect(attempt(() => createEmployee("dup"))).rejects.toMatchObject({ code: "P2002" });
  });

  test("id berupa UUID dan tanggal masuk bertipe date", async () => {
    const employee = await createEmployee("uuid");
    expect(employee.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(employee.joinDate.toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  test("data sensitif 1:1 terpisah dan ikut terhapus bersama karyawan (cascade)", async () => {
    const employee = await createEmployee("sens");
    await prisma.employeePersonal.create({
      data: { employeeId: employee.id, ktpNumber: `32${RUN}000000`.slice(0, 16) },
    });
    await prisma.employeeBankAccount.create({
      data: { employeeId: employee.id, bankName: "BCA", accountNumber: "0000000000" },
    });
    await prisma.employee.delete({ where: { id: employee.id } });
    expect(
      await prisma.employeePersonal.findUnique({ where: { employeeId: employee.id } }),
    ).toBeNull();
    expect(
      await prisma.employeeBankAccount.findUnique({ where: { employeeId: employee.id } }),
    ).toBeNull();
  });

  test("keluarga, pendidikan, pelatihan terhubung ke karyawan", async () => {
    const employee = await createEmployee("rel");
    await prisma.familyMember.create({
      data: { employeeId: employee.id, name: "Pasangan", relationship: "SPOUSE" },
    });
    await prisma.education.create({
      data: { employeeId: employee.id, schoolName: "Universitas Contoh", graduationYear: 2020 },
    });
    await prisma.training.create({
      data: { employeeId: employee.id, trainingField: "K3", trainingYear: 2025 },
    });
    expect(await prisma.familyMember.count({ where: { employeeId: employee.id } })).toBe(1);
    expect(await prisma.education.count({ where: { employeeId: employee.id } })).toBe(1);
    expect(await prisma.training.count({ where: { employeeId: employee.id } })).toBe(1);
  });

  test("atasan (manager_id) menunjuk karyawan lain", async () => {
    const manager = await createEmployee("mgr");
    const staff = await createEmployee("stf", { managerId: manager.id });
    expect(staff.managerId).toBe(manager.id);
  });

  test("master data yang masih dipakai karyawan tidak bisa dihapus (restrict)", async () => {
    await createEmployee("restrict");
    await expect(
      attempt(() => prisma.position.delete({ where: { id: ids.positionId } })),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      attempt(() => prisma.employmentStatus.delete({ where: { id: ids.statusId } })),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
