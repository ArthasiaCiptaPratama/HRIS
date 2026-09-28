import { ROLE, type Role } from "@hris/shared";
import type { Me } from "@/features/auth/schemas";

// PROMPT §7: helper akses untuk UI (menu, tombol). BUKAN pengganti cek di API — API tetap sumber kebenaran.
// Aturan mengikuti apps/api/src/modules/iam/iam.policy.ts (PLAN §4.3–§4.4, D-028, D-034).

const isSuperAdmin = (me: Me) => me.role === ROLE.SUPER_ADMIN;
const isHrAdmin = (me: Me) => me.role === ROLE.HR_ADMIN;

export const access = {
  listAccounts: (me: Me) => isSuperAdmin(me) || isHrAdmin(me),
  inviteRoles: (me: Me): readonly Role[] => {
    if (me.isPrimarySuperAdmin) return ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"];
    if (isSuperAdmin(me)) return ["HR_ADMIN", "MANAGER", "EMPLOYEE"];
    return isHrAdmin(me) ? ["EMPLOYEE"] : [];
  },
  changeRole: (me: Me) => isSuperAdmin(me),
  setActive: (me: Me, target: { id: string; role: string; isPrimarySuperAdmin: boolean }) => {
    if (target.id === me.id || target.isPrimarySuperAdmin) return false;
    if (isSuperAdmin(me)) return target.role !== ROLE.SUPER_ADMIN || me.isPrimarySuperAdmin;
    return isHrAdmin(me) && (target.role === ROLE.EMPLOYEE || target.role === ROLE.MANAGER);
  },
  transferPrimary: (me: Me) => me.isPrimarySuperAdmin,
  manageGrants: (me: Me) => isSuperAdmin(me),
  readAuditLogs: (me: Me) => isSuperAdmin(me),

  // Modul employee (apps/api/src/modules/employee/employee.policy.ts, D-035).
  /** Menu Personal Management: SA & HR penuh; MANAGER baca tim (butuh data karyawan). */
  personalMenu: (me: Me) =>
    isSuperAdmin(me) || isHrAdmin(me) || (me.role === ROLE.MANAGER && me.employeeId !== null),
  /** Tambah/ubah, ubah status, aktifkan/nonaktifkan, arsip & laporan. */
  manageEmployees: (me: Me) => isSuperAdmin(me) || isHrAdmin(me),
};
