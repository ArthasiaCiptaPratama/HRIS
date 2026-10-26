import { getPrisma } from "../../src/core/db.ts";

/**
 * Hapus data absen karyawan uji beserta turunannya: approval hari/absen/lembur, usulan lembur, hari absen.
 * Panggil di afterAll sebelum karyawan dihapus (temuan UAT 2026-10-22: lembur & approval yatim tertinggal).
 */
export async function deleteAttendanceData(employeeIds: string[]): Promise<void> {
  const prisma = getPrisma();
  const scope = { employeeId: { in: employeeIds } };
  const [days, overtime] = await Promise.all([
    prisma.attendanceDay.findMany({
      where: scope,
      select: { id: true, punches: { select: { id: true } } },
    }),
    prisma.overtimeRequest.findMany({ where: scope, select: { id: true } }),
  ]);
  const subjects = [
    ...days.flatMap((d) => [d.id, ...d.punches.map((p) => p.id)]),
    ...overtime.map((o) => o.id),
  ];
  await prisma.approvalRequest.deleteMany({ where: { subjectId: { in: subjects } } });
  await prisma.overtimeRequest.deleteMany({ where: scope });
  await prisma.attendanceDay.deleteMany({ where: scope });
}
