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
  await prisma.overtimeOrder.deleteMany({ where: scope });
  await prisma.overtimeClaim.deleteMany({ where: scope });
  await prisma.attendanceDay.deleteMany({ where: scope });
}

/**
 * Ubah sebagian pengaturan absen (kunci `attendance`) untuk satu file test; kembalikan dengan fungsi hasil.
 * Dipakai test perilaku lama (D-070/TM-D17) supaya tetap menguji aturan saat TM-D26 dimatikan.
 */
export async function patchAttendanceSettings(
  patch: Record<string, unknown>,
): Promise<() => Promise<void>> {
  const prisma = getPrisma();
  const row = await prisma.timeSetting.findUnique({ where: { key: "attendance" } });
  const before = (row?.value as Record<string, unknown> | null) ?? null;
  const value = { ...(before ?? {}), ...patch };
  await prisma.timeSetting.upsert({
    where: { key: "attendance" },
    create: { key: "attendance", value: value as never },
    update: { value: value as never },
  });
  return async () => {
    if (before === null) await prisma.timeSetting.deleteMany({ where: { key: "attendance" } });
    else {
      await prisma.timeSetting.update({
        where: { key: "attendance" },
        data: { value: before as never },
      });
    }
  };
}
