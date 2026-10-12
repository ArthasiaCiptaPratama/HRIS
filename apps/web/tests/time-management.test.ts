import { describe, expect, it } from "vitest";
import type { Me } from "@/features/auth/schemas";
import { tmAccess } from "@/features/time-management/access";
import {
  addDays,
  hhmm,
  parseHhmm,
  workDateLabel,
} from "@/features/time-management/components/display";
import {
  normalizeCode,
  RosterFileError,
  rowsFromGrid,
  toIsoDate,
} from "@/features/time-management/roster-file";

// D-068 import roster (format OD-12 menyusul) & helper tampilan Time Management.

describe("roster-file: bentuk panjang (NIP, Tanggal, Kode)", () => {
  it("membaca baris, menormalkan kode libur, melaporkan tanggal rusak", () => {
    const result = rowsFromGrid(
      [
        ["Roster Oktober"],
        ["NIP", "Nama", "Tanggal", "Kode"],
        ["1001", "Andi", "2026-10-01", "d"],
        ["1001", "Andi", new Date(Date.UTC(2026, 9, 2)), "-"],
        ["1002", "Budi", "02/10/2026", "N"],
        ["1003", "Cici", "31-02-2026", "D"],
        [null, null, null, null],
      ],
      "2026-10",
    );
    expect(result.format).toBe("long");
    expect(result.rows).toEqual([
      { employeeNumber: "1001", date: "2026-10-01", code: "D" },
      { employeeNumber: "1001", date: "2026-10-02", code: "OFF" },
      { employeeNumber: "1002", date: "2026-10-02", code: "N" },
    ]);
    expect(result.problems).toEqual(["Baris 6: tanggal tidak dikenali."]);
  });
});

describe("roster-file: grid bulanan", () => {
  it("header angka 1–31 memakai bulan terpilih; sel kosong dilewati", () => {
    const result = rowsFromGrid(
      [
        ["NIP", "Nama", 1, 2, "3", 31],
        ["1001", "Andi", "D", "D", "", "L"],
        ["1002", "Budi", "N", null, "OFF", "N"],
      ],
      "2026-10",
    );
    expect(result.format).toBe("wide");
    expect(result.rows).toEqual([
      { employeeNumber: "1001", date: "2026-10-01", code: "D" },
      { employeeNumber: "1001", date: "2026-10-02", code: "D" },
      { employeeNumber: "1001", date: "2026-10-31", code: "OFF" },
      { employeeNumber: "1002", date: "2026-10-01", code: "N" },
      { employeeNumber: "1002", date: "2026-10-03", code: "OFF" },
      { employeeNumber: "1002", date: "2026-10-31", code: "N" },
    ]);
  });

  it("tanggal 31 tidak dibuat untuk bulan 30 hari", () => {
    const result = rowsFromGrid(
      [
        ["NIP", 30, 31],
        ["1001", "D", "D"],
      ],
      "2026-11",
    );
    expect(result.rows).toEqual([{ employeeNumber: "1001", date: "2026-11-30", code: "D" }]);
  });

  it("tanpa kolom NIP / tanpa kolom tanggal → pesan jelas", () => {
    expect(() => rowsFromGrid([["Nama", "Kode"]], "2026-10")).toThrow(RosterFileError);
    expect(() =>
      rowsFromGrid(
        [
          ["NIP", "Nama"],
          ["1", "A"],
        ],
        "2026-10",
      ),
    ).toThrow(/kolom tanggal/);
  });

  it("toIsoDate & normalizeCode", () => {
    expect(toIsoDate("2026-1-5")).toBe("2026-01-05");
    expect(toIsoDate("bukan")).toBeNull();
    expect(normalizeCode(" ns ")).toBe("NS");
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode("Libur")).toBe("OFF");
  });
});

describe("helper tampilan", () => {
  it("jam shift & tanggal kerja", () => {
    expect(hhmm(19 * 60)).toBe("19:00");
    expect(hhmm(1440 + 30)).toBe("00:30");
    expect(parseHhmm("7:05")).toBe(425);
    expect(parseHhmm("24:00")).toBeNull();
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(workDateLabel("2026-10-12")).toMatch(/12/);
  });
});

describe("akses UI Time Management", () => {
  const me = (role: Me["role"], employeeId: string | null = "e1") =>
    ({ role, employeeId, grants: [], isPrimarySuperAdmin: false }) as unknown as Me;
  it("absen butuh data karyawan; Data Absen Harian untuk SA/HR/MANAGER", () => {
    expect(tmAccess.punch(me("EMPLOYEE"))).toBe(true);
    expect(tmAccess.punch(me("SUPER_ADMIN", null))).toBe(false);
    expect(tmAccess.reviewDays(me("EMPLOYEE"))).toBe(false);
    expect(tmAccess.reviewDays(me("MANAGER"))).toBe(true);
    expect(tmAccess.reviewDays(me("MANAGER", null))).toBe(false);
    expect(tmAccess.manageRoster(me("HR_ADMIN"))).toBe(true);
    expect(tmAccess.manageRoster(me("MANAGER"))).toBe(false);
    expect(tmAccess.manageSettings(me("HR_ADMIN"))).toBe(false);
  });
});
