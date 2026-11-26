import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import { canManageContracts, canManageContractsInCompany } from "../contract.policy.ts";

const actor = (role: Role, grants: Permission[] = []): Actor => ({
  accountId: "a",
  authUserId: "auth",
  email: "test@example.test",
  employeeId: "self",
  role,
  grants: new Set(grants),
  companyIds: new Set(["own"]),
  isPrimarySuperAdmin: false,
});
describe("contract.manage / PLAN §4.3", () => {
  test.each([
    ["SUPER_ADMIN", [], true],
    ["HR_ADMIN", ["contract.manage"], true],
    ["HR_ADMIN", [], false],
    ["MANAGER", ["contract.manage"], false],
    ["EMPLOYEE", ["contract.manage"], false],
    ["HR_PERSONNEL", [], false],
  ] satisfies [Role, Permission[], boolean][])("%s %j => %s", (role, grants, expected) => {
    expect(canManageContracts(actor(role, grants))).toBe(expected);
    expect(canManageContractsInCompany(actor(role, grants), "own")).toBe(expected);
    expect(canManageContractsInCompany(actor(role, grants), "other")).toBe(role === "SUPER_ADMIN");
  });
});
