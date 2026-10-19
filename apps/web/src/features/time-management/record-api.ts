import { ATTENDANCE_RECORD_OUTCOMES } from "@hris/shared";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";

// TM-D3 — rekam jejak Alpha & koreksi (tidak pernah dihapus).

export const attendanceRecordSchema = z.object({
  employee: z.object({
    id: z.string(),
    fullName: z.string(),
    employeeNumber: z.string().nullable(),
  }),
  today: z.string(),
  summary: z.record(z.enum(ATTENDANCE_RECORD_OUTCOMES), z.number()),
  items: z.array(
    z.object({
      workDate: z.string(),
      shiftCode: z.string().nullable(),
      outcome: z.enum(ATTENDANCE_RECORD_OUTCOMES),
      deadline: z.string(),
      correction: z
        .object({ status: z.string(), reason: z.string(), createdAt: z.string() })
        .nullable(),
    }),
  ),
});
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;

const one = z.object({ data: attendanceRecordSchema });

export const recordKeys = {
  me: ["time-management", "record", "me"] as const,
  employee: (id: string) => ["time-management", "record", "employee", id] as const,
};

export function useMyAttendanceRecord(enabled = true) {
  return useQuery({
    queryKey: recordKeys.me,
    queryFn: ({ signal }) =>
      api("/attendance/record/me", { schema: one, signal }).then((r) => r.data),
    enabled,
  });
}

export function useEmployeeAttendanceRecord(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: recordKeys.employee(employeeId),
    queryFn: ({ signal }) =>
      api(`/attendance/record/employees/${employeeId}`, { schema: one, signal }).then(
        (r) => r.data,
      ),
    enabled,
  });
}
