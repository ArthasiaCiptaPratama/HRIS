import { describe, expect, test } from "bun:test";
import type { Actor } from "../../../core/access/index.ts";
import {
  canApplyRosterCell,
  canListAttendanceDays,
  canListEmployeeAttendanceDays,
  canSetEmployeeAttendanceLocation,
} from "../attendance.policy.ts";

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
          expect(canListAttendanceDays(actor)).toBe(
            role === "SUPER_ADMIN" ||
              role === "HR_ADMIN" ||
              (role === "MANAGER" && employeeId !== null),
          );
          expect(canListEmployeeAttendanceDays(actor, target)).toBe(
            role === "SUPER_ADMIN" || (role === "HR_ADMIN" && inScope),
          );
          expect(canListEmployeeAttendanceDays(actor, { ...target, managerId: employeeId })).toBe(
            role === "SUPER_ADMIN" ||
              (role === "HR_ADMIN" && inScope) ||
              (role === "MANAGER" && employeeId !== null),
          );
          expect(canSetEmployeeAttendanceLocation(actor, target)).toBe(allowed);
          expect(canApplyRosterCell(actor, target.companyId, target.employeeId, false)).toBe(
            allowed,
          );
          expect(canApplyRosterCell(actor, target.companyId, target.employeeId, true)).toBe(
            role === "SUPER_ADMIN" || (role === "HR_ADMIN" && inScope),
          );
        });
      }
    }
  }
});
