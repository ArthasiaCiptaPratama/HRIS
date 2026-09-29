import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor, EmployeeTarget } from "../../../core/access/index.ts";
import {
  canDeactivateEmployee,
  canManageEmployees,
  canReadBank,
  canReadOrgStructure,
  canReadPersonal,
  canViewEmployee,
  employeeListScope,
} from "../employee.policy.ts";

// Matriks akses karyawan (PLAN §4.3 "Karyawan", §4.2 grant; D-035: MANAGER hanya baca tim).
type Who = "SA" | "HR" | "MGR" | "EMP";
type Rel = "other" | "team" | "self";

const ROLE_OF: Record<Who, Role> = {
  SA: "SUPER_ADMIN",
  HR: "HR_ADMIN",
  MGR: "MANAGER",
  EMP: "EMPLOYEE",
};

function actor(
  who: Who,
  grants: Permission[] = [],
  employeeId: string | null = `emp-${who}`,
): Actor {
  return {
    accountId: `acc-${who}`,
    authUserId: `auth-${who}`,
    email: `${who}@example.test`,
    role: ROLE_OF[who],
    employeeId,
    isPrimarySuperAdmin: false,
    grants: new Set(grants),
  };
}

function target(who: Who, rel: Rel): EmployeeTarget {
  if (rel === "self") return { employeeId: `emp-${who}`, managerId: null };
  if (rel === "team") return { employeeId: "emp-team", managerId: `emp-${who}` };
  return { employeeId: "emp-other", managerId: "emp-someone-else" };
}

describe("employeeListScope", () => {
  test.each([
    ["SA", "all"],
    ["HR", "all"],
    ["MGR", "team"],
    ["EMP", null],
  ] as const)("%s → %s", (who, scope) => {
    expect(employeeListScope(actor(who))).toBe(scope);
  });

  test("MANAGER tanpa data karyawan tidak punya tim", () => {
    expect(employeeListScope(actor("MGR", [], null))).toBeNull();
  });
});

describe("canViewEmployee (data kerja)", () => {
  test.each([
    ["SA", "other", true],
    ["HR", "other", true],
    ["MGR", "team", true],
    ["MGR", "other", false],
    ["MGR", "self", true],
    ["EMP", "self", true],
    ["EMP", "other", false],
  ] as const)("%s → %s = %s", (who, rel, allowed) => {
    expect(canViewEmployee(actor(who), target(who, rel))).toBe(allowed);
  });
});

describe("canManageEmployees (tambah/ubah/ubah status/aktifkan)", () => {
  test.each([
    ["SA", true],
    ["HR", true],
    ["MGR", false],
    ["EMP", false],
  ] as const)("%s = %s", (who, allowed) => {
    expect(canManageEmployees(actor(who))).toBe(allowed);
  });
});

describe("canDeactivateEmployee", () => {
  test.each([
    ["SA", "other", true],
    ["HR", "other", true],
    ["HR", "self", false],
    ["SA", "self", false],
    ["MGR", "team", false],
    ["EMP", "other", false],
  ] as const)("%s → %s = %s", (who, rel, allowed) => {
    expect(canDeactivateEmployee(actor(who), target(who, rel))).toBe(allowed);
  });
});

describe("canReadPersonal (NIK, NPWP, KK, alamat, keluarga)", () => {
  const P: Permission = "employee.personal.read";
  test.each([
    ["SA", [], "other", true],
    ["HR", [], "other", false],
    ["HR", [P], "other", true],
    ["HR", [], "self", true],
    ["MGR", [P], "team", true],
    ["MGR", [P], "other", false],
    ["MGR", [], "team", false],
    ["EMP", [], "self", true],
    ["EMP", [], "other", false],
    // Grant yang tidak boleh untuk role penerima tidak berlaku (hasPermission).
    ["EMP", [P], "other", false],
    // Grant rekening tidak membuka data pribadi.
    ["HR", ["employee.bank.read"], "other", false],
  ] as const)("%s %j → %s = %s", (who, grants, rel, allowed) => {
    expect(canReadPersonal(actor(who, [...grants]), target(who, rel))).toBe(allowed);
  });
});

describe("canReadBank (rekening)", () => {
  const B: Permission = "employee.bank.read";
  test.each([
    ["SA", [], "other", true],
    ["HR", [], "other", false],
    ["HR", [B], "other", true],
    ["MGR", [B], "team", true],
    ["MGR", [B], "other", false],
    ["EMP", [], "self", true],
    ["EMP", [], "other", false],
    ["HR", ["employee.personal.read"], "other", false],
  ] as const)("%s %j → %s = %s", (who, grants, rel, allowed) => {
    expect(canReadBank(actor(who, [...grants]), target(who, rel))).toBe(allowed);
  });
});

describe("canReadOrgStructure (direktori: semua role 👁)", () => {
  test.each(["SA", "HR", "MGR", "EMP"] as const)("%s = true", (who) => {
    expect(canReadOrgStructure(actor(who))).toBe(true);
  });
});
