import { permissionSchema, roleSchema } from "@hris/shared";
import { z } from "zod";

// Subset respons GET /api/v1/me yang dipakai web (sumber kebenaran tetap API).
export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
  isPrimarySuperAdmin: z.boolean(),
  employeeId: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  grants: z.array(z.object({ permission: permissionSchema, expiresAt: z.string().nullable() })),
  // D-045 b: status onboarding (locked = calon belum disetujui → hanya wizard).
  onboarding: z
    .object({
      status: z.string(),
      completionRequired: z.boolean(),
      submitted: z.boolean(),
      locked: z.boolean(),
    })
    .nullable()
    .optional(),
});
export type Me = z.infer<typeof meSchema>;

export const meResponseSchema = z.object({ data: meSchema });

// D-048: satu kolom "NIK atau email" (dipetakan ke email Supabase di halaman login).
export const loginFormSchema = z.object({
  identifier: z.string().trim().min(1, "Isi NIK atau email."),
  password: z.string().min(1, "Password wajib diisi."),
});
export type LoginForm = z.infer<typeof loginFormSchema>;

export const forgotPasswordFormSchema = z.object({
  identifier: z.string().trim().min(1, "Isi NIK atau email.").max(254),
});
export type ForgotPasswordForm = z.infer<typeof forgotPasswordFormSchema>;

// Minimal 12 karakter, sama dengan script bootstrap (PLAN §4.4).
export const setPasswordFormSchema = z
  .object({
    password: z.string().min(12, "Password minimal 12 karakter."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Konfirmasi password tidak sama.",
  });
export type SetPasswordForm = z.infer<typeof setPasswordFormSchema>;
