import { describe, expect, test } from "bun:test";
import { type Actor, isApprover } from "../src/core/access/index.ts";
import { stepRight } from "../src/modules/approval/approval.policy.ts";
import {
  canListAttendanceDays,
  canListAttendanceInbox,
  canOrderOvertime,
  canSeeTeamCostTotal,
  canVerifyAlpha,
  canViewAlphaVerifications,
  canViewEmployeeRoster,
} from "../src/modules/attendance/attendance.policy.ts";
import { canViewEmployeeLeave } from "../src/modules/leave/leave.policy.ts";

// ORG-D9: atasan = pemegang pos tepat di atasnya, apa pun role akunnya. Akun EMPLOYEE yang punya bawahan
// langsung (`isSupervisor`) memutuskan langkah "Atasan" untuk bawahan langsungnya saja; hak tim MANAGER
// lain (daftar/rekap/biaya tim) tidak ikut terbuka.

const actor = (over: Partial<Actor>): Actor => ({
  accountId: "acc-boss",
  authUserId: "auth-boss",
  email: "boss@example.test",
  role: "EMPLOYEE",
  employeeId: "boss",
  isPrimarySuperAdmin: false,
  grants: new Set(),
  companyIds: new Set(["co"]),
  ...over,
});

const supervisor = actor({ isSupervisor: true });
const plainEmployee = actor({ isSupervisor: false });
const direct = { employeeId: "sub", companyId: "co", managerId: "boss" };
const other = { employeeId: "x", companyId: "co", managerId: "someone-else" };

describe("isApprover (ORG-D9)", () => {
  test("EMPLOYEE dengan bawahan langsung = pemutus; tanpa bawahan / tanpa karyawan tidak", () => {
    expect(isApprover(supervisor)).toBe(true);
    expect(isApprover(plainEmployee)).toBe(false);
    expect(isApprover(actor({ isSupervisor: true, employeeId: null }))).toBe(false);
    expect(isApprover(actor({ role: "MANAGER" }))).toBe(true);
  });
});

describe("hak atasan ber-akun EMPLOYEE", () => {
  test("antrean keputusan terbuka: Alpha & inbox absen", () => {
    expect(canViewAlphaVerifications(supervisor)).toBe(true);
    expect(canListAttendanceInbox(supervisor)).toBe(true);
    expect(canViewAlphaVerifications(plainEmployee)).toBe(false);
    expect(canListAttendanceInbox(plainEmployee)).toBe(false);
  });

  test("bawahan langsung saja: lihat roster/cuti, verifikasi Alpha, SPL, langkah Atasan", () => {
    expect(canViewEmployeeRoster(supervisor, direct)).toBe(true);
    expect(canViewEmployeeRoster(supervisor, other)).toBe(false);
    expect(canViewEmployeeLeave(supervisor, direct)).toBe(true);
    expect(canViewEmployeeLeave(supervisor, other)).toBe(false);
    expect(canVerifyAlpha(supervisor, { ...direct, managerEmployeeId: "boss" })).toBe(true);
    expect(canVerifyAlpha(supervisor, { ...other, managerEmployeeId: "someone-else" })).toBe(false);
    expect(canOrderOvertime(supervisor, direct)).toBe(true);
    expect(canOrderOvertime(supervisor, other)).toBe(false);
    const approval = { requesterEmployeeId: "sub", companyId: "co", managerEmployeeId: "boss" };
    expect(stepRight(supervisor, approval, "MANAGER")).toBe("regular");
    expect(stepRight(supervisor, approval, "HR")).toBeNull();
    expect(
      stepRight(supervisor, { ...approval, managerEmployeeId: "someone-else" }, "MANAGER"),
    ).toBe(null);
  });

  test("hak tim MANAGER lain tetap tertutup (Data Absen Harian semua, total biaya tim)", () => {
    expect(canListAttendanceDays(supervisor)).toBe(false);
    expect(canSeeTeamCostTotal(supervisor)).toBe(false);
  });
});
