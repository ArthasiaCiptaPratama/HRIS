import { ROLE } from "@hris/shared";
import { tmOn } from "@/app/feature-flags";
import type { Me } from "@/features/auth/schemas";

// Helper akses UI Time Management (cermin apps/api/src/modules/attendance/attendance.policy.ts &
// approval.policy.ts). BUKAN pengganti cek di API — API tetap sumber kebenaran (cakupan PT, tim).
// Disimpan di fitur ini supaya lib/access.ts bersama tidak diubah.

const isSa = (me: Me) => me.role === ROLE.SUPER_ADMIN;
const isHr = (me: Me) => me.role === ROLE.HR_ADMIN;
const isManager = (me: Me) => me.role === ROLE.MANAGER && me.employeeId !== null;
/**
 * ORG-D9 (cermin `isApprover` API): pemutus langkah "Atasan" = MANAGER ber-karyawan atau akun role apa pun
 * yang punya bawahan langsung aktif (`me.isSupervisor`). Hanya antrean "perlu keputusan" & SPL bawahan
 * langsung — daftar/rekap tim tetap khusus MANAGER.
 */
const isApprover = (me: Me) =>
  me.employeeId !== null && (isManager(me) || me.isSupervisor === true);

export const tmAccess = {
  /** Absen PWA: akun yang terhubung ke data karyawan (D-067). */
  punch: (me: Me) => me.employeeId !== null,
  /**
   * #102 (TM-D26): akun EMPLOYEE yang tertaut karyawan memakai halaman absen sebagai beranda —
   * "/" dialihkan ke /absen dan menu web Dashboard/Time Management diganti satu tab "Absen".
   * MANAGER/HR/SA (walau punya data karyawan) tetap memakai dashboard.
   */
  absenHome: (me: Me) => tmOn("tmAbsen") && me.role === ROLE.EMPLOYEE && me.employeeId !== null,
  /** ORG-D9: antrean "perlu keputusan" (absen, cuti/izin, koreksi, Approval HP): SA, HR, atasan. */
  approvalInbox: (me: Me) => isSa(me) || isHr(me) || isApprover(me),
  /** TM-D13 Fase B: verifikasi Alpha bawahan langsung (atasan role apa pun, ORG-D9), SA, HR PT. */
  verifyAlpha: (me: Me) => isSa(me) || isHr(me) || isApprover(me),
  /** Data Absen Harian & inbox keputusan (D-068): SA, HR (PT ditugaskan), MANAGER (tim). */
  reviewDays: (me: Me) => isSa(me) || isHr(me) || isManager(me),
  /** Grid roster: semua yang punya data karyawan + SA/HR. */
  viewRoster: (me: Me) => isSa(me) || isHr(me) || me.employeeId !== null,
  /** Kelola shift, pola, crew, sel grid, import (D-069): SA; HR PT ditugaskan. */
  manageRoster: (me: Me) => isSa(me) || isHr(me),
  /** TM-D1: lokasi absen per karyawan (bawaan / khusus / bebas lokasi): SA; HR PT ditugaskan. */
  manageAttendanceLocations: (me: Me) => isSa(me) || isHr(me),
  /** Pengajuan perubahan / tukar shift: karyawan & atasan; HR/SA memutuskan dari inbox. */
  rosterChanges: (me: Me) => me.employeeId !== null || isSa(me) || isHr(me),
  /** Inbox keputusan perubahan roster (atasan role apa pun, ORG-D9). */
  decideRosterChanges: (me: Me) => isSa(me) || isHr(me) || isApprover(me),
  /** Kalender libur: semua melihat; SA kelola. */
  manageHolidays: (me: Me) => isSa(me),
  /** Pengaturan Time Management: SA ubah; HR lihat. */
  viewSettings: (me: Me) => isSa(me) || isHr(me),
  manageSettings: (me: Me) => isSa(me),
  /** Cuti/izin/sakit (D-072): ajukan untuk diri sendiri. */
  requestLeave: (me: Me) => me.employeeId !== null,
  /** Persetujuan cuti/izin/sakit: SA, HR (PT), MANAGER (tim). */
  decideLeave: (me: Me) => isSa(me) || isHr(me) || isManager(me),
  /** Saldo cuti per PT, penyesuaian & import: SA; HR PT ditugaskan. */
  manageLeaveBalances: (me: Me) => isSa(me) || isHr(me),
  /** Master Cuti & jenis: SA kelola; SA, HR, MANAGER melihat — karyawan biasa tidak (2026-10-19). */
  manageLeaveMaster: (me: Me) => isSa(me),
  viewLeaveMaster: (me: Me) => isSa(me) || isHr(me) || isManager(me),
  /** Koreksi & surat pernyataan (D-071): karyawan sendiri; pemutus koreksi (SA/HR/MANAGER). */
  correctionsStatements: (me: Me) => me.employeeId !== null || isSa(me) || isHr(me),
  /** Rekap bulanan & daftar Alpha: SA, HR (PT), MANAGER (tim). Tutup periode dicek API (grant). */
  viewRecap: (me: Me) => isSa(me) || isHr(me) || isManager(me),
  /** TM-D6 lembur: karyawan melihat miliknya; SA/HR/MANAGER memutuskan & merekap. */
  overtime: (me: Me) => me.employeeId !== null || isSa(me) || isHr(me),
  decideOvertime: (me: Me) => isSa(me) || isHr(me) || isManager(me),
  /** ORG-D9: tab "Perlu keputusan" lembur & buat SPL untuk bawahan langsung — atasan role apa pun. */
  overtimeInbox: (me: Me) => isSa(me) || isHr(me) || isApprover(me),
  /** TM-D17 susulan (Q1 opsi B): SPL tanggal lampau hanya HR PT & SA. */
  orderOvertimeRetroactive: (me: Me) => isSa(me) || isHr(me),
  /** Upah grade: SA ubah; HR ber-grant `labor.cost.read` lihat (cermin canSeeLaborCost). */
  viewGradeWages: (me: Me) =>
    isSa(me) || (isHr(me) && me.grants.some((g) => g.permission === "labor.cost.read")),
  manageGradeWages: (me: Me) => isSa(me),
};
