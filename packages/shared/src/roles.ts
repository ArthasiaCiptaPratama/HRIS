import { z } from "zod";

// PLAN §4.1: role tetap di kode; SUPER_ADMIN hanya memberi/mencabut, tidak membuat role baru.
// HR_PERSONNEL (IAM-D1): HR kepegawaian — hanya melihat data kerja karyawan di PT yang ditugaskan.
export const ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_PERSONNEL", "MANAGER", "EMPLOYEE"] as const;

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ROLE = roleSchema.enum;

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  HR_PERSONNEL: "HR Kepegawaian",
  MANAGER: "Manager",
  EMPLOYEE: "Karyawan",
};

/** D-040 + IAM-D1: role yang cakupan PT-nya dari penugasan (iam.account_companies). */
export const COMPANY_ASSIGNED_ROLES: readonly Role[] = [ROLE.HR_ADMIN, ROLE.HR_PERSONNEL];
export const usesAssignedCompanies = (role: Role) => COMPANY_ASSIGNED_ROLES.includes(role);
