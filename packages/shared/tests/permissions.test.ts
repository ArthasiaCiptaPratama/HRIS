import { describe, expect, test } from "bun:test";
import { isPermissionGrantableTo, PERMISSIONS, permissionSchema } from "../src/index.ts";

describe("permissions (PLAN §4.2)", () => {
  test("daftar izin persis 9 kode dari PLAN §4.2 (+ D-047 review onboarding)", () => {
    expect(PERMISSIONS).toHaveLength(9);
  });

  test("tidak ada izin gaji yang bisa di-grant", () => {
    for (const permission of PERMISSIONS) {
      expect(permission).not.toMatch(/salary|payslip/);
    }
    expect(permissionSchema.safeParse("payroll.salary.read").success).toBe(false);
  });

  test.each([
    ["employee.personal.read", "HR_ADMIN", true],
    ["employee.personal.read", "MANAGER", true],
    ["employee.bank.write", "MANAGER", true],
    ["contract.manage", "HR_ADMIN", true],
    ["contract.manage", "MANAGER", false],
    ["payroll.period.prepare", "MANAGER", false],
    ["employee.onboarding.review", "HR_ADMIN", true],
    ["employee.onboarding.review", "MANAGER", false],
    ["employee.personal.read", "EMPLOYEE", false],
    ["employee.personal.read", "SUPER_ADMIN", false],
  ] as const)("%s → %s = %p", (permission, role, expected) => {
    expect(isPermissionGrantableTo(permission, role)).toBe(expected);
  });
});
