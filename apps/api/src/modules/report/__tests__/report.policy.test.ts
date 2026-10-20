import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import {
  canListDataChanges,
  canListSensitiveDocument,
  canListWarningLetters,
  canViewReports,
  reportCompanyScope,
} from "../report.policy.ts";

// Matriks akses Laporan (ARS-D16, PLAN §4.3): SA & HR (PT ditugaskan); daftar sensitif butuh grant.
type Who = "SA" | "HR" | "MGR" | "EMP";
const ROLE_OF: Record<Who, Role> = {
  SA: "SUPER_ADMIN",
  HR: "HR_ADMIN",
  MGR: "MANAGER",
  EMP: "EMPLOYEE",
};
function actor(
  who: Who,
  grants: Permission[] = [],
  companyIds: string[] | null = who === "SA" ? null : ["co-A"],
): Actor {
  return {
    accountId: `acc-${who}`,
    authUserId: `auth-${who}`,
    email: `${who}@example.test`,
    role: ROLE_OF[who],
    employeeId: `emp-${who}`,
    isPrimarySuperAdmin: false,
    grants: new Set(grants),
    companyIds: companyIds === null ? null : new Set(companyIds),
  };
}

describe("menu Laporan", () => {
  test.each([
    ["SA", true],
    ["HR", true],
    ["MGR", false],
    ["EMP", false],
  ] as const)("%s → %p", (who, expected) => {
    expect(canViewReports(actor(who))).toBe(expected);
  });

  test("cakupan PT: SA semua; HR PT ditugaskan; HR tanpa PT = kosong", () => {
    expect(reportCompanyScope(actor("SA"))).toBeNull();
    expect(reportCompanyScope(actor("HR"))).toEqual(["co-A"]);
    expect(reportCompanyScope(actor("HR", [], []))).toEqual([]);
  });
});

describe("daftar per orang yang sensitif", () => {
  test("dokumen sensitif: SA / grant dokumen; scan SP juga grant SP", () => {
    expect(canListSensitiveDocument(actor("SA"), "KTP")).toBe(true);
    expect(canListSensitiveDocument(actor("HR", ["employee.documents.read"]), "KTP")).toBe(true);
    expect(canListSensitiveDocument(actor("HR"), "KTP")).toBe(false);
    expect(
      canListSensitiveDocument(actor("HR", ["employee.discipline.read"]), "WARNING_LETTER"),
    ).toBe(true);
    expect(canListSensitiveDocument(actor("HR", ["employee.discipline.read"]), "KTP")).toBe(false);
  });

  test("daftar SP: SA / HR ber-grant SP", () => {
    expect(canListWarningLetters(actor("SA"))).toBe(true);
    expect(canListWarningLetters(actor("HR", ["employee.discipline.write"]))).toBe(true);
    expect(canListWarningLetters(actor("HR", ["employee.discipline.read"]))).toBe(true);
    expect(canListWarningLetters(actor("HR"))).toBe(false);
  });

  test("daftar pengajuan perubahan data (ARS-D21): SA / pemeriksa ber-grant", () => {
    expect(canListDataChanges(actor("SA"))).toBe(true);
    expect(canListDataChanges(actor("HR", ["employee.changes.review"]))).toBe(true);
    expect(canListDataChanges(actor("HR"))).toBe(false);
  });
});
