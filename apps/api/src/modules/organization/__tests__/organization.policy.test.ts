import { describe, expect, test } from "bun:test";
import type { Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import { canReadMasterData } from "../organization.policy.ts";

const actor = (role: Role): Actor => ({
  accountId: `acc-${role}`,
  authUserId: `auth-${role}`,
  email: `${role}@example.test`,
  role,
  employeeId: null,
  isPrimarySuperAdmin: false,
  grants: new Set(),
});

// PLAN §4.3: struktur organisasi, jabatan, level, lokasi → 👁 semua role.
describe("canReadMasterData", () => {
  test.each(["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] as const)("%s = true", (role) => {
    expect(canReadMasterData(actor(role))).toBe(true);
  });

  test("tanpa akun ditolak", () => {
    expect(canReadMasterData({ ...actor("EMPLOYEE"), accountId: "" })).toBe(false);
  });
});
