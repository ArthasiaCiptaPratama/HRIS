import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import { canAccessDailyWage, canAccessDailyWageInCompany } from "../contract.policy.ts";

describe("KTR-D13 / labor.cost.read", () => {
  test.each([
    ["SUPER_ADMIN", [], true],
    ["HR_ADMIN", ["labor.cost.read"], true],
    ["HR_ADMIN", ["contract.manage"], false],
    ["HR_ADMIN", [], false],
    ["MANAGER", ["labor.cost.read"], false],
    ["EMPLOYEE", ["labor.cost.read"], false],
    ["HR_PERSONNEL", ["labor.cost.read"], false],
  ] satisfies [Role, Permission[], boolean][])("%s %j → %s", (role, grants, expected) => {
    const actor: Actor = {
      accountId: "a",
      authUserId: "b",
      email: "dummy@example.test",
      employeeId: null,
      role,
      grants: new Set(grants),
      companyIds: new Set(["own"]),
      isPrimarySuperAdmin: false,
    };
    expect(canAccessDailyWage(actor)).toBe(expected);
    expect(canAccessDailyWageInCompany(actor, "own")).toBe(expected);
    expect(canAccessDailyWageInCompany(actor, "other")).toBe(role === "SUPER_ADMIN");
  });
});
