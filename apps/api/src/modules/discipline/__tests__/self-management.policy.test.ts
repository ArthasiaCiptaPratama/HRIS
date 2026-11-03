import { describe, expect, test } from "bun:test";
import type { Actor } from "../../../core/access/index.ts";
import { canRevokeLetter } from "../discipline.policy.ts";

const target = { employeeId: "self", companyId: "company", managerId: "manager" };
describe("audit 4: jalur HR untuk data sendiri", () => {
  for (const role of ["SUPER_ADMIN", "HR_ADMIN", "HR_PERSONNEL", "MANAGER", "EMPLOYEE"] as const) {
    for (const employeeId of ["self", "other", null]) {
      for (const inScope of [true, false]) {
        test(`${role} employeeId=${employeeId} inScope=${inScope}`, () => {
          const actor: Actor = {
            accountId: "account",
            authUserId: "auth",
            email: "test@example.test",
            role,
            employeeId,
            isPrimarySuperAdmin: false,
            grants: new Set(["employee.discipline.write"]),
            companyIds: role === "SUPER_ADMIN" ? null : new Set(inScope ? ["company"] : []),
          };
          const allowed =
            role === "SUPER_ADMIN" || (role === "HR_ADMIN" && inScope && employeeId !== "self");
          expect(canRevokeLetter(actor, target)).toBe(allowed);
        });
      }
    }
  }
});
