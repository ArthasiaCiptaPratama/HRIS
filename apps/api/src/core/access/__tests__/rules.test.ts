import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import {
  type Actor,
  hasPermission,
  hasRole,
  isGrantActive,
  isInCompanyScope,
  isInTeam,
  isSelf,
} from "../rules.ts";

const NOW = new Date("2026-09-28T08:00:00Z");

function actor(role: Role, grants: Permission[] = []): Actor {
  return {
    accountId: "a-1",
    authUserId: "u-1",
    email: "x@example.test",
    role,
    employeeId: null,
    isPrimarySuperAdmin: false,
    grants: new Set(grants),
    companyIds: null,
  };
}

// PLAN §4.2: grant hanya berlaku untuk role yang boleh menerimanya; SUPER_ADMIN punya semua.
describe("hasPermission (PLAN §4.2)", () => {
  test.each([
    ["SUPER_ADMIN", [], "employee.personal.read", true],
    ["SUPER_ADMIN", [], "payroll.period.prepare", true],
    ["HR_ADMIN", [], "employee.personal.read", false],
    ["HR_ADMIN", ["employee.personal.read"], "employee.personal.read", true],
    ["HR_ADMIN", ["employee.personal.read"], "employee.bank.read", false],
    ["HR_ADMIN", ["payroll.period.prepare"], "payroll.period.prepare", true],
    ["MANAGER", ["employee.bank.read"], "employee.bank.read", true],
    // Grant tersisa setelah role diganti tidak boleh berlaku.
    ["MANAGER", ["contract.manage"], "contract.manage", false],
    ["EMPLOYEE", ["employee.personal.read"], "employee.personal.read", false],
  ] as const)("%s + %p → %s = %p", (role, grants, permission, expected) => {
    expect(hasPermission(actor(role, [...grants]), permission)).toBe(expected);
  });
});

describe("hasRole", () => {
  test("satu akun satu role (D-028)", () => {
    expect(hasRole(actor("HR_ADMIN"), ["HR_ADMIN", "SUPER_ADMIN"])).toBe(true);
    expect(hasRole(actor("MANAGER"), ["HR_ADMIN", "SUPER_ADMIN"])).toBe(false);
  });
});

describe("isGrantActive (PLAN §4.2: kedaluwarsa & pencabutan langsung berlaku)", () => {
  test.each([
    ["tanpa kedaluwarsa, belum dicabut", { expiresAt: null, revokedAt: null }, true],
    ["kedaluwarsa besok", { expiresAt: new Date("2026-09-29T00:00:00Z"), revokedAt: null }, true],
    ["kedaluwarsa tepat sekarang", { expiresAt: NOW, revokedAt: null }, false],
    ["sudah kedaluwarsa", { expiresAt: new Date("2026-09-01T00:00:00Z"), revokedAt: null }, false],
    ["dicabut", { expiresAt: null, revokedAt: new Date("2026-09-27T00:00:00Z") }, false],
  ] as const)("%s → %p", (_label, grant, expected) => {
    expect(isGrantActive(grant, NOW)).toBe(expected);
  });
});

// PLAN §4.1 / D-009: tim MANAGER = karyawan yang manager_id-nya menunjuk ke dia (satu tingkat).
describe("isSelf & isInTeam", () => {
  const manager = { ...actor("MANAGER"), employeeId: "emp-mgr" };
  const noEmployee = actor("SUPER_ADMIN");

  test.each([
    [
      "bawahan langsung",
      { employeeId: "emp-1", managerId: "emp-mgr", companyId: "co-A" },
      false,
      true,
    ],
    [
      "bukan bawahan",
      { employeeId: "emp-2", managerId: "emp-lain", companyId: "co-A" },
      false,
      false,
    ],
    ["tanpa atasan", { employeeId: "emp-3", managerId: null, companyId: "co-A" }, false, false],
    [
      "dirinya sendiri",
      { employeeId: "emp-mgr", managerId: "emp-atas", companyId: "co-A" },
      true,
      false,
    ],
  ] as const)("%s → self=%p, tim=%p", (_label, target, self, team) => {
    expect(isSelf(manager, target)).toBe(self);
    expect(isInTeam(manager, target)).toBe(team);
  });

  test("akun tanpa data karyawan tidak punya diri/tim", () => {
    expect(isSelf(noEmployee, { employeeId: "emp-1", managerId: null, companyId: "co-A" })).toBe(
      false,
    );
    expect(isInTeam(noEmployee, { employeeId: "emp-1", managerId: null, companyId: "co-A" })).toBe(
      false,
    );
  });
});

// D-040: cakupan perusahaan — null = semua (SUPER_ADMIN), set = PT yang ditugaskan/tempat terdaftar.
describe("isInCompanyScope", () => {
  test.each([
    [null, "co-B", true],
    [["co-A"], "co-A", true],
    [["co-A"], "co-B", false],
    [[], "co-A", false],
  ] as const)("cakupan %j, target %s → %p", (companies, companyId, expected) => {
    const scoped = {
      ...actor("HR_ADMIN"),
      companyIds: companies === null ? null : new Set(companies),
    };
    expect(isInCompanyScope(scoped, { companyId })).toBe(expected);
  });
});
