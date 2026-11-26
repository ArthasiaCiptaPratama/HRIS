import { z } from "@hono/zod-openapi";
import { PAGE_SIZE_MAX, paginationMetaSchema } from "@hris/shared";
import { assertExact, nullableRef } from "../../core/contract.ts";
import type { AttendancePeoplePage, AttendancePerson } from "./attendance-people.service.ts";

// TM-D33: Data Absen Harian tampilan "Per karyawan" (web saja; bukan bagian APP_OPERATION_IDS).

/** Bawaan 24 kartu per halaman (pas untuk grid 2/3/4 kolom). */
export const ATTENDANCE_PEOPLE_PAGE_SIZE_DEFAULT = 24;

export const attendancePeopleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGE_SIZE_MAX)
    .default(ATTENDANCE_PEOPLE_PAGE_SIZE_DEFAULT),
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .openapi({ description: "Cari nama atau NIP karyawan (tidak peka huruf besar/kecil)" }),
  companyId: z.uuid().optional(),
});

const attendancePersonStatusSchema = z
  .enum(["OPEN", "PENDING", "APPROVED", "REJECTED", "ALPHA", "LEAVE"])
  .openapi("AttendancePersonDayStatus");

const attendancePersonRefSchema = z
  .object({ id: z.uuid(), name: z.string() })
  .openapi("AttendancePersonRef");

export const attendancePersonSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    employeeNumber: z.string().nullable().openapi({ description: "NIP" }),
    position: z.string().nullable().openapi({ description: "Jabatan saat ini" }),
    division: z.string().nullable().openapi({ description: "Divisi saat ini" }),
    company: nullableRef(attendancePersonRefSchema).openapi({ description: "PT saat ini" }),
    crew: nullableRef(attendancePersonRefSchema).openapi({
      description: "Crew pada hari ini (zona waktu Time Management)",
    }),
    isActive: z.boolean(),
    firstWorkDate: z.iso
      .date()
      .openapi({ description: "Tanggal kerja pertama yang punya absen (tanggal lokal)" }),
    lastWorkDate: z.iso
      .date()
      .openapi({ description: "Tanggal kerja terakhir yang punya absen (tanggal lokal)" }),
    lastPunchAt: z.iso
      .datetime()
      .nullable()
      .openapi({ description: "Jam absen terbaru pada lastWorkDate (ISO 8601)" }),
    todayStatus: nullableRef(attendancePersonStatusSchema).openapi({
      description: "Status hari absen hari ini (zona waktu Time Management); null = belum ada",
    }),
    photoUrl: z.string().nullable().openapi({
      description:
        "Foto profil Personnel Management (URL bertanda tangan ±10 menit) bila ada & boleh dilihat aktor",
    }),
  })
  .openapi("AttendancePerson");

export const attendancePeoplePageSchema = z
  .object({ data: z.array(attendancePersonSchema), meta: paginationMetaSchema })
  .openapi("AttendancePersonList");

assertExact<z.infer<typeof attendancePersonSchema>, AttendancePerson>(true);
assertExact<z.infer<typeof attendancePeoplePageSchema>, AttendancePeoplePage>(true);
