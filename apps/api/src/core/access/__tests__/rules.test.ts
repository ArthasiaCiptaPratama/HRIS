import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import { type Actor, hasPermission, hasRole, isGrantActive } from "../rules.ts";

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
