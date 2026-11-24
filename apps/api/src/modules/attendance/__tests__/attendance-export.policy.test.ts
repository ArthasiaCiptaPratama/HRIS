import { describe, expect, test } from "bun:test";
import type { Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import { canExportAttendance } from "../attendance.policy.ts";

// TM-D31 (Q1-B): ekspor Excel data absen — SA semua PT; HR PT-nya; MANAGER tertaut (tim langsung); lainnya ditolak.
const actor = (role: Role, employeeId: string | null, companies: string[] | null): Actor => ({
  accountId: "account",
  authUserId: "auth",
  email: "test@example.test",
  role,
  employeeId,
  isPrimarySuperAdmin: false,
  grants: new Set(),
  companyIds: companies === null ? null : new Set(companies),
  isSupervisor: true,
});

const OWN = "company-own";
const OTHER = "company-other";

// [role, employeeId, companyIds, companyId diminta, boleh]
const MATRIX: [Role, string | null, string[] | null, string | undefined, boolean][] = [
  ["SUPER_ADMIN", null, null, undefined, true],
  ["SUPER_ADMIN", null, null, OTHER, true],
  ["SUPER_ADMIN", "emp", null, OWN, true],
  ["HR_ADMIN", null, [OWN], undefined, true],
  ["HR_ADMIN", null, [OWN], OWN, true],
  ["HR_ADMIN", null, [OWN], OTHER, false],
  ["HR_ADMIN", "emp", [OWN], OTHER, false],
  ["HR_ADMIN", null, [], OWN, false],
  ["MANAGER", "emp", [OWN], undefined, true],
  ["MANAGER", "emp", [OWN], OWN, true],
  ["MANAGER", "emp", [OWN], OTHER, false],
  ["MANAGER", null, [OWN], undefined, false],
  ["MANAGER", null, [OWN], OWN, false],
  ["EMPLOYEE", "emp", [OWN], undefined, false],
  ["EMPLOYEE", "emp", [OWN], OWN, false],
  ["HR_PERSONNEL", "emp", [OWN], undefined, false],
  ["HR_PERSONNEL", "emp", [OWN], OWN, false],
];

describe("canExportAttendance (TM-D31)", () => {
  for (const [role, employeeId, companies, companyId, allowed] of MATRIX) {
    test(`${role} employee=${employeeId ?? "-"} scope=${companies?.join(",") ?? "semua"} companyId=${companyId ?? "-"} → ${allowed ? "boleh" : "tolak"}`, () => {
      expect(canExportAttendance(actor(role, employeeId, companies), companyId)).toBe(allowed);
    });
  }
});
