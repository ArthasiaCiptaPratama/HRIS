import { describe, expect, test } from "bun:test";
import { attendanceLocationInputSchema } from "../src/index.ts";

// TM-D1 — input lokasi absen per karyawan.
const ID = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";

describe("attendanceLocationInputSchema", () => {
  test("mode lokasi khusus wajib membawa lokasi", () => {
    expect(
      attendanceLocationInputSchema.safeParse({ employeeIds: [ID], mode: "LOCATION" }).success,
    ).toBe(false);
    expect(
      attendanceLocationInputSchema.safeParse({
        employeeIds: [ID],
        mode: "LOCATION",
        workLocationId: LOC,
      }).success,
    ).toBe(true);
  });

  test("bawaan & bebas lokasi tidak boleh membawa lokasi", () => {
    for (const mode of ["DEFAULT", "ANYWHERE"]) {
      expect(attendanceLocationInputSchema.safeParse({ employeeIds: [ID], mode }).success).toBe(
        true,
      );
      expect(
        attendanceLocationInputSchema.safeParse({ employeeIds: [ID], mode, workLocationId: LOC })
          .success,
      ).toBe(false);
    }
  });

  test("minimal 1 karyawan, maksimal 500; mode tak dikenal ditolak", () => {
    expect(
      attendanceLocationInputSchema.safeParse({ employeeIds: [], mode: "ANYWHERE" }).success,
    ).toBe(false);
    expect(
      attendanceLocationInputSchema.safeParse({
        employeeIds: Array.from({ length: 501 }, () => ID),
        mode: "ANYWHERE",
      }).success,
    ).toBe(false);
    expect(attendanceLocationInputSchema.safeParse({ employeeIds: [ID], mode: "X" }).success).toBe(
      false,
    );
  });
});
