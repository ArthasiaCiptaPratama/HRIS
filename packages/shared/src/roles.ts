import { z } from "zod";

// PLAN §4.1: role tetap di kode; SUPER_ADMIN hanya memberi/mencabut, tidak membuat role baru.
export const ROLES = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] as const;

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ROLE = roleSchema.enum;

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Karyawan",
};
