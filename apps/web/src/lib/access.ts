import { ROLE, type Role } from "@hris/shared";
import type { Me } from "@/features/auth/schemas";

// PROMPT §7: helper akses untuk UI (menu, tombol). BUKAN pengganti cek di API — API tetap sumber kebenaran.
// Aturan mengikuti apps/api/src/modules/iam/iam.policy.ts (PLAN §4.3–§4.4, D-028, D-034).

const isSuperAdmin = (me: Me) => me.role === ROLE.SUPER_ADMIN;
const isHrAdmin = (me: Me) => me.role === ROLE.HR_ADMIN;

export const access = {
  /** IAM-D1: HR Kepegawaian — hanya melihat data kerja karyawan (tanpa arsip, dokumen, aksi, modul lain). */
  employmentOnly: (me: Me) => me.role === ROLE.HR_PERSONNEL,
  listAccounts: (me: Me) => isSuperAdmin(me) || isHrAdmin(me),
  inviteRoles: (me: Me): readonly Role[] => {
    if (me.isPrimarySuperAdmin)
      return ["SUPER_ADMIN", "HR_ADMIN", "HR_PERSONNEL", "MANAGER", "EMPLOYEE"];
    if (isSuperAdmin(me)) return ["HR_ADMIN", "HR_PERSONNEL", "MANAGER", "EMPLOYEE"];
    return isHrAdmin(me) ? ["EMPLOYEE"] : [];
  },
  changeRole: (me: Me) => isSuperAdmin(me),
  // D-040: penugasan perusahaan akun HR_ADMIN hanya oleh SUPER_ADMIN.
  assignCompanies: (me: Me) => isSuperAdmin(me),
  setActive: (me: Me, target: { id: string; role: string; isPrimarySuperAdmin: boolean }) => {
    if (target.id === me.id || target.isPrimarySuperAdmin) return false;
    if (isSuperAdmin(me)) return target.role !== ROLE.SUPER_ADMIN || me.isPrimarySuperAdmin;
    return isHrAdmin(me) && (target.role === ROLE.EMPLOYEE || target.role === ROLE.MANAGER);
  },
  transferPrimary: (me: Me) => me.isPrimarySuperAdmin,
  manageGrants: (me: Me) => isSuperAdmin(me),
  readAuditLogs: (me: Me) => isSuperAdmin(me),
  // D-049 (modules/organization/organization.policy.ts): SA kelola, HR lihat.
  viewMasterData: (me: Me) => isSuperAdmin(me) || isHrAdmin(me),
  manageMasterData: (me: Me) => isSuperAdmin(me),
  // D-045 (employee.policy canRunOnboarding): penerimaan karyawan baru — SA & HR (PT ditugaskan).
  runOnboarding: (me: Me) => isSuperAdmin(me) || isHrAdmin(me),
  // D-047 (employee.policy canReviewOnboarding): SA, atau HR dengan grant review (cakupan PT di API).
  reviewOnboarding: (me: Me) =>
    isSuperAdmin(me) ||
    (isHrAdmin(me) && me.grants.some((g) => g.permission === "employee.onboarding.review")),

  // D-054 / OD-6 (employee.policy canViewDataChangeQueue): antrean pengajuan perubahan data.
  reviewDataChanges: (me: Me) =>
    isSuperAdmin(me) ||
    (isHrAdmin(me) && me.grants.some((g) => g.permission === "employee.changes.review")),
  // Arsip sensitif (seesFamilyArchive / seesBankArchive): SA atau pemegang grant baca.
  readFamilyArchive: (me: Me) =>
    isSuperAdmin(me) || me.grants.some((g) => g.permission === "employee.personal.read"),
  readBankArchive: (me: Me) =>
    isSuperAdmin(me) || me.grants.some((g) => g.permission === "employee.bank.read"),

  // Modul employee (apps/api/src/modules/employee/employee.policy.ts, D-035).
  /** Menu Personal Management: SA & HR penuh; MANAGER baca tim (butuh data karyawan). */
  personalMenu: (me: Me) =>
    isSuperAdmin(me) ||
    isHrAdmin(me) ||
    me.role === ROLE.HR_PERSONNEL ||
    (me.role === ROLE.MANAGER && me.employeeId !== null),
  /** Menu Arsip (tabel lintas karyawan): bukan untuk HR Kepegawaian (IAM-D1). */
  readArchive: (me: Me) =>
    isSuperAdmin(me) || isHrAdmin(me) || (me.role === ROLE.MANAGER && me.employeeId !== null),
  /** Data Karyawan Tidak Aktif: pengelola (SA/HR) & HR Kepegawaian (lihat saja). */
  viewInactiveEmployees: (me: Me) =>
    isSuperAdmin(me) || isHrAdmin(me) || me.role === ROLE.HR_PERSONNEL,
  /** Tambah/ubah, ubah status, aktifkan/nonaktifkan, arsip & laporan. */
  manageEmployees: (me: Me) => isSuperAdmin(me) || isHrAdmin(me),
  /** EMP-D2 (employee.policy canWriteSensitiveOnCreate): isi data pribadi/keluarga & rekening saat tambah. */
  writePersonalOnCreate: (me: Me) =>
    isSuperAdmin(me) ||
    (isHrAdmin(me) && me.grants.some((g) => g.permission === "employee.personal.write")),
  writeBankOnCreate: (me: Me) =>
    isSuperAdmin(me) ||
    (isHrAdmin(me) && me.grants.some((g) => g.permission === "employee.bank.write")),

  // ARS-D3 (apps/api/src/modules/asset/asset.policy.ts): aset & APD.
  /** Lihat Arsip › Data Assets: SA, HR (PT sendiri), MANAGER (aset tim). */
  viewAssets: (me: Me) =>
    isSuperAdmin(me) || isHrAdmin(me) || (me.role === ROLE.MANAGER && me.employeeId !== null),
  /** Kelola aset/APD & master kategori/jenis APD: SA atau HR ber-grant `asset.manage` (PT dicek API). */
  manageAssets: (me: Me) =>
    isSuperAdmin(me) || (isHrAdmin(me) && me.grants.some((g) => g.permission === "asset.manage")),

  // ARS-D10/ARS-D13 (apps/api/src/modules/discipline/discipline.policy.ts): surat peringatan.
  /** Lihat Arsip › Riwayat Peringatan: SA, HR ber-grant SP (read/write), MANAGER (SP tim). */
  viewWarningLetters: (me: Me) =>
    isSuperAdmin(me) ||
    (isHrAdmin(me) &&
      me.grants.some(
        (g) =>
          g.permission === "employee.discipline.read" ||
          g.permission === "employee.discipline.write",
      )) ||
    (me.role === ROLE.MANAGER && me.employeeId !== null),
  /** Buat/terbitkan/cabut SP & kelola jenis pelanggaran: SA atau HR ber-grant write (PT dicek API). */
  manageWarningLetters: (me: Me) =>
    isSuperAdmin(me) ||
    (isHrAdmin(me) && me.grants.some((g) => g.permission === "employee.discipline.write")),
  /** Master jenis pelanggaran & pengaturan masa berlaku (baca): SA, HR ber-grant SP. */
  viewDisciplineMasters: (me: Me) =>
    isSuperAdmin(me) ||
    (isHrAdmin(me) &&
      me.grants.some(
        (g) =>
          g.permission === "employee.discipline.read" ||
          g.permission === "employee.discipline.write",
      )),
  // TM-D6 (apps/api/src/modules/attendance/overtime.policy.ts): rupiah per orang & tabel upah grade.
  /** Lihat biaya tenaga kerja: SA atau HR ber-grant `labor.cost.read`. */
  viewLaborCost: (me: Me) =>
    isSuperAdmin(me) ||
    (isHrAdmin(me) && me.grants.some((g) => g.permission === "labor.cost.read")),
  // ARS-D16 (apps/api/src/modules/report/report.policy.ts): menu Laporan untuk SA & HR (PT di API).
  viewReports: (me: Me) => isSuperAdmin(me) || isHrAdmin(me),
};
