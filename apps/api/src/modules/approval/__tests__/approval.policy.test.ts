import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import { type ApprovalTarget, canViewApproval, stepRight } from "../approval.policy.ts";

// PLAN §5.2: atasan (snapshot) = langkah MANAGER; HR PT pengaju = langkah HR; SA/HR override; tanpa atasan → SA.
const actor = (role: Role, employeeId: string | null, companies: string[] | null = []): Actor => ({
  accountId: `acc-${role}-${employeeId ?? "x"}`,
  authUserId: "auth",
  email: "a@example.test",
  role,
  employeeId,
  isPrimarySuperAdmin: false,
  grants: new Set<Permission>(),
  companyIds: companies === null ? null : new Set(companies),
});

const target: ApprovalTarget = {
  requesterEmployeeId: "emp",
  companyId: "co-A",
  managerEmployeeId: "mgr",
};
const noManager: ApprovalTarget = { ...target, managerEmployeeId: null };

describe("stepRight", () => {
  test.each([
    ["atasan snapshot", actor("MANAGER", "mgr"), target, "MANAGER", "regular"],
    ["manager lain", actor("MANAGER", "other"), target, "MANAGER", null],
    [
      "HR PT pengaju → override atasan",
      actor("HR_ADMIN", "hr", ["co-A"]),
      target,
      "MANAGER",
      "override",
    ],
    ["HR PT lain", actor("HR_ADMIN", "hr", ["co-B"]), target, "MANAGER", null],
    ["SA → override atasan", actor("SUPER_ADMIN", null, null), target, "MANAGER", "override"],
    [
      "tanpa atasan → SA regular",
      actor("SUPER_ADMIN", null, null),
      noManager,
      "MANAGER",
      "regular",
    ],
    ["HR PT pengaju", actor("HR_ADMIN", "hr", ["co-A"]), target, "HR", "regular"],
    ["HR PT lain di langkah HR", actor("HR_ADMIN", "hr", ["co-B"]), target, "HR", null],
    ["SA → override HR", actor("SUPER_ADMIN", null, null), target, "HR", "override"],
    ["atasan tidak memutuskan langkah HR", actor("MANAGER", "mgr"), target, "HR", null],
    ["karyawan", actor("EMPLOYEE", "x"), target, "MANAGER", null],
  ] as const)("%s", (_label, who, t, kind, expected) => {
    expect(stepRight(who, t, kind)).toBe(expected);
  });

  test("pengajuan sendiri tidak pernah bisa diputuskan (HR/SA yang mengajukan)", () => {
    const hrRequest: ApprovalTarget = { ...target, requesterEmployeeId: "hr" };
    expect(stepRight(actor("HR_ADMIN", "hr", ["co-A"]), hrRequest, "HR")).toBeNull();
    expect(stepRight(actor("HR_ADMIN", "hr", ["co-A"]), hrRequest, "MANAGER")).toBeNull();
    // HR lain di PT yang sama tetap bisa memutuskan langkah HR.
    expect(stepRight(actor("HR_ADMIN", "hr2", ["co-A"]), hrRequest, "HR")).toBe("regular");
  });
});

describe("canViewApproval", () => {
  test("pengaju, atasan, HR PT, SA melihat; lainnya tidak", () => {
    expect(canViewApproval(actor("EMPLOYEE", "emp"), target)).toBe(true);
    expect(canViewApproval(actor("MANAGER", "mgr"), target)).toBe(true);
    expect(canViewApproval(actor("HR_ADMIN", "hr", ["co-A"]), target)).toBe(true);
    expect(canViewApproval(actor("SUPER_ADMIN", null, null), target)).toBe(true);
    expect(canViewApproval(actor("HR_ADMIN", "hr", ["co-B"]), target)).toBe(false);
    expect(canViewApproval(actor("EMPLOYEE", "x"), target)).toBe(false);
  });
});
