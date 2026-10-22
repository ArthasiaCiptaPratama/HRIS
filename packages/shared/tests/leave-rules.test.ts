import { describe, expect, test } from "bun:test";
import {
  isLeaveYearExpired,
  leaveBalanceLastDay,
  leaveCompensation,
  leaveResubmitDeadline,
} from "../src/index.ts";

// TM-D9 (grill pemilik projek 2026-10-21): hangus 31 Desember, ajukan ulang ≤ 6 bulan, uang pengganti.
describe("hangus saldo cuti", () => {
  test("saldo ≥ 2026 hangus 31 Desember tahunnya; saldo lama (2025) 31 Maret berikutnya", () => {
    expect(leaveBalanceLastDay(2026)).toBe("2026-12-31");
    expect(leaveBalanceLastDay(2025)).toBe("2026-03-31");
    expect(isLeaveYearExpired(2026, "2026-12-31")).toBe(false);
    expect(isLeaveYearExpired(2026, "2027-01-01")).toBe(true);
    expect(isLeaveYearExpired(2025, "2026-03-31")).toBe(false);
    expect(isLeaveYearExpired(2025, "2026-04-01")).toBe(true);
  });
});

describe("batas pengajuan ulang 6 bulan", () => {
  test.each([
    ["2026-10-21", "2027-04-21"],
    ["2026-08-31", "2027-02-28"],
    ["2027-08-31", "2028-02-29"],
    ["2026-01-15", "2026-07-15"],
    ["2026-12-31", "2027-06-30"],
  ])("ditolak %s → paling lambat %s", (rejected, deadline) => {
    expect(leaveResubmitDeadline(rejected)).toBe(deadline);
  });
});

describe("uang penggantian hak cuti", () => {
  test("8 hari × 7,2 jt ÷ 21 (5 hari) dan ÷ 25 (6 hari); minus → 0", () => {
    expect(leaveCompensation(8, 5_700_000, 1_500_000, "FIVE_DAY")).toBe(2_742_857);
    expect(leaveCompensation(8, 5_700_000, 1_500_000, "SIX_DAY")).toBe(2_304_000);
    expect(leaveCompensation(-2, 5_700_000, 1_500_000, "SIX_DAY")).toBe(0);
  });
});
